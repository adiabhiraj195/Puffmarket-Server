import { Request, Response } from "express";
import db from "../lib/db";

export async function createCollection(req: any, res: Response) {
    try {
        const userAddress = req.user?.address;
        if (!userAddress) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const { contractAddress, name, symbol } = req.body;
        if (!contractAddress || !name || !symbol) {
            return res.status(400).json({ error: "Missing required fields: contractAddress, name, symbol" });
        }

        const normalizedAddress = contractAddress.toLowerCase();

        // Check if collection already exists
        const existing = await db.collection.findUnique({
            where: { contractAddress: normalizedAddress }
        });

        if (existing) {
            return res.status(400).json({ error: "Collection with this contract address already registered" });
        }

        const collection = await db.collection.create({
            data: {
                contractAddress: normalizedAddress,
                name,
                symbol,
                ownerAddress: userAddress.toLowerCase()
            }
        });

        // Retroactively link any existing NFTs of this contractAddress to the new collection
        await db.nFT.updateMany({
            where: { contractAddress: normalizedAddress },
            data: { collectionAddress: normalizedAddress }
        });

        console.log(`[Collection] Registered new collection: ${name} (${symbol}) at ${normalizedAddress} and linked existing NFTs`);
        return res.status(200).json({ success: true, collection });
    } catch (error: any) {
        console.error("[Collection] Create error:", error);
        return res.status(500).json({ error: error.message });
    }
}

export async function getUserCollections(req: any, res: Response) {
    try {
        const userAddress = req.user?.address;
        if (!userAddress) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const collections = await db.collection.findMany({
            where: {
                ownerAddress: userAddress.toLowerCase()
            },
            orderBy: {
                createdAt: "desc"
            }
        });

        return res.json(collections);
    } catch (error: any) {
        console.error("[Collection] Get user collections error:", error);
        return res.status(500).json({ error: error.message });
    }
}

export async function getAllCollections(req: Request, res: Response) {
    try {
        const collections = await db.collection.findMany({
            include: {
                nfts: {
                    select: { id: true }
                }
            },
            orderBy: {
                createdAt: "desc"
            }
        });
        const mapped = collections.map(c => ({
            id: c.id,
            contractAddress: c.contractAddress,
            name: c.name,
            symbol: c.symbol,
            ownerAddress: c.ownerAddress,
            createdAt: c.createdAt,
            nftCount: c.nfts.length
        }));
        return res.json(mapped);
    } catch (error: any) {
        console.error("[Collection] Get all collections error:", error);
        return res.status(500).json({ error: error.message });
    }
}

export async function getCollectionDetails(req: Request, res: Response) {
    try {
        const { contractAddress } = req.params;
        if (!contractAddress) {
            return res.status(400).json({ error: "Missing contract address" });
        }

        const normalizedAddress = contractAddress.toLowerCase();

        // 1. Fetch collection details
        const collection = await db.collection.findUnique({
            where: { contractAddress: normalizedAddress },
            include: {
                owner: true
            }
        });

        if (!collection) {
            return res.status(404).json({ error: "Collection not found" });
        }

        // 2. Fetch all NFTs in the collection
        const nfts = await db.nFT.findMany({
            where: {
                collectionAddress: normalizedAddress
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

        // 3. Map NFTs with gateway URL
        const PINATA_GATEWAY = "https://sapphire-keen-aardvark-438.mypinata.cloud/ipfs/";
        const mappedNfts = nfts.map(nft => {
            const isListed = nft.listings.length > 0;
            return {
                id: nft.id,
                tokenId: nft.tokenId.includes('-') ? nft.tokenId.split('-')[1] : nft.tokenId,
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

        // 4. Fetch all transfers for history
        const tokenIds = nfts.map(n => n.tokenId);
        const transfers = await db.transfer.findMany({
            where: {
                tokenId: {
                    in: tokenIds
                }
            },
            include: {
                nft: true
            },
            orderBy: {
                timestamp: "desc"
            }
        });

        const mappedTransfers = transfers.map(t => ({
            id: t.id,
            tokenId: t.tokenId.includes('-') ? t.tokenId.split('-')[1] : t.tokenId,
            nftName: t.nft.name,
            from: t.from,
            to: t.to,
            type: t.type,
            price: t.price,
            txHash: t.txHash,
            timestamp: t.timestamp
        }));

        // 5. Calculate Metrics
        // Unique owners
        const uniqueOwners = new Set(nfts.map(n => n.ownerAddress.toLowerCase()));
        const holderCount = uniqueOwners.size;

        // Total floor price (minimum price among all active listings)
        let floorPrice = "0";
        const listedNfts = mappedNfts.filter(n => n.isListed && n.listing?.price);
        if (listedNfts.length > 0) {
            const prices = listedNfts.map(n => Number(n.listing!.price!));
            let minPrice = prices[0];
            for (let i = 1; i < prices.length; i++) {
                if (prices[i] < minPrice) {
                    minPrice = prices[i];
                }
            }
            floorPrice = minPrice.toString();
        }

        // Total price of all active listings combined
        let totalListedValue = "0";
        if (listedNfts.length > 0) {
            const sum = listedNfts.reduce((acc, n) => acc + Number(n.listing!.price!), 0);
            totalListedValue = sum.toString();
        }

        let totalVolume = "0";
        const sales = transfers.filter(t => t.type === "SALE" || t.type === "AUCTION");
        if (sales.length > 0) {
            const sum = sales.reduce((acc, t) => acc + Number(t.price || "0"), 0);
            totalVolume = sum.toString();
        }

        // Top NFT: NFT with the highest single sale price. If no sales, the NFT with the highest listed price.
        let topNft = null;
        let highestSale = 0;

        for (const sale of sales) {
            const salePrice = Number(sale.price || "0");
            if (salePrice > highestSale) {
                highestSale = salePrice;
                const matchingNft = mappedNfts.find(n => {
                    const cleanId = n.tokenId;
                    const cleanSaleId = sale.tokenId.includes('-') ? sale.tokenId.split('-')[1] : sale.tokenId;
                    return cleanId === cleanSaleId;
                });
                if (matchingNft) {
                    topNft = {
                        ...matchingNft,
                        topPrice: salePrice.toString(),
                        topPriceType: "sale"
                    };
                }
            }
        }

        // If no sales, check listings
        if (!topNft && listedNfts.length > 0) {
            let highestList = 0;
            for (const n of listedNfts) {
                const listPrice = Number(n.listing!.price!);
                if (listPrice > highestList) {
                    highestList = listPrice;
                    topNft = {
                        ...n,
                        topPrice: listPrice.toString(),
                        topPriceType: "listing"
                    };
                }
            }
        }

        // If still no top NFT, default to first NFT in collection (if any)
        if (!topNft && mappedNfts.length > 0) {
            topNft = {
                ...mappedNfts[0],
                topPrice: "0",
                topPriceType: "none"
            };
        }

        return res.json({
            success: true,
            collection: {
                id: collection.id,
                contractAddress: collection.contractAddress,
                name: collection.name,
                symbol: collection.symbol,
                createdAt: collection.createdAt,
                owner: {
                    id: collection.owner.id,
                    address: collection.owner.walletAddress,
                    username: collection.owner.username
                }
            },
            nfts: mappedNfts,
            history: mappedTransfers,
            metrics: {
                nftCount: mappedNfts.length,
                holderCount,
                floorPrice,
                totalListedValue,
                totalVolume,
            },
            topNft
        });
    } catch (error: any) {
        console.error("[Collection] Get collection details error:", error);
        return res.status(500).json({ error: error.message });
    }
}

