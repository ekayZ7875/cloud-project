import { z } from "zod";
import { ALLOWED_TAGS, CHUNK_CONSTRAINTS } from "../constants/pipeline.constants.js";

const entitySchema = z.object({
  names: z.array(z.string()),
  dates: z.array(z.string()),
  deadlines: z.array(z.string()),
  organizations: z.array(z.string()),
  tasks: z.array(z.string()),
});

const chunkSchema = z
  .object({
    text: z.string().min(1),
    context: z.string().default(""),
    chunk_id: z.string().min(1),
  });

const fileUnderstandingSchema = z
  .object({
    summary: z.string().min(1),
    entities: entitySchema,
    tags: z.array(z.enum(ALLOWED_TAGS)).default([]),
    metadata: z.object({
      document_type: z.string().min(1),
      confidence: z.number().min(0).max(1),
    }),
    embedding_chunks: z.array(chunkSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const minWords = Number(CHUNK_CONSTRAINTS.minWords || 300);
    const maxWords = Number(CHUNK_CONSTRAINTS.maxWords || 800);
    const chunkWordCounts = value.embedding_chunks.map((chunk) =>
      chunk.text.trim().split(/\s+/).filter(Boolean).length
    );
    const totalWords = chunkWordCounts.reduce((sum, words) => sum + words, 0);

    // For small documents, allow a single short chunk instead of hard-failing the job.
    const enforceMinWords = totalWords >= minWords;

    value.embedding_chunks.forEach((chunk, index) => {
      const words = chunkWordCounts[index];

      if (words > maxWords || (enforceMinWords && words < minWords)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `chunk_id ${chunk.chunk_id} has ${words} words; expected ${minWords}-${maxWords}`,
          path: ["embedding_chunks", index],
        });
      }
    });
  });

export function validateFileUnderstandingPayload(payload) {
  return fileUnderstandingSchema.parse(payload);
}

export function safeValidateFileUnderstandingPayload(payload) {
  return fileUnderstandingSchema.safeParse(payload);
}
