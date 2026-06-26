import { ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { dynamoDb } from "../config/dynamoDb.js";
import s3 from "../config/s3.js";
import { getQueueDetails } from "./queue.service.js";
import { getQdrantDetails } from "./qdrant.service.js";
import { getGeminiDetails } from "./gemini.service.js";
import logger from "../libs/logger.js";

export async function checkSystemHealth() {
  const healthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    system: {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      platform: process.platform,
      nodeVersion: process.version,
      env: process.env.NODE_ENV || "development"
    },
    services: {
      dynamodb: { status: "healthy", details: null, error: null },
      s3: { status: "healthy", details: null, error: null },
      sqs: { status: "healthy", details: null, error: null },
      qdrant: { status: "healthy", details: null, error: null },
      llm: { status: "healthy", details: null, error: null }
    }
  };

  // 1. Check DynamoDB
  try {
    const listResult = await dynamoDb.send(new ListTablesCommand({}));
    healthStatus.services.dynamodb.details = {
      region: process.env.DYNAMODB_AWS_REGION || process.env.AWS_REGION || "us-east-1",
      configuredTables: {
        users: process.env.USERS_TABLE,
        files: process.env.FILES_TABLE,
        trash: process.env.TRASH_TABLE,
        folders: process.env.FOLDERS_TABLE,
        processing: process.env.FILE_PROCESSING_TABLE,
        activity: process.env.ACTIVITY_TABLE,
        share: process.env.SHARED_TABLE
      },
      availableTables: listResult.TableNames || [],
      availableTablesCount: (listResult.TableNames || []).length
    };
  } catch (error) {
    logger.error("Health check - DynamoDB failed:", error);
    healthStatus.services.dynamodb.status = "unhealthy";
    healthStatus.services.dynamodb.error = error.message || String(error);
    healthStatus.status = "unhealthy";
  }

  // 2. Check S3
  try {
    const bucketName = process.env.AWS_BUCKET_NAME;
    if (!bucketName) {
      throw new Error("AWS_BUCKET_NAME env variable is not configured");
    }
    await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
    healthStatus.services.s3.details = {
      bucket: bucketName,
      region: process.env.AWS_REGION || "us-east-1"
    };
  } catch (error) {
    logger.error("Health check - S3 failed:", error);
    healthStatus.services.s3.status = "unhealthy";
    healthStatus.services.s3.error = error.message || String(error);
    healthStatus.status = "unhealthy";
  }

  // 3. Check SQS
  try {
    const queueDetails = await getQueueDetails();
    healthStatus.services.sqs.details = queueDetails;
  } catch (error) {
    logger.error("Health check - SQS failed:", error);
    healthStatus.services.sqs.status = "unhealthy";
    healthStatus.services.sqs.error = error.message || String(error);
    healthStatus.status = "unhealthy";
  }

  // 4. Check Qdrant
  try {
    const qdrantDetails = await getQdrantDetails();
    healthStatus.services.qdrant.details = qdrantDetails;
  } catch (error) {
    logger.error("Health check - Qdrant failed:", error);
    healthStatus.services.qdrant.status = "unhealthy";
    healthStatus.services.qdrant.error = error.message || String(error);
    healthStatus.status = "unhealthy";
  }

  // 5. Check LLM (Gemini)
  try {
    const geminiDetails = await getGeminiDetails();
    healthStatus.services.llm.details = geminiDetails;
  } catch (error) {
    logger.error("Health check - Gemini LLM failed:", error);
    healthStatus.services.llm.status = "unhealthy";
    healthStatus.services.llm.error = error.message || String(error);
    healthStatus.status = "unhealthy";
  }

  return healthStatus;
}
