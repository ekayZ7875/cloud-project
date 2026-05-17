import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { dynamoDb } from './dynamoDb.js'
import {  generateId } from '../utils/generatedID.js'
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import dotenv from 'dotenv'
dotenv.config()

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails[0].value

    const { Item: existingUser } = await dynamoDb.send(new GetCommand({
      TableName: process.env.USERS_TABLE,
      Key: { email },
    }))

    if (existingUser) return done(null, existingUser)

    const newUser = {
      userId: generateId('USER'),
      email,
      name: profile.displayName,
      avatar: profile.photos[0].value,
      totalFileSize: 0,
      fileSizeAllowed: 5 * 1024 * 1024 * 1024,
      createdAt: new Date().toISOString(),
    }

    await dynamoDb.send(new PutCommand({
      TableName: process.env.USERS_TABLE,
      Item: newUser,
    }))

    return done(null, newUser)
  } catch (err) {
    return done(err, null)
  }
}))

export default passport