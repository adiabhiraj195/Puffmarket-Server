import { ethers } from "ethers";
import db from "./db";

export const PUFF_NFT_ADDRESS = process.env.PUFF_NFT_ADDRESS || "0x0165878a594ca255338adfa4d48449f69242eb8f";
export const MARKETPLACE_ADDRESS = process.env.MARKETPLACE_ADDRESS || "0xdc64a140aa3e981100a9beca4e685f962f0cf6c9";

const PUFF_NFT_ABI = [
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    "function tokenURI(uint256 tokenId) view returns (string)"
];

const MARKETPLACE_ABI = [
    "event ItemListed(address indexed seller, address indexed nftAddress, uint256 indexed tokenId, uint256 price, address paymentToken)",
    "event ItemBought(address indexed buyer, address indexed nftAddress, uint256 indexed tokenId, uint256 price, address paymentToken)"
];

export function startIndexer(io?: any) {
    const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
    console.log(`[Indexer] Initializing event indexer connecting to ${rpcUrl}...`);
    console.log(`[Indexer] NFT Contract Address: ${PUFF_NFT_ADDRESS}`);
    console.log(`[Indexer] Marketplace Contract Address: ${MARKETPLACE_ADDRESS}`);

    try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const nftContract = new ethers.Contract(PUFF_NFT_ADDRESS, PUFF_NFT_ABI, provider);
        const marketplaceContract = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, provider);

        const extractCID = (url: string): string => {
            if (!url) return "";
            if (url.startsWith("ipfs://")) return url.replace("ipfs://", "");
            const match = url.match(/\/ipfs\/([^\/?#]+)/);
            return match ? match[1] : url;
        };

        // 1. Transfer event listener
        nftContract.on("Transfer", async (from: string, to: string, tokenId: any, event: any) => {
            try {
                const tokenStr = tokenId.toString();
                const txHash = event?.log?.transactionHash || event?.transactionHash || "";
                const blockNumber = event?.log?.blockNumber || event?.blockNumber || 0;

                let timestamp = new Date();
                try {
                    const block = await provider.getBlock(blockNumber);
                    if (block) {
                        timestamp = new Date(block.timestamp * 1000);
                    }
                } catch (err) {
                    console.error(`[Indexer] Failed to fetch block details for block ${blockNumber}:`, err);
                }

                console.log(`[Indexer] Caught Transfer Event: from=${from}, to=${to}, tokenId=${tokenStr}, txHash=${txHash}`);

                // Find or create the receiving user
                let user = await db.user.findUnique({
                    where: { walletAddress: to.toLowerCase() }
                });
                if (!user) {
                    user = await db.user.create({
                        data: { walletAddress: to.toLowerCase() }
                    });
                }

                // Also make sure from user exists
                let fromUser = await db.user.findUnique({
                    where: { walletAddress: from.toLowerCase() }
                });
                if (!fromUser) {
                    fromUser = await db.user.create({
                        data: { walletAddress: from.toLowerCase() }
                    });
                }

                // Fetch the tokenURI on-chain
                let tokenURI = "";
                try {
                    tokenURI = await nftContract.tokenURI(tokenId);
                } catch (err) {
                    console.error(`[Indexer] Failed to query tokenURI for tokenId ${tokenStr}:`, err);
                }

                // Resolve metadata from the tokenURI
                let name = `Puff NFT #${tokenStr}`;
                let description = "";
                let imageURI = "";
                let thumbnailURI = "";
                let attributes: any[] = [];
                let properties = {};
                let mediaType: "IMAGE" | "VIDEO" = "IMAGE";

                if (tokenURI) {
                    try {
                        let fetchUrl = tokenURI;
                        if (tokenURI.startsWith("ipfs://")) {
                            fetchUrl = `https://sapphire-keen-aardvark-438.mypinata.cloud/ipfs/${tokenURI.replace("ipfs://", "")}`;
                        }
                        const response = await fetch(fetchUrl);
                        if (response.ok) {
                            const metadata = await response.json();
                            name = metadata.name || name;
                            description = metadata.description || "";
                            imageURI = metadata.image || metadata.thumbnail || "";
                            thumbnailURI = metadata.thumbnail || imageURI || "";
                            attributes = metadata.traits || metadata.attributes || [];
                            properties = metadata;
                            if (metadata.type && metadata.type.toLowerCase() === "video") {
                                mediaType = "VIDEO";
                            }
                        }
                    } catch (err) {
                        console.error(`[Indexer] Failed to fetch metadata for ${tokenURI}:`, err);
                    }
                }

                const contractAddress = PUFF_NFT_ADDRESS.toLowerCase();
                const dbTokenId = `${contractAddress}-${tokenStr}`;
                const existingNft = await db.nFT.findUnique({
                    where: { tokenId: dbTokenId }
                });

                if (existingNft) {
                    await db.nFT.update({
                        where: { id: existingNft.id },
                        data: {
                            ownerAddress: to.toLowerCase(),
                            confirmed: true,
                            mintBlockNumber: blockNumber,
                            mintTxHash: txHash || existingNft.mintTxHash
                        }
                    });
                    console.log(`[Indexer] Successfully updated NFT details in DB (TokenId: ${dbTokenId}, Owner: ${to.toLowerCase()})`);
                } else {
                    await db.nFT.create({
                        data: {
                            tokenId: dbTokenId,
                            contractAddress,
                            tokenURI,
                            metadataCID: extractCID(tokenURI),
                            mediaCID: extractCID(imageURI),
                            thumbnailCID: extractCID(thumbnailURI),
                            mediaType,
                            name,
                            description,
                            attributes: attributes as any,
                            properties: properties as any,
                            ownerAddress: to.toLowerCase(),
                            creatorAddress: from === "0x0000000000000000000000000000000000000000" ? to.toLowerCase() : from.toLowerCase(),
                            mintTxHash: txHash,
                            mintedAt: timestamp,
                            confirmed: true,
                            mintBlockNumber: blockNumber
                        }
                    });
                    console.log(`[Indexer] Successfully inserted new NFT in DB (TokenId: ${dbTokenId}, Owner: ${to.toLowerCase()})`);
                }

                // Record transfer
                const isMint = from === "0x0000000000000000000000000000000000000000";
                await db.transfer.upsert({
                    where: { txHash },
                    update: {},
                    create: {
                        tokenId: dbTokenId,
                        from: from.toLowerCase(),
                        to: to.toLowerCase(),
                        type: isMint ? "MINT" : "TRANSFER",
                        txHash,
                        blockNumber,
                        timestamp
                    }
                });


            } catch (error) {
                console.error("[Indexer] Error inside Transfer event listener callback:", error);
            }
        });

        // 2. ItemListed event listener
        marketplaceContract.on("ItemListed", async (sellerAddress: string, nftAddress: string, tokenId: any, priceInWei: any, paymentToken: string, event: any) => {
            try {

                const tokenStr = tokenId.toString();
                
                let decimals = 18;
                if (paymentToken && paymentToken !== ethers.ZeroAddress) {
                    try {
                        const tokenContract = new ethers.Contract(
                            paymentToken,
                            ["function decimals() view returns (uint8)"],
                            provider
                        );
                        decimals = await tokenContract.decimals();
                    } catch (err) {
                        console.error(`[Indexer] Failed to fetch decimals for token ${paymentToken}, defaulting to 18:`, err);
                    }
                }
                const priceInPuff = ethers.formatUnits(priceInWei, decimals);
                const txHash = event?.log?.transactionHash || event?.transactionHash || "";
                const blockNumber = event?.log?.blockNumber || event?.blockNumber || 0;

                let timestamp = new Date();
                try {
                    const block = await provider.getBlock(blockNumber);
                    if (block) {
                        timestamp = new Date(block.timestamp * 1000);
                    }
                } catch (err) { }

                console.log(`[Indexer] Caught ItemListed Event: seller=${sellerAddress}, nftAddress=${nftAddress}, tokenId=${tokenStr}, price=${priceInPuff}, paymentToken=${paymentToken}`);

                // Find or create the seller user
                let seller = await db.user.findUnique({
                    where: { walletAddress: sellerAddress.toLowerCase() }
                });
                if (!seller) {
                    seller = await db.user.create({
                        data: { walletAddress: sellerAddress.toLowerCase() }
                    });
                }

                const dbTokenId = `${nftAddress.toLowerCase()}-${tokenStr}`;

                // Find the NFT
                let nft = await db.nFT.findUnique({
                    where: { tokenId: dbTokenId }
                });

                if (!nft) {
                    console.log(`[Indexer] NFT not found. Creating placeholder NFT for listed item tokenId: ${dbTokenId}`);
                    let tokenURI = "";
                    let imageURI = "";
                    let name = `Puff NFT #${tokenStr}`;
                    let description = "";
                    let thumbnailURI = "";
                    let attributes: any[] = [];
                    let properties = {};
                    let mediaType: "IMAGE" | "VIDEO" = "IMAGE";

                    try {
                        const customNftContract = new ethers.Contract(nftAddress, PUFF_NFT_ABI, provider);
                        tokenURI = await customNftContract.tokenURI(tokenId);
                        if (tokenURI) {
                            let fetchUrl = tokenURI;
                            if (tokenURI.startsWith("ipfs://")) {
                                fetchUrl = `https://sapphire-keen-aardvark-438.mypinata.cloud/ipfs/${tokenURI.replace("ipfs://", "")}`;
                            }
                            const response = await fetch(fetchUrl);
                            if (response.ok) {
                                const metadata = await response.json();
                                name = metadata.name || name;
                                description = metadata.description || "";
                                imageURI = metadata.image || metadata.thumbnail || "";
                                thumbnailURI = metadata.thumbnail || imageURI || "";
                                attributes = metadata.traits || metadata.attributes || [];
                                properties = metadata;
                                if (metadata.type && metadata.type.toLowerCase() === "video") {
                                    mediaType = "VIDEO";
                                }
                            }
                        }
                    } catch (err) {
                        console.error(`[Indexer] Failed to fetch NFT details for missing NFT:`, err);
                    }

                    const hasCollection = await db.collection.findUnique({
                        where: { contractAddress: nftAddress.toLowerCase() }
                    });
                    const collectionAddress = hasCollection ? nftAddress.toLowerCase() : null;

                    nft = await db.nFT.create({
                        data: {
                            tokenId: dbTokenId,
                            contractAddress: nftAddress.toLowerCase(),
                            tokenURI,
                            metadataCID: extractCID(tokenURI),
                            mediaCID: extractCID(imageURI),
                            thumbnailCID: extractCID(thumbnailURI),
                            mediaType,
                            name,
                            description,
                            attributes: attributes as any,
                            properties: properties as any,
                            ownerAddress: sellerAddress.toLowerCase(),
                            creatorAddress: sellerAddress.toLowerCase(),
                            mintTxHash: txHash || "0x0000000000000000000000000000000000000000000000000000000000000000",
                            mintedAt: timestamp,
                            collectionAddress,
                            confirmed: false,
                            mintBlockNumber: blockNumber
                        }
                    });
                }

                // Check active listing
                let activeListing = await db.listing.findFirst({
                    where: {
                        tokenId: dbTokenId,
                        status: "ACTIVE"
                    }
                });

                if (activeListing) {
                    activeListing = await db.listing.update({
                        where: { id: activeListing.id },
                        data: { 
                            price: priceInPuff,
                            paymentToken: paymentToken.toLowerCase()
                        }
                    });
                } else {
                    activeListing = await db.listing.create({
                        data: {
                            tokenId: dbTokenId,
                            sellerAddress: sellerAddress.toLowerCase(),
                            price: priceInPuff,
                            paymentToken: paymentToken.toLowerCase(),
                            status: "ACTIVE",
                            listTxHash: txHash,
                            listBlockNumber: blockNumber,
                            createdAt: timestamp
                        }
                    });
                }


                // Record in PriceHistory
                await db.priceHistory.create({
                    data: {
                        listingId: activeListing.id,
                        price: priceInPuff,
                        isInitial: true,
                        txHash,
                        blockNumber,
                        timestamp
                    }
                });

                console.log(`[Indexer] Successfully synchronized listing in DB (NFT: ${tokenStr}, Price: ${priceInPuff}, Token: ${paymentToken})`);
            } catch (error) {
                console.error("[Indexer] Error inside ItemListed event listener callback:", error);
            }
        });

        // 3. ItemBought event listener
        marketplaceContract.on("ItemBought", async (buyerAddress: string, nftAddress: string, tokenId: any, priceInWei: any, paymentToken: string, event: any) => {
            try {
                const tokenStr = tokenId.toString();
                
                let decimals = 18;
                if (paymentToken && paymentToken !== ethers.ZeroAddress) {
                    try {
                        const tokenContract = new ethers.Contract(
                            paymentToken,
                            ["function decimals() view returns (uint8)"],
                            provider
                        );
                        decimals = await tokenContract.decimals();
                    } catch (err) {
                        console.error(`[Indexer] Failed to fetch decimals for token ${paymentToken}, defaulting to 18:`, err);
                    }
                }
                const priceInPuff = ethers.formatUnits(priceInWei, decimals);
                const txHash = event?.log?.transactionHash || event?.transactionHash || "";
                const blockNumber = event?.log?.blockNumber || event?.blockNumber || 0;

                let timestamp = new Date();
                try {
                    const block = await provider.getBlock(blockNumber);
                    if (block) {
                        timestamp = new Date(block.timestamp * 1000);
                    }
                } catch (err) { }

                console.log(`[Indexer] Caught ItemBought Event: buyer=${buyerAddress}, nftAddress=${nftAddress}, tokenId=${tokenStr}, price=${priceInPuff}, paymentToken=${paymentToken}, txHash=${txHash}`);

                // Find or create buyer user
                let buyer = await db.user.findUnique({
                    where: { walletAddress: buyerAddress.toLowerCase() }
                });
                if (!buyer) {
                    buyer = await db.user.create({
                        data: { walletAddress: buyerAddress.toLowerCase() }
                    });
                }

                const dbTokenId = `${nftAddress.toLowerCase()}-${tokenStr}`;

                // Find the NFT
                let nft = await db.nFT.findUnique({
                    where: { tokenId: dbTokenId }
                });

                if (!nft) {
                    console.error(`[Indexer ItemBought] Error: NFT not found in DB for contract: ${nftAddress}, tokenId: ${dbTokenId}`);
                    return;
                }

                // Update NFT owner address
                await db.nFT.update({
                    where: { id: nft.id },
                    data: {
                        ownerAddress: buyerAddress.toLowerCase()
                    }
                });

                // Update Listing to SOLD
                const activeListing = await db.listing.findFirst({
                    where: {
                        tokenId: dbTokenId,
                        status: "ACTIVE"
                    }
                });

                if (activeListing) {
                    await db.listing.update({
                        where: { id: activeListing.id },
                        data: {
                            status: "SOLD",
                            soldAt: timestamp,
                            buyerAddress: buyerAddress.toLowerCase(),
                            saleTxHash: txHash,
                            salePrice: priceInPuff
                        }
                    });

                    // Create Transfer record
                    await db.transfer.upsert({
                        where: { txHash },
                        update: {},
                        create: {
                            tokenId: dbTokenId,
                            from: activeListing.sellerAddress,
                            to: buyerAddress.toLowerCase(),
                            type: "SALE",
                            price: priceInPuff,
                            listingId: activeListing.id,
                            txHash,
                            blockNumber,
                            timestamp
                        }
                    });


                    // Emit nft:sold to seller's wallet room via Socket.io
                    if (io) {
                        const sellerAddress = activeListing.sellerAddress.toLowerCase();
                        io.to(sellerAddress).emit("nft:sold", {
                            tokenId: tokenStr,
                            price: priceInPuff
                        });
                        console.log(`[Indexer ItemBought] Emitted nft:sold to seller's wallet room: ${sellerAddress}`);
                    }
                } else {
                    console.warn(`[Indexer ItemBought] Warning: No active listing found for NFT ${nft.id} when bought.`);
                }

                console.log(`[Indexer] Successfully processed ItemBought in DB (NFT: ${tokenStr}, Buyer: ${buyerAddress})`);
            } catch (error) {
                console.error("[Indexer] Error inside ItemBought event listener callback:", error);
            }
        });

        console.log("[Indexer] Event indexer listeners started successfully.");
    } catch (err) {
        console.error("[Indexer] Failed to initialize indexer. Local hardhat node may be offline:", err);
    }
}
