import { dynamoDb } from "../config/dynamoDb.js";
import { errorHandler } from "../utils/errorHandler.js";
import { generateKnowledgeAssistantResponse } from "../services/ai.service.js";
import { buildSmartInsights } from "../services/insights.service.js";
import { getProcessingJob } from "../services/metadata.service.js";
import { PIPELINE_STATUS } from "../constants/pipeline.constants.js";
import { incrementUserTokens } from "../utils/usageTracker.js";
import dotenv from "dotenv";
dotenv.config();

const FILES_TABLE = process.env.FILES_TABLE || "ChunklyUserFiles";

export const handleAiQuery = async (req, res) => {
  try {
    const user = req.user;
    const userId = user.userId;
    const { query, fileId, folderId } = req.body;

    if (!query) {
      return res.status(400).send(errorHandler(400, "Bad Request", "query is required"));
    }

    // 1. Fetch relevant files for the user
    const result = await dynamoDb
      .query({
        TableName: FILES_TABLE,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: {
          ":uid": userId,
        },
      })
      .promise();

    let files = result.Items || [];

    // Filter out deleted files context
    files = files.filter(f => !f.isDeleted && !f.is_deleted);

    if (fileId) {
      files = files.filter(f => f.fileId === fileId);
    } else if (folderId) {
      files = files.filter(f => f.folderId === folderId);
    }

    if (files.length === 0) {
      return res.status(200).json({
        success: true,
        response: "⚠️ I could not find this information in your files."
      });
    }

    const filesWithStatus = await Promise.all(
      files.map(async (file) => {
        if (!file.jobId) {
          return { file, status: PIPELINE_STATUS.COMPLETED, job: null };
        }

        const job = await getProcessingJob({ userId, jobId: file.jobId });
        return {
          file,
          status: job?.status || PIPELINE_STATUS.PENDING,
          job,
        };
      })
    );

    const completedFiles = filesWithStatus
      .filter((entry) => entry.status === PIPELINE_STATUS.COMPLETED)
      .map((entry) => entry.file);

    if (completedFiles.length === 0) {
      return res.status(200).json({
        success: true,
        data: "⏳ Your file is still being processed. Please retry in a few moments.",
        processing: filesWithStatus.map((entry) => ({
          fileId: entry.file.fileId,
          fileName: entry.file.fileName,
          jobId: entry.file.jobId || null,
          status: entry.status,
          lastError: entry.job?.lastError || null,
        })),
      });
    }

    const fileIds = completedFiles.map(f => f.fileId);
    const fileMappings = completedFiles.reduce((acc, f) => {
      acc[f.fileId] = f.fileName;
      return acc;
    }, {});

    // 2. Query the Knowledge Assistant
    const { answer, tokensUsed } = await generateKnowledgeAssistantResponse(query, fileIds, fileMappings);

    // Track token usage
    if (user && user.email) {
      await incrementUserTokens(user.email, tokensUsed, true);
    }

    // 3. Return the response
    return res.status(200).json({
      success: true,
      data: answer
    });

  } catch (error) {
    console.error("AI Query Error:", error);
    return res.status(500).send(errorHandler(500, "Internal Server Error", "Failed to process AI query"));
  }
};

export const getSmartInsights = async (req, res) => {
  try {
    const userId = req.user.userId;
    const windowDays = Number(req.query.windowDays || 7);
    const deadlineLimit = Number(req.query.deadlineLimit || 5);

    const data = await buildSmartInsights(userId, {
      windowDays,
      deadlineLimit,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Smart Insights Error:", error);
    return res
      .status(500)
      .send(errorHandler(500, "Internal Server Error", "Failed to build smart insights"));
  }
};
