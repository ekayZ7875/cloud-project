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
  searchFilesByTags,
  getAllUserFileTags,
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

router.post("/upload-file", authMiddleware, upload.single("file"), uploadFile);
router.post("/upload-folder", authMiddleware, upload.array("files"), uploadFolder);
router.get("/get-files", authMiddleware, getUserFiles);
router.get("/get-file", authMiddleware, getSingleFile);
router.post("/delete-files", authMiddleware, softDeleteFile);
router.post("/star-file", authMiddleware, toggleStarFile);
router.get("/get-starred-files", authMiddleware, getStarredFiles);
router.get("/get-trashed-files", authMiddleware, getTrashedFiles);
router.get("/get-recent-files", authMiddleware, getRecentUploads);
router.get("/search-by-tags", authMiddleware, searchFilesByTags);
router.get("/tags", authMiddleware, getAllUserFileTags);
router.post("/download-file", authMiddleware, downloadFile);
router.get("/processing-status/:jobId", authMiddleware, getFileProcessingStatus);
router.get("/storage-capacity", authMiddleware, getUserStorageCapacity);
router.get("/get-folders", authMiddleware, getAllFoldersForUser);
router.post("/create-folder", authMiddleware, createFolder);
router.post("/delete-folder", authMiddleware, softDeleteFolder);
router.post("/restore-item", authMiddleware, restoreItem);
router.post("/permanent-delete", authMiddleware, permanentDelete);

export default router