import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { BedrockRuntime } from "@aws-sdk/client-bedrock-runtime";
import {
  AI_EMBEDDING_PROVIDER,
  AI_PROVIDER,
  CHUNK_CONSTRAINTS,
  EMBEDDING_DIMENSION,
  GROQ_LLM_MODEL,
  LLM_MODEL,
  OLLAMA_BASE_URL,
  OLLAMA_EMBEDDING_MODEL,
  OLLAMA_LLM_MODEL,
  OLLAMA_TIMEOUT_MS,
  RETRY_POLICY,
  BEDROCK_EMBEDDING_MODEL,
  BEDROCK_EMBEDDING_DIMENSION,
} from "../constants/pipeline.constants.js";
import {
  InvalidLlmJsonError,
  TransientProviderError,
  NonRetryableProcessingError,
} from "./errors/pipeline.errors.js";
import { validateFileUnderstandingPayload } from "../validators/fileUnderstanding.validator.js";

dotenv.config();

const FALLBACK_LLM_MODELS = ["gemini-3-flash-preview"];
const SUPPORTED_PROVIDERS = new Set(["gemini", "ollama", "groq"]);
const GEMINI_ANALYZE_MAX_CHARS = Number(process.env.GEMINI_ANALYZE_MAX_CHARS || 20000);
const OLLAMA_ANALYZE_MAX_CHARS = Number(process.env.OLLAMA_ANALYZE_MAX_CHARS || 12000);
const OLLAMA_EMBED_MAX_CHARS = Number(process.env.OLLAMA_EMBED_MAX_CHARS || 6000);

const LLM_PROMPT_TEMPLATE =`You are an elite AI document intelligence and indexing engine with expertise in structured information extraction, semantic chunking, and metadata classification.

Your task is to deeply analyze the provided document and return a STRICT JSON response. The JSON must be syntactically valid, complete, and contain no hallucinated or fabricated information. Every field must be populated based solely on what is explicitly stated or clearly implied in the document.

---

OUTPUT SCHEMA (return ONLY this JSON, no preamble, no explanation, no markdown fences):

{
  "summary": "A dense 5-7 line paragraph summarizing the document's purpose, key subject matter, important people or organizations involved, critical dates or deadlines, and any action items or decisions. Write in third-person, present tense.",

  "entities": {
    "names": ["Full names of all people mentioned, e.g. 'John Smith'"],
    "dates": ["All dates found in document, normalized to ISO 8601 format: YYYY-MM-DD"],
    "deadlines": ["Dates or phrases indicating a deadline or due date, with context, e.g. 'Payment due: 2025-06-01'"],
    "organizations": ["Company names, institutions, agencies, departments"],
    "tasks": ["Action items or tasks mentioned, written as imperative statements, e.g. 'Submit final report by Friday'"],
    "amounts": ["Monetary values, quantities, or measurements with units, e.g. '$4,500.00', '3 units'"],
    "locations": ["Physical addresses, cities, countries, or named places"]
  },

  "tags": ["Pick 1-3 tags ONLY from this exact list: Invoice, Resume, Notes, Legal Document, Lecture/Study Material"],

  "metadata": {
    "document_type": "One of: Invoice | Resume | Notes | Legal Document | Lecture/Study Material | Unknown",
    "language": "ISO 639-1 language code of the document, e.g. 'en'",
    "tone": "One of: Formal | Informal | Technical | Academic | Legal | Conversational",
    "confidence": "Float between 0.0 and 1.0 representing your confidence in the classification and extraction accuracy",
    "page_estimate": "Estimated number of pages based on text length (integer)",
    "has_tables": "true | false — whether the document contains tabular data",
    "has_action_items": "true | false — whether the document contains explicit tasks or action items"
  },

  "embedding_chunks": [
    {
      "chunk_id": "chunk_001",
      "text": "Raw extracted text for this chunk (300-800 words). Preserve original wording. Do not summarize.",
      "context": "1-2 sentence description of what this chunk covers and why it was segmented here.",
      "section_title": "Inferred section heading if applicable, else null",
      "keywords": ["3-6 most semantically significant keywords or phrases from this chunk"],
      "chunk_type": "One of: Introduction | Background | Main Content | Data/Figures | Conclusion | Appendix | Mixed"
    }
  ]
}

---

CHUNKING RULES:
- Split the document into semantically coherent chunks of 300-800 words each
- Never split mid-sentence or mid-paragraph
- Each chunk must be self-contained enough to answer a question without requiring another chunk
- Assign sequential chunk IDs: chunk_001, chunk_002, etc.
- If the document is short (< 300 words), return a single chunk with the full text

EXTRACTION RULES:
- Extract ONLY information explicitly present in the document — no inference beyond what is clearly implied
- Dates must be normalized to ISO 8601 (YYYY-MM-DD) wherever possible; preserve original format in parentheses if ambiguous
- Names must include full names where available; use partial names only if that is all that appears
- Tasks must be written as clear imperative action statements

OUTPUT RULES:
- Return ONLY the JSON object — no markdown, no backticks, no comments, no leading/trailing text
- All string values must be properly escaped
- Arrays must never be null — use [] if empty
- Boolean fields must be the string "true" or "false" (not actual booleans, to ensure safe parsing)
- confidence must be a float, not a string

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

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new NonRetryableProcessingError("GROQ_API_KEY is not configured");
  }

  return new Groq({ apiKey });
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

function isTransientGroqError(error) {
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

function isGroqContextLengthError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("context") || message.includes("maximum context length");
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

async function generateStructuredJsonTextWithGroq(prompt) {
  const client = getGroqClient();

  try {
    const response = await client.chat.completions.create({
      model: GROQ_LLM_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    return response?.choices?.[0]?.message?.content || "";
  } catch (error) {
    if (!String(error?.message || "").toLowerCase().includes("response_format")) {
      throw error;
    }

    const response = await client.chat.completions.create({
      model: GROQ_LLM_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    return response?.choices?.[0]?.message?.content || "";
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

function isBlank(value) {
  return !String(value || "").trim();
}

function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function isLikelyExtractiveSummary(summary, sourceText) {
  const normalizedSummary = normalizeWhitespace(summary).toLowerCase();
  const normalizedSource = normalizeWhitespace(sourceText).toLowerCase();

  if (!normalizedSummary || !normalizedSource) {
    return false;
  }

  if (normalizedSummary.length >= 60 && normalizedSource.includes(normalizedSummary)) {
    return true;
  }

  const summaryTokens = new Set(normalizedSummary.split(" ").filter(Boolean));
  const sourceTokens = new Set(normalizedSource.split(" ").filter(Boolean));
  const overlap = [...summaryTokens].filter((token) => sourceTokens.has(token)).length;
  const overlapRatio = summaryTokens.size ? overlap / summaryTokens.size : 0;

  return summaryTokens.size >= 12 && overlapRatio >= 0.92;
}

function buildNarrativeSummaryPrompt(documentText, previousSummary = "") {
  return `You are a document understanding assistant.
Write a human-readable summary explaining what this document is saying.

Rules:
- 4-6 short sentences.
- Explain meaning, purpose, and key details.
- Prefer interpretation over raw OCR copy.
- If this is an identity/government card, mention holder name, document type, important numbers (masked except last 4), and dates if present.
- If any field is unclear, say "not clearly readable".
- Return plain text only.

Current summary (if any):
${previousSummary || "N/A"}

Document OCR text:
${documentText}`;
}

function maskLikelyIdNumbers(text) {
  return String(text || "").replace(/\b([A-Z0-9]{2,})([A-Z0-9]{4})\b/g, (_, head, tail) => {
    if (head.length <= 2) {
      return `${head}${tail}`;
    }

    return `${"*".repeat(head.length)}${tail}`;
  });
}

async function generateNarrativeSummaryWithOllama(documentText, previousSummary = "") {
  const sourceText = normalizeWhitespace(documentText).slice(0, 3000);
  if (!sourceText) {
    return normalizeWhitespace(previousSummary);
  }

  const prompt = buildNarrativeSummaryPrompt(sourceText, normalizeWhitespace(previousSummary));
  const result = await ollamaRequest("/api/generate", {
    model: OLLAMA_LLM_MODEL,
    prompt,
    stream: false,
    options: { temperature: 0.15 },
  });

  const rewritten = normalizeWhitespace(parseOllamaGenerateText(result));
  if (!rewritten) {
    throw new Error("Ollama summary rewrite returned empty text");
  }

  return maskLikelyIdNumbers(rewritten).slice(0, 1200);
}

async function improveSummaryIfNeeded(documentText, summary) {
  const baseline = normalizeWhitespace(summary);
  const shouldRewrite = !baseline || isLikelyExtractiveSummary(baseline, documentText);

  if (!shouldRewrite) {
    return baseline;
  }

  try {
    const rewritten = await generateNarrativeSummaryWithOllama(documentText, baseline);
    return rewritten || baseline;
  } catch {
    return baseline;
  }
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
      const improvedSummary = await improveSummaryIfNeeded(documentText, validated.summary);

      return {
        ...validated,
        summary: improvedSummary || validated.summary,
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
        const validated = validateFileUnderstandingPayload(parsed);
        const improvedSummary = await improveSummaryIfNeeded(candidateText, validated.summary);

        return {
          ...validated,
          summary: improvedSummary || validated.summary,
          embedding_chunks: buildReliableEmbeddingChunks(documentText, validated.embedding_chunks),
        };
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
    const fallbackPayload = buildFallbackPayload(documentText);
    const improvedSummary = await improveSummaryIfNeeded(
      trimDocumentForAnalyze(documentText),
      fallbackPayload.summary
    );

    return {
      ...fallbackPayload,
      summary: improvedSummary || fallbackPayload.summary,
    };
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

async function analyzeDocumentRawWithGroq(documentText) {
  if (!documentText || !documentText.trim()) {
    throw new NonRetryableProcessingError("Document text is empty");
  }

  const analyzeCandidates = createAnalyzeInputCandidates(trimDocumentForAnalyze(documentText));
  let lastError = null;

  for (const candidateText of analyzeCandidates) {
    const prompt = buildPrompt(candidateText);

    try {
      const responseText = await generateStructuredJsonTextWithGroq(prompt);
      const parsed = parseJsonFromModelText(responseText);
      const validated = validateFileUnderstandingPayload(parsed);
      const improvedSummary = await improveSummaryIfNeeded(candidateText, validated.summary);

      return {
        ...validated,
        summary: improvedSummary || validated.summary,
        embedding_chunks: buildReliableEmbeddingChunks(documentText, validated.embedding_chunks),
      };
    } catch (error) {
      lastError = error;

      if (isTransientGroqError(error)) {
        throw new TransientProviderError(`Transient error from Groq analyze call: ${error.message}`, {
          reason: error.message,
          model: GROQ_LLM_MODEL,
          provider: "groq",
          retryAfterSeconds: extractRetryAfterSeconds(error),
        });
      }

      if (isGroqContextLengthError(error) || isModelOutputValidationError(error)) {
        continue;
      }

      throw new NonRetryableProcessingError("Groq analyze call failed", {
        reason: error.message,
        model: GROQ_LLM_MODEL,
        provider: "groq",
      });
    }
  }

  if (isModelOutputValidationError(lastError) || isGroqContextLengthError(lastError)) {
    const fallbackPayload = buildFallbackPayload(documentText);
    const improvedSummary = await improveSummaryIfNeeded(
      trimDocumentForAnalyze(documentText),
      fallbackPayload.summary
    );

    return {
      ...fallbackPayload,
      summary: improvedSummary || fallbackPayload.summary,
    };
  }

  throw new NonRetryableProcessingError(
    `Groq analyze call failed: ${lastError?.message || "Unknown Groq analyze error"}`,
    {
      reason: lastError?.message || "Unknown Groq analyze error",
      model: GROQ_LLM_MODEL,
      provider: "groq",
    }
  );
}

async function embedTextWithBedrock(text) {
  if (!text || !text.trim()) {
    throw new NonRetryableProcessingError("Cannot embed empty text");
  }

  const region = process.env.AWS_REGION || "us-east-1";
  const client = new BedrockRuntime({ region });
  const modelId = BEDROCK_EMBEDDING_MODEL || "amazon.titan-embed-text-v2:0";

  try {
    const response = await client.invokeModel({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({ inputText: text }),
    });

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const embedding = responseBody?.embedding;

    if (!embedding) {
      throw new Error("No embedding in Bedrock response");
    }

    return normalizeVector(embedding);
  } catch (error) {
    if (error instanceof NonRetryableProcessingError) {
      throw error;
    }

    // Transient errors from Bedrock
    if (
      error?.name === "ThrottlingException" ||
      error?.name === "ServiceUnavailableException" ||
      error?.Code === "ThrottlingException" ||
      error?.Code === "ServiceUnavailableException"
    ) {
      throw new TransientProviderError(
        `Transient error from AWS Bedrock embedding call: ${error.message}`,
        {
          reason: error.message,
          model: modelId,
          provider: "bedrock",
          retryAfterSeconds: error?.RetryAfterSeconds || 10,
        }
      );
    }

    throw new NonRetryableProcessingError("AWS Bedrock embedding call failed", {
      reason: error.message,
      model: modelId,
      provider: "bedrock",
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
          model: EMBEDDING_MODEL,
          input: candidateText,
          truncate: true,
        });
      } catch (primaryError) {
        if (Number(primaryError?.status || 0) !== 404) {
          throw primaryError;
        }

        // Backward compatibility for older Ollama versions.
        result = await ollamaRequest("/api/embeddings", {
          model: EMBEDDING_MODEL,
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
            model: EMBEDDING_MODEL,
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


export async function analyzeDocumentRaw(documentText, options = {}) {
  const forceProvider = String(options.forceProvider || "").toLowerCase();
  const provider = forceProvider || getActiveProvider();
  if (provider === "ollama") {
    return analyzeDocumentRawWithOllama(documentText);
  }

  if (provider === "groq") {
    return analyzeDocumentRawWithGroq(documentText);
  }

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

export async function embedText(text, options = {}) {
  const forceProvider = String(options.forceProvider || "").toLowerCase();
  const provider = forceProvider || AI_EMBEDDING_PROVIDER;
  
  if (provider === "bedrock") {
    return embedTextWithBedrock(text);
  }
  
  return embedTextWithOllama(text);
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

async function generateAssistantTextWithOllama(prompt) {
  try {
    const result = await ollamaRequest("/api/generate", {
      model: OLLAMA_LLM_MODEL,
      prompt,
      stream: false,
      options: {
        temperature: 0.2,
      },
    });

    const text = parseOllamaGenerateText(result);
    if (isBlank(text)) {
      throw new NonRetryableProcessingError("Ollama assistant response was empty", {
        provider: "ollama",
      });
    }

    return text;
  } catch (error) {
    if (error instanceof NonRetryableProcessingError) {
      throw error;
    }

    if (isTransientOllamaError(error)) {
      throw new TransientProviderError(
        `Transient error from Ollama assistant call: ${error.message}`,
        {
          reason: error.message,
          model: OLLAMA_LLM_MODEL,
          provider: "ollama",
          retryAfterSeconds: extractRetryAfterSeconds(error),
        }
      );
    }

    throw new NonRetryableProcessingError("Ollama assistant call failed", {
      reason: error.message,
      model: OLLAMA_LLM_MODEL,
      provider: "ollama",
    });
  }
}

async function generateAssistantTextWithGroq(prompt) {
  const client = getGroqClient();

  try {
    const response = await client.chat.completions.create({
      model: GROQ_LLM_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    const text = response?.choices?.[0]?.message?.content || "";
    if (isBlank(text)) {
      throw new NonRetryableProcessingError("Groq assistant response was empty", {
        provider: "groq",
      });
    }

    return text;
  } catch (error) {
    if (error instanceof NonRetryableProcessingError) {
      throw error;
    }

    if (isTransientGroqError(error)) {
      throw new TransientProviderError(`Transient error from Groq assistant call: ${error.message}`, {
        reason: error.message,
        model: GROQ_LLM_MODEL,
        provider: "groq",
        retryAfterSeconds: extractRetryAfterSeconds(error),
      });
    }

    throw new NonRetryableProcessingError("Groq assistant call failed", {
      reason: error.message,
      model: GROQ_LLM_MODEL,
      provider: "groq",
    });
  }
}

export async function generateAssistantText(prompt, options = {}) {
  const forceProvider = String(options.forceProvider || "").toLowerCase();
  const activeProvider = forceProvider || getActiveProvider();

  if (activeProvider === "groq") {
    try {
      return await generateAssistantTextWithGroq(prompt);
    } catch (error) {
      if (forceProvider === "groq") {
        throw error;
      }

      if (error?.retryable || error?.code === "NON_RETRYABLE_PROCESSING_ERROR") {
        return generateAssistantTextWithGemini(prompt);
      }

      throw error;
    }
  }

  if (activeProvider === "ollama") {
    try {
      return await generateAssistantTextWithOllama(prompt);
    } catch (error) {
      if (forceProvider === "ollama") {
        throw error;
      }

      if (error?.retryable || error?.code === "NON_RETRYABLE_PROCESSING_ERROR") {
        return generateAssistantTextWithGemini(prompt);
      }

      throw error;
    }
  }

  return generateAssistantTextWithGemini(prompt);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateBackoff(attempt) {
  const exp = RETRY_POLICY.baseDelayMs * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 300);
  return Math.min(exp + jitter, RETRY_POLICY.maxDelayMs);
}
