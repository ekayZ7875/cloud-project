import AWS from "aws-sdk";
import dotenv from "dotenv";

dotenv.config();

const sqs = new AWS.SQS({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_KEY,
});

const ses = new AWS.SES({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_KEY,
});

const SHARE_NOTIFICATION_QUEUE_URL = process.env.SHARE_NOTIFICATION_QUEUE_URL;
const NOTIFICATION_FROM_EMAIL = process.env.NOTIFICATION_FROM_EMAIL;

export async function publishShareNotificationJob(payload) {
  if (!SHARE_NOTIFICATION_QUEUE_URL) {
    throw new Error("SHARE_NOTIFICATION_QUEUE_URL is not configured");
  }

  await sqs
    .sendMessage({
      QueueUrl: SHARE_NOTIFICATION_QUEUE_URL,
      MessageBody: JSON.stringify(payload),
      MessageAttributes: {
        attempt: {
          DataType: "Number",
          StringValue: String(payload.attempt || 1),
        },
      },
    })
    .promise();
}

export async function sendShareNotificationEmail({
  recipientEmail,
  ownerName,
  fileName,
  permission,
  dashboardUrl,
}) {
  if (!NOTIFICATION_FROM_EMAIL) {
    throw new Error("NOTIFICATION_FROM_EMAIL is not configured");
  }

  const safeOwner = ownerName || "Someone";
  const safeFile = fileName || "a file";

  await ses
    .sendEmail({
      Source: NOTIFICATION_FROM_EMAIL,
      Destination: {
        ToAddresses: [recipientEmail],
      },
      Message: {
        Subject: {
          Data: `${safeOwner} shared ${safeFile} with you`,
        },
        Body: {
          Html: {
            Data: `
              <h2>File shared with you</h2>
              <p><strong>${safeOwner}</strong> shared <strong>${safeFile}</strong> with permission <strong>${permission}</strong>.</p>
              <p>Open your Shared tab to access the file.</p>
              <p><a href="${dashboardUrl}">Open dashboard</a></p>
            `,
          },
        },
      },
    })
    .promise();
}
