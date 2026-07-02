import { dynamoDb } from '../config/dynamoDb.js'
import { ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { asyncHandler } from '../utils/asyncHandler.js'
import { checkSystemHealth } from '../services/health.service.js'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import logger from '../libs/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

// ─── Scan all items from a DynamoDB table (handles pagination) ────────────────

async function scanAll(tableName, filterExpression, expressionAttributeValues) {
  const items = []
  let lastKey = undefined

  do {
    const params = {
      TableName: tableName,
      ExclusiveStartKey: lastKey,
    }
    if (filterExpression) {
      params.FilterExpression = filterExpression
      params.ExpressionAttributeValues = expressionAttributeValues
    }

    const result = await dynamoDb.send(new ScanCommand(params))
    items.push(...(result.Items || []))
    lastKey = result.LastEvaluatedKey
  } while (lastKey)

  return items
}

// ─── Qdrant collection stats (safe, returns null on error) ────────────────────

async function getQdrantCollectionStats() {
  try {
    const { QdrantClient } = await import('@qdrant/js-client-rest')
    const url = process.env.QDRANT_URL
    const apiKey = process.env.QDRANT_API_KEY
    const collectionName = process.env.QDRANT_COLLECTION || 'file_chunks'

    if (!url || !apiKey) return null

    let normalizedUrl = url
    try {
      const parsed = new URL(url)
      normalizedUrl = parsed.origin
    } catch { /* keep original */ }

    const client = new QdrantClient({ url: normalizedUrl, apiKey, checkCompatibility: false })
    const info = await client.getCollection(collectionName)

    return {
      collectionName,
      pointsCount: info.points_count || 0,
      vectorsCount: info.vectors_count || 0,
      segmentsCount: info.segments_count || 0,
      status: info.status || 'unknown',
      diskDataSize: info.disk_data_size || 0,
      ramDataSize: info.ram_data_size || 0,
    }
  } catch (err) {
    logger.warn(`Dashboard: Qdrant stats unavailable: ${err.message}`)
    return null
  }
}

// ─── Read package.json dependencies ──────────────────────────────────────────

async function getBackendDependencies() {
  try {
    const pkgPath = join(__dirname, '..', 'package.json')
    const raw = await readFile(pkgPath, 'utf-8')
    const pkg = JSON.parse(raw)

    const deps = Object.entries(pkg.dependencies || {}).map(([name, version]) => ({
      name,
      version,
      category: categorizeDependency(name),
    }))

    return deps
  } catch {
    return []
  }
}

function categorizeDependency(name) {
  if (name.includes('aws-sdk') || name.includes('@aws-sdk')) return 'AWS'
  if (name.includes('qdrant')) return 'Vector DB'
  if (name.includes('gemini') || name.includes('generative-ai') || name.includes('openai') || name.includes('groq') || name.includes('bedrock')) return 'AI/LLM'
  if (name.includes('express') || name.includes('cors') || name.includes('body-parser') || name.includes('cookie-parser') || name.includes('morgan')) return 'Server'
  if (name.includes('passport') || name.includes('jwt') || name.includes('argon')) return 'Auth'
  if (name.includes('winston') || name.includes('chalk') || name.includes('logger')) return 'Logging'
  if (name.includes('multer')) return 'File Upload'
  if (name.includes('nodemailer')) return 'Email'
  if (name.includes('swagger')) return 'Docs'
  if (name.includes('zod')) return 'Validation'
  if (name.includes('dotenv')) return 'Config'
  if (name.includes('uuid')) return 'Utility'
  if (name.includes('nodemon')) return 'Dev Tools'
  return 'Other'
}

// ─── Main Dashboard Stats Endpoint ──────────────────────────────────────────

// @desc    Get full system dashboard stats (all users, all services)
// @route   GET /api/dashboard/stats
// @access  Public
const getDashboardStats = asyncHandler(async (req, res) => {
  // 1. Scan all files (filter out deleted ones)
  const allFiles = await scanAll(
    process.env.FILES_TABLE,
    'isDeleted = :f',
    { ':f': false }
  )

  // 2. Scan all users
  const allUsers = await scanAll(process.env.USERS_TABLE)

  // 3. Compute file stats
  const totalFiles = allFiles.length
  const totalStorageBytes = allFiles.reduce((acc, f) => acc + (f.fileSize || f.size || 0), 0)

  // Monthly uploads (last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const uploadsThisMonth = allFiles.filter(f => f.uploadedAt && new Date(f.uploadedAt) >= thirtyDaysAgo).length

  // By tier
  const byTier = { heavy: { count: 0, bytes: 0 }, working: { count: 0, bytes: 0 }, light: { count: 0, bytes: 0 } }
  allFiles.forEach(f => {
    const tier = f.tier || 'working'
    if (byTier[tier]) {
      byTier[tier].count++
      byTier[tier].bytes += f.fileSize || f.size || 0
    }
  })

  // By type
  const typeMap = {}
  allFiles.forEach(f => {
    const category = getMimeCategory(f.fileType || f.mimeType || '')
    if (!typeMap[category]) typeMap[category] = { count: 0, bytes: 0 }
    typeMap[category].count++
    typeMap[category].bytes += f.fileSize || f.size || 0
  })

  const byType = Object.entries(typeMap)
    .map(([type, data]) => ({
      type,
      count: data.count,
      bytes: data.bytes,
      size: formatSize(data.bytes),
    }))
    .sort((a, b) => b.bytes - a.bytes)

  // 4. Aggregate user token usage
  const totalTokensUsed = allUsers.reduce((acc, u) => acc + (u.tokensUsed || 0), 0)
  const totalQueries = allUsers.reduce((acc, u) => acc + (u.queriesCount || 0), 0)
  const tokenLimit = allUsers.reduce((acc, u) => acc + (u.tokenLimit || 1000000), 0)
  const totalUsers = allUsers.length

  // 5. Billing estimates
  const s3GbUsed = totalStorageBytes / (1024 * 1024 * 1024)
  const s3Cost = s3GbUsed * 0.023
  const tokenCost = (totalTokensUsed / 1000000) * 3.50
  const embeddingCost = totalFiles * 0.0001
  const totalBill = s3Cost + tokenCost + embeddingCost

  // 6. Qdrant stats (parallel)
  const qdrantStatsPromise = getQdrantCollectionStats()

  // 7. System health (parallel)
  let healthData = null
  try {
    healthData = await checkSystemHealth()
  } catch (err) {
    logger.warn(`Dashboard: Health check failed: ${err.message}`)
  }

  // 8. Recent activities (last 20 across all users)
  let recentActivities = []
  try {
    const allActivities = await scanAll(process.env.ACTIVITY_TABLE)
    recentActivities = allActivities
      .sort((a, b) => new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0))
      .slice(0, 20)
      .map(a => ({
        id: a.activityId || a.id,
        action: a.type || a.action,
        email: a.userId || a.email,
        meta: {
          fileName: a.fileName,
          fileId: a.fileId,
          query: a.query,
          tokensUsed: a.tokensUsed,
          recipient: a.recipient,
          oldName: a.oldName,
          newName: a.newName,
        },
        timestamp: a.timestamp || a.createdAt,
      }))
  } catch (err) {
    logger.warn(`Dashboard: Activity scan failed: ${err.message}`)
  }

  // 9. Dependencies
  const dependencies = await getBackendDependencies()

  // 10. Await qdrant
  const qdrantStats = await qdrantStatsPromise

  // 11. Trash count
  let trashCount = 0
  try {
    const trashItems = await scanAll(process.env.TRASH_TABLE)
    trashCount = trashItems.length
  } catch { /* ignore */ }

  res.status(200).json({
    success: true,
    storage: {
      totalUsed: totalStorageBytes,
      totalUsedFormatted: formatSize(totalStorageBytes),
      fileCount: totalFiles,
      uploadsThisMonth,
      trashCount,
      byTier: {
        heavy: { ...byTier.heavy, size: formatSize(byTier.heavy.bytes) },
        working: { ...byTier.working, size: formatSize(byTier.working.bytes) },
        light: { ...byTier.light, size: formatSize(byTier.light.bytes) },
      },
      byType,
    },
    usage: {
      totalUsers,
      tokensUsed: totalTokensUsed,
      tokenLimit,
      remainingTokens: Math.max(0, tokenLimit - totalTokensUsed),
      tokenPercentage: tokenLimit > 0 ? Math.min(Math.round((totalTokensUsed / tokenLimit) * 100), 100) : 0,
      queriesCount: totalQueries,
      estimatedBill: {
        s3Cost: Number(s3Cost.toFixed(6)),
        tokenCost: Number(tokenCost.toFixed(6)),
        embeddingCost: Number(embeddingCost.toFixed(6)),
        total: Number(totalBill.toFixed(4)),
        currency: 'USD',
      },
    },
    qdrant: qdrantStats,
    health: healthData,
    activities: recentActivities,
    dependencies,
  })
})

export { getDashboardStats }
