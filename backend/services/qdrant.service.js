import { QdrantClient } from "@qdrant/js-client-rest";
import { QDRANT_DEFAULTS } from "../constants/pipeline.constants.js";
import { NonRetryableProcessingError } from "./errors/pipeline.errors.js";

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

export async function ensureCollection(vectorSize) {
  if (!Number.isInteger(vectorSize) || vectorSize <= 0) {
    throw new NonRetryableProcessingError("Invalid vector size for Qdrant collection");
  }

  const client = getQdrantClient();
  const collectionName = QDRANT_DEFAULTS.collectionName;

  try {
    await client.getCollection(collectionName);
    return collectionName;
  } catch {
    await client.createCollection(collectionName, {
      vectors: {
        size: vectorSize,
        distance: QDRANT_DEFAULTS.distance,
      },
    });

    return collectionName;
  }
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

  const points = chunksWithVectors.map((chunk) => ({
    id: `${fileId}:${chunk.chunk_id}`,
    vector: chunk.vector,
    payload: {
      fileId,
      chunk_id: chunk.chunk_id,
      text: chunk.text,
      context: chunk.context,
      tags,
      document_type: documentType,
    },
  }));

  await client.upsert(collectionName, {
    points,
    wait: true,
  });

  return {
    collectionName,
    upserted: points.length,
  };
}
