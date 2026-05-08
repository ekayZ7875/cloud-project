import "dotenv/config";

export const PIPELINE_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

export const ALLOWED_TAGS = [
  "Invoice",
  "Resume",
  "Notes",
  "Legal Document",
  "Lecture/Study Material",
];

export const AI_PROVIDER = (process.env.AI_PROVIDER || "gemini").toLowerCase();
export const AI_EMBEDDING_PROVIDER = (
  process.env.AI_EMBEDDING_PROVIDER || (AI_PROVIDER === "groq" ? "ollama" : AI_PROVIDER)
).toLowerCase();
const DEFAULT_EMBEDDING_DIMENSION = AI_EMBEDDING_PROVIDER === "gemini" ? 1536 : 768;

export const LLM_MODEL = process.env.GEMINI_LLM_MODEL || "gemini-3-flash-preview";
export const GROQ_LLM_MODEL = process.env.GROQ_LLM_MODEL || "llama-3.3-70b-versatile";
export const GROQ_EMBEDDING_MODEL = process.env.GROQ_EMBEDDING_MODEL || "nomic-embed-text-v1.5";
export const EMBEDDING_MODEL = "embedding-001";
export const EMBEDDING_DIMENSION = Number(
  process.env.EMBEDDING_DIMENSION ||
    process.env.GEMINI_EMBEDDING_DIMENSION ||
    process.env.GROQ_EMBEDDING_DIMENSION ||
    process.env.OLLAMA_EMBEDDING_DIMENSION ||
    DEFAULT_EMBEDDING_DIMENSION
);

export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
export const OLLAMA_LLM_MODEL = process.env.OLLAMA_LLM_MODEL || "phi:latest";
export const OLLAMA_EMBEDDING_MODEL =
  process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text:latest";
export const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 120000);

export const RETRY_POLICY = {
  maxAttempts: Number(process.env.FILE_PROCESSING_MAX_ATTEMPTS || 3),
  baseDelayMs: Number(process.env.FILE_PROCESSING_RETRY_BASE_MS || 2000),
  maxDelayMs: Number(process.env.FILE_PROCESSING_RETRY_MAX_MS || 60000),
};

export const CHUNK_CONSTRAINTS = {
  minWords: 300,
  maxWords: 800,
};

export const QDRANT_DEFAULTS = {
  collectionName: process.env.QDRANT_COLLECTION || "file_chunks",
  distance: process.env.QDRANT_DISTANCE || "Cosine",
};
