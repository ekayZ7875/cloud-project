import dotenv from "dotenv";
import { dynamoDb } from "../config/dynamoDb.js";
import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { PIPELINE_STATUS } from "../constants/pipeline.constants.js";

dotenv.config();

const FILE_PROCESSING_TABLE = process.env.FILE_PROCESSING_TABLE;

function requireTable() {
  if (!FILE_PROCESSING_TABLE) {
    throw new Error("FILE_PROCESSING_TABLE is not configured");
  }
}

export async function createProcessingJob({ jobId, userId, fileId, s3Url }) {
  requireTable();

  const now = new Date().toISOString();
  const item = {
    userId,
    jobId,
    fileId,
    s3Url,
    status: PIPELINE_STATUS.PENDING,
    attempt: 0,
    createdAt: now,
    updatedAt: now,
  };

  await dynamoDb.send(
    new PutCommand({
      TableName: FILE_PROCESSING_TABLE,
      Item: item,
      ConditionExpression: "attribute_not_exists(jobId)",
    })
  );

  return item;
}

export async function markProcessingStarted({ userId, jobId, attempt }) {
  requireTable();

  const now = new Date().toISOString();

  await dynamoDb.send(
    new UpdateCommand({
      TableName: FILE_PROCESSING_TABLE,
      Key: { userId, jobId },
      UpdateExpression:
        "SET #status = :status, attempt = :attempt, updatedAt = :updatedAt, startedAt = if_not_exists(startedAt, :startedAt)",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": PIPELINE_STATUS.PROCESSING,
        ":attempt": attempt,
        ":updatedAt": now,
        ":startedAt": now,
      },
    })
  );
}

export async function markProcessingPendingRetry({ userId, jobId, attempt, errorMessage }) {
  requireTable();

  const now = new Date().toISOString();

  await dynamoDb.send(
    new UpdateCommand({
      TableName: FILE_PROCESSING_TABLE,
      Key: { userId, jobId },
      UpdateExpression:
        "SET #status = :status, attempt = :attempt, updatedAt = :updatedAt, lastError = :lastError",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": PIPELINE_STATUS.PENDING,
        ":attempt": attempt,
        ":updatedAt": now,
        ":lastError": errorMessage,
      },
    })
  );
}

export async function markProcessingCompleted({ userId, jobId, result }) {
  requireTable();

  const now = new Date().toISOString();

  await dynamoDb.send(
    new UpdateCommand({
      TableName: FILE_PROCESSING_TABLE,
      Key: { userId, jobId },
      UpdateExpression:
        "SET #status = :status, updatedAt = :updatedAt, completedAt = :completedAt, analysis = :analysis REMOVE lastError",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": PIPELINE_STATUS.COMPLETED,
        ":updatedAt": now,
        ":completedAt": now,
        ":analysis": result,
      },
    })
  );
}

export async function markProcessingFailed({ userId, jobId, attempt, errorMessage }) {
  requireTable();

  const now = new Date().toISOString();

  await dynamoDb.send(
    new UpdateCommand({
      TableName: FILE_PROCESSING_TABLE,
      Key: { userId, jobId },
      UpdateExpression:
        "SET #status = :status, updatedAt = :updatedAt, failedAt = :failedAt, attempt = :attempt, lastError = :lastError",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": PIPELINE_STATUS.FAILED,
        ":updatedAt": now,
        ":failedAt": now,
        ":attempt": attempt,
        ":lastError": errorMessage,
      },
    })
  );
}

export async function getProcessingJob({ userId, jobId }) {
  requireTable();

  const result = await dynamoDb.send(
    new GetCommand({
      TableName: FILE_PROCESSING_TABLE,
      Key: { userId, jobId },
    })
  );

  return result.Item || null;
}
