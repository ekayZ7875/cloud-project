import { analyzeDocumentWithRetry, embedText } from "../../services/gemini.service.js";
import { extractText } from "../../services/extractText.service.js";
import { upsertChunks } from "../../services/qdrant.service.js";
import logger from "../../libs/logger.js";
import {
  getProcessingJob,
  markProcessingStarted,
  markProcessingCompleted,
  markProcessingFailed,
  markProcessingPendingRetry,
} from "../../services/metadata.service.js";
import { RETRY_POLICY, PIPELINE_STATUS } from "../../constants/pipeline.constants.js";

const STAGE_TIMEOUT_MS = Number(process.env.FILE_STAGE_TIMEOUT_MS || 180000);
const EXTRACT_TEXT_TIMEOUT_MS = Number(
  process.env.FILE_EXTRACT_STAGE_TIMEOUT_MS || Math.max(STAGE_TIMEOUT_MS, 420000)
);

async function runWithTimeout(stageName, fn, timeoutMs = STAGE_TIMEOUT_MS) {
  let timeoutId;

  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const timeoutError = new Error(
            `${stageName} timed out after ${timeoutMs}ms`
          );
          timeoutError.code = "STAGE_TIMEOUT";
          timeoutError.retryable = true;
          reject(timeoutError);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function normalizeError(error) {
  return {
    message: error?.message || "Unknown processing error",
    code: error?.code || "UNKNOWN_ERROR",
    retryable: Boolean(error?.retryable),
    retryAfterSeconds: Number.isFinite(error?.details?.retryAfterSeconds)
      ? Number(error.details.retryAfterSeconds)
      : Number.isFinite(error?.retryAfterSeconds)
      ? Number(error.retryAfterSeconds)
      : null,
  };
}

export async function processFile(jobMessage) {
  const { jobId, fileId, userId, s3Url } = jobMessage;
  const attempt = Number(jobMessage.attempt || 1);
  const startTime = Date.now();

  if (!jobId || !fileId || !userId || !s3Url) {
    const error = new Error("Invalid job message: missing required fields");
    error.retryable = false;
    error.code = "INVALID_JOB_MESSAGE";
    throw error;
  }

  logger.info(
    `[PIPELINE] Start job=${jobId} file=${fileId} user=${userId} attempt=${attempt}`
  );

  const existing = await getProcessingJob({ userId, jobId });
  if (existing?.status === PIPELINE_STATUS.COMPLETED) {
    return {
      ok: true,
      skipped: true,
      reason: "Already completed",
    };
  }

  await markProcessingStarted({ userId, jobId, attempt });

  try {
    logger.info(`[PIPELINE] job=${jobId} stage=extractText start`);
    const extractedText = await runWithTimeout("extractText", () =>
      extractText(s3Url)
    , EXTRACT_TEXT_TIMEOUT_MS);
    logger.info(
      `[PIPELINE] job=${jobId} stage=extractText done chars=${extractedText.length}`
    );

    logger.info(`[PIPELINE] job=${jobId} stage=analyzeDocument start`);
    const analyzed = await runWithTimeout("analyzeDocument", () =>
      analyzeDocumentWithRetry(extractedText, undefined, { forceProvider: "ollama" })
    );
    logger.info(
      `[PIPELINE] job=${jobId} stage=analyzeDocument done chunks=${analyzed.embedding_chunks.length}`
    );

    const chunksWithVectors = [];
    for (const chunk of analyzed.embedding_chunks) {
      const vector = await runWithTimeout(`embedText:${chunk.chunk_id}`, () =>
        embedText(chunk.text, { forceProvider: "ollama" })
      );
      chunksWithVectors.push({
        ...chunk,
        vector,
      });
    }

    logger.info(
      `[PIPELINE] job=${jobId} stage=embedText done vectors=${chunksWithVectors.length}`
    );

    logger.info(`[PIPELINE] job=${jobId} stage=upsertChunks start`);
    await runWithTimeout("upsertChunks", () =>
      upsertChunks({
        fileId,
        chunksWithVectors,
        tags: analyzed.tags,
        documentType: analyzed.metadata.document_type,
      })
    );
    logger.info(`[PIPELINE] job=${jobId} stage=upsertChunks done`);

    await markProcessingCompleted({
      userId,
      jobId,
      result: {
        summary: analyzed.summary,
        entities: analyzed.entities,
        tags: analyzed.tags,
        metadata: analyzed.metadata,
        chunkCount: analyzed.embedding_chunks.length,
      },
    });

    logger.info(
      `[PIPELINE] Complete job=${jobId} attempt=${attempt} durationMs=${
        Date.now() - startTime
      }`
    );

    return {
      ok: true,
      retryable: false,
      attempt,
    };
  } catch (error) {
    const normalized = normalizeError(error);
    const canRetry = normalized.retryable && attempt < RETRY_POLICY.maxAttempts;

    logger.warn(
      `[PIPELINE] Fail job=${jobId} attempt=${attempt} retryable=${canRetry} code=${normalized.code} message=${normalized.message}`
    );

    if (canRetry) {
      await markProcessingPendingRetry({
        userId,
        jobId,
        attempt: attempt + 1,
        errorMessage: `${normalized.code}: ${normalized.message}`,
      });
    } else {
      await markProcessingFailed({
        userId,
        jobId,
        attempt,
        errorMessage: `${normalized.code}: ${normalized.message}`,
      });
    }

    const wrapped = new Error(normalized.message);
    wrapped.retryable = canRetry;
    wrapped.code = normalized.code;
    wrapped.attempt = attempt;
    wrapped.retryAfterSeconds = normalized.retryAfterSeconds;
    throw wrapped;
  }
}
