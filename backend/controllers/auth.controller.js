import { dynamoDb } from "../config/dynamoDB/index.js";
import jwt from "jsonwebtoken";
import argon2 from 'argon2'
import { errorHandler } from "../utils/errorHandler.js";
import { generateId } from "../utils/generateUserId.js";
import dotenv from 'dotenv'
dotenv.config()

const USER_TABLE = process.env.USER_TABLE;

export const userSignup = async (req, res) => {
  const { uid, email, name, avatar } = req.body;

  if (!uid || !email || !name) {
    return res
      .status(400)
      .send(errorHandler(400, "Missing Fields", "Required fields missing"));
  }

  try {
    const existingUser = await dynamoDb
      .get({
        TableName: "users",
        Key: { email },
      })
      .promise();

    let user;
    const hashUID = await argon2.hash(uid);

    if (existingUser.Item) {
      user = existingUser.Item;
    } else {
      user = {
        userId: generateId("USR"),
        email,
        name,
        uid: hashUID,
        avatar: avatar || "",
        totalFileSize: 0,
        fileSizeAllowed: 1073741824,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await dynamoDb
        .put({
          TableName: "users",
          Item: user,
        })
        .promise();
    }

    const token = jwt.sign(
      {
        userId: user.userId,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

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
};

export const userLogin = async (req, res) => {
  try {
    const { email, uid } = req.body;

    if (!email || !uid) {
      return res
        .status(400)
        .send(
          errorHandler(400, "Missing Fields", "Email and UID are required")
        );
    }

    const result = await dynamoDb
      .get({
        TableName: USER_TABLE,
        Key: { email },
      })
      .promise();

    const user = result.Item;
    if (!user) {
      return res
        .status(400)
        .send(errorHandler(404, "Not Found", "User Not Found"));
    }

    const passwordMatch = argon2.verify(uid, user.uid);
    if (!passwordMatch) {
      return res
        .status(400)
        .send(
          errorHandler(400, "Bad Request", "Please Enter Correct Password")
        );
    }

    const token = jwt.sign(
      {
        userId: user.userId,
        email: user.email,
      },
      process.env.JWT_SECRET_KEY,
      { expiresIn: "7d" }
    );

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
};
