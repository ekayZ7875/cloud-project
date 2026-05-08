import logger from "../../libs/logger.js";
import { sendShareNotificationEmail } from "../../services/notification.service.js";
import { SHARE_NOTIFICATION } from "../../constants/share.constants.js";

function computeDelaySeconds(attempt) {
  const delay = Math.min(
    SHARE_NOTIFICATION.BASE_DELAY_SECONDS * 2 ** Math.max(0, attempt - 1),
    SHARE_NOTIFICATION.MAX_DELAY_SECONDS
  );

  return Math.max(0, Math.floor(delay));
}

export async function processShareNotification(message) {
  const attempt = Number(message.attempt || 1);

  if (!message.recipientEmail) {
    const error = new Error("recipientEmail is required");
    error.retryable = false;
    throw error;
  }

  try {
    await sendShareNotificationEmail({
      recipientEmail: message.recipientEmail,
      ownerName: message.ownerName,
      fileName: message.fileName,
      permission: message.permission,
      dashboardUrl:
        process.env.FRONTEND_BASE_URL || "http://localhost:5173/dashboard/shared",
    });

    logger.info(`[SHARE_NOTIFY] sent email to ${message.recipientEmail}`);
    return { ok: true };
  } catch (error) {
    const wrapped = new Error(error.message || "Failed to send email");
    wrapped.retryable = ![
      "MessageRejected",
      "MailFromDomainNotVerifiedException",
      "InvalidParameterValue",
    ].includes(error.code);
    wrapped.nextAttempt = attempt + 1;
    wrapped.maxAttempts = SHARE_NOTIFICATION.MAX_ATTEMPTS;
    wrapped.retryAfterSeconds = computeDelaySeconds(wrapped.nextAttempt);

    throw wrapped;
  }
}
