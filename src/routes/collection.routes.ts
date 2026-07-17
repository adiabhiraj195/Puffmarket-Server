import express from "express";
import { authenticateToken } from "../middleware/auth";
import {
    createCollection,
    getUserCollections,
    getAllCollections,
    getCollectionDetails
} from "../controllers/collection.controller";

const router = express.Router();

router.post("/", authenticateToken, createCollection);
router.get("/user", authenticateToken, getUserCollections);
router.get("/all", getAllCollections);
router.get("/:contractAddress", getCollectionDetails);

export default router;
