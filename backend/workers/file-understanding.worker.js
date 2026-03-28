import dotenv from "dotenv";
import logger from "../libs/logger.js";
import { startQueueConsumer } from "./queue.consumer.js";
import { processFile } from "./processors/processFile.js";

dotenv.config();

async function bootstrap() {
  const concurrency = Number(process.env.FILE_WORKER_CONCURRENCY || 3);

  await startQueueConsumer({
    concurrency,
    handler: processFile,
  });
}

bootstrap().catch((error) => {
  logger.error(`Worker bootstrap failed: ${error.message}`);
  process.exit(1);
});
