import { dynamoDb } from '../config/dynamoDb.js'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import {asyncHandler} from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'

// ─── Activity type labels ─────────────────────────────────────────────────────

const ACTIVITY_LABELS = {
  UPLOAD:           'Uploaded a file',
  DOWNLOAD:         'Downloaded a file',
  TRASH:            'Moved to trash',
  RESTORE:          'Restored from trash',
  PERMANENT_DELETE: 'Permanently deleted',
  EMPTY_TRASH:      'Emptied trash',
  RENAME:           'Renamed a file',
  SHARE:            'Shared a file',
  UNSHARE:          'Revoked file access',
}

// @desc    Get activity feed for user
// @route   GET /api/activity
// @access  Private
const getActivityFeed = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { type, search, limit = 50 } = req.query

  const { Items } = await dynamoDb.send(new QueryCommand({
    TableName: process.env.ACTIVITY_TABLE,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    ScanIndexForward: false, // newest first
    Limit: parseInt(limit),
  }))

  let activities = Items || []

  // Filter by type if provided
  if (type && type !== 'ALL') {
    activities = activities.filter(a => a.type === type)
  }

  // Filter by search (matches fileName or type label)
  if (search) {
    const q = search.toLowerCase()
    activities = activities.filter(a =>
      a.fileName?.toLowerCase().includes(q) ||
      a.oldName?.toLowerCase().includes(q) ||
      a.newName?.toLowerCase().includes(q) ||
      ACTIVITY_LABELS[a.type]?.toLowerCase().includes(q)
    )
  }

  // Enrich with label
  const enriched = activities.map(a => ({
    ...a,
    label: ACTIVITY_LABELS[a.type] || a.type,
  }))

  res.status(200).json({ success: true, activities: enriched })
})

export { getActivityFeed }