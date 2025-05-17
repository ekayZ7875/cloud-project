import express from "express";
import multer from "multer";
import { uploadFile,getUserFiles } from "../controllers/file.controller.js";
import  authMiddleware  from "../middlewares/auth.middlewares.js";

const router = express.Router();
const upload = multer(); // configure as needed

router.post("/upload-file", authMiddleware, upload.single("file"), uploadFile);
router.get("/get-files",authMiddleware,getUserFiles)

export default router;