import AWS from "aws-sdk";
import s3 from "../config/s3.js";
import { NonRetryableProcessingError } from "./errors/pipeline.errors.js";

const textract = new AWS.Textract();

const OCR_FILE_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"]);
const TEXT_FILE_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".xml",
  ".html",
  ".htm",
  ".log",
]);

const TEXTRACT_POLL_INTERVAL_MS = Number(process.env.TEXTRACT_POLL_INTERVAL_MS || 2000);
const TEXTRACT_MAX_POLLS = Number(process.env.TEXTRACT_MAX_POLLS || 90);

function parseS3Url(s3Url) {
  try {
    const url = new URL(s3Url);
    const key = decodeURIComponent(url.pathname.replace(/^\//, ""));
    const bucket = url.hostname.split(".")[0];

    if (!bucket || !key) {
      throw new Error("Invalid S3 URL format");
    }

    return { bucket, key };
  } catch {
    throw new NonRetryableProcessingError("Invalid s3Url received for text extraction", {
      s3Url,
    });
  }
}

function getFileExtension(key) {
  const dot = key.lastIndexOf(".");
  return dot >= 0 ? key.slice(dot).toLowerCase() : "";
}

function isLikelyBinary(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return false;
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  for (let index = 0; index < sample.length; index += 1) {
    if (sample[index] === 0) {
      return true;
    }
  }

  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectTextractLines(blocks = []) {
  return blocks
    .filter((block) => block?.BlockType === "LINE" && block?.Text)
    .map((block) => block.Text.trim())
    .filter(Boolean);
}

async function extractTextWithTextract(bucket, key) {
  let jobId;

  try {
    const startResult = await textract
      .startDocumentTextDetection({
        DocumentLocation: {
          S3Object: {
            Bucket: bucket,
            Name: key,
          },
        },
      })
      .promise();

    jobId = startResult?.JobId;
  } catch (error) {
    throw new NonRetryableProcessingError(`Textract start failed: ${error.message}`, {
      bucket,
      key,
      provider: "textract",
      reason: error.message,
    });
  }

  if (!jobId) {
    throw new NonRetryableProcessingError("Textract did not return a JobId", {
      bucket,
      key,
      provider: "textract",
    });
  }

  let firstPage;

  for (let poll = 0; poll < TEXTRACT_MAX_POLLS; poll += 1) {
    await sleep(TEXTRACT_POLL_INTERVAL_MS);

    const statusResult = await textract
      .getDocumentTextDetection({
        JobId: jobId,
      })
      .promise();

    if (statusResult?.JobStatus === "FAILED") {
      throw new NonRetryableProcessingError(
        `Textract OCR failed: ${statusResult?.StatusMessage || "Unknown status"}`,
        {
          bucket,
          key,
          provider: "textract",
          jobId,
          reason: statusResult?.StatusMessage,
        }
      );
    }

    if (statusResult?.JobStatus === "SUCCEEDED") {
      firstPage = statusResult;
      break;
    }
  }

  if (!firstPage) {
    throw new NonRetryableProcessingError("Textract OCR timed out", {
      bucket,
      key,
      provider: "textract",
      jobId,
      maxPolls: TEXTRACT_MAX_POLLS,
      pollIntervalMs: TEXTRACT_POLL_INTERVAL_MS,
    });
  }

  const lines = collectTextractLines(firstPage.Blocks);
  let nextToken = firstPage.NextToken;

  while (nextToken) {
    const page = await textract
      .getDocumentTextDetection({
        JobId: jobId,
        NextToken: nextToken,
      })
      .promise();

    lines.push(...collectTextractLines(page.Blocks));
    nextToken = page.NextToken;
  }

  const text = lines.join("\n").trim();
  if (!text) {
    throw new NonRetryableProcessingError("Textract returned no readable text", {
      bucket,
      key,
      provider: "textract",
      jobId,
    });
  }

  return text;
}

export async function extractText(s3Url) {
  const { bucket, key } = parseS3Url(s3Url);
  const extension = getFileExtension(key);

  if (OCR_FILE_EXTENSIONS.has(extension)) {
    return extractTextWithTextract(bucket, key);
  }

  const object = await s3
    .getObject({
      Bucket: bucket,
      Key: key,
    })
    .promise();

  const body = object?.Body;
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body || "");

  if (!buffer.length) {
    throw new NonRetryableProcessingError("S3 object body is empty", {
      bucket,
      key,
    });
  }

  if (isLikelyBinary(buffer)) {
    throw new NonRetryableProcessingError(
      "Binary file uploaded. Use OCR-supported files (pdf/png/jpg/tiff/bmp) for scanned documents",
      {
        bucket,
        key,
        extension,
      }
    );
  }

  const text = buffer.toString("utf8").trim();
  if (!text) {
    throw new NonRetryableProcessingError("No extractable text found in S3 object", {
      bucket,
      key,
      extension,
    });
  }

  if (extension && !TEXT_FILE_EXTENSIONS.has(extension)) {
    throw new NonRetryableProcessingError(
      `Unsupported non-OCR file type for text extraction: ${extension}`,
      {
        bucket,
        key,
        extension,
      }
    );
  }

  return text;
}
