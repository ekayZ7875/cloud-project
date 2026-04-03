import { dynamoDb } from "../config/dynamoDB/index.js";
import { getProcessingJob } from "./metadata.service.js";

const FILES_TABLE = process.env.FILES_TABLE || "ChunklyUserFiles";

const MONTH_MAP = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

function parseLooseDate(input, now = new Date()) {
  if (!input || typeof input !== "string") return null;

  const raw = input.trim();
  if (!raw) return null;

  // ISO-like dates first for deterministic parsing.
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const dt = new Date(raw);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  // dd/mm/yyyy or dd-mm-yyyy
  let match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    const dt = new Date(year, month, day);
    if (
      dt.getFullYear() === year &&
      dt.getMonth() === month &&
      dt.getDate() === day
    ) {
      return dt;
    }
  }

  // dd month [yyyy]
  match = raw.match(/^(\d{1,2})\s+([a-zA-Z]+)(?:\s+(\d{4}))?$/);
  if (match) {
    const day = Number(match[1]);
    const monthName = match[2].toLowerCase();
    const month = MONTH_MAP[monthName];
    const year = Number(match[3] || now.getFullYear());

    if (month !== undefined) {
      const dt = new Date(year, month, day);
      if (
        dt.getFullYear() === year &&
        dt.getMonth() === month &&
        dt.getDate() === day
      ) {
        return dt;
      }
    }
  }

  // month dd[, yyyy]
  match = raw.match(/^([a-zA-Z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
  if (match) {
    const monthName = match[1].toLowerCase();
    const day = Number(match[2]);
    const month = MONTH_MAP[monthName];
    const year = Number(match[3] || now.getFullYear());

    if (month !== undefined) {
      const dt = new Date(year, month, day);
      if (
        dt.getFullYear() === year &&
        dt.getMonth() === month &&
        dt.getDate() === day
      ) {
        return dt;
      }
    }
  }

  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) {
    return fallback;
  }

  return null;
}

function formatHumanDate(date) {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export async function buildSmartInsights(userId, options = {}) {
  const windowDays = Number.isFinite(Number(options.windowDays))
    ? Number(options.windowDays)
    : 7;
  const deadlineLimit = Number.isFinite(Number(options.deadlineLimit))
    ? Number(options.deadlineLimit)
    : 5;

  const result = await dynamoDb
    .query({
      TableName: FILES_TABLE,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: {
        ":uid": userId,
      },
    })
    .promise();

  const files = (result.Items || []).filter((f) => !f.isDeleted && !f.is_deleted);
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const weeklyUploads = files.filter((file) => {
    if (!file.uploadedAt) return false;
    const uploadedAt = new Date(file.uploadedAt);
    return !Number.isNaN(uploadedAt.getTime()) && uploadedAt >= windowStart;
  }).length;

  const deadlineEntries = [];
  for (const file of files) {
    if (!file.jobId) continue;

    const job = await getProcessingJob({ userId, jobId: file.jobId });
    const deadlines = job?.analysis?.entities?.deadlines || [];

    for (const deadlineText of deadlines) {
      const parsedDate = parseLooseDate(deadlineText, now);
      deadlineEntries.push({
        fileId: file.fileId,
        fileName: file.fileName,
        raw: deadlineText,
        parsedDate,
      });
    }
  }

  const upcomingDeadlines = deadlineEntries
    .filter((entry) => entry.parsedDate)
    .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime())
    .slice(0, deadlineLimit);

  const insights = [
    `You uploaded ${weeklyUploads} file${weeklyUploads === 1 ? "" : "s"} this week`,
  ];

  if (upcomingDeadlines.length > 0) {
    const nearest = upcomingDeadlines[0];
    insights.push(
      `Deadline detected in file: ${nearest.raw}${nearest.fileName ? ` (${nearest.fileName})` : ""}`
    );
  } else {
    insights.push("No deadlines detected in your processed files");
  }

  return {
    insights,
    summary: {
      weeklyUploads,
      totalFiles: files.length,
      deadlinesDetected: deadlineEntries.length,
      upcomingDeadlines: upcomingDeadlines.map((item) => ({
        fileId: item.fileId,
        fileName: item.fileName,
        sourceText: item.raw,
        normalizedDate: formatHumanDate(item.parsedDate),
      })),
      windowDays,
    },
    generatedAt: now.toISOString(),
  };
}
