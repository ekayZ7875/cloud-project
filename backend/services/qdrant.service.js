import { QdrantClient } from "@qdrant/js-client-rest";
import { createHash } from "node:crypto";
import { QDRANT_DEFAULTS } from "../constants/pipeline.constants.js";
import { NonRetryableProcessingError } from "./errors/pipeline.errors.js";

const payloadIndexState = new Map();

function buildDeterministicPointId(fileId, chunkId) {
  const hex = createHash("sha256").update(`${fileId}:${chunkId}`).digest("hex");

  // Qdrant accepts UUID or unsigned integer IDs.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function getQdrantClient() {
  const url = process.env.QDRANT_URL;
  const apiKey = process.env.QDRANT_API_KEY;

  if (!url) {
    throw new NonRetryableProcessingError("QDRANT_URL is not configured");
  }

  const lower = url.toLowerCase();
  if (lower.includes("localhost") || lower.includes("127.0.0.1")) {
    throw new NonRetryableProcessingError(
      "Qdrant Cloud is required: QDRANT_URL must point to your cloud cluster endpoint"
    );
  }

  if (!apiKey) {
    throw new NonRetryableProcessingError(
      "QDRANT_API_KEY is required for Qdrant Cloud"
    );
  }

  return new QdrantClient({
    url,
    apiKey,
  });
}

function extractVectorsConfig(collectionInfo) {
  const config = collectionInfo?.config || collectionInfo?.result?.config;
  return config?.params?.vectors || config?.vectors;
}

function getNamedVectorKey(collectionInfo) {
  const vectors = extractVectorsConfig(collectionInfo);

  if (!vectors || Array.isArray(vectors)) {
    return null;
  }

  if (Number.isFinite(vectors?.size)) {
    return null;
  }

  const keys = Object.keys(vectors);
  return keys.length ? keys[0] : null;
}

function buildFileIdsFilter(fileIds = []) {
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return undefined;
  }

  // Use `should + match.value` for broad Qdrant compatibility.
  if (fileIds.length === 1) {
    return {
      must: [
        {
          key: "fileId",
          match: {
            value: fileIds[0],
          },
        },
      ],
    };
  }

  return {
    should: fileIds.map((id) => ({
      key: "fileId",
      match: {
        value: id,
      },
    })),
  };
}

async function ensureFileIdPayloadIndex(client, collectionName) {
  const cached = payloadIndexState.get(collectionName);
  if (cached === true) {
    return;
  }

  try {
    await client.createPayloadIndex(collectionName, {
      field_name: "fileId",
      field_schema: "keyword",
      wait: true,
    });
    payloadIndexState.set(collectionName, true);
  } catch (error) {
    const message = (error?.data?.status?.error || error?.message || "").toLowerCase();

    // Treat already-existing index as success to keep this operation idempotent.
    if (message.includes("already exists") || message.includes("duplicate")) {
      payloadIndexState.set(collectionName, true);
      return;
    }

    throw new NonRetryableProcessingError("Failed to ensure Qdrant payload index for fileId", {
      reason: error?.data?.status?.error || error?.message || "Unknown payload index error",
      status: error?.status,
      collectionName,
    });
  }
}

export async function ensureCollection(vectorSize) {
  if (!Number.isInteger(vectorSize) || vectorSize <= 0) {
    throw new NonRetryableProcessingError("Invalid vector size for Qdrant collection");
  }

  const client = getQdrantClient();
  const collectionName = QDRANT_DEFAULTS.collectionName;

  try {
    await client.getCollection(collectionName);
  } catch {
    await client.createCollection(collectionName, {
      vectors: {
        size: vectorSize,
        distance: QDRANT_DEFAULTS.distance,
      },
    });
  }

  await ensureFileIdPayloadIndex(client, collectionName);
  return collectionName;
}

export async function upsertChunks({
  fileId,
  chunksWithVectors,
  tags = [],
  documentType,
}) {
  if (!fileId) {
    throw new NonRetryableProcessingError("fileId is required for Qdrant upsert");
  }

  if (!Array.isArray(chunksWithVectors) || chunksWithVectors.length === 0) {
    throw new NonRetryableProcessingError("chunksWithVectors must not be empty");
  }

  const client = getQdrantClient();
  const vectorSize = chunksWithVectors[0].vector.length;
  const collectionName = await ensureCollection(vectorSize);
  const collectionInfo = await client.getCollection(collectionName);
  const namedVectorKey = getNamedVectorKey(collectionInfo);

  const points = chunksWithVectors.map((chunk) => ({
    id: buildDeterministicPointId(fileId, chunk.chunk_id),
    vector: namedVectorKey
      ? {
          [namedVectorKey]: chunk.vector,
        }
      : chunk.vector,
    payload: {
      fileId,
      chunk_id: chunk.chunk_id,
      text: chunk.text,
      context: chunk.context,
      tags,
      document_type: documentType,
    },
  }));

  try {
    await client.upsert(collectionName, {
      points,
      wait: true,
    });
  } catch (error) {
    const providerMessage =
      error?.data?.status?.error || error?.message || "Unknown Qdrant upsert error";

    throw new NonRetryableProcessingError(`Qdrant upsert failed: ${providerMessage}`, {
      provider: "qdrant",
      status: error?.status,
      reason: providerMessage,
      collectionName,
    });
  }

  return {
    collectionName,
    upserted: points.length,
  };
}

export async function searchChunksByVector(vector, fileIds = [], limit = 10) {
  const client = getQdrantClient();
  const collectionName = QDRANT_DEFAULTS.collectionName;

  try {
    await ensureFileIdPayloadIndex(client, collectionName);
    const collectionInfo = await client.getCollection(collectionName);
    const namedVectorKey = getNamedVectorKey(collectionInfo);

    const result = await client.search(collectionName, {
      vector: namedVectorKey
        ? {
            name: namedVectorKey,
            vector,
          }
        : vector,
      limit,
      filter: buildFileIdsFilter(fileIds),
      with_payload: true,
    });
    return result;
  } catch (error) {
    const providerMessage =
      error?.data?.status?.error || error?.message || "Unknown Qdrant search error";

    throw new NonRetryableProcessingError("Qdrant search failed", {
      reason: providerMessage,
      status: error?.status,
      collectionName,
    });
  }
}

export async function getAllChunksForFiles(fileIds = []) {
  if (!fileIds || fileIds.length === 0) return [];
  
  const client = getQdrantClient();
  const collectionName = QDRANT_DEFAULTS.collectionName;

  try {
    await ensureFileIdPayloadIndex(client, collectionName);
    const result = await client.scroll(collectionName, {
      filter: buildFileIdsFilter(fileIds),
      limit: 100,
      with_payload: true,
      with_vector: false
    });
    return result.points;
  } catch (error) {
    throw new NonRetryableProcessingError("Qdrant scroll failed", {
      reason: error.message,
    });
  }
}
