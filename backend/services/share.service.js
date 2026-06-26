import dotenv from "dotenv";
import { dynamoDb } from "../config/dynamoDb.js";
import { generateId } from "../utils/generatedID.js";
import { SHARE_STATUS, SHARE_PERMISSION, SHARE_PERMISSION_VALUES } from "../constants/share.constants.js";

dotenv.config();

const FILES_TABLE = process.env.FILES_TABLE || "ChunklyUserFiles";
const USER_TABLE = process.env.USER_TABLE || "ChunklyUsers";
const FILE_SHARES_TABLE = process.env.FILE_SHARES_TABLE || "ChunklyFileShares";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isExpired(expiresAt) {
  if (!expiresAt) {
    return false;
  }

  return new Date(expiresAt).getTime() <= Date.now();
}

async function getOwnedFile({ ownerId, fileId }) {
  const { Item } = await dynamoDb
    .get({
      TableName: FILES_TABLE,
      Key: { userId: ownerId, fileId },
    })
    .promise();

  if (!Item || Item.isDeleted === true || Item.is_deleted === true) {
    return null;
  }

  return Item;
}

async function findShareById(shareId) {
  const response = await dynamoDb
    .scan({
      TableName: FILE_SHARES_TABLE,
      FilterExpression: "shareId = :shareId",
      ExpressionAttributeValues: {
        ":shareId": shareId,
      },
      Limit: 1,
    })
    .promise();

  return response.Items?.[0] || null;
}

async function getUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }

  const response = await dynamoDb
    .get({
      TableName: USER_TABLE,
      Key: { email: normalized },
    })
    .promise();

  return response.Item || null;
}

export async function createOrUpdateShare({
  ownerId,
  ownerEmail,
  fileId,
  recipientEmail,
  permission = SHARE_PERMISSION.VIEW,
  expiresAt,
}) {
  if (!SHARE_PERMISSION_VALUES.includes(permission)) {
    const error = new Error("Invalid permission");
    error.status = 400;
    throw error;
  }

  const normalizedOwnerEmail = normalizeEmail(ownerEmail);
  const normalizedRecipientEmail = normalizeEmail(recipientEmail);

  if (!normalizedRecipientEmail) {
    const error = new Error("recipientEmail is required");
    error.status = 400;
    throw error;
  }

  if (normalizedOwnerEmail === normalizedRecipientEmail) {
    const error = new Error("Cannot share a file with yourself");
    error.status = 400;
    throw error;
  }

  const file = await getOwnedFile({ ownerId, fileId });
  if (!file) {
    const error = new Error("File not found");
    error.status = 404;
    throw error;
  }

  const recipientUser = await getUserByEmail(normalizedRecipientEmail);
  const now = new Date().toISOString();

  const existingResponse = await dynamoDb
    .query({
      TableName: FILE_SHARES_TABLE,
      KeyConditionExpression: "ownerId = :ownerId",
      FilterExpression: "fileId = :fileId AND recipientEmail = :recipientEmail",
      ExpressionAttributeValues: {
        ":ownerId": ownerId,
        ":fileId": fileId,
        ":recipientEmail": normalizedRecipientEmail,
      },
    })
    .promise();

  const existing = existingResponse.Items?.[0];

  if (existing) {
    const nextStatus = recipientUser?.userId ? SHARE_STATUS.ACTIVE : SHARE_STATUS.PENDING;

    await dynamoDb
      .update({
        TableName: FILE_SHARES_TABLE,
        Key: {
          ownerId,
          shareId: existing.shareId,
        },
        UpdateExpression:
          "SET #permission = :permission, #status = :status, recipientUserId = :recipientUserId, expiresAt = :expiresAt, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#permission": "permission",
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":permission": permission,
          ":status": nextStatus,
          ":recipientUserId": recipientUser?.userId || null,
          ":expiresAt": expiresAt || null,
          ":updatedAt": now,
        },
      })
      .promise();

    return {
      ...existing,
      permission,
      status: nextStatus,
      recipientUserId: recipientUser?.userId || null,
      expiresAt: expiresAt || null,
      updatedAt: now,
      file,
      wasUpdated: true,
    };
  }

  const shareId = generateId("SHR");
  const share = {
    ownerId,
    shareId,
    fileId,
    ownerEmail: normalizedOwnerEmail,
    recipientEmail: normalizedRecipientEmail,
    recipientUserId: recipientUser?.userId || null,
    permission,
    status: recipientUser?.userId ? SHARE_STATUS.ACTIVE : SHARE_STATUS.PENDING,
    expiresAt: expiresAt || null,
    createdAt: now,
    updatedAt: now,
  };

  await dynamoDb
    .put({
      TableName: FILE_SHARES_TABLE,
      Item: share,
    })
    .promise();

  return {
    ...share,
    file,
    wasUpdated: false,
  };
}

export async function listSharesForFile({ ownerId, fileId }) {
  const response = await dynamoDb
    .query({
      TableName: FILE_SHARES_TABLE,
      KeyConditionExpression: "ownerId = :ownerId",
      FilterExpression: "fileId = :fileId",
      ExpressionAttributeValues: {
        ":ownerId": ownerId,
        ":fileId": fileId,
      },
    })
    .promise();

  return (response.Items || []).map((share) => {
    if (
      share.status !== SHARE_STATUS.REVOKED &&
      share.status !== SHARE_STATUS.DECLINED &&
      isExpired(share.expiresAt)
    ) {
      return {
        ...share,
        status: SHARE_STATUS.EXPIRED,
      };
    }

    return share;
  });
}

export async function revokeShare({ shareId, ownerId }) {
  const share = await findShareById(shareId);
  if (!share) {
    const error = new Error("Share not found");
    error.status = 404;
    throw error;
  }

  if (share.ownerId !== ownerId) {
    const error = new Error("Only owner can revoke share");
    error.status = 403;
    throw error;
  }

  const updatedAt = new Date().toISOString();

  await dynamoDb
    .update({
      TableName: FILE_SHARES_TABLE,
      Key: {
        ownerId: share.ownerId,
        shareId: share.shareId,
      },
      UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": SHARE_STATUS.REVOKED,
        ":updatedAt": updatedAt,
      },
    })
    .promise();

  return {
    ...share,
    status: SHARE_STATUS.REVOKED,
    updatedAt,
  };
}

export async function updateSharePermission({ shareId, ownerId, permission }) {
  if (!SHARE_PERMISSION_VALUES.includes(permission)) {
    const error = new Error("Invalid permission");
    error.status = 400;
    throw error;
  }

  const share = await findShareById(shareId);
  if (!share) {
    const error = new Error("Share not found");
    error.status = 404;
    throw error;
  }

  if (share.ownerId !== ownerId) {
    const error = new Error("Only owner can update permission");
    error.status = 403;
    throw error;
  }

  const updatedAt = new Date().toISOString();

  await dynamoDb
    .update({
      TableName: FILE_SHARES_TABLE,
      Key: {
        ownerId: share.ownerId,
        shareId: share.shareId,
      },
      UpdateExpression: "SET #permission = :permission, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#permission": "permission",
      },
      ExpressionAttributeValues: {
        ":permission": permission,
        ":updatedAt": updatedAt,
      },
    })
    .promise();

  return {
    ...share,
    permission,
    updatedAt,
  };
}

export async function acceptShare({ shareId, recipientUserId, recipientEmail }) {
  const share = await findShareById(shareId);
  if (!share) {
    const error = new Error("Share not found");
    error.status = 404;
    throw error;
  }

  const normalizedRecipientEmail = normalizeEmail(recipientEmail);
  const matchesRecipient =
    share.recipientUserId === recipientUserId ||
    share.recipientEmail === normalizedRecipientEmail;

  if (!matchesRecipient) {
    const error = new Error("You are not allowed to accept this share");
    error.status = 403;
    throw error;
  }

  const updatedAt = new Date().toISOString();

  await dynamoDb
    .update({
      TableName: FILE_SHARES_TABLE,
      Key: {
        ownerId: share.ownerId,
        shareId: share.shareId,
      },
      UpdateExpression:
        "SET #status = :status, recipientUserId = :recipientUserId, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": SHARE_STATUS.ACTIVE,
        ":recipientUserId": recipientUserId,
        ":updatedAt": updatedAt,
      },
    })
    .promise();

  return {
    ...share,
    status: SHARE_STATUS.ACTIVE,
    recipientUserId,
    updatedAt,
  };
}

export async function declineShare({ shareId, recipientUserId, recipientEmail }) {
  const share = await findShareById(shareId);
  if (!share) {
    const error = new Error("Share not found");
    error.status = 404;
    throw error;
  }

  const normalizedRecipientEmail = normalizeEmail(recipientEmail);
  const matchesRecipient =
    share.recipientUserId === recipientUserId ||
    share.recipientEmail === normalizedRecipientEmail;

  if (!matchesRecipient) {
    const error = new Error("You are not allowed to decline this share");
    error.status = 403;
    throw error;
  }

  const updatedAt = new Date().toISOString();

  await dynamoDb
    .update({
      TableName: FILE_SHARES_TABLE,
      Key: {
        ownerId: share.ownerId,
        shareId: share.shareId,
      },
      UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": SHARE_STATUS.DECLINED,
        ":updatedAt": updatedAt,
      },
    })
    .promise();

  return {
    ...share,
    status: SHARE_STATUS.DECLINED,
    updatedAt,
  };
}

export async function listSharedWithMe({ recipientUserId, recipientEmail }) {
  const normalizedEmail = normalizeEmail(recipientEmail);

  const response = await dynamoDb
    .scan({
      TableName: FILE_SHARES_TABLE,
      FilterExpression:
        "(recipientUserId = :recipientUserId OR recipientEmail = :recipientEmail) AND (#status = :active OR #status = :pending)",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":recipientUserId": recipientUserId,
        ":recipientEmail": normalizedEmail,
        ":active": SHARE_STATUS.ACTIVE,
        ":pending": SHARE_STATUS.PENDING,
      },
    })
    .promise();

  const shares = response.Items || [];
  const hydrated = await Promise.all(
    shares.map(async (share) => {
      if (isExpired(share.expiresAt)) {
        return null;
      }

      const file = await getOwnedFile({ ownerId: share.ownerId, fileId: share.fileId });
      if (!file) {
        return null;
      }

      const owner = await getUserByEmail(share.ownerEmail);

      if (!share.recipientUserId && share.recipientEmail === normalizedEmail && recipientUserId) {
        await dynamoDb
          .update({
            TableName: FILE_SHARES_TABLE,
            Key: {
              ownerId: share.ownerId,
              shareId: share.shareId,
            },
            UpdateExpression: "SET recipientUserId = :recipientUserId, #status = :status, updatedAt = :updatedAt",
            ExpressionAttributeNames: {
              "#status": "status",
            },
            ExpressionAttributeValues: {
              ":recipientUserId": recipientUserId,
              ":status": SHARE_STATUS.ACTIVE,
              ":updatedAt": new Date().toISOString(),
            },
          })
          .promise();

        share.recipientUserId = recipientUserId;
        share.status = SHARE_STATUS.ACTIVE;
      }

      return {
        shareId: share.shareId,
        ownerId: share.ownerId,
        fileId: share.fileId,
        fileName: file.fileName,
        fileType: file.fileType,
        fileSize: file.fileSize,
        permission: share.permission,
        status: share.status,
        sharedAt: share.createdAt,
        expiresAt: share.expiresAt || null,
        owner: {
          email: share.ownerEmail,
          name: owner?.name || null,
          avatar: owner?.avatar || null,
        },
      };
    })
  );

  return hydrated.filter(Boolean);
}

export async function canUserAccessFile({ requesterUserId, requesterEmail, ownerId, fileId }) {
  if (requesterUserId === ownerId) {
    return {
      allowed: true,
      permission: SHARE_PERMISSION.EDIT,
      viaShare: false,
    };
  }

  const response = await dynamoDb
    .query({
      TableName: FILE_SHARES_TABLE,
      KeyConditionExpression: "ownerId = :ownerId",
      FilterExpression:
        "fileId = :fileId AND #status = :status AND (recipientUserId = :requesterUserId OR recipientEmail = :requesterEmail)",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":ownerId": ownerId,
        ":fileId": fileId,
        ":status": SHARE_STATUS.ACTIVE,
        ":requesterUserId": requesterUserId,
        ":requesterEmail": normalizeEmail(requesterEmail),
      },
    })
    .promise();

  const share = (response.Items || []).find((item) => !isExpired(item.expiresAt));

  if (!share) {
    return {
      allowed: false,
      permission: null,
      viaShare: true,
    };
  }

  return {
    allowed: true,
    permission: share.permission,
    viaShare: true,
    shareId: share.shareId,
  };
}

export async function attachRecipientToPendingShares({ email, userId }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !userId) {
    return 0;
  }

  const response = await dynamoDb
    .scan({
      TableName: FILE_SHARES_TABLE,
      FilterExpression: "recipientEmail = :recipientEmail AND (#status = :pending OR attribute_not_exists(recipientUserId))",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":recipientEmail": normalizedEmail,
        ":pending": SHARE_STATUS.PENDING,
      },
    })
    .promise();

  const pendingShares = response.Items || [];

  await Promise.all(
    pendingShares.map((share) =>
      dynamoDb
        .update({
          TableName: FILE_SHARES_TABLE,
          Key: {
            ownerId: share.ownerId,
            shareId: share.shareId,
          },
          UpdateExpression: "SET recipientUserId = :recipientUserId, #status = :status, updatedAt = :updatedAt",
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":recipientUserId": userId,
            ":status": SHARE_STATUS.ACTIVE,
            ":updatedAt": new Date().toISOString(),
          },
        })
        .promise()
    )
  );

  return pendingShares.length;
}
