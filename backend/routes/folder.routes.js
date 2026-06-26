import express from 'express'
import { isAuthenticated } from '../middlewares/auth.middlewares.js'
import {
  createFolder,
  getAllFoldersForUser,
  getFilesInFolder,
  moveFileToFolder,
  bulkMoveFilesToFolder,
  renameFolder,
  deleteFolder,
} from '../controllers/folder.controller.js'

const router = express.Router()

// All routes are protected
router.use(isAuthenticated)

// ─── Folders ──────────────────────────────────────────────────────────────────
router.post('/', createFolder)
router.get('/', getAllFoldersForUser)
router.delete('/:folderId', deleteFolder)
router.patch('/:folderId/rename', renameFolder)

// ─── Files inside folder ──────────────────────────────────────────────────────
router.get('/:folderId/files', getFilesInFolder)
router.patch('/:folderId/files/bulk', bulkMoveFilesToFolder)
router.patch('/:folderId/files/:fileId', moveFileToFolder)

export default router