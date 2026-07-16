import { Request, Response } from "express";
import db from "../lib/db";

export async function getListings(req: Request, res: Response) {
    try {
        const listings = await db.listing.findMany({
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

        const mappedListings = listings.map(l => ({
            id: l.id,
            nftId: l.nft.id,
            sellerId: l.seller.id,
            price: l.price,
            paymentToken: l.paymentToken,
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
        return res.json(mappedListings);
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
}

export async function getUserNfts(req: any, res: Response) {
    try {
        const userAddress = req.user?.address;
        if (!userAddress) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const nfts = await db.nFT.findMany({
            where: {
                ownerAddress: userAddress.toLowerCase()
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
        
        const PINATA_GATEWAY = "https://sapphire-keen-aardvark-438.mypinata.cloud/ipfs/";
        const mappedNfts = nfts.map(nft => {
            const isListed = nft.listings.length > 0;
            return {
                id: nft.id,
                tokenId: nft.tokenId,
                contractAddress: nft.contractAddress,
                ownerId: nft.owner.id,
                metadataURI: nft.tokenURI,
                imageURI: `${PINATA_GATEWAY}${nft.mediaCID}`,
                isListed: isListed,
                createdAt: nft.mintedAt,
                updatedAt: nft.mintedAt,
                owner: {
                    id: nft.owner.id,
                    address: nft.owner.walletAddress,
                    userName: nft.owner.username || ""
                },
                listing: isListed ? {
                    price: nft.listings[0].price,
                    paymentToken: nft.listings[0].paymentToken
                } : undefined,
                name: nft.name,
                description: nft.description,
                attributes: nft.attributes,
                creatorAddress: nft.creatorAddress
            };
        });
        return res.json(mappedNfts);
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
}

export async function addNft(req: any, res: Response) {
    try {
        const userAddress = req.user?.address;
        const userId = req.user?.id;
        if (!userAddress || !userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const { tokenId, contractAddress, metadataURI, imageURI, type } = req.body;

        const isexists = await db.nFT.findMany({
            where: {
                contractAddress: contractAddress.toLowerCase(),
                tokenId,
            }
        });

        if (!isexists || isexists.length === 0) {
            const extractCID = (url: string): string => {
                if (!url) return "";
                if (url.startsWith("ipfs://")) return url.replace("ipfs://", "");
                const match = url.match(/\/ipfs\/([^\/?#]+)/);
                return match ? match[1] : url;
            };

            const response = await db.nFT.create({
                data: {
                    tokenId,
                    contractAddress: contractAddress.toLowerCase(),
                    tokenURI: metadataURI || "",
                    metadataCID: extractCID(metadataURI || ""),
                    mediaCID: extractCID(imageURI || ""),
                    thumbnailCID: extractCID(imageURI || ""),
                    mediaType: (type && type.toLowerCase() === "video") ? "VIDEO" : "IMAGE",
                    name: `Puff NFT #${tokenId}`,
                    description: "",
                    ownerAddress: userAddress.toLowerCase(),
                    creatorAddress: userAddress.toLowerCase(),
                    mintTxHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
                    mintedAt: new Date(),
                    confirmed: false,
                    mintBlockNumber: 0
                }
            });
            return res.status(200).json({ data: response });
        }

        return res.status(400).json({ success: false, error: "already added" });
    } catch (e: any) {
        return res.status(401).json({ success: false, error: e.message });
    }
}

export async function getNftDetails(req: Request, res: Response) {
    const { id } = req.params;
    try {
        const nft = await db.nFT.findFirst({
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

        if (!nft) {
            return res.status(404).json({ success: false, error: "No nft with such id" });
        }

        const PINATA_GATEWAY = "https://sapphire-keen-aardvark-438.mypinata.cloud/ipfs/";
        const isListed = nft.listings.length > 0;
        const mappedNft = {
            id: nft.id,
            tokenId: nft.tokenId,
            contractAddress: nft.contractAddress,
            ownerId: nft.owner.id,
            metadataURI: nft.tokenURI,
            imageURI: `${PINATA_GATEWAY}${nft.mediaCID}`,
            isListed: isListed,
            createdAt: nft.mintedAt,
            updatedAt: nft.mintedAt,
            owner: {
                id: nft.owner.id,
                address: nft.owner.walletAddress,
                userName: nft.owner.username || ""
            },
            listing: isListed ? {
                price: nft.listings[0].price,
                paymentToken: nft.listings[0].paymentToken
            } : undefined,
            name: nft.name,
            description: nft.description,
            attributes: nft.attributes,
            creatorAddress: nft.creatorAddress
        };

        return res.status(200).json({ success: true, nft: mappedNft });
    } catch (error: any) {
        return res.status(400).json({ success: false, error: error.message });
    }
}

export async function buyNft(req: any, res: Response) {
    const nftId = req.params.id;
    const { sellerId, txHash, price } = req.body;
    const buyerAddress = req.user?.address;
    const buyerId = req.user?.id;

    if (!buyerAddress || !buyerId) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        // Resolve seller's walletAddress if sellerId was a cuid
        const sellerUser = await db.user.findFirst({
            where: {
                OR: [
                    { id: sellerId },
                    { walletAddress: sellerId.toLowerCase() }
                ]
            }
        });
        const sellerAddress = sellerUser ? sellerUser.walletAddress : sellerId;

        // Find the NFT first to get the tokenId
        const nft = await db.nFT.findUnique({
            where: { id: nftId }
        });

        if (!nft) {
            return res.status(404).json({ error: `NFT with id ${nftId} not found` });
        }

        // Find the active listing for this NFT's tokenId
        const activeListing = await db.listing.findFirst({
            where: {
                tokenId: nft.tokenId,
                status: "ACTIVE"
            }
        });

        if (activeListing) {
            await db.listing.update({
                where: {
                    id: activeListing.id
                },
                data: {
                    status: "SOLD",
                    soldAt: new Date(),
                    buyerAddress: buyerAddress.toLowerCase(),
                    saleTxHash: txHash,
                    salePrice: price.toString()
                }
            });
        } else {
            console.warn(`No active listing found for NFT TokenId: ${nft.tokenId}`);
        }

        // Update owner
        await db.nFT.update({
            where: { id: nftId },
            data: {
                ownerAddress: buyerAddress.toLowerCase()
            }
        });

        // Create transaction transfer record
        await db.transfer.upsert({
            where: { txHash },
            update: {
                tokenId: nft.tokenId,
                from: sellerAddress.toLowerCase(),
                to: buyerAddress.toLowerCase(),
                type: "SALE",
                price: price.toString(),
                blockNumber: 0,
                timestamp: new Date()
            },
            create: {
                tokenId: nft.tokenId,
                from: sellerAddress.toLowerCase(),
                to: buyerAddress.toLowerCase(),
                type: "SALE",
                price: price.toString(),
                txHash,
                blockNumber: 0,
                timestamp: new Date()
            }
        });

        return res.status(200).json({ success: true });
    } catch (error: any) {
        console.error("Buy NFT error:", error);
        return res.status(500).json({ error: error.message });
    }
}

export async function cancelListing(req: any, res: Response) {
    const nftId = req.params.id;
    if (!req.user?.address) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        const nft = await db.nFT.findUnique({
            where: { id: nftId }
        });

        if (!nft) {
            return res.status(404).json({ error: `NFT with id ${nftId} not found` });
        }

        const activeListing = await db.listing.findFirst({
            where: {
                tokenId: nft.tokenId,
                status: "ACTIVE"
            }
        });

        if (activeListing) {
            await db.listing.update({
                where: {
                    id: activeListing.id
                },
                data: {
                    status: "CANCELLED",
                    cancelledAt: new Date(),
                    cancelTxHash: "0x0000000000000000000000000000000000000000000000000000000000000000"
                }
            });
        }

        return res.status(200).json({ success: true });
    } catch (error: any) {
        console.error("Cancel listing error:", error);
        return res.status(500).json({ error: error.message });
    }
}

export async function listNft(req: any, res: Response) {
    const { nftId, price, paymentToken } = req.body;
    const sellerAddress = req.user?.address;

    if (!sellerAddress) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        const nft = await db.nFT.findUnique({
            where: { id: nftId }
        });
        if (!nft) {
            return res.status(404).json({ error: "NFT not found" });
        }

        // Cancel any existing active listing for this tokenId before creating a new one
        await db.listing.updateMany({
            where: {
                tokenId: nft.tokenId,
                status: "ACTIVE"
            },
            data: {
                status: "CANCELLED",
                cancelledAt: new Date()
            }
        });

        const defaultPaymentToken = "0x0000000000000000000000000000000000000000";
        const listing = await db.listing.create({
            data: {
                tokenId: nft.tokenId,
                sellerAddress: sellerAddress.toLowerCase(),
                price: price.toString(),
                paymentToken: (paymentToken || defaultPaymentToken).toLowerCase(),
                listTxHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
                listBlockNumber: 0,
                status: "ACTIVE",
                createdAt: new Date()
            }
        });

        return res.status(200).json({ success: true, listing });
    } catch (error: any) {
        console.error("List NFT error:", error);
        return res.status(401).json({ success: false, error: error.message });
    }
}

export async function createListing(req: any, res: Response) {
    const { tokenId, price, txHash, paymentToken } = req.body;
    const sellerAddress = req.user?.address;

    if (!sellerAddress) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (!tokenId || !price) {
        return res.status(400).json({ error: "Missing required fields: tokenId, price" });
    }

    try {
        const nftContractAddress = (process.env.PUFF_NFT_ADDRESS || "0x0165878a594ca255338adfa4d48449f69242eb8f").toLowerCase();
        
        let nft = await db.nFT.findUnique({
            where: { tokenId: tokenId.toString() }
        });

        if (!nft) {
            console.log(`[API Listings] NFT not found. Creating placeholder NFT for tokenId: ${tokenId}`);
            nft = await db.nFT.create({
                data: {
                    tokenId: tokenId.toString(),
                    contractAddress: nftContractAddress,
                    tokenURI: "",
                    metadataCID: "",
                    mediaCID: "",
                    thumbnailCID: "",
                    mediaType: "IMAGE",
                    name: `Puff NFT #${tokenId}`,
                    description: "",
                    ownerAddress: sellerAddress.toLowerCase(),
                    creatorAddress: sellerAddress.toLowerCase(),
                    mintTxHash: txHash || "0x0000000000000000000000000000000000000000000000000000000000000000",
                    mintedAt: new Date(),
                    confirmed: false,
                    mintBlockNumber: 0
                }
            });
        }

        // Cancel any existing active listing for this tokenId before creating a new one
        await db.listing.updateMany({
            where: {
                tokenId: tokenId.toString(),
                status: "ACTIVE"
            },
            data: {
                status: "CANCELLED",
                cancelledAt: new Date()
            }
        });

        const defaultPaymentToken = "0x0000000000000000000000000000000000000000";
        const listing = await db.listing.create({
            data: {
                tokenId: tokenId.toString(),
                sellerAddress: sellerAddress.toLowerCase(),
                price: price.toString(),
                paymentToken: (paymentToken || defaultPaymentToken).toLowerCase(),
                listTxHash: txHash || "0x0000000000000000000000000000000000000000000000000000000000000000",
                listBlockNumber: 0,
                status: "ACTIVE",
                createdAt: new Date()
            }
        });

        console.log(`[API Listings] Successfully created listing for tokenId: ${tokenId}, price: ${price}, token: ${listing.paymentToken}`);
        return res.status(200).json({ success: true, listing });
    } catch (error: any) {
        console.error("[API Listings] Error:", error);
        return res.status(500).json({ error: error.message });
    }
}

export async function getNftTransactions(req: Request, res: Response) {
    const { id } = req.params;
    try {
        const nft = await db.nFT.findFirst({
            where: {
                OR: [
                    { id: id },
                    { tokenId: id }
                ]
            }
        });

        if (!nft) {
            return res.status(200).json({ success: true, transactions: [] });
        }

        const transfers = await db.transfer.findMany({
            where: {
                tokenId: nft.tokenId
            },
            orderBy: {
                timestamp: "desc"
            }
        });

        const transactions = transfers.map(t => ({
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

        return res.status(200).json({ success: true, transactions });
    } catch (error: any) {
        return res.status(400).json({ success: false, error: error.message });
    }
}
