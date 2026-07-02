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

  const tokensUsed = user?.tokensUsed || 0
  const tokenLimit = user?.tokenLimit || 1000000
  const queriesCount = user?.queriesCount || 0

  // Billing estimation
  // S3 storage rate: $0.023 per GB per month
  const s3GbUsed = totalUsed / (1024 * 1024 * 1024)
  const s3Cost = s3GbUsed * 0.023

  // Gemini rate: ~$3.50 per 1M tokens (average of input and output)
  const tokenCost = (tokensUsed / 1000000) * 3.50

  // Vector DB embeddings & indexing costs (estimated)
  const embeddingCost = allFiles.length * 0.0001

  const totalBill = s3Cost + tokenCost + embeddingCost

  // Monthly uploads count
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const uploadsThisMonth = allFiles.filter(f => f.uploadedAt && new Date(f.uploadedAt) >= thirtyDaysAgo).length

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
    usage: {
      tokensUsed,
      tokenLimit,
      remainingTokens: Math.max(0, tokenLimit - tokensUsed),
      tokenPercentage: Math.min(Math.round((tokensUsed / tokenLimit) * 100), 100),
      queriesCount,
      uploadsThisMonth,
      estimatedBill: {
        s3Cost: Number(s3Cost.toFixed(6)),
        tokenCost: Number(tokenCost.toFixed(6)),
        embeddingCost: Number(embeddingCost.toFixed(6)),
        total: Number(totalBill.toFixed(4)),
        currency: "USD",
      }
    }
  })
})

export { getStorageStats }