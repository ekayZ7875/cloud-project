import { checkSystemHealth } from "../services/health.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// @desc    Check health of backend and all external integration services (SQS, DynamoDB, Qdrant, S3, Gemini LLM)
// @route   GET /api/health
// @access  Public
export const getHealthStatus = asyncHandler(async (req, res) => {
  const health = await checkSystemHealth();
  
  if (health.status === "healthy") {
    return res.status(200).json(health);
  } else {
    return res.status(503).json(health);
  }
});
