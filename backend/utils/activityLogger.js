import { dynamoDb } from '../config/dynamoDb.js'
import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { generateId } from './generatedID.js'

export const logActivity = async (userId, type, meta = {}) => {
  try {
    await dynamoDb.send(new PutCommand({
      TableName: process.env.ACTIVITY_TABLE || "ChunklyActivityTable",
      Item: {
        userId, // user email
        activityId: generateId('activity'),
        type,
        ...meta,
        timestamp: new Date().toISOString(),
      },
    }))
  } catch (error) {
    console.error("Failed to log activity:", error)
  }
}
