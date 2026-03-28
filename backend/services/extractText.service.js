import s3 from "../config/S3/index.js";
import { NonRetryableProcessingError } from "./errors/pipeline.errors.js";

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

export async function extractText(s3Url) {
  const { bucket, key } = parseS3Url(s3Url);

  const object = await s3
    .getObject({
      Bucket: bucket,
      Key: key,
    })
    .promise();

  const text = object?.Body?.toString("utf8")?.trim();
  if (!text) {
    throw new NonRetryableProcessingError("No extractable text found in S3 object", {
      bucket,
      key,
    });
  }

  return text;
}
