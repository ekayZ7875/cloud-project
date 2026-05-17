import jwt from 'jsonwebtoken'
import { dynamoDb } from '../config/dynamoDb.js'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { ApiError } from '../utils/ApiError.js'
import {asyncHandler} from '../utils/asyncHandler.js'

const isAuthenticated = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiError(401, 'No token provided, please login first')
  }

  const token = authHeader.split(' ')[1]

  let decoded
  try {
    decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET)
  } catch {
    throw new ApiError(401, 'Invalid or expired access token')
  }

  // Fetch fresh user from DynamoDB and attach to req
  const { Item: user } = await dynamoDb.send(new GetCommand({
    TableName: process.env.USERS_TABLE,
    Key: { email: decoded.email },
  }))

  if (!user) throw new ApiError(401, 'User no longer exists')

  req.user = user
  next()
})

export { isAuthenticated }