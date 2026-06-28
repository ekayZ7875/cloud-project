import { dynamoDb } from '../config/dynamoDb.js'
import { QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import {asyncHandler} from '../utils/asyncHandler.js'
import { DEFAULT_FILE_SIZE_ALLOWED } from '../constants/pipeline.constants.js'

// ─── Helper ───────────────────────────────────────────────────────────────────

const getMimeCategory = (mimeType = '') => {
  if (mimeType.startsWith('video/')) return 'Video'
  if (mimeType.startsWith('image/')) return 'Image'
  if (mimeType.startsWith('audio/')) return 'Audio'
  if (mimeType.includes('pdf')) return 'Document'
  if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('tar') || mimeType.includes('rar')) return 'Archive'
  if (mimeType.includes('json') || mimeType.includes('csv') || mimeType.includes('xml')) return 'Data'
  if (mimeType.includes('figma') || mimeType.includes('sketch')) return 'Design'
  if (mimeType.includes('word') || mimeType.includes('document') || mimeType.includes('text')) return 'Document'
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'Spreadsheet'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'Presentation'
  return 'Other'
}

const formatSize = (bytes = 0) => {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

// @desc    Get full storage breakdown for user
// @route   GET /api/storage
// @access  Private
const getStorageStats = asyncHandler(async (req, res) => {
  const { email: userId } = req.user

  // Get user for storage limit
  const { Item: user } = await dynamoDb.send(new GetCommand({
    TableName: process.env.USERS_TABLE,
    Key: { email: userId },
  }))

  // Get all non-trashed files
  const { Items: files } = await dynamoDb.send(new QueryCommand({
    TableName: process.env.FILES_TABLE,
    KeyConditionExpression: 'userId = :uid',
    FilterExpression: 'trashed = :f',
    ExpressionAttributeValues: { ':uid': userId, ':f': false },
  }))

  const allFiles = files || []
  const totalAllowed = user?.fileSizeAllowed || DEFAULT_FILE_SIZE_ALLOWED

  // Total used
  const totalUsed = allFiles.reduce((acc, f) => acc + (f.size || 0), 0)
  const percentage = Math.min(Math.round((totalUsed / totalAllowed) * 100), 100)

  // By tier
  const byTier = {
    heavy:   { count: 0, bytes: 0 },
    working: { count: 0, bytes: 0 },
    light:   { count: 0, bytes: 0 },
  }
  allFiles.forEach(f => {
    const tier = f.tier || 'working'
    if (byTier[tier]) {
      byTier[tier].count++
      byTier[tier].bytes += f.size || 0
    }
  })

  // By type
  const typeMap = {}
  allFiles.forEach(f => {
    const category = getMimeCategory(f.mimeType)
    if (!typeMap[category]) typeMap[category] = { count: 0, bytes: 0 }
    typeMap[category].count++
    typeMap[category].bytes += f.size || 0
  })

  const byType = Object.entries(typeMap)
    .map(([type, data]) => ({
      type,
      count: data.count,
      bytes: data.bytes,
      size: formatSize(data.bytes),
    }))
    .sort((a, b) => b.bytes - a.bytes)

  res.status(200).json({
    success: true,
    storage: {
      totalUsed,
      totalAllowed,
      totalUsedFormatted: formatSize(totalUsed),
      totalAllowedFormatted: formatSize(totalAllowed),
      percentage,
      fileCount: allFiles.length,
      byTier: {
        heavy:   { ...byTier.heavy,   size: formatSize(byTier.heavy.bytes) },
        working: { ...byTier.working, size: formatSize(byTier.working.bytes) },
        light:   { ...byTier.light,   size: formatSize(byTier.light.bytes) },
      },
      byType,
    },
  })
})

export { getStorageStats }