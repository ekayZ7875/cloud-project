import express from 'express'
import { isAuthenticated } from '../middlewares/auth.middlewares.js'
import { getStorageStats } from '../controllers/storage.controller.js'

const router = express.Router()

router.use(isAuthenticated)

// @route   GET /api/storage
router.get('/', getStorageStats)

export default router