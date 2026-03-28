import AWS from "aws-sdk";
import dotenv from "dotenv";
import { RETRY_POLICY } from "../constants/pipeline.constants.js";

dotenv.config();

const sqs = new AWS.SQS({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_KEY,
});

const queueUrl = process.env.FILE_PROCESSING_QUEUE_URL;

function assertQueueUrl() {
  if (!queueUrl) {
    throw new Error("FILE_PROCESSING_QUEUE_URL is not configured");
  }
}

function computeDelaySeconds(attempt) {
  const ms = Math.min(
    RETRY_POLICY.baseDelayMs * 2 ** Math.max(0, attempt - 1),
    RETRY_POLICY.maxDelayMs
  );

  return Math.min(Math.floor(ms / 1000), 900);
}

export async function publishFileProcessingJob(message) {
  assertQueueUrl();

  await sqs
    .sendMessage({
      QueueUrl: queueUrl,
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

export async function requeueFileProcessingJob(message, options = {}) {
  assertQueueUrl();

  const attempt = Number(message.attempt || 1);
  const nextAttempt = attempt + 1;
  const computedDelaySeconds = computeDelaySeconds(nextAttempt);
  const minDelaySeconds = Math.max(0, Math.ceil(Number(options.minDelaySeconds || 0)));
  const delaySeconds = Math.min(900, Math.max(computedDelaySeconds, minDelaySeconds));

  await sqs
    .sendMessage({
      QueueUrl: queueUrl,
      DelaySeconds: delaySeconds,
      MessageBody: JSON.stringify({
        ...message,
        attempt: nextAttempt,
      }),
      MessageAttributes: {
        attempt: {
          DataType: "Number",
          StringValue: String(nextAttempt),
        },
      },
    })
    .promise();

  return { nextAttempt, delaySeconds };
}

export async function consumeMessages({
  maxNumberOfMessages = 5,
  waitTimeSeconds = 20,
  visibilityTimeout = 120,
} = {}) {
  assertQueueUrl();

  const response = await sqs
    .receiveMessage({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: maxNumberOfMessages,
      WaitTimeSeconds: waitTimeSeconds,
      VisibilityTimeout: visibilityTimeout,
      MessageAttributeNames: ["All"],
      AttributeNames: ["All"],
    })
    .promise();

  return response.Messages || [];
}

export async function deleteMessage(receiptHandle) {
  assertQueueUrl();

  await sqs
    .deleteMessage({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    })
    .promise();
}
