import express from "express";
import multer from "multer";
import { authenticateToken } from "../middleware/auth";
import { uploadMedia, confirmMint } from "../controllers/media.controller";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/upload", authenticateToken, upload.single("file"), uploadMedia);
router.post("/confirm-mint", authenticateToken, confirmMint);

export default router;
