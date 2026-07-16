"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTransfer = createTransfer;
exports.createTransaction = createTransaction;
exports.createSaleHistory = createSaleHistory;
exports.getNftTransactions = getNftTransactions;
const db_1 = __importDefault(require("../lib/db"));
async function createTransfer({ tokenId, from, to, type, price, txHash, blockNumber, timestamp }) {
    try {
        return await db_1.default.transfer.upsert({
            where: { txHash },
            update: {
                tokenId,
                from: from.toLowerCase(),
                to: to.toLowerCase(),
                type,
                price,
                blockNumber,
                timestamp
            },
            create: {
                tokenId,
                from: from.toLowerCase(),
                to: to.toLowerCase(),
                type,
                price,
                txHash,
                blockNumber,
                timestamp
            }
        });
    }
    catch (error) {
        console.error("[createTransfer] Error:", error);
        throw error;
    }
}
async function createTransaction({ nftId, sellerId, buyerId, price, transactionHash }) {
    try {
        const nft = await db_1.default.nFT.findUnique({
            where: { id: nftId }
        });
        if (!nft)
            throw new Error(`NFT with id ${nftId} not found`);
        return await createTransfer({
            tokenId: nft.tokenId,
            from: sellerId,
            to: buyerId,
            type: "SALE",
            price,
            txHash: transactionHash,
            blockNumber: 0,
            timestamp: new Date()
        });
    }
    catch (error) {
        console.error("[createTransaction] Error:", error);
        throw error;
    }
}
async function createSaleHistory(data) {
    // Staging or historical logs are handled in Transfer table now
    return true;
}
async function getNftTransactions(nftId) {
    try {
        const nft = await db_1.default.nFT.findFirst({
            where: {
                OR: [
                    { id: nftId },
                    { tokenId: nftId }
                ]
            }
        });
        if (!nft) {
            return [];
        }
        const transfers = await db_1.default.transfer.findMany({
            where: {
                tokenId: nft.tokenId
            },
            orderBy: {
                timestamp: "desc"
            }
        });
        return transfers.map(t => ({
            id: t.id,
            nftId: nft.id,
            buyerId: t.to,
            sellerId: t.from,
            price: t.price || "0",
            transactionHash: t.txHash,
            createdAt: t.timestamp,
            buyer: { address: t.to },
            seller: { address: t.from }
        }));
    }
    catch (error) {
        console.error("[getNftTransactions] Error:", error);
        throw error;
    }
}
