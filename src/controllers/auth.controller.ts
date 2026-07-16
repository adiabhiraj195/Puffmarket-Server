import { Request, Response } from "express";
import { ethers } from "ethers";
import jwt from "jsonwebtoken";
import db from "../lib/db";

export async function getNonce(req: Request, res: Response) {
    try {
        const { address } = req.body;
        if (!address) {
            return res.status(400).json({ error: "Address is required" });
        }

        const userAddress = address.toLowerCase();

        // Ensure user exists
        let user = await db.user.findUnique({
            where: { walletAddress: userAddress }
        });
        if (!user) {
            user = await db.user.create({
                data: { walletAddress: userAddress }
            });
        }

        const nonce = Math.floor(Math.random() * 1000000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        await db.authNonce.create({
            data: {
                walletAddress: userAddress,
                nonce,
                expiresAt
            }
        });

        const issuedAt = new Date().toISOString();
        const message = `puff-market.com wants you to sign in with your Ethereum account:\n${address}\n\nSign in to PUFF Marketplace.\n\nURI: http://localhost:3000\nVersion: 1\nChain ID: 31337\nNonce: ${nonce}\nIssued At: ${issuedAt}`;

        return res.json({ message, nonce });
    } catch (error: any) {
        console.error("Nonce generation error:", error);
        return res.status(500).json({ error: error.message });
    }
}

export async function verifySignature(req: Request, res: Response) {
    try {
        const { message, signature, address } = req.body;

        if (!message || !signature || !address) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const recoveredAddress = ethers.verifyMessage(message, signature);

        if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
            return res.status(401).json({ error: "Signature verification failed" });
        }

        // Verify Nonce in DB
        const nonceRegex = /Nonce: (\d+)/;
        const match = message.match(nonceRegex);
        const nonce = match ? match[1] : "";

        const dbNonce = await db.authNonce.findUnique({
            where: { nonce }
        });

        if (!dbNonce || dbNonce.used || dbNonce.expiresAt < new Date() || dbNonce.walletAddress !== address.toLowerCase()) {
            return res.status(400).json({ error: "Invalid, expired, or already used nonce" });
        }

        // Mark nonce as used
        await db.authNonce.update({
            where: { id: dbNonce.id },
            data: { used: true }
        });

        // Upsert User
        const user = await db.user.upsert({
            where: { walletAddress: address.toLowerCase() },
            update: {},
            create: { walletAddress: address.toLowerCase() },
        });

        const jwtSecret = process.env.JWT_SECRET || "puff_market_secret";
        const token = jwt.sign(
            { id: user.id, address: user.walletAddress },
            jwtSecret,
            { expiresIn: "30d" }
        );

        return res.json({ success: true, token, user: { id: user.id, address: user.walletAddress, userName: user.username } });
    } catch (error: any) {
        console.error("Verification error:", error);
        return res.status(500).json({ error: error.message });
    }
}
