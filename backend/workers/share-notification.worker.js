import AWS from "aws-sdk";
import dotenv from "dotenv";
import logger from "../libs/logger.js";
import { processShareNotification } from "./processors/notifyShare.js";

dotenv.config();

const sqs = new AWS.SQS({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_KEY,
});

const SHARE_NOTIFICATION_QUEUE_URL = process.env.SHARE_NOTIFICATION_QUEUE_URL;

function parseBody(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function deleteMessage(receiptHandle) {
  await sqs
    .deleteMessage({
      QueueUrl: SHARE_NOTIFICATION_QUEUE_URL,
      ReceiptHandle: receiptHandle,
    })
    .promise();
}

async function requeueMessage(message, delaySeconds) {
  await sqs
    .sendMessage({
      QueueUrl: SHARE_NOTIFICATION_QUEUE_URL,
      DelaySeconds: Math.min(900, Math.max(0, Math.floor(delaySeconds || 0))),
      MessageBody: JSON.stringify(message),
      MessageAttributes: {
        attempt: {
          DataType: "Number",
          StringValue: String(message.attempt || 1),
        },
      },
    })
    .promise();
}

async function consumeBatch() {
  const response = await sqs
    .receiveMessage({
      QueueUrl: SHARE_NOTIFICATION_QUEUE_URL,
      MaxNumberOfMessages: Number(process.env.SHARE_NOTIFICATION_WORKER_CONCURRENCY || 5),
      WaitTimeSeconds: 20,
      VisibilityTimeout: Number(process.env.SHARE_NOTIFICATION_VISIBILITY_TIMEOUT_SEC || 120),
      MessageAttributeNames: ["All"],
      AttributeNames: ["All"],
    })
    .promise();

  return response.Messages || [];
}

async function handleMessage(rawMessage) {
  const payload = parseBody(rawMessage.Body);
  if (!payload) {
    logger.error("[SHARE_NOTIFY] Invalid JSON payload, deleting message");
    await deleteMessage(rawMessage.ReceiptHandle);
    return;
  }

  try {
    await processShareNotification(payload);
    await deleteMessage(rawMessage.ReceiptHandle);
  } catch (error) {
    const nextAttempt = Number(error.nextAttempt || Number(payload.attempt || 1) + 1);
    const maxAttempts = Number(error.maxAttempts || 3);

    if (error.retryable && nextAttempt <= maxAttempts) {
      await requeueMessage({ ...payload, attempt: nextAttempt }, error.retryAfterSeconds || 60);
      await deleteMessage(rawMessage.ReceiptHandle);
      logger.warn(
        `[SHARE_NOTIFY] Requeued message for ${payload.recipientEmail}; attempt=${nextAttempt}`
      );
      return;
    }

    await deleteMessage(rawMessage.ReceiptHandle);
    logger.error(`[SHARE_NOTIFY] Dropped message: ${error.message}`);
  }
}

async function bootstrap() {
  if (!SHARE_NOTIFICATION_QUEUE_URL) {
    throw new Error("SHARE_NOTIFICATION_QUEUE_URL is not configured");
  }

  logger.info("Share notification worker started");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const messages = await consumeBatch();
    if (!messages.length) {
      continue;
    }

    await Promise.all(messages.map((message) => handleMessage(message)));
  }
}

bootstrap().catch((error) => {
  logger.error(`[SHARE_NOTIFY] Worker bootstrap failed: ${error.message}`);
  process.exit(1);
});
