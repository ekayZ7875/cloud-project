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
  process.env.AI_EMBEDDING_PROVIDER || "gemini"
).toLowerCase();

export const LLM_MODEL = process.env.GEMINI_LLM_MODEL || "gemini-3-flash-preview";

// Determine EMBEDDING_DIMENSION based on provider
function getEmbeddingDimension() {
  const provider = AI_EMBEDDING_PROVIDER;
  
  if (provider === "gemini") {
    return Number(process.env.EMBEDDING_DIMENSION || process.env.GEMINI_EMBEDDING_DIMENSION || 768);
  }
  
  return Number(process.env.EMBEDDING_DIMENSION || 768);
}

export const EMBEDDING_DIMENSION = getEmbeddingDimension();

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

export const DEFAULT_FILE_SIZE_ALLOWED = 18 * 1024 * 1024 * 1024; // 18 GB

