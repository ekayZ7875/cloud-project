import { dynamoDb } from "../config/dynamoDB/index.js";
import jwt from "jsonwebtoken";
import argon2 from 'argon2'
import { errorHandler } from "../utils/errorHandler.js";
import { generateId } from "../utils/generateUserId.js";
import { attachRecipientToPendingShares } from "../services/share.service.js";
import dotenv from 'dotenv'
dotenv.config()

const USER_TABLE = process.env.USER_TABLE;
const JWT_SECRET = process.env.JWT_SECRET_KEY || process.env.JWT_SECRET;

export const userSignup = async (req, res) => {
  const { uid, email, name, avatar } = req.body;

  if (!uid || !email || !name) {
    return res
      .status(400)
      .send(errorHandler(400, "Missing Fields", "Required fields missing"));
  }

  const { Item: user } = await dynamoDb.send(new GetCommand({
    TableName: process.env.USERS_TABLE,
    Key: { email: decoded.email },
  }))

    if (!JWT_SECRET) {
      return res
        .status(500)
        .send(errorHandler(500, "Auth Config Error", "JWT secret not configured"));
    }

    const token = jwt.sign(
      {
        userId: user.userId,
        email: user.email,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    try {
      await attachRecipientToPendingShares({
        email: user.email,
        userId: user.userId,
      });
    } catch (shareAttachError) {
      console.error("Share Reconciliation Warning:", shareAttachError.message);
    }

    return res.status(200).send({
      response: {
        token,
        user: {
          userId: user.userId,
          email: user.email,
          fullname: user.fullname,
          lastname: user.lastname,
          avatar: user.avatar,
        },
        message: "Login successful",
        status: 200,
      },
    });
  } catch (err) {
    console.error("Firebase Auth Error:", err);
    return res
      .status(500)
      .send(errorHandler(500, "Auth Failed", "Firebase login failed"));
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

    const token = jwt.sign(
      {
        userId: user.userId,
        email: user.email,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    try {
      await attachRecipientToPendingShares({
        email: user.email,
        userId: user.userId,
      });
    } catch (shareAttachError) {
      console.error("Share Reconciliation Warning:", shareAttachError.message);
    }

    return res.status(200).send({
      response: {
        token,
        user: {
          userId: user.userId,
          email: user.email,
          fullname: user.fullname,
          lastname: user.lastname,
          avatar: user.avatar,
        },
        message: "Login successful",
        status: 200,
      },
    });
  } catch (err) {
    console.error("Login Error:", err);
    return res
      .status(500)
      .send(errorHandler(500, "Login Failed", "Internal server error"));
  }

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })

  res.status(200).json({ success: true, message: 'Logged out successfully' })
})

export { handleGoogleCallback, getMe, refreshAccessToken, logout }