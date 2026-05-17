import { dynamoDb } from '../config/dynamoDb.js'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import {asyncHandler} from '../utils/asyncHandler.js'

// @desc    Search files by name
// @route   GET /api/search?q=filename
// @access  Private
const searchFiles = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { q = '' } = req.query

  if (!q.trim()) {
    return res.status(200).json({ success: true, files: [] })
  }

  const { Items } = await dynamoDb.send(new QueryCommand({
    TableName: process.env.FILES_TABLE,
    KeyConditionExpression: 'userId = :uid',
    FilterExpression: 'trashed = :f',
    ExpressionAttributeValues: { ':uid': userId, ':f': false },
  }))

  const query = q.toLowerCase().trim()

  const results = (Items || []).filter(file =>
    file.name?.toLowerCase().includes(query) ||
    file.mimeType?.toLowerCase().includes(query) ||
    file.tier?.toLowerCase().includes(query)
  )

  res.status(200).json({ success: true, files: results, count: results.length })
})

export { searchFiles }