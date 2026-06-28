import express from 'express';
import {
  getSmartInsights,
  handleAiQuery,
  handleGetChats,
  handleCreateChat,
  handleGetChatDetails,
} from '../controllers/ai.controller.js';
import { isAuthenticated } from '../middlewares/auth.middlewares.js';

const router = express.Router();

router.post('/query', isAuthenticated, handleAiQuery);
router.get('/insights', isAuthenticated, getSmartInsights);

// Chat / Conversation routes
router.get('/chats', isAuthenticated, handleGetChats);
router.post('/chats', isAuthenticated, handleCreateChat);
router.get('/chats/:chatId', isAuthenticated, handleGetChatDetails);

export default router;
