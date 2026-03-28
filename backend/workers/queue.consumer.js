import logger from "../libs/logger.js";
import {
  consumeMessages,
  deleteMessage,
  requeueFileProcessingJob,
} from "../services/queue.service.js";

function parseMessageBody(rawBody) {
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

async function processSqsMessage(message, handler) {
  const body = parseMessageBody(message.Body);
  if (!body) {
    logger.error("Received invalid JSON in SQS message body");
    await deleteMessage(message.ReceiptHandle);
    return;
  }

  try {
    await handler(body);
    await deleteMessage(message.ReceiptHandle);
  } catch (error) {
    if (error?.retryable) {
      const { nextAttempt, delaySeconds } = await requeueFileProcessingJob(body, {
        minDelaySeconds: error?.retryAfterSeconds,
      });
      await deleteMessage(message.ReceiptHandle);
      logger.warn(
        `Requeued job ${body.jobId} for attempt ${nextAttempt} after ${delaySeconds}s due to retryable failure: ${error.message}`
      );
      return;
    }

    await deleteMessage(message.ReceiptHandle);
    logger.error(`Dropping non-retryable job ${body.jobId}: ${error.message}`);
  }
}

export async function startQueueConsumer({ handler, concurrency = 3 }) {
  if (typeof handler !== "function") {
    throw new Error("Queue consumer requires a valid handler function");
  }

  const visibilityTimeoutSeconds = Number(
    process.env.FILE_QUEUE_VISIBILITY_TIMEOUT_SEC || 600
  );

  logger.info(`File processing worker started with concurrency=${concurrency}`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const messages = await consumeMessages({
      maxNumberOfMessages: Math.min(concurrency, 10),
      waitTimeSeconds: 20,
      visibilityTimeout: visibilityTimeoutSeconds,
    });

    if (!messages.length) {
      continue;
    }

    await Promise.all(messages.map((message) => processSqsMessage(message, handler)));
  }
}
