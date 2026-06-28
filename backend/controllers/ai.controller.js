import { dynamoDb } from "../config/dynamoDb.js";
import { errorHandler } from "../utils/errorHandler.js";
import { generateKnowledgeAssistantResponse } from "../services/ai.service.js";
import { buildSmartInsights } from "../services/insights.service.js";
import { getProcessingJob } from "../services/metadata.service.js";
import { PIPELINE_STATUS } from "../constants/pipeline.constants.js";
import {
  getUserChats,
  getChatSession,
  createChatSession,
  appendMessageToChat,
} from "../services/chat.service.js";
import dotenv from "dotenv";
dotenv.config();

const FILES_TABLE = process.env.FILES_TABLE || "ChunklyUserFiles";

export const handleAiQuery = async (req, res) => {
  try {
    const user = req.user;
    const userId = user.userId;
    const { query, fileId, folderId, studyMode, chatId } = req.body;

    if (!query) {
      return res.status(400).send(errorHandler(400, "Bad Request", "query is required"));
    }

    // 1. Retrieve history or auto-generate a new chatId & determine active file/folder context
    let history = [];
    let sessionChatId = chatId;
    let activeFileId = fileId;
    let activeFolderId = folderId;

    if (sessionChatId) {
      const chat = await getChatSession(userId, sessionChatId);
      if (!chat) {
        return res.status(404).send(errorHandler(404, "Not Found", "Chat session not found"));
      }
      history = chat.messages || [];
      activeFileId = fileId || chat.fileId || null;
      activeFolderId = folderId || chat.folderId || null;
    } else {
      const truncatedTitle = query.length > 40 ? query.substring(0, 40) + "..." : query;
      const newChat = await createChatSession(userId, truncatedTitle, fileId, folderId);
      sessionChatId = newChat.chatId;
      activeFileId = fileId;
      activeFolderId = folderId;
      history = [];
    }

    // 2. Fetch relevant files for the user
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

    if (activeFileId) {
      files = files.filter(f => f.fileId === activeFileId);
    } else if (activeFolderId) {
      files = files.filter(f => f.folderId === activeFolderId);
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

    // 3. Query the Knowledge Assistant
    const answer = await generateKnowledgeAssistantResponse(query, fileIds, fileMappings, studyMode, history);

    // 4. Save conversation turn to DB
    await appendMessageToChat(userId, sessionChatId, query, answer);

    // 5. Return the response
    return res.status(200).json({
      success: true,
      data: answer,
      chatId: sessionChatId
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

export const handleGetChats = async (req, res) => {
  try {
    const userId = req.user.userId;
    const chats = await getUserChats(userId);
    return res.status(200).json({ success: true, data: chats });
  } catch (error) {
    console.error("Get Chats Error:", error);
    return res.status(500).send(errorHandler(500, "Internal Server Error", "Failed to fetch chats"));
  }
};

export const handleCreateChat = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { title, fileId, folderId } = req.body;
    const chat = await createChatSession(userId, title, fileId, folderId);
    return res.status(201).json({ success: true, data: chat });
  } catch (error) {
    console.error("Create Chat Error:", error);
    return res.status(500).send(errorHandler(500, "Internal Server Error", "Failed to create chat"));
  }
};

export const handleGetChatDetails = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { chatId } = req.params;
    const chat = await getChatSession(userId, chatId);
    if (!chat) {
      return res.status(404).send(errorHandler(404, "Not Found", "Chat session not found"));
    }
    return res.status(200).json({ success: true, data: chat });
  } catch (error) {
    console.error("Get Chat Details Error:", error);
    return res.status(500).send(errorHandler(500, "Internal Server Error", "Failed to fetch chat details"));
  }
};
