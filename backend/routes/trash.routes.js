import express from 'express'
import { isAuthenticated } from '../middlewares/auth.middlewares.js'
import {
  getTrashedFiles,
  restoreFromTrash,
  permanentDeleteFile,
  emptyTrash,
} from '../controllers/trash.controller.js'

const router = express.Router()

router.use(isAuthenticated)

// @route   GET    /api/trash
router.get('/', getTrashedFiles)

// @route   DELETE /api/trash
router.delete('/', emptyTrash)

// @route   PATCH  /api/trash/:fileId/restore
router.patch('/:fileId/restore', restoreFromTrash)

// @route   DELETE /api/trash/:fileId
router.delete('/:fileId', permanentDeleteFile)

export default router