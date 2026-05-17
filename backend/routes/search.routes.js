import express from 'express'
import { isAuthenticated } from '../middlewares/auth.middleware.js'
import { searchFiles } from '../controllers/search.controller.js'

const router = express.Router()

router.use(isAuthenticated)

// @route   GET /api/search?q=filename
router.get('/', searchFiles)

export default router