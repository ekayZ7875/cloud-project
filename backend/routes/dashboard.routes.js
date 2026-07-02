import express from 'express'
import { getDashboardStats } from '../controllers/dashboard.controller.js'

const router = express.Router()

// @route   GET /api/dashboard/stats
// @access  Public (no auth required — admin/ops console)
router.get('/stats', getDashboardStats)

export default router
