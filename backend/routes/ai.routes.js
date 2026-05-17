import express from 'express';
import { getSmartInsights, handleAiQuery } from '../controllers/ai.controller.js';
import authMiddleware from '../middlewares/auth.middlewares.js';

const router = express.Router();

router.post('/query', authMiddleware, handleAiQuery);
router.get('/insights', authMiddleware, getSmartInsights);

export default router;
