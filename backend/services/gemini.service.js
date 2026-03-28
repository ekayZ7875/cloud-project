import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  AI_PROVIDER,
  CHUNK_CONSTRAINTS,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSION,
  LLM_MODEL,
  OLLAMA_BASE_URL,
  OLLAMA_EMBEDDING_MODEL,
  OLLAMA_LLM_MODEL,
  OLLAMA_TIMEOUT_MS,
  RETRY_POLICY,
} from "../constants/pipeline.constants.js";
import {
  InvalidLlmJsonError,
  TransientProviderError,
  NonRetryableProcessingError,
} from "./errors/pipeline.errors.js";
import { validateFileUnderstandingPayload } from "../validators/fileUnderstanding.validator.js";

dotenv.config();

const FALLBACK_LLM_MODELS = ["gemini-3-flash-preview"];
const SUPPORTED_PROVIDERS = new Set(["gemini", "ollama"]);
const GEMINI_ANALYZE_MAX_CHARS = Number(process.env.GEMINI_ANALYZE_MAX_CHARS || 20000);
const OLLAMA_ANALYZE_MAX_CHARS = Number(process.env.OLLAMA_ANALYZE_MAX_CHARS || 12000);
const OLLAMA_EMBED_MAX_CHARS = Number(process.env.OLLAMA_EMBED_MAX_CHARS || 6000);

const LLM_PROMPT_TEMPLATE = `You are an AI document intelligence and indexing engine.
Return STRICT JSON:
{
"summary": "5-7 lines",
"entities": {
"names": [],
"dates": [],
"deadlines": [],
"organizations": [],
"tasks": []
},
"tags": [],
"metadata": {
"document_type": "",
"confidence": 0-1
},
"embedding_chunks": [
{
"text": "",
"context": "",
"chunk_id": ""
}
]
}
Rules:

Only JSON
No extra text
No hallucination
Allowed tags: Invoice, Resume, Notes, Legal Document, Lecture/Study Material
Split into meaningful chunks (300-800 words)

Document:
{{DOCUMENT_TEXT}}`;

function getActiveProvider() {
  const provider = String(AI_PROVIDER || "gemini").toLowerCase();
  return SUPPORTED_PROVIDERS.has(provider) ? provider : "gemini";
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

function isTransientOllamaError(error) {
  const message = (error?.message || "").toLowerCase();
  const status = Number(error?.status || error?.code || 0);

  return (
    [408, 429, 500, 502, 503, 504].includes(status) ||
    message.includes("timeout") ||
    message.includes("temporar") ||
    message.includes("rate") ||
    message.includes("unavailable") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("econnrefused") ||
    message.includes("socket")
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

function createAnalyzeInputCandidates(documentText) {
  const cleaned = (documentText || "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return [];
  }

  const maxChars = Math.max(2000, OLLAMA_ANALYZE_MAX_CHARS);
  const limits = [maxChars, Math.floor(maxChars * 0.66), Math.floor(maxChars * 0.4), 4000, 2000];
  const candidates = [];

  for (const limit of limits) {
    const safeLimit = Math.max(1000, limit);
    if (cleaned.length <= safeLimit) {
      candidates.push(cleaned);
      continue;
    }

    const sliced = cleaned.slice(0, safeLimit);
    const boundary = sliced.lastIndexOf(" ");
    candidates.push((boundary > 0 ? sliced.slice(0, boundary) : sliced).trim());
  }

  return [...new Set(candidates.filter(Boolean))];
}

function isModelOutputValidationError(error) {
  return error instanceof InvalidLlmJsonError || String(error?.name || "") === "ZodError";
}

function createEmbeddingInputCandidates(text) {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return [];
  }

  const maxChars = Math.max(500, OLLAMA_EMBED_MAX_CHARS);
  const limits = [maxChars, Math.floor(maxChars * 0.66), Math.floor(maxChars * 0.4), 1000];
  const candidates = [];

  for (const limit of limits) {
    const safeLimit = Math.max(500, limit);
    if (cleaned.length <= safeLimit) {
      candidates.push(cleaned);
      continue;
    }

    const sliced = cleaned.slice(0, safeLimit);
    const boundary = sliced.lastIndexOf(" ");
    candidates.push((boundary > 0 ? sliced.slice(0, boundary) : sliced).trim());
  }

  return [...new Set(candidates.filter(Boolean))];
}

function isOllamaContextLengthError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("input length exceeds") ||
    message.includes("context length") ||
    message.includes("prompt is too long")
  );
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

async function ollamaRequest(path, payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const rawBody = await response.text();

    if (!response.ok) {
      const error = new Error(
        `Ollama request failed with status ${response.status}: ${rawBody.slice(0, 300)}`
      );
      error.status = response.status;
      throw error;
    }

    try {
      return JSON.parse(rawBody);
    } catch {
      throw new InvalidLlmJsonError("Ollama returned non-JSON HTTP body", {
        responsePreview: rawBody.slice(0, 300),
      });
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`Ollama request timed out after ${OLLAMA_TIMEOUT_MS}ms`);
      timeoutError.status = 408;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseOllamaGenerateText(result) {
  return result?.response || result?.message?.content || "";
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
      return validateFileUnderstandingPayload(parsed);
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

async function analyzeDocumentRawWithOllama(documentText) {
  if (!documentText || !documentText.trim()) {
    throw new NonRetryableProcessingError("Document text is empty");
  }

  const analyzeCandidates = createAnalyzeInputCandidates(trimDocumentForAnalyze(documentText));

  let lastError = null;

  for (const candidateText of analyzeCandidates) {
    const prompt = buildPrompt(candidateText);
    const attempts = [
      {
        model: OLLAMA_LLM_MODEL,
        prompt,
        stream: false,
        format: "json",
        options: { temperature: 0.2 },
      },
      {
        model: OLLAMA_LLM_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.2 },
      },
    ];

    for (const payload of attempts) {
      try {
        const result = await ollamaRequest("/api/generate", payload);
        const parsed = parseJsonFromModelText(parseOllamaGenerateText(result));
        return validateFileUnderstandingPayload(parsed);
      } catch (error) {
        lastError = error;

        if (isTransientOllamaError(error)) {
          throw new TransientProviderError(
            `Transient error from Ollama analyze call: ${error.message}`,
            {
              reason: error.message,
              model: OLLAMA_LLM_MODEL,
              provider: "ollama",
              retryAfterSeconds: extractRetryAfterSeconds(error),
            }
          );
        }

        if (isOllamaContextLengthError(error) || isModelOutputValidationError(error)) {
          continue;
        }
      }
    }
  }

  if (isModelOutputValidationError(lastError) || isOllamaContextLengthError(lastError)) {
    return buildFallbackPayload(documentText);
  }

  throw new NonRetryableProcessingError(
    `Ollama analyze call failed: ${lastError?.message || "Unknown Ollama analyze error"}`,
    {
    reason: lastError?.message || "Unknown Ollama analyze error",
    model: OLLAMA_LLM_MODEL,
    provider: "ollama",
    }
  );
}

async function embedTextWithGemini(text) {
  if (!text || !text.trim()) {
    throw new NonRetryableProcessingError("Cannot embed empty text");
  }

  const client = getGeminiClient();
  const model = client.getGenerativeModel({ model: EMBEDDING_MODEL });

  try {
    const result = await model.embedContent({
      content: {
        parts: [{ text }],
      },
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: EMBEDDING_DIMENSION,
    });

    return normalizeVector(result?.embedding?.values);
  } catch (error) {
    if (error instanceof NonRetryableProcessingError) {
      throw error;
    }

    if (isTransientGeminiError(error)) {
      throw new TransientProviderError(
        `Transient error from Gemini embedding call: ${error.message}`,
        {
          reason: error.message,
          model: EMBEDDING_MODEL,
          provider: "gemini",
          retryAfterSeconds: extractRetryAfterSeconds(error),
        }
      );
    }

    throw new NonRetryableProcessingError("Gemini embedding call failed", {
      reason: error.message,
      provider: "gemini",
    });
  }
}

async function embedTextWithOllama(text) {
  if (!text || !text.trim()) {
    throw new NonRetryableProcessingError("Cannot embed empty text");
  }

  const candidates = createEmbeddingInputCandidates(text);
  let lastError;

  for (const candidateText of candidates) {
  try {
    let result;
    try {
      result = await ollamaRequest("/api/embed", {
        model: OLLAMA_EMBEDDING_MODEL,
          input: candidateText,
        truncate: true,
      });
    } catch (primaryError) {
      if (Number(primaryError?.status || 0) !== 404) {
        throw primaryError;
      }

      // Backward compatibility for older Ollama versions.
      result = await ollamaRequest("/api/embeddings", {
        model: OLLAMA_EMBEDDING_MODEL,
          prompt: candidateText,
        truncate: true,
      });
    }

    const rawVector = Array.isArray(result?.embeddings) ? result.embeddings[0] : result?.embedding;
    return normalizeVector(rawVector);
  } catch (error) {
      lastError = error;

      if (isOllamaContextLengthError(error)) {
        continue;
      }

    if (error instanceof NonRetryableProcessingError) {
      throw error;
    }

    if (isTransientOllamaError(error)) {
      throw new TransientProviderError(
        `Transient error from Ollama embedding call: ${error.message}`,
        {
          reason: error.message,
          model: OLLAMA_EMBEDDING_MODEL,
          provider: "ollama",
          retryAfterSeconds: extractRetryAfterSeconds(error),
        }
      );
    }

    throw new NonRetryableProcessingError(`Ollama embedding call failed: ${error.message}`, {
      reason: error.message,
      provider: "ollama",
    });
  }
}

  throw new NonRetryableProcessingError(
    `Ollama embedding call failed: ${lastError?.message || "Embedding candidates exhausted"}`,
    {
      reason: lastError?.message,
      provider: "ollama",
    }
  );
}

export async function analyzeDocumentRaw(documentText) {
  const provider = getActiveProvider();
  if (provider === "ollama") {
    return analyzeDocumentRawWithOllama(documentText);
  }

  return analyzeDocumentRawWithGemini(documentText);
}

export async function analyzeDocumentWithRetry(documentText, maxAttempts = RETRY_POLICY.maxAttempts) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await analyzeDocumentRaw(documentText);
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

export async function embedText(text) {
  const provider = getActiveProvider();
  if (provider === "ollama") {
    return embedTextWithOllama(text);
  }

  return embedTextWithGemini(text);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateBackoff(attempt) {
  const exp = RETRY_POLICY.baseDelayMs * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 300);
  return Math.min(exp + jitter, RETRY_POLICY.maxDelayMs);
}
