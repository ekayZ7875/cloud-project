import express from 'express'
import { isAuthenticated } from '../middlewares/auth.middleware.js'
import  upload  from '../config/multer.js'
import {
  uploadFile,
  getUserFiles,
  getSingleFile,
  softDeleteFile,
  getTrashedFiles,
  toggleStarFile,
  getStarredFiles,
  getRecentUploads,
  downloadFile,
  renameFile,
  restoreFromTrash,
  permanentDeleteFile,
  emptyTrash,
} from '../controllers/file.controller.js'

const router = express.Router()

// All routes are protected
router.use(isAuthenticated)

// ─── Upload ───────────────────────────────────────────────────────────────────
router.post('/upload', upload.single('file'), uploadFile)

// ─── Read ─────────────────────────────────────────────────────────────────────
router.get('/', getUserFiles)
router.get('/starred', getStarredFiles)
router.get('/recent', getRecentUploads)
router.get('/:fileId', getSingleFile)
router.get('/:fileId/download', downloadFile)

// ─── Update ───────────────────────────────────────────────────────────────────
router.patch('/:fileId/rename', renameFile)
router.patch('/:fileId/star', toggleStarFile)

// ─── Trash ────────────────────────────────────────────────────────────────────
router.get('/trash', getTrashedFiles)
router.delete('/trash/empty', emptyTrash)
router.patch('/trash/:fileId/restore', restoreFromTrash)
router.delete('/trash/:fileId/permanent', permanentDeleteFile)
router.delete('/:fileId', softDeleteFile)

export default router