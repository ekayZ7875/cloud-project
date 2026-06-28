import { dynamoDb } from "../config/dynamoDb.js";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { generateId } from "../utils/generatedID.js";
import { DEFAULT_FILE_SIZE_ALLOWED } from "../constants/pipeline.constants.js";
import { attachRecipientToPendingShares } from "../services/share.service.js";

dotenv.config();

const USERS_TABLE = process.env.USERS_TABLE || process.env.USER_TABLE;
const ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET_KEY || process.env.JWT_SECRET;
const REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET_KEY || process.env.JWT_SECRET;
const ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || "15m";
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

function buildUserResponse(user) {
  return {
    userId: user.userId,
    email: user.email,
    fullname: user.fullname || user.name || null,
    lastname: user.lastname || null,
    avatar: user.avatar || null,
  };
}

function issueTokens(user) {
  if (!ACCESS_SECRET || !REFRESH_SECRET) {
    throw new ApiError(500, "Auth Config Error", "JWT secret not configured");
  }

  const accessToken = jwt.sign(
    { userId: user.userId, email: user.email },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN }
  );

  const refreshToken = jwt.sign(
    { userId: user.userId, email: user.email },
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN }
  );

  return { accessToken, refreshToken };
}

function setRefreshCookie(res, refreshToken) {
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

const userSignup = asyncHandler(async (req, res) => {
  const { uid, email, name, avatar } = req.body;

  if (!uid || !email || !name) {
    throw new ApiError(400, "Missing Fields", "Required fields missing");
  }

  if (!USERS_TABLE) {
    throw new ApiError(500, "Auth Config Error", "User table not configured");
  }

  const { Item: existingUser } = await dynamoDb.send(
    new GetCommand({
      TableName: USERS_TABLE,
      Key: { email },
    })
  );

  let user = existingUser;
  if (!user) {
    user = {
      userId: generateId("USER"),
      email,
      name,
      avatar: avatar || null,
      uid,
      totalFileSize: 0,
      fileSizeAllowed: DEFAULT_FILE_SIZE_ALLOWED,
      createdAt: new Date().toISOString(),
    };

    await dynamoDb.send(
      new PutCommand({
        TableName: USERS_TABLE,
        Item: user,
      })
    );
  } else if (user.uid && user.uid !== uid) {
    throw new ApiError(401, "Unauthorized", "Invalid credentials");
  }

  const { accessToken, refreshToken } = issueTokens(user);
  setRefreshCookie(res, refreshToken);

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
      token: accessToken,
      user: buildUserResponse(user),
      message: "Login successful",
      status: 200,
    },
  });
});

const userLogin = asyncHandler(async (req, res) => {
  const { email, uid } = req.body;

  if (!email || !uid) {
    throw new ApiError(400, "Missing Fields", "Required fields missing");
  }

  if (!USERS_TABLE) {
    throw new ApiError(500, "Auth Config Error", "User table not configured");
  }

  const { Item: user } = await dynamoDb.send(
    new GetCommand({
      TableName: USERS_TABLE,
      Key: { email },
    })
  );

  if (!user) {
    throw new ApiError(404, "Not Found", "User does not exist");
  }

  if (user.uid && user.uid !== uid) {
    throw new ApiError(401, "Unauthorized", "Invalid credentials");
  }

  const { accessToken, refreshToken } = issueTokens(user);
  setRefreshCookie(res, refreshToken);

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
      token: accessToken,
      user: buildUserResponse(user),
      message: "Login successful",
      status: 200,
    },
  });
});

const handleGoogleCallback = asyncHandler(async (req, res) => {
  const user = req.user;

  if (!user) {
    throw new ApiError(401, "Unauthorized", "Authentication failed");
  }

  const { accessToken, refreshToken } = issueTokens(user);
  setRefreshCookie(res, refreshToken);

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
      token: accessToken,
      user: buildUserResponse(user),
      message: "Login successful",
      status: 200,
    },
  });
});

const getMe = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ApiError(401, "Unauthorized", "No authenticated user");
  }

  res.status(200).json({ success: true, user: buildUserResponse(req.user) });
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    throw new ApiError(401, "Unauthorized", "Refresh token missing");
  }

  if (!REFRESH_SECRET) {
    throw new ApiError(500, "Auth Config Error", "JWT secret not configured");
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, REFRESH_SECRET);
  } catch {
    throw new ApiError(401, "Unauthorized", "Invalid refresh token");
  }

  if (!USERS_TABLE) {
    throw new ApiError(500, "Auth Config Error", "User table not configured");
  }

  const { Item: user } = await dynamoDb.send(
    new GetCommand({
      TableName: USERS_TABLE,
      Key: { email: decoded.email },
    })
  );

  if (!user) {
    throw new ApiError(401, "Unauthorized", "User no longer exists");
  }

  const { accessToken } = issueTokens(user);

  res.status(200).json({ success: true, accessToken });
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  res.status(200).json({ success: true, message: "Logged out successfully" });
});

export {
  handleGoogleCallback,
  getMe,
  refreshAccessToken,
  logout,
  userSignup,
  userLogin,
};
