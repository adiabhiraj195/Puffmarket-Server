"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const nft_controller_1 = require("../controllers/nft.controller");
const router = express_1.default.Router();
router.get("/listings", nft_controller_1.getListings);
router.get("/user", auth_1.authenticateToken, nft_controller_1.getUserNfts);
router.post("/", auth_1.authenticateToken, nft_controller_1.addNft);
router.get("/:id", nft_controller_1.getNftDetails);
router.post("/buy/:id", auth_1.authenticateToken, nft_controller_1.buyNft);
router.post("/cancel/:id", auth_1.authenticateToken, nft_controller_1.cancelListing);
router.post("/list", auth_1.authenticateToken, nft_controller_1.listNft);
router.get("/transaction/:id", nft_controller_1.getNftTransactions);
exports.default = router;
