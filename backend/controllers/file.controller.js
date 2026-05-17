import s3 from "../config/S3/index.js";
import { dynamoDb } from "../config/dynamoDB/index.js";
import { generateId } from "../utils/generateUserId.js";
import { errorHandler } from "../utils/errorHandler.js";
import {
  createProcessingJob,
  getProcessingJob,
  markProcessingFailed,
} from "../services/metadata.service.js";
import { canUserAccessFile } from "../services/share.service.js";
import { publishFileProcessingJob } from "../services/queue.service.js";
import dotenv from "dotenv";
import { response } from "express";
dotenv.config();

const FILES_TABLE = process.env.FILES_TABLE;
const USER_TABLE = process.env.USER_TABLE;
const TRASH_TABLE = process.env.TRASH_TABLE;
const FOLDERS_TABLE = process.env.FOLDERS_TABLE;
const BUCKET_NAME = process.env.AWS_BUCKET_NAME;

function normalizeTag(tag) {
  return String(tag || "").trim().toLowerCase();
}

function parseRequestedTags(rawTags) {
  const values = Array.isArray(rawTags) ? rawTags : [rawTags];

  return [...new Set(
    values
      .flatMap((value) => String(value || "").split(","))
      .map((tag) => tag.trim())
      .filter(Boolean)
  )];
}

export const uploadFile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const email = req.user.email;
    const file = req.file;
    const fileId = generateId("FILE");
    const jobId = generateId("JOB");

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
          jobId, // Add this line
          fileName: file.originalname,
          fileType: file.mimetype,
          fileSize,
          s3Url,
          isStarred: false,
          isDeleted: false,
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

    await createProcessingJob({
      jobId,
      userId,
      fileId,
      s3Url,
    });

    try {
      await publishFileProcessingJob({
        jobId,
        fileId,
        userId,
        s3Url,
        attempt: 1,
        uploadedAt: new Date().toISOString(),
      });
    } catch (queueError) {
      console.log(queueError)
      await markProcessingFailed({
        userId,
        jobId,
        attempt: 1,
        errorMessage: `QUEUE_PUBLISH_FAILED: ${queueError.message}`,
      });

      return res
        .status(500)
        .send(
          errorHandler(
            500,
            "Upload Queuing Failed",
            "File uploaded but processing job could not be queued"
          )
        );
    }

    return res.status(200).send({
      message: "File uploaded successfully",
      fileUrl: s3Url,
      fileId,
      jobId,
      processingStatus: "PENDING",
    });
  } catch (err) {
    console.error("Upload File Error:", err);
    return res
      .status(500)
      .send(errorHandler(500, "Upload Failed", "Server error during upload"));
  }
};

export const uploadFolder = async (req, res) => {
  try {
    const userId = req.user.userId;
    const email = req.user.email;
    const files = req.files; // Array of files
    const folderName = req.body.folderName || "New Folder";

    if (!files || files.length === 0) {
      return res.status(400).send(errorHandler(400, "No Files", "No files uploaded"));
    }

    // 1. Check user storage
    const { Item: user } = await dynamoDb.get({ TableName: USER_TABLE, Key: { email } }).promise();
    if (!user) return res.status(404).send(errorHandler(404, "User Not Found", "User does not exist"));

    const folderSize = files.reduce((acc, f) => acc + f.size, 0);
    const newTotalSize = user.totalFileSize + folderSize;
    if (newTotalSize > user.fileSizeAllowed) {
      return res.status(403).send(errorHandler(403, "Limit Exceeded", "Storage limit exceeded"));
    }

    // 2. Create the folder entry
    const folderId = generateId("FOLD");
    await dynamoDb.put({
      TableName: "ChunklyUserFolders",
      Item: {
        userId,
        folderId,
        name: folderName,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    }).promise();

    const uploadPromises = files.map(async (file) => {
      const fileId = generateId("FILE");
      const jobId = generateId("JOB");
      const fileKey = `${userId}/${fileId}-${file.originalname}`;

      // Upload to S3
      await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype,
      }).promise();

      const s3Url = `https://${BUCKET_NAME}.s3.amazonaws.com/${fileKey}`;

      // Register in DynamoDB
      await dynamoDb.put({
        TableName: "ChunklyUserFiles",
        Item: {
          userId,
          fileId,
          folderId,
          belongs_to: folderName, // Link by human-readable name as requested
          fileName: file.originalname,
          fileType: file.mimetype,
          fileSize: file.size,
          s3Url,
          isStarred: false,
          isDeleted: false,
          uploadedAt: new Date().toISOString(),
        }
      }).promise();

      // Trigger Processing Job for each file in folder
      return createProcessingJob({
        jobId,
        userId,
        fileId,
        fileName: file.originalname,
        s3Url,
      });
    });

    await Promise.all(uploadPromises);

    // 4. Update user size
    await dynamoDb.update({
      TableName: USER_TABLE,
      Key: { email },
      UpdateExpression: "SET totalFileSize = :newSize",
      ExpressionAttributeValues: { ":newSize": newTotalSize },
    }).promise();

    res.status(201).json({
      message: "Folder uploaded successfully",
      folderId,
      fileCount: files.length
    });
  } catch (error) {
    res.status(500).send(errorHandler(500, "Upload Failed", error.message));
  }
};

export const getUserFiles = async (req, res) => {
  const userId = req.user.userId;

  try {
    const result = await dynamoDb
      .query({
        TableName: FILES_TABLE,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: {
          ":uid": userId,
        },
      })
      .promise();

    // Filter: Not deleted AND not in any folder (Root list only)
    // Filter: Not deleted AND not in any folder (Root list only)
    const files = (result.Items || []).filter(f => {
      const isDel = f.isDeleted === true || f.is_deleted === true;
      return !isDel && !f.folderId;
    });

    return res.status(200).send({
      message: "User files fetched successfully",
      files,
    });
  } catch (error) {
    console.error("Fetch User Files Error:", error);
    return res
      .status(500)
      .send(errorHandler(500, "Internal Error", "Failed to fetch user files"));
  }
};

export const searchFilesByTags = async (req, res) => {
  const userId = req.user.userId;
  const requestedTags = parseRequestedTags(req.query.tags);
  const matchMode = String(req.query.match || "any").toLowerCase();
  const folderId = req.query.folderId ? String(req.query.folderId) : null;
  const requestedLimit = Number(req.query.limit || 50);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(200, Math.max(1, Math.floor(requestedLimit)))
    : 50;

  if (requestedTags.length === 0) {
    return res
      .status(400)
      .send(errorHandler(400, "Invalid Request", "tags query param is required"));
  }

  if (!["any", "all"].includes(matchMode)) {
    return res
      .status(400)
      .send(errorHandler(400, "Invalid Request", "match must be 'any' or 'all'"));
  }

  const normalizedRequestedTags = requestedTags.map(normalizeTag);

  try {
    const result = await dynamoDb
      .query({
        TableName: FILES_TABLE,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: {
          ":uid": userId,
        },
      })
      .promise();

    let files = (result.Items || []).filter((file) => {
      const isDeleted = file.isDeleted === true || file.is_deleted === true;
      return !isDeleted;
    });

    if (folderId) {
      files = files.filter((file) => file.folderId === folderId);
    }

    const matchedFiles = (
      await Promise.all(
        files.map(async (file) => {
          if (!file.jobId) {
            return null;
          }

          const job = await getProcessingJob({ userId, jobId: file.jobId });
          const jobTags = Array.isArray(job?.analysis?.tags) ? job.analysis.tags : [];

          if (jobTags.length === 0) {
            return null;
          }

          const normalizedJobTags = jobTags.map(normalizeTag);
          const matchedTags = requestedTags.filter((tag, index) =>
            normalizedJobTags.includes(normalizedRequestedTags[index])
          );

          const isMatch =
            matchMode === "all"
              ? matchedTags.length === requestedTags.length
              : matchedTags.length > 0;

          if (!isMatch) {
            return null;
          }

          return {
            ...file,
            processingStatus: job?.status || null,
            tags: jobTags,
            matchedTags,
          };
        })
      )
    )
      .filter(Boolean)
      .slice(0, limit);

    return res.status(200).send({
      message: "Files fetched successfully by tags",
      query: {
        tags: requestedTags,
        match: matchMode,
        folderId,
        limit,
      },
      totalMatches: matchedFiles.length,
      files: matchedFiles,
    });
  } catch (error) {
    console.error("Search Files By Tags Error:", error);
    return res
      .status(500)
      .send(errorHandler(500, "Internal Error", "Failed to search files by tags"));
  }
};

export const getAllUserFileTags = async (req, res) => {
  const userId = req.user.userId;
  const folderId = req.query.folderId ? String(req.query.folderId) : null;

  try {
    const result = await dynamoDb
      .query({
        TableName: FILES_TABLE,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: {
          ":uid": userId,
        },
      })
      .promise();

    let files = (result.Items || []).filter((file) => {
      const isDeleted = file.isDeleted === true || file.is_deleted === true;
      return !isDeleted;
    });

    if (folderId) {
      files = files.filter((file) => file.folderId === folderId);
    }

    const fileTags = await Promise.all(
      files.map(async (file) => {
        const job = file.jobId
          ? await getProcessingJob({ userId, jobId: file.jobId })
          : null;

        const tags = Array.isArray(job?.analysis?.tags) ? job.analysis.tags : [];

        return {
          fileId: file.fileId,
          fileName: file.fileName,
          folderId: file.folderId || null,
          jobId: file.jobId || null,
          processingStatus: job?.status || null,
          tags,
        };
      })
    );

    const uniqueTags = [...new Set(fileTags.flatMap((file) => file.tags))].sort();

    return res.status(200).send({
      message: "User file tags fetched successfully",
      totalFiles: fileTags.length,
      uniqueTags,
      files: fileTags,
    });
  } catch (error) {
    console.error("Get All User File Tags Error:", error);
    return res
      .status(500)
      .send(errorHandler(500, "Internal Error", "Failed to fetch file tags"));
  }
};

export const softDeleteFolder = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { folderId } = req.body;

    if (!folderId) return res.status(400).send(errorHandler(400, "Invalid Request", "folderId required"));

    // 1. Get folder info
    const folderRes = await dynamoDb.get({ TableName: "ChunklyUserFolders", Key: { userId, folderId } }).promise();
    if (!folderRes.Item) return res.status(404).send(errorHandler(404, "Not Found", "Folder not found"));

    // 2. Mark as deleted
    await dynamoDb.update({
      TableName: "ChunklyUserFolders",
      Key: { userId, folderId },
      UpdateExpression: "SET isDeleted = :del, updatedAt = :now",
      ExpressionAttributeValues: { ":del": true, ":now": new Date().toISOString() }
    }).promise();

    // 3. Optional: Move to Trash Table
    await dynamoDb.put({
      TableName: "ChunklyTrashTable",
      Item: {
        ...folderRes.Item,
        isDeleted: true,
        type: 'folder',
        deletedAt: new Date().toISOString()
      }
    }).promise();

    return res.status(200).json({ message: "Folder moved to trash" });
  } catch (err) {
    res.status(500).send(errorHandler(500, "Server Error", "Failed to delete folder"));
  }
};

export const restoreItem = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { itemId, type } = req.body; // type can be 'file' or 'folder'

    if (type === 'folder') {
      await dynamoDb.update({
        TableName: "ChunklyUserFolders",
        Key: { userId, folderId: itemId },
        UpdateExpression: "SET isDeleted = :del, updatedAt = :now",
        ExpressionAttributeValues: { ":del": false, ":now": new Date().toISOString() }
      }).promise();
    } else {
      await dynamoDb.update({
        TableName: "ChunklyUserFiles",
        Key: { userId, fileId: itemId },
        UpdateExpression: "SET isDeleted = :del, updatedAt = :now",
        ExpressionAttributeValues: { ":del": false, ":now": new Date().toISOString() }
      }).promise();
    }

    // Remove from Trash Table
    await dynamoDb.delete({
      TableName: "ChunklyTrashTable",
      Key: { userId, ...(type === 'folder' ? { folderId: itemId } : { fileId: itemId }) }
    }).promise();

    return res.status(200).json({ message: "Item restored from vault" });
  } catch (err) {
    res.status(500).send(errorHandler(500, "Server Error", "Failed to restore item"));
  }
};

export const permanentDelete = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { itemId, type, fileName } = req.body;

    if (type === 'file') {
      // 1. Delete from S3 if possible
      try {
        const fileKey = `${userId}/${itemId}-${fileName}`;
        await s3.deleteObject({ Bucket: BUCKET_NAME, Key: fileKey }).promise();
      } catch (s3Err) { console.error("S3 Deletion failed, continuing...", s3Err); }

      // 2. Delete from Files Table
      await dynamoDb.delete({ TableName: "ChunklyUserFiles", Key: { userId, fileId: itemId } }).promise();
    } else {
      // 3. Delete from Folders Table
      await dynamoDb.delete({ TableName: "ChunklyUserFolders", Key: { userId, folderId: itemId } }).promise();
    }

    // 4. Cleanup Trash
    await dynamoDb.delete({
      TableName: "ChunklyTrashTable",
      Key: { userId, ...(type === 'folder' ? { folderId: itemId } : { fileId: itemId }) }
    }).promise();

    return res.status(200).json({ message: "Item purged from system" });
  } catch (err) {
    res.status(500).send(errorHandler(500, "Server Error", "Failed to purge item"));
  }
};

export const getSingleFile = async (req, res) => {
  try {
    const user = req.user;
    const { fileId } = req.query;

    const requesterId = user.userId;
    const requesterEmail = user.email;
    const ownerId = String(req.query.ownerId || requesterId);

    if (!fileId) {
      return res
        .status(400)
        .send(errorHandler(400, "Invalid Request", "fileId is required"));
    }

    const result = await dynamoDb
      .get({
        TableName: FILES_TABLE,
        Key: { userId: ownerId, fileId },
      })
      .promise();

    if (!result.Item || result.Item.isDeleted === true || result.Item.is_deleted === true) {
      return res
        .status(404)
        .send(errorHandler(404, "Not Found", "File not found"));
    }

    if (ownerId !== requesterId) {
      const access = await canUserAccessFile({
        requesterUserId: requesterId,
        requesterEmail,
        ownerId,
        fileId,
      });

      if (!access.allowed) {
        return res
          .status(403)
          .send(errorHandler(403, "Forbidden", "You do not have access to this file"));
      }
    }

    return res.status(200).send({
      message: "File fetched successfully",
      file: result.Item,
    });
  } catch (error) {
    console.error("Fetch Single File Error:", error);
    return res
      .status(500)
      .send(errorHandler(500, "Internal Error", "Failed to fetch file"));
  }
};

export const softDeleteFile = async (req, res) => {
  try {
    const user = req.user;
    const { fileId } = req.query;

    const userId = user.userId;
    const fileMeta = await dynamoDb
      .get({
        TableName: "ChunklyUserFiles",
        Key: { userId, fileId },
      })
      .promise();

    if (!fileMeta.Item) {
      return res
        .status(404)
        .send(errorHandler(404, "Not Found", "File not found"));
    }

    const file = fileMeta.Item;

    await dynamoDb
      .update({
        TableName: "ChunklyUserFiles",
        Key: { userId, fileId },
        UpdateExpression: "SET isDeleted = :val, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":val": true,
          ":updatedAt": new Date().toISOString(),
        },
      })
      .promise();

    const trashItem = {
      ...file,
      isDeleted: true,
      deletedAt: new Date().toISOString(),
    };

    await dynamoDb
      .put({
        TableName: "ChunklyTrashTable",
        Item: trashItem,
      })
      .promise();

    return res.status(200).send({
      response: {
        data: { fileId },
        title: "File Deleted Successfully",
        message: "File Moved To Trash Successfully",
        status: 200,
      },
    });
  } catch (err) {
    console.error("Soft Delete Error:", err);
    return res
      .status(500)
      .send(errorHandler(500, "Server Error", "Failed to delete file"));
  }
};
export const getTrashedFiles = async (req, res) => {
  const user = req.user;

  const userId = user.userId;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "User ID is required.",
    });
  }

  const params = {
    TableName: "ChunklyUserFiles",
    KeyConditionExpression: "userId = :uid",
    FilterExpression: "isDeleted = :isDeleted",
    ExpressionAttributeValues: {
      ":uid": userId,
      ":isDeleted": true,
    },
  }))
}

// Check if user is owner OR has shared access to the file
const checkAccess = async (requestingEmail, fileId, ownerId) => {
  // If user is the owner, allow
  if (requestingEmail === ownerId) return true

  // Check SharedTable for shared access
  const { Item: shareRecord } = await dynamoDb.send(new GetCommand({
    TableName: process.env.SHARED_TABLE,
    Key: { fileId, sharedWithEmail: requestingEmail },
  }))

  if (!shareRecord) throw new ApiError(403, 'Access denied')

  return true
}

// ─── Upload ───────────────────────────────────────────────────────────────────

// @desc    Upload file to S3 + save metadata in DynamoDB
// @route   POST /api/files/upload
// @access  Private
const uploadFile = asyncHandler(async (req, res) => {
  console.log('req.file:', req.file)
  console.log('req.body:', req.body)
  console.log('req.user:', req.user)
  if (!req.file) throw new ApiError(400, 'No file provided')

  const { email: userId } = req.user
  const { folderId = null, tier = 'working' } = req.body
  const fileId = generateId('file')
  const s3Key = `${userId}/${fileId}/${req.file.originalname}`

  await s3.send(new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: s3Key,
    Body: req.file.buffer,
    ContentType: req.file.mimetype,
  }))

  const fileItem = {
    userId,
    fileId,
    name: req.file.originalname,
    size: req.file.size,
    mimeType: req.file.mimetype,
    s3Key,
    folderId,
    tier,
    starred: false,
    trashed: false,
    uploadedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await dynamoDb.send(new PutCommand({
    TableName: process.env.FILES_TABLE,
    Item: fileItem,
  }))

  await logActivity(userId, 'UPLOAD', { fileId, fileName: req.file.originalname })

  res.status(201).json({ success: true, file: fileItem })
})

// ─── Read ─────────────────────────────────────────────────────────────────────

// @desc    Get all non-trashed files for user
// @route   GET /api/files
// @access  Private
const getUserFiles = asyncHandler(async (req, res) => {
  const { email: userId } = req.user

  const { Items } = await dynamoDb.send(new QueryCommand({
    TableName: process.env.FILES_TABLE,
    KeyConditionExpression: 'userId = :uid',
    FilterExpression: 'trashed = :f',
    ExpressionAttributeValues: { ':uid': userId, ':f': false },
  }))

  res.status(200).json({ success: true, files: Items })
})

// @desc    Get a single file by fileId
// @route   GET /api/files/:fileId
// @access  Private
const getSingleFile = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { fileId } = req.params

  // First try to find the file by fileId across any owner
  const { Item: file } = await dynamoDb.send(new GetCommand({
    TableName: process.env.FILES_TABLE,
    Key: { userId: req.query.ownerId || userId, fileId },
  }))

  if (!file) throw new ApiError(404, 'File not found')
  if (file.trashed) throw new ApiError(410, 'File is in trash')

  await checkAccess(userId, fileId, file.userId)

  res.status(200).json({ success: true, file })
})

// ─── Trash ────────────────────────────────────────────────────────────────────

// @desc    Soft delete — copy to TrashTable, mark trashed in FilesTable
// @route   DELETE /api/files/:fileId
// @access  Private
const softDeleteFile = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { fileId } = req.params

  const { Item: file } = await dynamoDb.send(new GetCommand({
    TableName: process.env.FILES_TABLE,
    Key: { userId: req.query.ownerId || userId, fileId },
  }))

  if (!file) throw new ApiError(404, 'File not found')

  await checkAccess(userId, fileId, file.userId)

  await dynamoDb.send(new PutCommand({
    TableName: process.env.TRASH_TABLE,
    Item: { ...file, trashedAt: new Date().toISOString() },
  }))

  await dynamoDb.send(new UpdateCommand({
    TableName: process.env.FILES_TABLE,
    Key: { userId: file.userId, fileId },
    UpdateExpression: 'SET trashed = :t, updatedAt = :u',
    ExpressionAttributeValues: { ':t': true, ':u': new Date().toISOString() },
  }))

  await logActivity(userId, 'TRASH', { fileId, fileName: file.name })

  res.status(200).json({ success: true, message: 'File moved to trash' })
})

// @desc    Get all trashed files for user
// @route   GET /api/files/trash
// @access  Private
const getTrashedFiles = asyncHandler(async (req, res) => {
  const { email: userId } = req.user

  const { Items } = await dynamoDb.send(new QueryCommand({
    TableName: process.env.TRASH_TABLE,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }))

  res.status(200).json({ success: true, files: Items })
})

// @desc    Restore file from trash
// @route   PATCH /api/files/trash/:fileId/restore
// @access  Private
const restoreFromTrash = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { fileId } = req.params

  const { Item: file } = await dynamoDb.send(new GetCommand({
    TableName: process.env.TRASH_TABLE,
    Key: { userId, fileId },
  }))

  if (!file) throw new ApiError(404, 'File not found in trash')

  await dynamoDb.send(new UpdateCommand({
    TableName: process.env.FILES_TABLE,
    Key: { userId, fileId },
    UpdateExpression: 'SET trashed = :f, updatedAt = :u',
    ExpressionAttributeValues: { ':f': false, ':u': new Date().toISOString() },
  }))

  await dynamoDb.send(new DeleteCommand({
    TableName: process.env.TRASH_TABLE,
    Key: { userId, fileId },
  }))

  await logActivity(userId, 'RESTORE', { fileId, fileName: file.name })

  res.status(200).json({ success: true, message: 'File restored successfully' })
})

// @desc    Permanently delete file from S3 + both tables
// @route   DELETE /api/files/trash/:fileId/permanent
// @access  Private
const permanentDeleteFile = asyncHandler(async (req, res) => {
  const { email: userId } = req.user
  const { fileId } = req.params

  const { Item: file } = await dynamoDb.send(new GetCommand({
    TableName: process.env.TRASH_TABLE,
    Key: { userId, fileId },
  }))

  if (!file) throw new ApiError(404, 'File not found in trash')

  await s3.send(new DeleteObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: file.s3Key,
  }))

  await dynamoDb.send(new DeleteCommand({
    TableName: process.env.TRASH_TABLE,
    Key: { userId, fileId },
  }))

  await dynamoDb.send(new DeleteCommand({
    TableName: process.env.FILES_TABLE,
    Key: { userId, fileId },
  }))

  await logActivity(userId, 'PERMANENT_DELETE', { fileId, fileName: file.name })

  res.status(200).json({ success: true, message: 'File permanently deleted' })
})

// @desc    Empty entire trash for user
// @route   DELETE /api/files/trash/empty
// @access  Private
const emptyTrash = asyncHandler(async (req, res) => {
  const { email: userId } = req.user

  const { Items } = await dynamoDb.send(new QueryCommand({
    TableName: process.env.TRASH_TABLE,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }))

  if (!Items.length) {
    return res.status(200).json({ success: true, message: 'Trash is already empty' })
  }
};

//TO-FIX:
export const getFilesInFolder = async (req, res) => {
  try {
    const user = req.user;
    const { folderId } = req.query;

    const userId = user.userId;

    if (!folderId) {
      return res
        .status(400)
        .send(errorHandler(400, "Invalid Request", "Please Enter folderId"));
    }

    const params = {
      TableName: FILES_TABLE,
      FilterExpression: "folderId = :fid AND userId = :uid AND isDeleted = :isDeleted",
      ExpressionAttributeValues: {
        ":fid": folderId,
        ":uid": userId,
        ":isDeleted": false,
      },
    };

    const result = await dynamoDb.scan(params).promise();
    console.log("Folder items found:", result.Items?.length);
    res.status(200).send({
      response: {
        data: result.Items,
        title: "File Fetched",
        message: `Files Fetched For The Folder ${folderId}`,
        status: 200,
      },
    });
  } catch (error) {
    console.error("Error fetching files in folder:", error);
    res
      .status(500)
      .send(
        errorHandler(
          500,
          "Internal Server Error",
          "Server Error Occurred While Fetching Files"
        )
      );
  }
};

export const getAllFoldersForUser = async (req, res) => {
  try {
    const user = req.user;

    const userId = user.userId;

    if (!userId) {
      return res.status(400).json({ message: "Missing userId" });
    }

    const params = {
      TableName: "ChunklyUserFolders",
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: {
        ":uid": userId,
      },
    };

    const result = await dynamoDb.query(params).promise();
    const folders = result.Items.filter((folder) => {
      const isDel = folder.isDeleted === true || folder.is_deleted === true;
      return !isDel;
    });

    res.status(200).json({
      folders,
    });
  } catch (error) {
    console.error("Error fetching folders:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getRecentUploads = async (req, res) => {
  try {
    const userId = req.user.userId;

    const params = {
      TableName: FILES_TABLE,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: {
        ":uid": userId,
      },
      FilterExpression: "isDeleted = :isDeleted",
      ExpressionAttributeValues: {
        ":uid": userId,
        ":isDeleted": false,
      },
    };

    const result = await dynamoDb.query(params).promise();
    const files = result.Items || [];

    const now = Date.now();
    const fiveHoursMs = 5 * 60 * 60 * 1000;
    const recentFiles = files.filter((file) => {
      if (!file.uploadedAt) return false;
      const uploadedAt = new Date(file.uploadedAt).getTime();
      return now - uploadedAt <= fiveHoursMs;
    });

    return res.status(200).json({
      success: true,
      message: "Recent uploads fetched successfully.",
      files: recentFiles,
    });
  } catch (error) {
    console.error("Error fetching recent uploads:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch recent uploads.",
    });
  }
};

export const downloadFile = async (req, res) => {
  try {
    const requesterId = req.user.userId;
    const requesterEmail = req.user.email;
    const { fileId } = req.query;
    const ownerId = String(req.query.ownerId || requesterId);

    const result = await dynamoDb
      .get({
        TableName: FILES_TABLE,
        Key: { userId: ownerId, fileId },
      })
      .promise();

    if (!result.Item || result.Item.isDeleted === true || result.Item.is_deleted === true) {
      return res
        .status(404)
        .send(errorHandler(404, "Not Found", "File not found"));
    }

    if (ownerId !== requesterId) {
      const access = await canUserAccessFile({
        requesterUserId: requesterId,
        requesterEmail,
        ownerId,
        fileId,
      });

      if (!access.allowed) {
        return res
          .status(403)
          .send(errorHandler(403, "Forbidden", "You do not have access to this file"));
      }
    }

    const fileKey = `${ownerId}/${fileId}-${result.Item.fileName}`;

    const isDownload = req.query.download === 'true';

    const params = {
      Bucket: BUCKET_NAME,
      Key: fileKey,
      Expires: 60 * 5,
      ResponseContentDisposition: `${isDownload ? 'attachment' : 'inline'}; filename="${result.Item.fileName}"`,
    };

    const url = s3.getSignedUrl("getObject", params);

    return res.status(200).json({
      success: true,
      downloadUrl: url,
      fileName: result.Item.fileName,
    });
  } catch (error) {
    console.error("Download File Error:", error);
    return res
      .status(500)
      .send(
        errorHandler(500, "Download Failed", "Server error during download")
      );
  }
};

export const getFileProcessingStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { jobId } = req.params;

    if (!jobId) {
      return res
        .status(400)
        .send(errorHandler(400, "Invalid Request", "jobId is required"));
    }

    const job = await getProcessingJob({ userId, jobId });

    if (!job) {
      return res
        .status(404)
        .send(errorHandler(404, "Not Found", "Processing job not found"));
    }

    return res.status(200).send({
      message: "Processing status fetched successfully",
      job: {
        jobId: job.jobId,
        fileId: job.fileId,
        status: job.status,
        attempt: job.attempt,
        lastError: job.lastError || null,
        analysis: job.analysis || null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt || null,
      },
    });
  } catch (error) {
    console.error("Get Processing Status Error:", error);
    return res
      .status(500)
      .send(
        errorHandler(500, "Internal Error", "Failed to fetch processing status")
      );
  }
};

export const getUserStorageCapacity = async (req, res) => {
  try {
    const email = req.user.email;
    const userId = req.user.userId;

    if (!email || !userId) {
      return res
        .status(400)
        .send(errorHandler(400, "Invalid Request", "User info is missing"));
    }

    // 1. Fetch user data for fileSizeAllowed
    const userResult = await dynamoDb
      .get({
        TableName: USER_TABLE,
        Key: { email },
      })
      .promise();

    const user = userResult.Item;
    if (!user) {
      return res
        .status(404)
        .send(errorHandler(404, "Not Found", "User not found"));
    }

    // 2. Fetch all files to dynamically sum actual consumed storage
    const filesParams = {
      TableName: FILES_TABLE,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: {
        ":uid": userId,
      },
    };

    const filesData = await dynamoDb.query(filesParams).promise();

    // Sum sizes, optionally excluding hard-deleted or soft-deleted items
    const dynamicUsedBytes = (filesData.Items || []).reduce((acc, file) => {
      // Storage often still counts trashed items, but if we don't want it to, we'd check file.isDeleted
      return acc + (Number(file.fileSize) || 0);
    }, 0);

    const allowedBytes = Number(user.fileSizeAllowed || 1073741824); // default 1GB
    const remainingBytes = Math.max(allowedBytes - dynamicUsedBytes, 0);
    const usagePercentage =
      allowedBytes > 0 ? Number(((dynamicUsedBytes / allowedBytes) * 100).toFixed(2)) : 0;

    // Optional: Sync back up to user table if needed
    if (Number(user.totalFileSize) !== dynamicUsedBytes) {
      await dynamoDb.update({
        TableName: USER_TABLE,
        Key: { email },
        UpdateExpression: "SET totalFileSize = :newSize",
        ExpressionAttributeValues: { ":newSize": dynamicUsedBytes },
      }).promise().catch(() => { });
    }

    return res.status(200).send({
      message: "Storage capacity fetched dynamically",
      storage: {
        usedBytes: dynamicUsedBytes,
        allowedBytes,
        remainingBytes,
        usagePercentage,
      },
    });
  } catch (error) {
    console.error("Get User Storage Capacity Error:", error);
    return res
      .status(500)
      .send(
        errorHandler(500, "Internal Error", "Failed to fetch storage capacity")
      );
  }
};
