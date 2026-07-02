import { dynamoDb } from '../config/dynamoDb.js'
import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import {asyncHandler} from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { generateId } from '../utils/generatedID.js'
import { logActivity } from '../utils/activityLogger.js'

// @desc    Create a new folder
// @route   POST /api/folders
// @access  Private
const createFolder = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { name, parentFolderId = null } = req.body

  if (!name || !name.trim()) throw new ApiError(400, 'Folder name is required')

  const folderId = generateId('folder')

  const folderItem = {
    userId,
    folderId,
    name: name.trim(),
    parentFolderId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await dynamoDb.send(new PutCommand({
    TableName: process.env.FOLDERS_TABLE,
    Item: folderItem,
  }))

  res.status(201).json({ success: true, folder: folderItem })
})

// @desc    Get all folders for user
// @route   GET /api/folders
// @access  Private
const getAllFoldersForUser = asyncHandler(async (req, res) => {
  const { email: userId } = req.user

  const { Items } = await dynamoDb.send(new QueryCommand({
    TableName: process.env.FOLDERS_TABLE,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }))

  res.status(200).json({ success: true, folders: Items })
})

// @desc    Get all files inside a folder
// @route   GET /api/folders/:folderId/files
// @access  Private
const getFilesInFolder = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { folderId } = req.params

  const { Items } = await dynamoDb.send(new QueryCommand({
    TableName: process.env.FILES_TABLE,
    KeyConditionExpression: 'userId = :uid',
    FilterExpression: 'folderId = :fid AND trashed = :f',
    ExpressionAttributeValues: { ':uid': userId, ':fid': folderId, ':f': false },
  }))

  res.status(200).json({ success: true, files: Items })
})

// @desc    Move a single file to a folder
// @route   PATCH /api/folders/:folderId/files/:fileId
// @access  Private
const moveFileToFolder = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { folderId, fileId } = req.params

  const { Item: folder } = await dynamoDb.send(new GetCommand({
    TableName: process.env.FOLDERS_TABLE,
    Key: { userId, folderId },
  }))

  if (!folder) throw new ApiError(404, 'Folder not found')

  const { Item: file } = await dynamoDb.send(new GetCommand({
    TableName: process.env.FILES_TABLE,
    Key: { userId, fileId },
  }))

  if (!file) throw new ApiError(404, 'File not found')

  await dynamoDb.send(new UpdateCommand({
    TableName: process.env.FILES_TABLE,
    Key: { userId, fileId },
    UpdateExpression: 'SET folderId = :fid, updatedAt = :u',
    ExpressionAttributeValues: { ':fid': folderId, ':u': new Date().toISOString() },
  }))

  res.status(200).json({ success: true, message: 'File moved to folder' })
})

// @desc    Bulk move files to a folder
// @route   PATCH /api/folders/:folderId/files/bulk
// @access  Private
const bulkMoveFilesToFolder = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { folderId } = req.params
  const { fileIds } = req.body

  if (!Array.isArray(fileIds) || !fileIds.length) {
    throw new ApiError(400, 'fileIds must be a non-empty array')
  }

  const { Item: folder } = await dynamoDb.send(new GetCommand({
    TableName: process.env.FOLDERS_TABLE,
    Key: { userId, folderId },
  }))

  if (!folder) throw new ApiError(404, 'Folder not found')

  await Promise.all(
    fileIds.map((fileId) =>
      dynamoDb.send(new UpdateCommand({
        TableName: process.env.FILES_TABLE,
        Key: { userId, fileId },
        UpdateExpression: 'SET folderId = :fid, updatedAt = :u',
        ExpressionAttributeValues: { ':fid': folderId, ':u': new Date().toISOString() },
      }))
    )
  )

  res.status(200).json({ success: true, message: `${fileIds.length} files moved to folder` })
})

// @desc    Rename a folder
// @route   PATCH /api/folders/:folderId/rename
// @access  Private
const renameFolder = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { folderId } = req.params
  const { name } = req.body

  if (!name || !name.trim()) throw new ApiError(400, 'New folder name is required')

  const { Item: folder } = await dynamoDb.send(new GetCommand({
    TableName: process.env.FOLDERS_TABLE,
    Key: { userId, folderId },
  }))

  if (!folder) throw new ApiError(404, 'Folder not found')

  await dynamoDb.send(new UpdateCommand({
    TableName: process.env.FOLDERS_TABLE,
    Key: { userId, folderId },
    UpdateExpression: 'SET #n = :n, updatedAt = :u',
    ExpressionAttributeNames: { '#n': 'name' },
    ExpressionAttributeValues: { ':n': name.trim(), ':u': new Date().toISOString() },
  }))

  await logActivity(req.user.email, 'RENAME', { folderId, oldName: folder.name, newName: name.trim() });

  res.status(200).json({ success: true, message: 'Folder renamed successfully' })
})

// @desc    Delete a folder and unassign all its files
// @route   DELETE /api/folders/:folderId
// @access  Private
const deleteFolder = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { folderId } = req.params

  const { Item: folder } = await dynamoDb.send(new GetCommand({
    TableName: process.env.FOLDERS_TABLE,
    Key: { userId, folderId },
  }))

  if (!folder) throw new ApiError(404, 'Folder not found')

  const { Items: files } = await dynamoDb.send(new QueryCommand({
    TableName: process.env.FILES_TABLE,
    KeyConditionExpression: 'userId = :uid',
    FilterExpression: 'folderId = :fid',
    ExpressionAttributeValues: { ':uid': userId, ':fid': folderId },
  }))

  await Promise.all(
    files.map((file) =>
      dynamoDb.send(new UpdateCommand({
        TableName: process.env.FILES_TABLE,
        Key: { userId, fileId: file.fileId },
        UpdateExpression: 'SET folderId = :null, updatedAt = :u',
        ExpressionAttributeValues: { ':null': null, ':u': new Date().toISOString() },
      }))
    )
  )

  await dynamoDb.send(new DeleteCommand({
    TableName: process.env.FOLDERS_TABLE,
    Key: { userId, folderId },
  }))

  res.status(200).json({ success: true, message: 'Folder deleted, files unassigned' })
})

export {
  createFolder,
  getAllFoldersForUser,
  getFilesInFolder,
  moveFileToFolder,
  bulkMoveFilesToFolder,
  renameFolder,
  deleteFolder,
}