import { dynamoDb } from '../config/dynamoDb.js'
import { QueryCommand, GetCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import s3 from '../config/s3.js'
import {asyncHandler} from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { logActivity } from '../utils/activityLogger.js'

// ─── Helper ───────────────────────────────────────────────────────────────────


// @desc    Get all trashed files for user
// @route   GET /api/trash
// @access  Private
const getTrashedFiles = asyncHandler(async (req, res) => {
  const { email: userId } = req.user

  const { Items } = await dynamoDb.send(new QueryCommand({
    TableName: process.env.TRASH_TABLE,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }))

  // Sort by trashedAt — most recently trashed first
  const sorted = (Items || []).sort(
    (a, b) => new Date(b.trashedAt) - new Date(a.trashedAt)
  )

  res.status(200).json({ success: true, files: sorted, count: sorted.length })
})

// @desc    Restore a file from trash
// @route   PATCH /api/trash/:fileId/restore
// @access  Private
const restoreFromTrash = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { fileId } = req.params

  const { Item: file } = await dynamoDb.send(new GetCommand({
    TableName: process.env.TRASH_TABLE,
    Key: { userId, fileId },
  }))

  if (!file) throw new ApiError(404, 'File not found in trash')

  // Restore in FilesTable
  await dynamoDb.send(new UpdateCommand({
    TableName: process.env.FILES_TABLE,
    Key: { userId, fileId },
    UpdateExpression: 'SET trashed = :f, updatedAt = :u',
    ExpressionAttributeValues: { ':f': false, ':u': new Date().toISOString() },
  }))

  // Remove from TrashTable
  await dynamoDb.send(new DeleteCommand({
    TableName: process.env.TRASH_TABLE,
    Key: { userId, fileId },
  }))

  await logActivity(userId, 'RESTORE', { fileId, fileName: file.name })

  res.status(200).json({ success: true, message: 'File restored successfully', file })
})

// @desc    Permanently delete a single file
// @route   DELETE /api/trash/:fileId
// @access  Private
const permanentDeleteFile = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { fileId } = req.params

  const { Item: file } = await dynamoDb.send(new GetCommand({
    TableName: process.env.TRASH_TABLE,
    Key: { userId, fileId },
  }))

  if (!file) throw new ApiError(404, 'File not found in trash')

  // Delete from S3
  await s3.send(new DeleteObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: file.s3Key,
  }))

  // Delete from both tables
  await dynamoDb.send(new DeleteCommand({
    TableName: process.env.TRASH_TABLE,
    Key: { userId, fileId },
  }))

  await dynamoDb.send(new DeleteCommand({
    TableName: process.env.FILES_TABLE,
    Key: { userId, fileId },
  }))

  await logActivity(userId, 'PERMANENT_DELETE', { fileId, fileName: file.name })

  res.status(200).json({ success: true, message: 'File permanently deleted' })
})

// @desc    Empty entire trash
// @route   DELETE /api/trash
// @access  Private
const emptyTrash = asyncHandler(async (req, res) => {
  const { email: userId } = req.user

  const { Items } = await dynamoDb.send(new QueryCommand({
    TableName: process.env.TRASH_TABLE,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }))

  if (!Items?.length) {
    return res.status(200).json({ success: true, message: 'Trash is already empty' })
  }

  await Promise.all(
    Items.map(async (file) => {
      await s3.send(new DeleteObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: file.s3Key,
      }))
      await dynamoDb.send(new DeleteCommand({
        TableName: process.env.TRASH_TABLE,
        Key: { userId, fileId: file.fileId },
      }))
      await dynamoDb.send(new DeleteCommand({
        TableName: process.env.FILES_TABLE,
        Key: { userId, fileId: file.fileId },
      }))
    })
  )

  await logActivity(userId, 'EMPTY_TRASH', { count: Items.length })

  res.status(200).json({ success: true, message: `${Items.length} files permanently deleted` })
})

export { getTrashedFiles, restoreFromTrash, permanentDeleteFile, emptyTrash }