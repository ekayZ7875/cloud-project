import { dynamoDb } from "../config/dynamoDb.js";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";

const USER_TABLE = process.env.USER_TABLE || process.env.USERS_TABLE || "ChunklyUsers";

/**
 * Increment the user's Gemini token usage and query count in DynamoDB.
 * Uses atomic updates to avoid read-modify-write race conditions.
 * 
 * @param {string} email User email (partition key)
 * @param {number} tokensCount Number of tokens consumed
 * @param {boolean} incrementQuery Whether to increment the query count (for chat/QA)
 */
export async function incrementUserTokens(email, tokensCount, incrementQuery = false) {
  if (!email || !tokensCount || tokensCount <= 0) return;

  try {
    let updateExpression = "SET tokensUsed = if_not_exists(tokensUsed, :zero) + :tokens";
    const expressionAttributeValues = {
      ":tokens": tokensCount,
      ":zero": 0,
    };

    if (incrementQuery) {
      updateExpression += ", queriesCount = if_not_exists(queriesCount, :zero) + :one";
      expressionAttributeValues[":one"] = 1;
    }

    await dynamoDb.send(
      new UpdateCommand({
        TableName: USER_TABLE,
        Key: { email },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
      })
    );
  } catch (err) {
    console.error(`[UsageTracker] Failed to increment user tokens for ${email}:`, err);
  }
}
