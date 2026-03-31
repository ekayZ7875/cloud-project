import dotenv from "dotenv";
import logger from "../libs/logger.js";
import { startQueueConsumer } from "./queue.consumer.js";
import { processFile } from "./processors/processFile.js";
import {
  AI_PROVIDER,
  OLLAMA_LLM_MODEL,
  LLM_MODEL,
} from "../constants/pipeline.constants.js";

dotenv.config();

async function bootstrap() {
  const concurrency = Number(process.env.FILE_WORKER_CONCURRENCY || 3);

  const activeModel = AI_PROVIDER === "ollama" ? OLLAMA_LLM_MODEL : LLM_MODEL;
  logger.info(`File worker provider=${AI_PROVIDER} model=${activeModel}`);

  await startQueueConsumer({
    concurrency,
    handler: processFile,
  });
}

bootstrap().catch((error) => {
  logger.error(`Worker bootstrap failed: ${error.message}`);
  process.exit(1);
});
