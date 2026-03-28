import express from "express";
import multer from "multer";
import {
  uploadFile,
  getUserFiles,
  getSingleFile,
  softDeleteFile,
  toggleStarFile,
  getTrashedFiles,
  getStarredFiles,
  getRecentUploads,
  downloadFile,
  getFileProcessingStatus,
  getUserStorageCapacity,
  getAllFoldersForUser,
  createFolder,
  uploadFolder,
  softDeleteFolder,
  restoreItem,
  permanentDelete,
} from "../controllers/file.controller.js";
import authMiddleware from "../middlewares/auth.middlewares.js";

const router = express.Router();
const upload = multer();

router.post("/upload-file", authMiddleware, upload.single("file"), uploadFile);
router.post("/upload-folder", authMiddleware, upload.array("files"), uploadFolder);
router.get("/get-files", authMiddleware, getUserFiles);
router.get("/get-file", authMiddleware, getSingleFile);
router.post("/delete-files", authMiddleware, softDeleteFile);
router.post("/star-file", authMiddleware, toggleStarFile);
router.get("/get-starred-files", authMiddleware, getStarredFiles);
router.get("/get-trashed-files", authMiddleware, getTrashedFiles);
router.get("/get-recent-files", authMiddleware, getRecentUploads);
router.post("/download-file", authMiddleware, downloadFile);
router.get("/processing-status/:jobId", authMiddleware, getFileProcessingStatus);
router.get("/storage-capacity", authMiddleware, getUserStorageCapacity);
router.get("/get-folders", authMiddleware, getAllFoldersForUser);
router.post("/create-folder", authMiddleware, createFolder);
router.post("/delete-folder", authMiddleware, softDeleteFolder);
router.post("/restore-item", authMiddleware, restoreItem);
router.post("/permanent-delete", authMiddleware, permanentDelete);

export default router;
