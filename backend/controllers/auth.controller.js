import jwt from 'jsonwebtoken'
import { dynamoDb } from '../config/dynamoDb.js'
import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import {asyncHandler} from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateAccessToken = (user) => {
  return jwt.sign(
    { email: user.email, name: user.name },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  )
}

const generateRefreshToken = (user) => {
  return jwt.sign(
    { email: user.email },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  )
}

const setRefreshTokenCookie = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

// ─── Called by Passport after Google OAuth success ────────────────────────────

// @desc    Issue tokens after Google OAuth callback
// @route   GET /auth/google/callback
// @access  Public
const handleGoogleCallback = asyncHandler(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'Google authentication failed')

  const accessToken = generateAccessToken(req.user)
  const refreshToken = generateRefreshToken(req.user)

  // Save refreshToken in UsersTable
  await dynamoDb.send(new UpdateCommand({
    TableName: process.env.USERS_TABLE,
    Key: { email: req.user.email },
    UpdateExpression: 'SET refreshToken = :rt',
    ExpressionAttributeValues: { ':rt': refreshToken },
  }))

  setRefreshTokenCookie(res, refreshToken)

  res.redirect(`${process.env.CLIENT_URL}/auth/success?accessToken=${accessToken}`)
})

// ─── Controllers ──────────────────────────────────────────────────────────────

// @desc    Get current logged-in user
// @route   GET /auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'Not authenticated')

  res.status(200).json({
    success: true,
    user: {
      email: req.user.email,
      name: req.user.name,
      picture: req.user.picture,
      createdAt: req.user.createdAt,
    },
  })
})

// @desc    Refresh access token using refresh token from cookie
// @route   POST /auth/refresh
// @access  Public
const refreshAccessToken = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken
  if (!token) throw new ApiError(401, 'No refresh token provided')

  let decoded
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET)
  } catch {
    throw new ApiError(403, 'Invalid or expired refresh token')
  }

  const { Item: user } = await dynamoDb.send(new GetCommand({
    TableName: process.env.USERS_TABLE,
    Key: { email: decoded.email },
  }))

  if (!user || user.refreshToken !== token) {
    throw new ApiError(403, 'Refresh token mismatch')
  }

  const newAccessToken = generateAccessToken(user)

  res.status(200).json({ success: true, accessToken: newAccessToken })
})

// @desc    Logout — clear cookie and remove refresh token from DB
// @route   POST /auth/logout
// @access  Private
const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken

  if (token) {
    const decoded = jwt.decode(token)

    if (decoded?.email) {
      await dynamoDb.send(new UpdateCommand({
        TableName: process.env.USERS_TABLE,
        Key: { email: decoded.email },
        UpdateExpression: 'REMOVE refreshToken',
      }))
    }
  }

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })

  res.status(200).json({ success: true, message: 'Logged out successfully' })
})

export { handleGoogleCallback, getMe, refreshAccessToken, logout }