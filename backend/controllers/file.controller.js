import { dynamoDb } from '../config/dynamoDb.js'
import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import s3 from '../config/s3.js'
import {asyncHandler} from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { generateId } from '../utils/generatedID.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const logActivity = async (userId, type, meta = {}) => {
  await dynamoDb.send(new PutCommand({
    TableName: process.env.ACTIVITY_TABLE,
    Item: {
      userId,
      activityId: generateId('activity'),
      type,
      ...meta,
      timestamp: new Date().toISOString(),
    },
  }))
}

// Check if user is owner OR has shared access to the file
const checkAccess = async (requestingEmail, fileId, ownerId) => {
  // If user is the owner, allow
  if (requestingEmail === ownerId) return true

  // Check SharedTable for shared access
  const { Item: shareRecord } = await dynamoDb.send(new GetCommand({
    TableName: process.env.SHARED_TABLE,
    Key: { fileId, sharedWithEmail: requestingEmail },
  }))

  if (!shareRecord) throw new ApiError(403, 'Access denied')

  return true
}

// ─── Upload ───────────────────────────────────────────────────────────────────

// @desc    Upload file to S3 + save metadata in DynamoDB
// @route   POST /api/files/upload
// @access  Private
const uploadFile = asyncHandler(async (req, res) => {
  console.log('req.file:', req.file)
  console.log('req.body:', req.body)
  console.log('req.user:', req.user)
  if (!req.file) throw new ApiError(400, 'No file provided')

  const { email: userId } = req.user
  const { folderId = null, tier = 'working' } = req.body
  const fileId = generateId('file')
  const s3Key = `${userId}/${fileId}/${req.file.originalname}`

  await s3.send(new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: s3Key,
    Body: req.file.buffer,
    ContentType: req.file.mimetype,
  }))

  const fileItem = {
    userId,
    fileId,
    name: req.file.originalname,
    size: req.file.size,
    mimeType: req.file.mimetype,
    s3Key,
    folderId,
    tier,
    starred: false,
    trashed: false,
    uploadedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await dynamoDb.send(new PutCommand({
    TableName: process.env.FILES_TABLE,
    Item: fileItem,
  }))

  await logActivity(userId, 'UPLOAD', { fileId, fileName: req.file.originalname })

  res.status(201).json({ success: true, file: fileItem })
})

// ─── Read ─────────────────────────────────────────────────────────────────────

// @desc    Get all non-trashed files for user
// @route   GET /api/files
// @access  Private
const getUserFiles = asyncHandler(async (req, res) => {
  const { email: userId } = req.user

  const { Items } = await dynamoDb.send(new QueryCommand({
    TableName: process.env.FILES_TABLE,
    KeyConditionExpression: 'userId = :uid',
    FilterExpression: 'trashed = :f',
    ExpressionAttributeValues: { ':uid': userId, ':f': false },
  }))

  res.status(200).json({ success: true, files: Items })
})

// @desc    Get a single file by fileId
// @route   GET /api/files/:fileId
// @access  Private
const getSingleFile = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { fileId } = req.params

  // First try to find the file by fileId across any owner
  const { Item: file } = await dynamoDb.send(new GetCommand({
    TableName: process.env.FILES_TABLE,
    Key: { userId: req.query.ownerId || userId, fileId },
  }))

  if (!file) throw new ApiError(404, 'File not found')
  if (file.trashed) throw new ApiError(410, 'File is in trash')

  await checkAccess(userId, fileId, file.userId)

  res.status(200).json({ success: true, file })
})

// ─── Trash ────────────────────────────────────────────────────────────────────

// @desc    Soft delete — copy to TrashTable, mark trashed in FilesTable
// @route   DELETE /api/files/:fileId
// @access  Private
const softDeleteFile = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { fileId } = req.params

  const { Item: file } = await dynamoDb.send(new GetCommand({
    TableName: process.env.FILES_TABLE,
    Key: { userId: req.query.ownerId || userId, fileId },
  }))

  if (!file) throw new ApiError(404, 'File not found')

  await checkAccess(userId, fileId, file.userId)

  await dynamoDb.send(new PutCommand({
    TableName: process.env.TRASH_TABLE,
    Item: { ...file, trashedAt: new Date().toISOString() },
  }))

  await dynamoDb.send(new UpdateCommand({
    TableName: process.env.FILES_TABLE,
    Key: { userId: file.userId, fileId },
    UpdateExpression: 'SET trashed = :t, updatedAt = :u',
    ExpressionAttributeValues: { ':t': true, ':u': new Date().toISOString() },
  }))

  await logActivity(userId, 'TRASH', { fileId, fileName: file.name })

  res.status(200).json({ success: true, message: 'File moved to trash' })
})

// @desc    Get all trashed files for user
// @route   GET /api/files/trash
// @access  Private
const getTrashedFiles = asyncHandler(async (req, res) => {
  const { email: userId } = req.user

  const { Items } = await dynamoDb.send(new QueryCommand({
    TableName: process.env.TRASH_TABLE,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }))

  res.status(200).json({ success: true, files: Items })
})

// @desc    Restore file from trash
// @route   PATCH /api/files/trash/:fileId/restore
// @access  Private
const restoreFromTrash = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { fileId } = req.params

  const { Item: file } = await dynamoDb.send(new GetCommand({
    TableName: process.env.TRASH_TABLE,
    Key: { userId, fileId },
  }))

  if (!file) throw new ApiError(404, 'File not found in trash')

  await dynamoDb.send(new UpdateCommand({
    TableName: process.env.FILES_TABLE,
    Key: { userId, fileId },
    UpdateExpression: 'SET trashed = :f, updatedAt = :u',
    ExpressionAttributeValues: { ':f': false, ':u': new Date().toISOString() },
  }))

  await dynamoDb.send(new DeleteCommand({
    TableName: process.env.TRASH_TABLE,
    Key: { userId, fileId },
  }))

  await logActivity(userId, 'RESTORE', { fileId, fileName: file.name })

  res.status(200).json({ success: true, message: 'File restored successfully' })
})

// @desc    Permanently delete file from S3 + both tables
// @route   DELETE /api/files/trash/:fileId/permanent
// @access  Private
const permanentDeleteFile = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { fileId } = req.params

  const { Item: file } = await dynamoDb.send(new GetCommand({
    TableName: process.env.TRASH_TABLE,
    Key: { userId, fileId },
  }))

  if (!file) throw new ApiError(404, 'File not found in trash')

  await s3.send(new DeleteObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: file.s3Key,
  }))

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

// @desc    Empty entire trash for user
// @route   DELETE /api/files/trash/empty
// @access  Private
const emptyTrash = asyncHandler(async (req, res) => {
  const { email: userId } = req.user

  const { Items } = await dynamoDb.send(new QueryCommand({
    TableName: process.env.TRASH_TABLE,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }))

  if (!Items.length) {
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

// ─── Star ─────────────────────────────────────────────────────────────────────

// @desc    Toggle starred status of a file
// @route   PATCH /api/files/:fileId/star
// @access  Private
const toggleStarFile = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { fileId } = req.params

  const { Item: file } = await dynamoDb.send(new GetCommand({
    TableName: process.env.FILES_TABLE,
    Key: { userId: req.query.ownerId || userId, fileId },
  }))

  if (!file) throw new ApiError(404, 'File not found')

  await checkAccess(userId, fileId, file.userId)

  const newStarred = !file.starred

  await dynamoDb.send(new UpdateCommand({
    TableName: process.env.FILES_TABLE,
    Key: { userId: file.userId, fileId },
    UpdateExpression: 'SET starred = :s, updatedAt = :u',
    ExpressionAttributeValues: { ':s': newStarred, ':u': new Date().toISOString() },
  }))

  res.status(200).json({ success: true, starred: newStarred })
})

// @desc    Get all starred files for user
// @route   GET /api/files/starred
// @access  Private
const getStarredFiles = asyncHandler(async (req, res) => {
  const { email: userId } = req.user

  const { Items } = await dynamoDb.send(new QueryCommand({
    TableName: process.env.FILES_TABLE,
    KeyConditionExpression: 'userId = :uid',
    FilterExpression: 'starred = :s AND trashed = :f',
    ExpressionAttributeValues: { ':uid': userId, ':s': true, ':f': false },
  }))

  res.status(200).json({ success: true, files: Items })
})

// ─── Recent ───────────────────────────────────────────────────────────────────

// @desc    Get 10 most recently uploaded files
// @route   GET /api/files/recent
// @access  Private
const getRecentUploads = asyncHandler(async (req, res) => {
  const { email: userId } = req.user

  const { Items } = await dynamoDb.send(new QueryCommand({
    TableName: process.env.FILES_TABLE,
    KeyConditionExpression: 'userId = :uid',
    FilterExpression: 'trashed = :f',
    ExpressionAttributeValues: { ':uid': userId, ':f': false },
  }))

  const recent = Items
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    .slice(0, 10)

  res.status(200).json({ success: true, files: recent })
})

// ─── Download ─────────────────────────────────────────────────────────────────

// @desc    Generate a pre-signed S3 URL for downloading a file
// @route   GET /api/files/:fileId/download
// @access  Private
const downloadFile = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { fileId } = req.params

  const { Item: file } = await dynamoDb.send(new GetCommand({
    TableName: process.env.FILES_TABLE,
    Key: { userId: req.query.ownerId || userId, fileId },
  }))

  if (!file) throw new ApiError(404, 'File not found')
  if (file.trashed) throw new ApiError(410, 'File is in trash')

  await checkAccess(userId, fileId, file.userId)

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: file.s3Key,
    }),
    { expiresIn: 60 * 5 } // 5 minutes
  )

  await logActivity(userId, 'DOWNLOAD', { fileId, fileName: file.name })

  res.status(200).json({ success: true, url })
})

// ─── Rename ───────────────────────────────────────────────────────────────────

// @desc    Rename a file
// @route   PATCH /api/files/:fileId/rename
// @access  Private
const renameFile = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { fileId } = req.params
  const { name } = req.body

  if (!name || !name.trim()) throw new ApiError(400, 'New name is required')

  const { Item: file } = await dynamoDb.send(new GetCommand({
    TableName: process.env.FILES_TABLE,
    Key: { userId: req.query.ownerId || userId, fileId },
  }))

  if (!file) throw new ApiError(404, 'File not found')

  await checkAccess(userId, fileId, file.userId)

  await dynamoDb.send(new UpdateCommand({
    TableName: process.env.FILES_TABLE,
    Key: { userId: file.userId, fileId },
    UpdateExpression: 'SET #n = :n, updatedAt = :u',
    ExpressionAttributeNames: { '#n': 'name' },
    ExpressionAttributeValues: { ':n': name.trim(), ':u': new Date().toISOString() },
  }))

  await logActivity(userId, 'RENAME', { fileId, oldName: file.name, newName: name.trim() })

  res.status(200).json({ success: true, message: 'File renamed successfully' })
})

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  uploadFile,
  getUserFiles,
  getSingleFile,
  softDeleteFile,
  getTrashedFiles,
  toggleStarFile,
  getStarredFiles,
  getRecentUploads,
  downloadFile,
  renameFile,
  restoreFromTrash,
  permanentDeleteFile,
  emptyTrash,
}