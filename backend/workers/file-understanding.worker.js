import dotenv from "dotenv";
import logger from "../libs/logger.js";
import { startQueueConsumer } from "./queue.consumer.js";
import { processFile } from "./processors/processFile.js";
import { verifyQdrantConnection } from "../services/qdrant.service.js";
import {
  AI_PROVIDER,
  OLLAMA_LLM_MODEL,
  LLM_MODEL,
  GROQ_LLM_MODEL,
} from "../constants/pipeline.constants.js";

dotenv.config();

async function bootstrap() {
  const concurrency = Number(process.env.FILE_WORKER_CONCURRENCY || 3);

  let activeModel;
  if (AI_PROVIDER === "ollama") {
    activeModel = OLLAMA_LLM_MODEL;
  } else if (AI_PROVIDER === "groq") {
    activeModel = GROQ_LLM_MODEL;
  } else {
    activeModel = LLM_MODEL;
  }
  logger.info(`File worker provider=${AI_PROVIDER} model=${activeModel}`);
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
