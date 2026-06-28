import { CreateTableCommand, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { dynamoDb } from "../config/dynamoDb.js";
import { generateId } from "../utils/generatedID.js";
import logger from "../libs/logger.js";

const CHATS_TABLE = process.env.CHATS_TABLE || "ChunklyChats";

// Initialization function to verify table exists or create it
export async function initializeChatTable() {
  try {
    // Check if table exists
    await dynamoDb.send(new DescribeTableCommand({ TableName: CHATS_TABLE }));
    logger.info(`DynamoDB Chat Table "${CHATS_TABLE}" exists.`);
  } catch (error) {
    if (error.name === "ResourceNotFoundException") {
      logger.info(`DynamoDB Chat Table "${CHATS_TABLE}" does not exist. Creating it now...`);
      try {
        await dynamoDb.send(new CreateTableCommand({
          TableName: CHATS_TABLE,
          KeySchema: [
            { AttributeName: "userId", KeyType: "HASH" },
            { AttributeName: "chatId", KeyType: "RANGE" }
          ],
          AttributeDefinitions: [
            { AttributeName: "userId", AttributeType: "S" },
            { AttributeName: "chatId", AttributeType: "S" }
          ],
          BillingMode: "PAY_PER_REQUEST"
        }));
        logger.info(`Successfully created DynamoDB Chat Table "${CHATS_TABLE}".`);
      } catch (createError) {
        logger.error(`Failed to create DynamoDB Chat Table "${CHATS_TABLE}":`, createError);
      }
    } else {
      logger.error(`Error describing DynamoDB Chat Table "${CHATS_TABLE}":`, error);
    }
  }
}

// Automatically initialize table on module load
initializeChatTable().catch((err) => {
  logger.error("Chat Table initialization error:", err);
});

// Retrieve all chats for a user
export async function getUserChats(userId) {
  const result = await dynamoDb.query({
    TableName: CHATS_TABLE,
    KeyConditionExpression: "userId = :uid",
    ExpressionAttributeValues: {
      ":uid": userId,
    },
  }).promise();
  
  return result.Items || [];
}

// Retrieve details for a single chat session
export async function getChatSession(userId, chatId) {
  const result = await dynamoDb.get({
    TableName: CHATS_TABLE,
    Key: { userId, chatId },
  }).promise();
  
  return result.Item || null;
}

// Create a new chat session
export async function createChatSession(userId, title = "New Conversation") {
  const chatId = `CHAT_${generateId()}`;
  const now = new Date().toISOString();
  const newChat = {
    userId,
    chatId,
    title,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  
  await dynamoDb.put({
    TableName: CHATS_TABLE,
    Item: newChat,
  }).promise();
  
  return newChat;
}

// Add a message pair (user query + model answer) to a chat session
export async function appendMessageToChat(userId, chatId, userMessage, modelMessage) {
  const now = new Date().toISOString();
  
  // Use UpdateExpression to append messages atomically and update timestamp
  return dynamoDb.update({
    TableName: CHATS_TABLE,
    Key: { userId, chatId },
    UpdateExpression: "SET messages = list_append(if_not_exists(messages, :empty_list), :new_messages), updatedAt = :now",
    ExpressionAttributeValues: {
      ":empty_list": [],
      ":new_messages": [
        { role: "user", content: userMessage, timestamp: now },
        { role: "model", content: modelMessage, timestamp: now },
      ],
      ":now": now,
    },
    ReturnValues: "ALL_NEW",
  }).promise();
}
