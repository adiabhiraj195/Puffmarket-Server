"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addNftToDatabase = addNftToDatabase;
exports.getNftByAddressAndTokenId = getNftByAddressAndTokenId;
exports.getAllNftOfUser = getAllNftOfUser;
exports.getNftById = getNftById;
exports.updateNftOwner = updateNftOwner;
const db_1 = __importDefault(require("../lib/db"));
async function addNftToDatabase(data) {
    try {
        return await db_1.default.nFT.create({
            data: {
                ...data,
                ownerAddress: data.ownerAddress.toLowerCase(),
                creatorAddress: data.creatorAddress.toLowerCase(),
                contractAddress: data.contractAddress.toLowerCase(),
            }
        });
    }
    catch (error) {
        console.error("[addNftToDatabase] Error:", error);
        throw error;
    }
}
async function getNftByAddressAndTokenId({ contractAddress, tokenId }) {
    try {
        return await db_1.default.nFT.findMany({
            where: {
                contractAddress: contractAddress.toLowerCase(),
                tokenId,
            }
        });
    }
    catch (error) {
        console.error("[getNftByAddressAndTokenId] Error:", error);
        throw error;
    }
}
async function getAllNftOfUser(ownerAddress) {
    try {
        return await db_1.default.nFT.findMany({
            where: {
                ownerAddress: ownerAddress.toLowerCase()
            },
            include: {
                owner: true,
                listings: {
                    where: {
                        status: "ACTIVE"
                    }
                }
            }
        });
    }
    catch (error) {
        console.error("[getAllNftOfUser] Error:", error);
        throw error;
    }
}
async function getNftById(id) {
    try {
        return await db_1.default.nFT.findFirst({
            where: {
                OR: [
                    { id: id },
                    { tokenId: id }
                ]
            },
            include: {
                owner: true,
                listings: {
                    where: {
                        status: "ACTIVE"
                    }
                }
            }
        });
    }
    catch (error) {
        console.error("[getNftById] Error:", error);
        throw error;
    }
}
async function updateNftOwner(id, ownerAddress) {
    try {
        return await db_1.default.nFT.update({
            where: {
                id
            },
            data: {
                ownerAddress: ownerAddress.toLowerCase()
            }
        });
    }
    catch (error) {
        console.error("[updateNftOwner] Error:", error);
        throw error;
    }
}
