"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNonce = getNonce;
exports.verifySignature = verifySignature;
const ethers_1 = require("ethers");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = __importDefault(require("../lib/db"));
async function getNonce(req, res) {
    try {
        const { address } = req.body;
        if (!address) {
            return res.status(400).json({ error: "Address is required" });
        }
        const userAddress = address.toLowerCase();
        // Ensure user exists
        let user = await db_1.default.user.findUnique({
            where: { walletAddress: userAddress }
        });
        if (!user) {
            user = await db_1.default.user.create({
                data: { walletAddress: userAddress }
            });
        }
        const nonce = Math.floor(Math.random() * 1000000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        await db_1.default.authNonce.create({
            data: {
                walletAddress: userAddress,
                nonce,
                expiresAt
            }
        });
        const issuedAt = new Date().toISOString();
        const message = `puff-market.com wants you to sign in with your Ethereum account:\n${address}\n\nSign in to PUFF Marketplace.\n\nURI: http://localhost:3000\nVersion: 1\nChain ID: 31337\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
        return res.json({ message, nonce });
    }
    catch (error) {
        console.error("Nonce generation error:", error);
        return res.status(500).json({ error: error.message });
    }
}
async function verifySignature(req, res) {
    try {
        const { message, signature, address } = req.body;
        if (!message || !signature || !address) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        const recoveredAddress = ethers_1.ethers.verifyMessage(message, signature);
        if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
            return res.status(401).json({ error: "Signature verification failed" });
        }
        // Verify Nonce in DB
        const nonceRegex = /Nonce: (\d+)/;
        const match = message.match(nonceRegex);
        const nonce = match ? match[1] : "";
        const dbNonce = await db_1.default.authNonce.findUnique({
            where: { nonce }
        });
        if (!dbNonce || dbNonce.used || dbNonce.expiresAt < new Date() || dbNonce.walletAddress !== address.toLowerCase()) {
            return res.status(400).json({ error: "Invalid, expired, or already used nonce" });
        }
        // Mark nonce as used
        await db_1.default.authNonce.update({
            where: { id: dbNonce.id },
            data: { used: true }
        });
        // Upsert User
        const user = await db_1.default.user.upsert({
            where: { walletAddress: address.toLowerCase() },
            update: {},
            create: { walletAddress: address.toLowerCase() },
        });
        const jwtSecret = process.env.JWT_SECRET || "puff_market_secret";
        const token = jsonwebtoken_1.default.sign({ id: user.id, address: user.walletAddress }, jwtSecret, { expiresIn: "30d" });
        return res.json({ success: true, token, user: { id: user.id, address: user.walletAddress, userName: user.username } });
    }
    catch (error) {
        console.error("Verification error:", error);
        return res.status(500).json({ error: error.message });
    }
}
