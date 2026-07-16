"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listNft = listNft;
exports.getAllActiveListings = getAllActiveListings;
exports.updateListing = updateListing;
const db_1 = __importDefault(require("../lib/db"));
async function listNft({ tokenId, sellerAddress, price, listTxHash, listBlockNumber }) {
    try {
        // Cancel any existing active listing for this tokenId before creating a new one
        await db_1.default.listing.updateMany({
            where: {
                tokenId,
                status: "ACTIVE"
            },
            data: {
                status: "CANCELLED",
                cancelledAt: new Date()
            }
        });
        return await db_1.default.listing.create({
            data: {
                tokenId,
                sellerAddress: sellerAddress.toLowerCase(),
                price,
                listTxHash,
                listBlockNumber,
                status: "ACTIVE",
                createdAt: new Date()
            }
        });
    }
    catch (error) {
        console.error("[listNft] Error:", error);
        throw error;
    }
}
async function getAllActiveListings() {
    try {
        const listings = await db_1.default.listing.findMany({
            where: {
                status: "ACTIVE"
            },
            include: {
                nft: true,
                seller: true
            },
            orderBy: {
                createdAt: "desc"
            }
        });
        const PINATA_GATEWAY = "https://sapphire-keen-aardvark-438.mypinata.cloud/ipfs/";
        return listings.map(l => ({
            id: l.id,
            nftId: l.nft.id,
            sellerId: l.seller.id,
            price: l.price,
            status: l.status,
            createdAt: l.createdAt,
            updatedAt: l.createdAt,
            imageURI: `${PINATA_GATEWAY}${l.nft.mediaCID}`,
            nft: {
                id: l.nft.id,
                imageURI: `${PINATA_GATEWAY}${l.nft.mediaCID}`,
                tokenId: l.nft.tokenId,
                name: l.nft.name,
                description: l.nft.description,
                mediaType: l.nft.mediaType
            },
            seller: {
                id: l.seller.id,
                address: l.seller.walletAddress,
                username: l.seller.username
            }
        }));
    }
    catch (error) {
        console.error("[getAllActiveListings] Error:", error);
        throw error;
    }
}
async function updateListing({ nftId, status, buyerAddress, saleTxHash, salePrice, cancelTxHash }) {
    try {
        // Find the NFT first to get the tokenId
        const nft = await db_1.default.nFT.findUnique({
            where: { id: nftId }
        });
        if (!nft) {
            throw new Error(`NFT with id ${nftId} not found`);
        }
        // Find the active listing for this NFT's tokenId
        const activeListing = await db_1.default.listing.findFirst({
            where: {
                tokenId: nft.tokenId,
                status: "ACTIVE"
            }
        });
        if (!activeListing) {
            console.warn(`No active listing found for NFT TokenId: ${nft.tokenId}`);
            return null;
        }
        return await db_1.default.listing.update({
            where: {
                id: activeListing.id
            },
            data: {
                status,
                soldAt: status === "SOLD" ? new Date() : undefined,
                buyerAddress: status === "SOLD" && buyerAddress ? buyerAddress.toLowerCase() : undefined,
                saleTxHash: status === "SOLD" ? saleTxHash : undefined,
                salePrice: status === "SOLD" ? salePrice : undefined,
                cancelledAt: status === "CANCELLED" ? new Date() : undefined,
                cancelTxHash: status === "CANCELLED" ? cancelTxHash : undefined
            }
        });
    }
    catch (error) {
        console.error("[updateListing] Error:", error);
        throw error;
    }
}
