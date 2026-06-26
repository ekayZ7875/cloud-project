import express from 'express'
import { isAuthenticated } from '../middlewares/auth.middlewares.js'
import upload from '../config/mutler.js'
import {
  uploadFile,
  uploadFolder,
  getUserFiles,
  getSingleFile,
  softDeleteFile,
  getTrashedFiles,
  getRecentUploads,
  searchFilesByTags,
  getAllUserFileTags,
  downloadFile,
  getFileProcessingStatus,
  getUserStorageCapacity,
  getAllFoldersForUser,
  softDeleteFolder,
  restoreItem,
  permanentDelete,
  getFilesInFolder,
} from '../controllers/file.controller.js'

const router = express.Router()

// All routes are protected
router.use(isAuthenticated)

// ─── Upload ───────────────────────────────────────────────────────────────────
router.post('/upload-file', upload.single('file'), uploadFile)
router.post('/upload-folder', upload.array('files'), uploadFolder)

// ─── Read ─────────────────────────────────────────────────────────────────────
router.get('/get-files', getUserFiles)
router.get('/get-file', getSingleFile)
router.get('/get-trashed-files', getTrashedFiles)
router.get('/get-recent-files', getRecentUploads)
router.get('/search-by-tags', searchFilesByTags)
router.get('/tags', getAllUserFileTags)
router.post('/download-file', downloadFile)
router.get('/processing-status/:jobId', getFileProcessingStatus)
router.get('/storage-capacity', getUserStorageCapacity)
router.get('/get-folders', getAllFoldersForUser)
router.get('/get-folder-files', getFilesInFolder)

// ─── Delete / Restore ─────────────────────────────────────────────────────────
router.post('/delete-files', softDeleteFile)
router.post('/delete-folder', softDeleteFolder)
router.post('/restore-item', restoreItem)
router.post('/permanent-delete', permanentDelete)

export default router