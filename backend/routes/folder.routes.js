import express from "express";
import {
  createFolder,
  moveFileToFolder,
  bulkMoveFilesToFolder,
  getFilesInFolder,
  getAllFoldersForUser,
} from "../controllers/file.controller.js";
import authMiddleware from "../middlewares/auth.middlewares.js";

const router = express.Router();

router.post("/create-folder", authMiddleware, createFolder);
router.post("/move-file-to-folder", authMiddleware, moveFileToFolder);
router.post("/bulk-move-files", authMiddleware, bulkMoveFilesToFolder);
router.get("/get-files", authMiddleware, getFilesInFolder);
router.get("/get-all-folders", authMiddleware, getAllFoldersForUser);

export default router;
