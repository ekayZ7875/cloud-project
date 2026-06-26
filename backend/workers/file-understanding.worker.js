import dotenv from "dotenv";
import logger from "../libs/logger.js";
import { startQueueConsumer } from "./queue.consumer.js";
import { processFile } from "./processors/processFile.js";
import { verifyQdrantConnection } from "../services/qdrant.service.js";
import {
  AI_EMBEDDING_PROVIDER,
  AI_PROVIDER,
  LLM_MODEL,
} from "../constants/pipeline.constants.js";

dotenv.config();

async function bootstrap() {
  const concurrency = Number(
    process.env.FILE_WORKER_CONCURRENCY || 3
  );

  logger.info(
    `File worker provider=${AI_PROVIDER} embeddingProvider=${AI_EMBEDDING_PROVIDER} model=${LLM_MODEL}`
  );
  await verifyQdrantConnection();
  logger.info("Qdrant health check ok");

  await startQueueConsumer({
    concurrency,
    handler: processFile,
  });
}

bootstrap().catch((error) => {
  logger.error(`Worker bootstrap failed: ${error.message}`);
  process.exit(1);
});
