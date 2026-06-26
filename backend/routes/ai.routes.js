import express from 'express';
import { getSmartInsights, handleAiQuery } from '../controllers/ai.controller.js';
import { isAuthenticated } from '../middlewares/auth.middlewares.js';

const router = express.Router();

router.post('/query', isAuthenticated, handleAiQuery);
router.get('/insights', isAuthenticated, getSmartInsights);

export default router;
