import { ethers } from "ethers";
import fs from "fs";

// Load deployments
const tokenDeployment = JSON.parse(fs.readFileSync("/Users/adityaraj/Documents/Web3 Stuff/contract-puff-market/deployments/localhost/PUFFTOKEN.json", "utf-8"));
const nftDeployment = JSON.parse(fs.readFileSync("/Users/adityaraj/Documents/Web3 Stuff/contract-puff-market/deployments/localhost/PuffNFT.json", "utf-8"));
const marketplaceDeployment = JSON.parse(fs.readFileSync("/Users/adityaraj/Documents/Web3 Stuff/contract-puff-market/deployments/localhost/NftMarketplace.json", "utf-8"));

const PUFF_TOKEN_ADDRESS = tokenDeployment.address;
const PUFF_NFT_ADDRESS = nftDeployment.address;
const MARKETPLACE_ADDRESS = marketplaceDeployment.address;

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function loginUser(wallet: ethers.Wallet) {
    const address = wallet.address;
    console.log(`[Test] SIWE: Requesting nonce for ${address}...`);
    const nonceRes = await fetch("http://127.0.0.1:5001/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address })
    });
    const nonceData = await nonceRes.json() as any;
    if (!nonceData.message) {
        throw new Error(`Failed to get nonce: ${JSON.stringify(nonceData)}`);
    }
    const { message } = nonceData;
    console.log(`[Test] SIWE: Signing message...`);
    const signature = await wallet.signMessage(message);
    
    console.log(`[Test] SIWE: Verifying signature...`);
    const verifyRes = await fetch("http://127.0.0.1:5001/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature, address })
    });
    const verifyData = await verifyRes.json() as any;
    if (!verifyData.success) {
        throw new Error(`SIWE Verification failed: ${JSON.stringify(verifyData)}`);
    }
    console.log(`[Test] SIWE: Success! Token acquired.`);
    return verifyData.token;
}

async function main() {
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    
    // Hardhat Account #0
    const key0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const wallet0 = new ethers.Wallet(key0, provider);
    
    // Hardhat Account #1
    const key1 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
    const wallet1 = new ethers.Wallet(key1, provider);
    
    console.log("----------------------------------------------------------------");
    console.log(`Account 0: ${wallet0.address}`);
    console.log(`Account 1: ${wallet1.address}`);
    console.log(`PuffToken Contract: ${PUFF_TOKEN_ADDRESS}`);
    console.log(`PuffNFT Contract: ${PUFF_NFT_ADDRESS}`);
    console.log(`Marketplace Contract: ${MARKETPLACE_ADDRESS}`);
    console.log("----------------------------------------------------------------");
    
    // 1. SIWE Logins
    const token0 = await loginUser(wallet0);
    const token1 = await loginUser(wallet1);
    
    // 2. Faucet Claims
    const tokenContract0 = new ethers.Contract(PUFF_TOKEN_ADDRESS, tokenDeployment.abi, wallet0);
    const tokenContract1 = new ethers.Contract(PUFF_TOKEN_ADDRESS, tokenDeployment.abi, wallet1);
    
    console.log("\n[Test] Checking PUFF balances before Faucet claim...");
    let bal0 = await tokenContract0.balanceOf(wallet0.address);
    let bal1 = await tokenContract1.balanceOf(wallet1.address);
    console.log(`Account 0 PUFF Balance: ${ethers.formatUnits(bal0, 18)} PUFF`);
    console.log(`Account 1 PUFF Balance: ${ethers.formatUnits(bal1, 18)} PUFF`);
    
    let nonce0 = await provider.getTransactionCount(wallet0.address);
    let nonce1 = await provider.getTransactionCount(wallet1.address);
    
    console.log("\n[Test] Account 0: Calling Faucet...");
    try {
        const faucetTx0 = await tokenContract0.faucet({ nonce: nonce0 });
        await faucetTx0.wait();
        console.log(`[Test] Faucet claimed for Account 0. Tx: ${faucetTx0.hash}`);
        nonce0++;
    } catch (err: any) {
        if (err.message.includes("Cooldown active") || (err.data && err.data.includes("Cooldown active")) || JSON.stringify(err).includes("Cooldown active")) {
            console.log("[Test] Faucet cooldown active for Account 0 (already claimed). Skipping.");
        } else {
            throw err;
        }
    }
    
    console.log("\n[Test] Account 1: Calling Faucet...");
    try {
        const faucetTx1 = await tokenContract1.faucet({ nonce: nonce1 });
        await faucetTx1.wait();
        console.log(`[Test] Faucet claimed for Account 1. Tx: ${faucetTx1.hash}`);
        nonce1++;
    } catch (err: any) {
        if (err.message.includes("Cooldown active") || (err.data && err.data.includes("Cooldown active")) || JSON.stringify(err).includes("Cooldown active")) {
            console.log("[Test] Faucet cooldown active for Account 1 (already claimed). Skipping.");
        } else {
            throw err;
        }
    }
    
    bal0 = await tokenContract0.balanceOf(wallet0.address);
    bal1 = await tokenContract1.balanceOf(wallet1.address);
    console.log(`Account 0 PUFF Balance after claim stage: ${ethers.formatUnits(bal0, 18)} PUFF`);
    console.log(`Account 1 PUFF Balance after claim stage: ${ethers.formatUnits(bal1, 18)} PUFF`);
    
    // 3. Mint NFT (Account 0)
    const nftContract0 = new ethers.Contract(PUFF_NFT_ADDRESS, nftDeployment.abi, wallet0);
    console.log("\n[Test] Account 0: Minting new NFT...");
    const tokenURI = ""; // Empty tokenURI ensures indexer skips IPFS resolution delay
    const mintTx = await nftContract0.mintNFT(wallet0.address, tokenURI, { nonce: nonce0++ });
    const receipt = await mintTx.wait();
    console.log(`[Test] NFT Mint Tx mined. Tx hash: ${mintTx.hash}`);
    
    // Parse receipt logs to get the assigned tokenId
    let tokenId = "";
    const iface = new ethers.Interface(nftDeployment.abi);
    for (const log of receipt.logs) {
        try {
            const parsed = iface.parseLog(log);
            if (parsed && parsed.name === "Transfer") {
                tokenId = parsed.args.tokenId.toString();
                break;
            }
        } catch (e) {}
    }
    
    if (!tokenId) {
        throw new Error("Could not find Transfer event in transaction logs to extract tokenId");
    }
    console.log(`[Test] NFT Minted successfully! Assigned TokenId: ${tokenId}`);
    
    // Give indexer 8 seconds to process Transfer event
    console.log("[Test] Waiting 8 seconds for indexer to sync the mint...");
    await sleep(8000);
    
    // Check backend to see if NFT is indexed
    console.log("\n[Test] Verifying NFT indexing in DB...");
    const userNftsRes = await fetch("http://127.0.0.1:5001/api/nft/user", {
        headers: { "Authorization": `Bearer ${token0}` }
    });
    const userNfts = await userNftsRes.json() as any[];
    console.log(`[Test] Account 0 owns ${userNfts.length} indexed NFTs.`);
    const matchingNft = userNfts.find(n => n.tokenId === tokenId.toString());
    if (!matchingNft) {
        console.error("[Test] ERROR: Minted NFT was not found in the backend database.");
        process.exit(1);
    }
    console.log(`[Test] Success: Found NFT in DB. ID: ${matchingNft.id}`);
    
    // 4. Approve & List NFT on Marketplace (Account 0)
    console.log("\n[Test] Account 0: Approving Marketplace for NFT...");
    const approveNftTx = await nftContract0.approve(MARKETPLACE_ADDRESS, tokenId, { nonce: nonce0++ });
    await approveNftTx.wait();
    console.log("[Test] Marketplace approved for NFT.");
    
    console.log("\n[Test] Account 0: Listing NFT on Marketplace...");
    const listPrice = ethers.parseUnits("1000", 18); // 1000 PUFF
    const marketplace0 = new ethers.Contract(MARKETPLACE_ADDRESS, marketplaceDeployment.abi, wallet0);
    const listTx = await marketplace0.listItem(PUFF_NFT_ADDRESS, tokenId, listPrice, PUFF_TOKEN_ADDRESS, { nonce: nonce0++ });
    await listTx.wait();
    console.log(`[Test] NFT Listed on-chain! Tx: ${listTx.hash}`);
    
    // Trigger optimistic listing notification to backend
    console.log("[Test] Sending listing notification to backend...");
    const listNotifyRes = await fetch("http://127.0.0.1:5001/api/listings", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token0}`
        },
        body: JSON.stringify({
            tokenId: tokenId.toString(),
            price: "1000",
            txHash: listTx.hash
        })
    });
    const listNotifyData = await listNotifyRes.json() as any;
    console.log(`[Test] Backend listings notification response:`, listNotifyData);
    
    // Give indexer 8 seconds to process Listing event
    console.log("[Test] Waiting 8 seconds for indexer to sync the listing...");
    await sleep(8000);
    
    // Verify listing is active in backend
    console.log("\n[Test] Verifying active listings in backend...");
    const activeListingsRes = await fetch("http://127.0.0.1:5001/api/nft/listings");
    const activeListings = await activeListingsRes.json() as any[];
    console.log(`[Test] Found ${activeListings.length} active listings.`);
    const matchingListing = activeListings.find(l => l.nft.tokenId === tokenId.toString());
    if (!matchingListing) {
        console.error("[Test] ERROR: Listed NFT was not found in the active listings backend API.");
        process.exit(1);
    }
    console.log(`[Test] Success: Found active listing in DB. ID: ${matchingListing.id}, Price: ${matchingListing.price} PUFF`);
    
    // 5. Approve & Buy NFT (Account 1)
    console.log("\n[Test] Account 1: Approving Marketplace to spend 1000 PUFF...");
    const approveTokenTx = await tokenContract1.approve(MARKETPLACE_ADDRESS, listPrice, { nonce: nonce1++ });
    await approveTokenTx.wait();
    console.log("[Test] Marketplace approved for PUFF spending.");
    
    console.log("\n[Test] Account 1: Buying NFT from Marketplace...");
    const marketplace1 = new ethers.Contract(MARKETPLACE_ADDRESS, marketplaceDeployment.abi, wallet1);
    const buyTx = await marketplace1.buyItem(PUFF_NFT_ADDRESS, tokenId, { nonce: nonce1++ });
    await buyTx.wait();
    console.log(`[Test] Purchase complete on-chain! Tx: ${buyTx.hash}`);

    
    // Call the backend buy API immediately (simulating BuyModal.tsx)
    console.log("[Test] Calling backend buy API (simulating BuyModal.tsx)...");
    const buyApiRes = await fetch(`http://127.0.0.1:5001/api/nft/buy/${matchingNft.id}`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token1}`
        },
        body: JSON.stringify({
            sellerId: wallet0.address,
            txHash: buyTx.hash,
            price: "1000"
        })
    });
    const buyApiData = await buyApiRes.json() as any;
    console.log(`[Test] Backend buy API response:`, buyApiData);

    // Give indexer 8 seconds to process Purchase event
    console.log("[Test] Waiting 8 seconds for indexer to sync purchase event...");

    await sleep(8000);
    
    // 6. Verify Ownership Update and Listing Sold
    console.log("\n[Test] Verifying ownership and listing updates in DB...");
    const nftDetailsRes = await fetch(`http://127.0.0.1:5001/api/nft/${matchingNft.id}`);
    const nftDetails = await nftDetailsRes.json() as any;
    console.log(`[Test] NFT owner in DB: ${nftDetails.nft.owner.address}`);
    console.log(`[Test] NFT isListed status in DB: ${nftDetails.nft.isListed}`);
    
    if (nftDetails.nft.owner.address.toLowerCase() !== wallet1.address.toLowerCase()) {
        console.error(`[Test] ERROR: NFT owner was not updated to Account 1 (${wallet1.address}) in database.`);
        process.exit(1);
    }
    if (nftDetails.nft.isListed) {
        console.error("[Test] ERROR: NFT is still marked as listed in database.");
        process.exit(1);
    }
    
    console.log("\n----------------------------------------------------------------");
    console.log("🎉 SUCCESS: ALL flow stages executed and verified successfully!");
    console.log("----------------------------------------------------------------");
    process.exit(0);
}

main().catch(err => {
    console.error("\n[Test] FATAL: Flow test failed with error:", err);
    process.exit(1);
});
