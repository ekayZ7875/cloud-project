import { errorHandler } from "../utils/errorHandler.js";
import {
  createOrUpdateShare,
  revokeShare,
  updateSharePermission,
  listSharesForFile,
  listSharedWithMe,
  acceptShare,
  declineShare,
} from "../services/share.service.js";
import { publishShareNotificationJob } from "../services/notification.service.js";
import {
  validateCreateShare,
  validatePermissionUpdate,
  validateShareAction,
} from "../validators/share.validator.js";
import { dynamoDb } from "../config/dynamoDB/index.js";

const FILES_TABLE = process.env.FILES_TABLE || "ChunklyUserFiles";
const USER_TABLE = process.env.USER_TABLE || "ChunklyUsers";

export const shareFile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const ownerEmail = req.user.email;

    const { fileId, recipientEmail, permission, expiresAt, emailNotification } = validateCreateShare(
      req.body
    );

    const share = await createOrUpdateShare({
      ownerId: userId,
      ownerEmail,
      fileId,
      recipientEmail,
      permission,
      expiresAt,
    });

    if (emailNotification) {
      const [ownerResponse, fileResponse] = await Promise.all([
        dynamoDb
          .get({
            TableName: USER_TABLE,
            Key: { email: ownerEmail },
          })
          .promise(),
        dynamoDb
          .get({
            TableName: FILES_TABLE,
            Key: { userId, fileId },
          })
          .promise(),
      ]);

      await publishShareNotificationJob({
        attempt: 1,
        shareId: share.shareId,
        recipientEmail,
        ownerName: ownerResponse.Item?.name || ownerEmail,
        fileName: fileResponse.Item?.fileName || "file",
        permission: share.permission,
      });
    }

    return res.status(201).send({
      message: share.wasUpdated ? "Share updated successfully" : "File shared successfully",
      share,
    });
  } catch (error) {
    console.error("Share File Error:", error);
    const status = error.status || 500;
    return res.status(status).send(errorHandler(status, "Share Failed", error.message));
  }
};

export const revokeFileShare = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { shareId } = validateShareAction(req.body);

    const share = await revokeShare({ shareId, ownerId: userId });

    return res.status(200).send({
      message: "Share revoked successfully",
      share,
    });
  } catch (error) {
    console.error("Revoke Share Error:", error);
    const status = error.status || 500;
    return res.status(status).send(errorHandler(status, "Revoke Failed", error.message));
  }
};

export const listFileShares = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const fileId = String(req.query.fileId || "").trim();

    if (!fileId) {
      return res.status(400).send(errorHandler(400, "Invalid Request", "fileId query param is required"));
    }

    const shares = await listSharesForFile({ ownerId, fileId });

    return res.status(200).send({
      message: "Shares fetched successfully",
      fileId,
      shares,
    });
  } catch (error) {
    console.error("List Shares Error:", error);
    return res.status(500).send(errorHandler(500, "List Failed", "Failed to list shares"));
  }
};

export const listSharedWithMeFiles = async (req, res) => {
  try {
    const shares = await listSharedWithMe({
      recipientUserId: req.user.userId,
      recipientEmail: req.user.email,
    });

    return res.status(200).send({
      message: "Shared files fetched successfully",
      shares,
    });
  } catch (error) {
    console.error("List Shared With Me Error:", error);
    return res.status(500).send(errorHandler(500, "List Failed", "Failed to fetch shared files"));
  }
};

export const changeSharePermission = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const { shareId, permission } = validatePermissionUpdate(req.body);

    const share = await updateSharePermission({
      shareId,
      ownerId,
      permission,
    });

    return res.status(200).send({
      message: "Share permission updated",
      share,
    });
  } catch (error) {
    console.error("Update Permission Error:", error);
    const status = error.status || 500;
    return res.status(status).send(errorHandler(status, "Update Failed", error.message));
  }
};

export const acceptShareInvite = async (req, res) => {
  try {
    const { shareId } = validateShareAction(req.body);

    const share = await acceptShare({
      shareId,
      recipientUserId: req.user.userId,
      recipientEmail: req.user.email,
    });

    return res.status(200).send({
      message: "Share accepted",
      share,
    });
  } catch (error) {
    console.error("Accept Share Error:", error);
    const status = error.status || 500;
    return res.status(status).send(errorHandler(status, "Accept Failed", error.message));
  }
};

export const declineShareInvite = async (req, res) => {
  try {
    const { shareId } = validateShareAction(req.body);

    const share = await declineShare({
      shareId,
      recipientUserId: req.user.userId,
      recipientEmail: req.user.email,
    });

    return res.status(200).send({
      message: "Share declined",
      share,
    });
  } catch (error) {
    console.error("Decline Share Error:", error);
    const status = error.status || 500;
    return res.status(status).send(errorHandler(status, "Decline Failed", error.message));
  }
};
