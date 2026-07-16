import express from "express";
import { authenticateToken } from "../middleware/auth";
import {
    getListings,
    getUserNfts,
    addNft,
    getNftDetails,
    buyNft,
    cancelListing,
    listNft,
    getNftTransactions
} from "../controllers/nft.controller";

const router = express.Router();

router.get("/listings", getListings);
router.get("/user", authenticateToken, getUserNfts);
router.post("/", authenticateToken, addNft);
router.get("/:id", getNftDetails);
router.post("/buy/:id", authenticateToken, buyNft);
router.post("/cancel/:id", authenticateToken, cancelListing);
router.post("/list", authenticateToken, listNft);
router.get("/transaction/:id", getNftTransactions);

export default router;
