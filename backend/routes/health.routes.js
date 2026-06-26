import express from "express";
import { getHealthStatus } from "../controllers/health.controller.js";

const router = express.Router();

// @route   GET /api/health
router.get("/", getHealthStatus);

export default router;
