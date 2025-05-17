import s3 from "../config/S3/index.js";
import {dynamoDb} from "../config/dynamoDB/index.js";
import { generateId } from "../utils/generateUserId.js";
import { errorHandler } from "../utils/errorHandler.js";
import dotenv from 'dotenv'
dotenv.config()

const FILES_TABLE = process.env.FILES_TABLE;
const USER_TABLE = process.env.USER_TABLE;
const BUCKET_NAME = process.env.AWS_BUCKET_NAME;

export const uploadFile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const email = req.user.email;
    const file = req.file;
    const fileId = generateId("FILE");

    if (!file) {
      return res
        .status(400)
        .send(errorHandler(400, "No File", "No file uploaded"));

    }

    const fileSize = file.size;
    const fileKey = `${userId}/${fileId}-${file.originalname}`;

    const { Item: user } = await dynamoDb
      .get({
        TableName: USER_TABLE,
        Key: { email },
      })
      .promise();

    if (!user) {
      return res
        .status(404)
        .send(errorHandler(404, "User Not Found", "User does not exist"));
    }

    const newTotalSize = user.totalFileSize + fileSize;
    if (newTotalSize > user.fileSizeAllowed) {
      return res
        .status(403)
        .send(errorHandler(403, "Limit Exceeded", "Storage limit exceeded"));
    }

    await s3
      .putObject({
        Bucket: BUCKET_NAME,
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
      .promise();

    const s3Url = `https://${BUCKET_NAME}.s3.amazonaws.com/${fileKey}`;

    await dynamoDb
      .put({
        TableName: FILES_TABLE,
        Item: {
          userId,
          fileId,
          fileName: file.originalname,
          fileType: file.mimetype,
          fileSize,
          s3Url,
          uploadedAt: new Date().toISOString(),
        },
      })
      .promise();

    await dynamoDb
      .update({
        TableName: USER_TABLE,
        Key: { email },
        UpdateExpression: "SET totalFileSize = :newSize",
        ExpressionAttributeValues: {
          ":newSize": newTotalSize,
        },
      })
      .promise();

    return res.status(200).send({
      message: "File uploaded successfully",
      fileUrl: s3Url,
      fileId,
    });
  } catch (err) {
    console.error("Upload File Error:", err);
    return res
      .status(500)
      .send(errorHandler(500, "Upload Failed", "Server error during upload"));
  }
};

export const getUserFiles = async (req, res) => {
  const userId = req.user.userId;

  try {
    const result = await dynamoDb.query({
      TableName: FILES_TABLE,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: {
        ":uid": userId,
      },
    }).promise();

    const files = result.Items || [];

    return res.status(200).send({
      message: "User files fetched successfully",
      files,
    });
  } catch (error) {
    console.error("Fetch User Files Error:", error);
    return res.status(500).send(
      errorHandler(500, "Internal Error", "Failed to fetch user files")
    );
  }
};

