import express from "express";
import multer from "multer";
import {
  uploadFile,
  getUserFiles,
  softDeleteFile,
  toggleStarFile,
  getTrashedFiles
} from "../controllers/file.controller.js";
import authMiddleware from "../middlewares/auth.middlewares.js";

const router = express.Router();
const upload = multer(); // configure as needed

router.post("/upload-file", authMiddleware, upload.single("file"), uploadFile);
router.get("/get-files", authMiddleware, getUserFiles);
router.post("/delete-files", authMiddleware, softDeleteFile);
router.post('/star-file',authMiddleware,toggleStarFile)
router.get('/get-trashed-files',authMiddleware,getTrashedFiles)

export default router;
