import express from 'express'
import { isAuthenticated } from '../middlewares/auth.middlewares.js'
import { getActivityFeed } from '../controllers/activity.controller.js'

const router = express.Router()

router.use(isAuthenticated)

// @route   GET /api/activity
router.get('/', getActivityFeed)

export default router