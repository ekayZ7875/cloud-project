import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  AI_EMBEDDING_PROVIDER,
  AI_PROVIDER,
  CHUNK_CONSTRAINTS,
  EMBEDDING_DIMENSION,
  LLM_MODEL,
  RETRY_POLICY,
} from "../constants/pipeline.constants.js";
import {
  InvalidLlmJsonError,
  TransientProviderError,
  NonRetryableProcessingError,
} from "./errors/pipeline.errors.js";
import { validateFileUnderstandingPayload } from "../validators/fileUnderstanding.validator.js";
import logger from "../libs/logger.js";

dotenv.config();

const FALLBACK_LLM_MODELS = ["gemini-3-flash-preview"];
const GEMINI_ANALYZE_MAX_CHARS = Number(process.env.GEMINI_ANALYZE_MAX_CHARS || 20000);

import { LLM_PROMPT_TEMPLATE } from "../prompts/document.prompts.js";

function getActiveProvider() {
  const provider = String(AI_PROVIDER || "gemini").toLowerCase();
  return provider === "gemini" ? "gemini" : "gemini";
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new NonRetryableProcessingError("GEMINI_API_KEY is not configured");
  }

  return new GoogleGenerativeAI(apiKey);
}

function parseJsonFromModelText(modelText) {
  const trimmed = (modelText || "").trim();
  if (!trimmed) {
    throw new InvalidLlmJsonError("Model returned an empty response");
  }

  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");

  if (start < 0 || end < 0 || end <= start) {
    throw new InvalidLlmJsonError("Model response did not contain a JSON object", {
      responsePreview: withoutFence.slice(0, 300),
    });
  }

  const jsonCandidate = withoutFence.slice(start, end + 1);

  try {
    return JSON.parse(jsonCandidate);
  } catch (error) {
    const repaired = tryRepairJson(jsonCandidate);

    if (repaired) {
      try {
        return JSON.parse(repaired);
      } catch {
        // Fall through to structured parse error.
      }
    }

    throw new InvalidLlmJsonError("Model response JSON parsing failed", {
      reason: error.message,
      responsePreview: jsonCandidate.slice(0, 500),
    });
  }
}

function tryRepairJson(input) {
  if (!input || typeof input !== "string") {
    return null;
  }

  let repaired = input
    .replace(/\uFEFF/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");

  repaired = repaired.replace(/,\s*,+/g, ",");

  return repaired.trim();
}

function isTransientGeminiError(error) {
  const message = (error?.message || "").toLowerCase();
  const status = Number(error?.status || error?.code || 0);

  return (
    [408, 429, 500, 502, 503, 504].includes(status) ||
    message.includes("timeout") ||
    message.includes("temporar") ||
    message.includes("rate") ||
    message.includes("unavailable") ||
    message.includes("network")
  );
}

function isModelNotFoundError(error) {
  const message = (error?.message || "").toLowerCase();
  const status = Number(error?.status || error?.code || 0);

  return (
    status === 404 ||
    (message.includes("model") && message.includes("not found")) ||
    (message.includes("models/") && message.includes("is not found"))
  );
}

function extractRetryAfterSeconds(error) {
  const message = error?.message || "";

  const retryAfterHeader =
    error?.$response?.headers?.["retry-after"] ||
    error?.$response?.headers?.["Retry-After"] ||
    error?.response?.headers?.["retry-after"] ||
    error?.response?.headers?.["Retry-After"] ||
    error?.$metadata?.httpHeaders?.["retry-after"] ||
    error?.$metadata?.httpHeaders?.["Retry-After"] ||
    error?.headers?.["retry-after"] ||
    error?.headers?.["Retry-After"];

  const numericRetryAfter = Number(error?.RetryAfterSeconds || error?.retryAfterSeconds);
  if (Number.isFinite(numericRetryAfter) && numericRetryAfter > 0) {
    return Math.ceil(numericRetryAfter);
  }

  if (typeof retryAfterHeader === "string" && retryAfterHeader.trim()) {
    const headerValue = retryAfterHeader.trim();
    const seconds = Number(headerValue);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.ceil(seconds);
    }

    const retryAfterDate = Date.parse(headerValue);
    if (Number.isFinite(retryAfterDate)) {
      return Math.max(1, Math.ceil((retryAfterDate - Date.now()) / 1000));
    }
  }

  const retryInMatch = message.match(/retry in\s+([0-9.]+)s/i);
  if (retryInMatch) {
    return Math.max(1, Math.ceil(Number(retryInMatch[1])));
  }

  const retryDelayMatch = message.match(/"retryDelay":"(\d+)s"/i);
  if (retryDelayMatch) {
    return Math.max(1, Number(retryDelayMatch[1]));
  }

  return null;
}

function getGeminiModelCandidates() {
  const envCandidates = (process.env.GEMINI_LLM_MODELS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set([...envCandidates, LLM_MODEL, ...FALLBACK_LLM_MODELS])];
}

function buildPrompt(documentText) {
  return LLM_PROMPT_TEMPLATE.replace("{{DOCUMENT_TEXT}}", documentText);
}

function trimDocumentForAnalyze(documentText) {
  if (!documentText) {
    return "";
  }

  if (documentText.length <= GEMINI_ANALYZE_MAX_CHARS) {
    return documentText;
  }

  return documentText.slice(0, GEMINI_ANALYZE_MAX_CHARS);
}

function splitIntoSentences(text) {
  if (!text) {
    return [];
  }

  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildFallbackSummary(text) {
  const sentences = splitIntoSentences(text);
  if (sentences.length) {
    return sentences.slice(0, 6).join(" ").slice(0, 1600);
  }

  return text.trim().slice(0, 1600) || "No summary available";
}

function chunkTextByWords(text) {
  const words = (text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [];
  }

  const minWords = Math.max(1, Number(CHUNK_CONSTRAINTS.minWords || 300));
  const maxWords = Math.max(minWords, Number(CHUNK_CONSTRAINTS.maxWords || 800));
  const chunkSize = Math.min(500, maxWords);

  const chunks = [];

  for (let index = 0; index < words.length; index += chunkSize) {
    const chunkWords = words.slice(index, index + chunkSize);
    if (!chunkWords.length) {
      continue;
    }

    if (chunkWords.length < minWords && chunks.length > 0) {
      const carryWords = chunkWords.join(" ");
      chunks[chunks.length - 1].text = `${chunks[chunks.length - 1].text} ${carryWords}`.trim();
      continue;
    }

    chunks.push({
      text: chunkWords.join(" "),
      context: "fallback_extractive_chunk",
      chunk_id: `chunk-${chunks.length + 1}`,
    });
  }

  return chunks;
}

function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function buildReliableEmbeddingChunks(documentText, modelChunks = []) {
  const sourceText = normalizeWhitespace(trimDocumentForAnalyze(documentText));
  const sourceWords = countWords(sourceText);

  const normalizedModelChunks = Array.isArray(modelChunks)
    ? modelChunks
        .filter((chunk) => chunk && !isBlank(chunk.text))
        .map((chunk, index) => ({
          text: normalizeWhitespace(chunk.text),
          context: normalizeWhitespace(chunk.context) || "model_chunk",
          chunk_id: String(chunk.chunk_id || `chunk-${index + 1}`),
        }))
    : [];

  const modelWords = normalizedModelChunks.reduce((sum, chunk) => sum + countWords(chunk.text), 0);
  const coverageRatio = sourceWords > 0 ? modelWords / sourceWords : 1;

  // If model chunks are sparse/incomplete, index deterministic source chunks instead.
  if (!normalizedModelChunks.length || (sourceWords >= 80 && coverageRatio < 0.65)) {
    return chunkTextByWords(sourceText).map((chunk) => ({
      ...chunk,
      context: "source_text_chunk",
    }));
  }

  return normalizedModelChunks;
}

function buildFallbackPayload(documentText) {
  const text = trimDocumentForAnalyze(documentText);
  const chunks = chunkTextByWords(text);

  const payload = {
    summary: buildFallbackSummary(text),
    entities: {
      names: [],
      dates: [],
      deadlines: [],
      organizations: [],
      tasks: [],
    },
    tags: ["Notes"],
    metadata: {
      document_type: "Notes",
      confidence: 0.35,
    },
    embedding_chunks: chunks,
  };

  return validateFileUnderstandingPayload(payload);
}

function isModelOutputValidationError(error) {
  return error instanceof InvalidLlmJsonError || String(error?.name || "") === "ZodError";
}

async function generateStructuredJsonText(model, prompt) {
  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    return result?.response?.text?.() || "";
  } catch (error) {
    if (
      String(error?.message || "")
        .toLowerCase()
        .includes("responsemimetype")
    ) {
      const result = await model.generateContent(prompt);
      return result?.response?.text?.() || "";
    }

    throw error;
  }
}

function isBlank(value) {
  return !String(value || "").trim();
}

function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function normalizeVector(rawVector) {
  let vector = rawVector;
  if (Array.isArray(rawVector) && rawVector.length > EMBEDDING_DIMENSION) {
    vector = rawVector.slice(0, EMBEDDING_DIMENSION);
  }

  if (!Array.isArray(vector) || vector.length === 0) {
    throw new NonRetryableProcessingError("Embedding response is missing vector values");
  }

  if (vector.length !== EMBEDDING_DIMENSION) {
    throw new NonRetryableProcessingError(
      `Embedding dimension mismatch: expected ${EMBEDDING_DIMENSION}, got ${vector.length}`
    );
  }

  return vector;
}

async function analyzeDocumentRawWithGemini(documentText) {
  if (!documentText || !documentText.trim()) {
    throw new NonRetryableProcessingError("Document text is empty");
  }

  const client = getGeminiClient();
  const prompt = buildPrompt(trimDocumentForAnalyze(documentText));
  const modelCandidates = getGeminiModelCandidates();
  let lastModelError = null;

  for (const modelName of modelCandidates) {
    const model = client.getGenerativeModel({ model: modelName });

    try {
      const responseText = await generateStructuredJsonText(model, prompt);
      const parsed = parseJsonFromModelText(responseText);
      const validated = validateFileUnderstandingPayload(parsed);

      return {
        ...validated,
        embedding_chunks: buildReliableEmbeddingChunks(documentText, validated.embedding_chunks),
      };
    } catch (error) {
      lastModelError = error;

      if (error instanceof InvalidLlmJsonError) {
        continue;
      }

      if (isModelNotFoundError(error)) {
        continue;
      }

      if (isTransientGeminiError(error)) {
        throw new TransientProviderError(
          `Transient error from Gemini analyze call: ${error.message}`,
          {
            reason: error.message,
            model: modelName,
            provider: "gemini",
            retryAfterSeconds: extractRetryAfterSeconds(error),
          }
        );
      }

      throw new NonRetryableProcessingError("Gemini analyze call failed", {
        reason: error.message,
        model: modelName,
        provider: "gemini",
      });
    }
  }

  throw new NonRetryableProcessingError(
    `No available Gemini analyze model found. Tried: ${modelCandidates.join(", ")}`,
    {
      reason: lastModelError?.message || "Unknown model availability error",
      triedModels: modelCandidates,
      provider: "gemini",
    }
  );
}

export async function analyzeDocumentRaw(documentText, options = {}) {
  return analyzeDocumentRawWithGemini(documentText);
}

export async function analyzeDocumentWithRetry(
  documentText,
  maxAttempts = RETRY_POLICY.maxAttempts,
  options = {}
) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await analyzeDocumentRaw(documentText, options);
    } catch (error) {
      lastError = error;

      const canRetry = Boolean(error?.retryable) && attempt < maxAttempts;
      if (!canRetry) {
        break;
      }

      const providerRetryMs =
        Number(error?.details?.retryAfterSeconds || error?.retryAfterSeconds || 0) * 1000;
      const delay = Math.max(calculateBackoff(attempt), providerRetryMs || 0);
      await sleep(delay);
    }
  }

  throw lastError;
}

async function embedTextWithGemini(text) {
  if (!text || !text.trim()) {
    throw new NonRetryableProcessingError("Cannot embed empty text");
  }

  const client = getGeminiClient();
  const modelName = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
  const model = client.getGenerativeModel({ model: modelName });

  try {
    const result = await model.embedContent({
      content: { role: "user", parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIMENSION,
    });

    const embedding = result?.embedding?.values;
    if (!embedding) {
      throw new Error("No embedding in Gemini response");
    }

    return normalizeVector(embedding);
  } catch (error) {
    if (error instanceof NonRetryableProcessingError) {
      throw error;
    }

    if (isTransientGeminiError(error)) {
      throw new TransientProviderError(
        `Transient error from Gemini embedding call: ${error.message}`,
        {
          reason: error.message,
          model: modelName,
          provider: "gemini",
          retryAfterSeconds: extractRetryAfterSeconds(error),
        }
      );
    }

    throw new NonRetryableProcessingError(`Gemini embedding call failed: ${error.message}`, {
      reason: error.message,
      provider: "gemini",
      model: modelName,
    });
  }
}

export async function embedText(text, options = {}) {
  return embedTextWithGemini(text);
}

export async function embedTextBatch(texts, options = {}) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return [];
  }

  const client = getGeminiClient();
  const modelName = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
  const model = client.getGenerativeModel({ model: modelName });

  try {
    const requests = texts.map((text) => ({
      content: { role: "user", parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIMENSION,
    }));

    const result = await model.batchEmbedContents({ requests });
    const embeddings = result?.embeddings;
    if (!embeddings || embeddings.length !== texts.length) {
      throw new Error("No embedding in Gemini response or dimension mismatch");
    }

    return embeddings.map((e) => normalizeVector(e.values));
  } catch (error) {
    if (error instanceof NonRetryableProcessingError) {
      throw error;
    }

    if (isTransientGeminiError(error)) {
      throw new TransientProviderError(
        `Transient error from Gemini batch embedding call: ${error.message}`,
        {
          reason: error.message,
          model: modelName,
          provider: "gemini",
          retryAfterSeconds: extractRetryAfterSeconds(error),
        }
      );
    }

    throw new NonRetryableProcessingError(`Gemini batch embedding call failed: ${error.message}`, {
      reason: error.message,
      provider: "gemini",
      model: modelName,
    });
  }
}


async function generateAssistantTextWithGemini(prompt) {
  const client = getGeminiClient();
  const modelCandidates = getGeminiModelCandidates();
  let lastModelError = null;

  for (const modelName of modelCandidates) {
    const model = client.getGenerativeModel({ model: modelName });

    try {
      const result = await model.generateContent(prompt);
      const text = result?.response?.text?.() || "";

      if (isBlank(text)) {
        throw new InvalidLlmJsonError("Gemini assistant response was empty");
      }

      return text;
    } catch (error) {
      lastModelError = error;

      if (isModelNotFoundError(error)) {
        continue;
      }

      if (isTransientGeminiError(error)) {
        throw new TransientProviderError(
          `Transient error from Gemini assistant call: ${error.message}`,
          {
            reason: error.message,
            model: modelName,
            provider: "gemini",
            retryAfterSeconds: extractRetryAfterSeconds(error),
          }
        );
      }

      throw new NonRetryableProcessingError("Gemini assistant call failed", {
        reason: error.message,
        model: modelName,
        provider: "gemini",
      });
    }
  }

  throw new NonRetryableProcessingError(
    `No available Gemini assistant model found. Tried: ${modelCandidates.join(", ")}`,
    {
      reason: lastModelError?.message || "Unknown model availability error",
      triedModels: modelCandidates,
      provider: "gemini",
    }
  );
}

export async function generateAssistantText(prompt, options = {}) {
  return generateAssistantTextWithGemini(prompt);
}

export async function getGeminiDetails() {
  const client = getGeminiClient();
  const modelName = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
  const model = client.getGenerativeModel({ model: modelName });
  
  const startTime = Date.now();
  await model.embedContent({
    content: { role: "user", parts: [{ text: "ping" }] },
    outputDimensionality: EMBEDDING_DIMENSION,
  });
  const latencyMs = Date.now() - startTime;

  return {
    provider: "gemini",
    llmModel: process.env.GEMINI_LLM_MODEL || "gemini-3.5-flash",
    embeddingModel: modelName,
    latencyMs,
  };
}


function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateBackoff(attempt) {
  const exp = RETRY_POLICY.baseDelayMs * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 300);
  return Math.min(exp + jitter, RETRY_POLICY.maxDelayMs);
}

