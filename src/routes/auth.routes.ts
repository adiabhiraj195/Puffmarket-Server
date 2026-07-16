import express from "express";
import { getNonce, verifySignature } from "../controllers/auth.controller";

const router = express.Router();

router.post("/nonce", getNonce);
router.post("/verify", verifySignature);

export default router;
