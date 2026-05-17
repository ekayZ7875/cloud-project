import { dynamoDb } from '../config/dynamoDb.js'
import { PutCommand, DeleteCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import {asyncHandler} from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'

// ─── Helper ───────────────────────────────────────────────────────────────────

const checkFileOwnership = async (userId, fileId) => {
  const { Item: file } = await dynamoDb.send(new GetCommand({
    TableName: process.env.FILES_TABLE,
    Key: { userId, fileId },
  }))

  if (!file) throw new ApiError(404, 'File not found')
  if (file.trashed) throw new ApiError(410, 'File is in trash')

  return file
}

// ─── Controllers ──────────────────────────────────────────────────────────────

// @desc    Share a file with another user by email
// @route   POST /api/share/:fileId
// @access  Private
const shareFile = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { fileId } = req.params
  const { sharedWithEmail } = req.body

  if (!sharedWithEmail) throw new ApiError(400, 'sharedWithEmail is required')
  if (sharedWithEmail === userId) throw new ApiError(400, 'You cannot share a file with yourself')

  // Only owner can share
  await checkFileOwnership(userId, fileId)

  // Check if already shared with this email
  const { Item: existingShare } = await dynamoDb.send(new GetCommand({
    TableName: process.env.SHARED_TABLE,
    Key: { fileId, sharedWithEmail },
  }))

  if (existingShare) throw new ApiError(409, 'File already shared with this user')

  await dynamoDb.send(new PutCommand({
    TableName: process.env.SHARED_TABLE,
    Item: {
      fileId,
      sharedWithEmail,
      sharedByEmail: userId,
      sharedAt: new Date().toISOString(),
    },
  }))

  res.status(201).json({ success: true, message: `File shared with ${sharedWithEmail}` })
})

// @desc    Revoke a user's access to a file
// @route   DELETE /api/share/:fileId/:sharedWithEmail
// @access  Private
const unshareFile = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { fileId, sharedWithEmail } = req.params

  // Only owner can unshare
  await checkFileOwnership(userId, fileId)

  const { Item: existingShare } = await dynamoDb.send(new GetCommand({
    TableName: process.env.SHARED_TABLE,
    Key: { fileId, sharedWithEmail },
  }))

  if (!existingShare) throw new ApiError(404, 'Share record not found')

  await dynamoDb.send(new DeleteCommand({
    TableName: process.env.SHARED_TABLE,
    Key: { fileId, sharedWithEmail },
  }))

  res.status(200).json({ success: true, message: `Access revoked for ${sharedWithEmail}` })
})

// @desc    Get all files you have shared with others
// @route   GET /api/share/by-me
// @access  Private
const getSharedByMe = asyncHandler(async (req, res) => {
  const { email: userId } = req.user

  // Query SharedTable by sharedByEmail using GSI
  const { Items: sharedRecords } = await dynamoDb.send(new QueryCommand({
    TableName: process.env.SHARED_TABLE,
    IndexName: 'sharedByEmail-index',
    KeyConditionExpression: 'sharedByEmail = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }))

  if (!sharedRecords.length) {
    return res.status(200).json({ success: true, files: [] })
  }

  // Fetch actual file details for each shared record
  const files = await Promise.all(
    sharedRecords.map(async (record) => {
      const { Item: file } = await dynamoDb.send(new GetCommand({
        TableName: process.env.FILES_TABLE,
        Key: { userId, fileId: record.fileId },
      }))
      return file ? { ...file, sharedWithEmail: record.sharedWithEmail, sharedAt: record.sharedAt } : null
    })
  )

  res.status(200).json({ success: true, files: files.filter(Boolean) })
})

// @desc    Get all files others have shared with you
// @route   GET /api/share/with-me
// @access  Private
const getSharedWithMe = asyncHandler(async (req, res) => {
  const { email: userId } = req.user

  // Query SharedTable by sharedWithEmail using GSI
  const { Items: sharedRecords } = await dynamoDb.send(new QueryCommand({
    TableName: process.env.SHARED_TABLE,
    IndexName: 'sharedWithEmail-index',
    KeyConditionExpression: 'sharedWithEmail = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }))

  if (!sharedRecords.length) {
    return res.status(200).json({ success: true, files: [] })
  }

  // Fetch actual file details for each shared record
  const files = await Promise.all(
    sharedRecords.map(async (record) => {
      const { Item: file } = await dynamoDb.send(new GetCommand({
        TableName: process.env.FILES_TABLE,
        Key: { userId: record.sharedByEmail, fileId: record.fileId },
      }))
      return file ? { ...file, sharedByEmail: record.sharedByEmail, sharedAt: record.sharedAt } : null
    })
  )

  res.status(200).json({ success: true, files: files.filter(Boolean) })
})

export { shareFile, unshareFile, getSharedByMe, getSharedWithMe }