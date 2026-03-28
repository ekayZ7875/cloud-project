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
  })
  .superRefine((value, ctx) => {
    const words = value.text.trim().split(/\s+/).filter(Boolean).length;

    if (words < CHUNK_CONSTRAINTS.minWords || words > CHUNK_CONSTRAINTS.maxWords) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `chunk_id ${value.chunk_id} has ${words} words; expected ${CHUNK_CONSTRAINTS.minWords}-${CHUNK_CONSTRAINTS.maxWords}`,
      });
    }
  });

const fileUnderstandingSchema = z.object({
  summary: z.string().min(1),
  entities: entitySchema,
  tags: z.array(z.enum(ALLOWED_TAGS)).default([]),
  metadata: z.object({
    document_type: z.string().min(1),
    confidence: z.number().min(0).max(1),
  }),
  embedding_chunks: z.array(chunkSchema).min(1),
});

export function validateFileUnderstandingPayload(payload) {
  return fileUnderstandingSchema.parse(payload);
}

export function safeValidateFileUnderstandingPayload(payload) {
  return fileUnderstandingSchema.safeParse(payload);
}
