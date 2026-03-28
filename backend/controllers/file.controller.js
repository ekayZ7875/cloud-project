import s3 from "../config/S3/index.js";
import { dynamoDb } from "../config/dynamoDB/index.js";
import { generateId } from "../utils/generateUserId.js";
import { errorHandler } from "../utils/errorHandler.js";
import {
  createProcessingJob,
  getProcessingJob,
  markProcessingFailed,
} from "../services/metadata.service.js";
import { publishFileProcessingJob } from "../services/queue.service.js";
import dotenv from "dotenv";
import { response } from "express";
dotenv.config();

const FILES_TABLE = process.env.FILES_TABLE;
const USER_TABLE = process.env.USER_TABLE;
const TRASH_TABLE = process.env.TRASH_TABLE;
const FOLDERS_TABLE = process.env.FOLDERS_TABLE;
const BUCKET_NAME = process.env.AWS_BUCKET_NAME;

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

    const userId = user.userId;
    if (!fileId) {
      return res
        .status(400)
        .send(errorHandler(400, "Invalid Request", "fileId is required"));
    }

    const result = await dynamoDb
      .get({
        TableName: FILES_TABLE,
        Key: { userId, fileId },
      })
      .promise();

    if (!result.Item) {
      return res
        .status(404)
        .send(errorHandler(404, "Not Found", "File not found"));
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
  };

  try {
    const resultFiles = await dynamoDb.query(params).promise();
    
    // Also fetch trashed folders
    const paramsFolders = {
      TableName: "ChunklyUserFolders",
      KeyConditionExpression: "userId = :uid",
      FilterExpression: "isDeleted = :isDeleted",
      ExpressionAttributeValues: { ":uid": userId, ":isDeleted": true }
    };
    const resultFolders = await dynamoDb.query(paramsFolders).promise();

    const mergedTrash = [
      ...(resultFiles.Items || []).map(i => ({ ...i, type: 'file' })),
      ...(resultFolders.Items || []).map(i => ({ ...i, type: 'folder' }))
    ];

    return res.status(200).json({
      success: true,
      data: mergedTrash,
    });
  } catch (err) {
    console.error("Error fetching trash files:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch trash files.",
    });
  }
};

export const toggleStarFile = async (req, res) => {
  try {
    const user = req.user;
    const { fileId, isStarred } = req.body;

    const userId = user.userId;

    if (!fileId || typeof isStarred !== "boolean") {
      return res
        .status(400)
        .send(
          errorHandler(
            400,
            "Invalid Request",
            "Please Enter All The Required Fields"
          )
        );
    }

    const params = {
      TableName: FILES_TABLE,
      Key: { userId, fileId },
      UpdateExpression: "set isStarred = :isStarred, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":isStarred": isStarred,
        ":updatedAt": new Date().toISOString(),
      },
    };

    await dynamoDb.update(params).promise();
    res.status(200).json({
      message: `File ${isStarred ? "starred" : "unstarred"} successfully`,
    });
  } catch (error) {
    console.error("Error starring/un-starring file:", error);
    res
      .status(500)
      .send(
        errorHandler(
          500,
          "Internal Server Error",
          "Server Error While Starring The File"
        )
      );
  }
};

export const getStarredFiles = async (req, res) => {
  try {
    const user = req.user;

    const userId = user.userId;

    const params = {
      TableName: FILES_TABLE,
      KeyConditionExpression: "userId = :uid",
      FilterExpression: "isStarred = :starred AND isDeleted <> :deleted",
      ExpressionAttributeValues: {
        ":uid": userId,
        ":starred": true,
        ":deleted": true,
      },
    };

    const result = await dynamoDb.query(params).promise();

    return res.status(200).json({
      success: true,
      message: "Starred files fetched successfully.",
      files: result.Items || [],
    });
  } catch (error) {
    console.error("Error fetching starred files:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch starred files.",
    });
  }
};

export const createFolder = async (req, res) => {
  const user = req.user;
  const { name, parentFolderId } = req.body;

  const userId = user.userId;

  if (!userId || !name) {
    return res
      .status(400)
      .send(
        errorHandler(
          400,
          "Invalid Request",
          "Please Enter All The Required Fields"
        )
      );
  }

  const folderId = generateId("FOLD");

  const newFolder = {
    userId,
    folderId,
    name,
    parentFolderId: parentFolderId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await dynamoDb
      .put({
        TableName: "ChunklyUserFolders",
        Item: newFolder,
      })
      .promise();

    res.status(201).send({
      response: {
        data: { newFolder },
        title: "New Folder Created",
        message: `Created New Folder ${folderId}`,
        status: 201,
      },
    });
  } catch (error) {
    console.error("Error creating folder:", error);
    res
      .status(500)
      .send(
        errorHandler(
          500,
          "Internal Server Error",
          "Server Error While Creating Folder"
        )
      );
  }
};

export const moveFileToFolder = async (req, res) => {
  const user = req.user;
  const { fileId } = req.query;
  const { targetFolderId } = req.body;

  const userId = user.userId;

  if (!userId || !fileId || !targetFolderId) {
    return res
      .status(400)
      .send(
        errorHandler(
          400,
          "Invalid Request",
          "Please Enter All The Required Fields"
        )
      );
  }

  const params = {
    TableName: "files",
    Key: {
      userId,
      fileId,
    },
    UpdateExpression: "set folderId = :folderId, updatedAt = :updatedAt",
    ExpressionAttributeValues: {
      ":folderId": targetFolderId,
      ":updatedAt": new Date().toISOString(),
    },
    ReturnValues: "ALL_NEW",
  };

  try {
    const updated = await dynamoDb.update(params).promise();
    res.status(200).send({
      response: {
        data: { updated },
        title: "File Moved",
        message: `File Moved To Folder ${targetFolderId}`,
      },
    });
  } catch (error) {
    console.error("Error moving file:", error);
    res
      .status(500)
      .send(
        errorHandler(
          500,
          "Internal Server Error",
          "Server Error While Moving Folder"
        )
      );
  }
};

export const bulkMoveFilesToFolder = async (req, res) => {
  try {
    const user = req.user;
    const { fileIds, targetFolderId } = req.body;

    const userId = user.userId;

    if (
      !userId ||
      !Array.isArray(fileIds) ||
      fileIds.length === 0 ||
      !targetFolderId
    ) {
      return res
        .status(400)
        .json({ message: "Missing or invalid required fields" });
    }

    const updateRequests = fileIds.map((fileId) => ({
      Update: {
        TableName: "files",
        Key: { userId, fileId },
        UpdateExpression: "set folderId = :folderId, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":folderId": targetFolderId,
          ":updatedAt": new Date().toISOString(),
        },
      },
    }));

    const params = {
      TransactItems: updateRequests,
    };

    await dynamoDb.transactWrite(params).promise();
    res.status(200).json({ message: "Files moved successfully" });
  } catch (error) {
    console.error("Bulk move error:", error);
    res.status(500).json({ message: "Internal server error" });
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
    const userId = req.user.userId;
    const { fileId } = req.query;

    const result = await dynamoDb
      .get({
        TableName: FILES_TABLE,
        Key: { userId, fileId },
      })
      .promise();

    if (!result.Item) {
      return res
        .status(404)
        .send(errorHandler(404, "Not Found", "File not found"));
    }

    const fileKey = `${userId}/${fileId}-${result.Item.fileName}`;

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

    if (!email) {
      return res
        .status(400)
        .send(errorHandler(400, "Invalid Request", "User email is missing"));
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
        .status(404)
        .send(errorHandler(404, "Not Found", "User not found"));
    }

    const usedBytes = Number(user.totalFileSize || 0);
    const allowedBytes = Number(user.fileSizeAllowed || 0);
    const remainingBytes = Math.max(allowedBytes - usedBytes, 0);
    const usagePercentage =
      allowedBytes > 0 ? Number(((usedBytes / allowedBytes) * 100).toFixed(2)) : 0;

    return res.status(200).send({
      message: "Storage capacity fetched successfully",
      storage: {
        usedBytes,
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
