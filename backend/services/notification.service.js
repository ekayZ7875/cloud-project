import AWS from "aws-sdk";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { getShareNotificationHtml } from "../utils/emailTemplates.js";

dotenv.config();

const sqs = new AWS.SQS({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_KEY,
});

const SHARE_NOTIFICATION_QUEUE_URL = process.env.SHARE_NOTIFICATION_QUEUE_URL;
const NOTIFICATION_FROM_EMAIL = process.env.NOTIFICATION_FROM_EMAIL;

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_GMAIL_USER || process.env.NOTIFICATION_FROM_EMAIL,
    pass: process.env.SMTP_GMAIL_APP_PASS,
  },
});


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
  const fromEmail = process.env.SMTP_GMAIL_USER || process.env.NOTIFICATION_FROM_EMAIL;
  if (!fromEmail) {
    throw new Error("SMTP_GMAIL_USER or NOTIFICATION_FROM_EMAIL is not configured");
  }
  if (!process.env.SMTP_GMAIL_APP_PASS) {
    throw new Error("SMTP_GMAIL_APP_PASS is not configured");
  }

  const safeOwner = ownerName || "Someone";
  const safeFile = fileName || "a file";

  const emailHtml = getShareNotificationHtml({
    ownerName: safeOwner,
    fileName: safeFile,
    permission,
    dashboardUrl,
  });

  await transporter.sendMail({
    from: `"Chunkly" <${fromEmail}>`,
    to: recipientEmail,
    subject: `${safeOwner} shared ${safeFile} with you`,
    html: emailHtml,
  });
}


