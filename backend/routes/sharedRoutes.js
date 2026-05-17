import express from 'express'
import { isAuthenticated } from '../middlewares/auth.middleware.js'
import {
  shareFile,
  unshareFile,
  getSharedByMe,
  getSharedWithMe,
} from '../controllers/shared.controller.js'

const router = express.Router()

// All routes are protected
router.use(isAuthenticated)

// ─── Share ────────────────────────────────────────────────────────────────────
router.get('/by-me', getSharedByMe)
router.get('/with-me', getSharedWithMe)
router.post('/:fileId', shareFile)
router.delete('/:fileId/:sharedWithEmail', unshareFile)

export default router