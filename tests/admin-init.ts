import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SimpleVault } from "../target/types/simple_vault";
import { 
  TOKEN_PROGRAM_ID, 
  createMint, 
  createAccount, 
  mintTo,
  getAssociatedTokenAddress,
  createAssociatedTokenAccount,
} from "@solana/spl-token";
import { 
  SystemProgram, 
  SYSVAR_RENT_PUBKEY,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import contract_info from "../contract_info.json";

describe("admin_initialization", () => {
  // Set Anchor environment
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SimpleVault as Program<SimpleVault>;
  
  // Declare all needed variables
  let tokenMint: PublicKey;              // USDT token mint address
  let vaultPDA: PublicKey;               // Vault PDA address
  let vaultTokenAccount: PublicKey;      // Vault token account address
  let owner: Keypair;                    // Admin/Owner wallet
  let rewardSourceAccount: PublicKey;    // Reward source account
  
  // Vault configuration parameters
  const vaultName = contract_info.vault_name;         // Vault name
  const vaultNameBuffer = Buffer.alloc(32);
  vaultNameBuffer.write(vaultName);
  
  it("Initialize vault contract (Admin Only)", async () => {
    console.log("🚀 Start initializing Vault contract...");
    
    // ========== Step 1: Load local Admin wallet ==========
    console.log("\n📋 Step 1: Load local Admin wallet");
    
    // Try multiple possible id.json paths
    const possiblePaths = [
      `${os.homedir()}/.config/solana/id.json`,
      `${os.homedir()}/.config/solana/devnet.json`,
      `${os.homedir()}/solana-keypair.json`,
      `./id.json`,
      `../id.json`
    ];
    
    let adminKeypairData: number[] | null = null;
    let usedPath = "";
    
    for (const path of possiblePaths) {
      try {
        if (fs.existsSync(path)) {
          const data = fs.readFileSync(path, "utf8");
          adminKeypairData = JSON.parse(data);
          usedPath = path;
          console.log(`✅ Found admin wallet file: ${path}`);
          break;
        }
      } catch (error) {
        console.log(`⚠️  Unable to read ${path}: ${error}`);
      }
    }
    
    if (!adminKeypairData) {
      throw new Error("❌ Admin wallet file not found. Please ensure ~/.config/solana/id.json exists");
    }
    
    // Create Keypair object
    owner = Keypair.fromSecretKey(Buffer.from(adminKeypairData));
    console.log(`✅ Admin wallet address: ${owner.publicKey.toString()}`);
    console.log(`📁 Used wallet file: ${usedPath}`);
    
    // Verify wallet address matches
    const expectedAddress = "3FJ4EYCddqi4HpGnvXNPuFFwVpoZYahoC2W6y4aY6fxv";
    if (owner.publicKey.toString() === expectedAddress) {
      console.log(`✅ Wallet address verification successful: ${expectedAddress}`);
    } else {
      console.log(`⚠️  Wallet address mismatch:`);
      console.log(`   Expected: ${expectedAddress}`);
      console.log(`   Actual: ${owner.publicKey.toString()}`);
    }
    
    // Check SOL balance
    const balance = await provider.connection.getBalance(owner.publicKey);
    console.log(`✅ Admin wallet SOL balance: ${balance / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    
    // ========== Step 2: Create USDT Token Mint ==========
    console.log("\n📋 Step 2: Create USDT Token Mint (6 decimal places)");
    
    // Check if there is a pre-configured token mint
    if (contract_info && contract_info.usdt_address) {
      console.log("📝 Using pre-configured USDT token mint...");
      tokenMint = new PublicKey(contract_info.usdt_address);
      console.log(`✅ Using existing USDT Token Mint: ${tokenMint.toString()}`);
    } else {
      console.log("📝 Creating new USDT token mint...");
      tokenMint = await createMint(
        provider.connection,
        owner,                    // Payer
        owner.publicKey,          // mint authority
        null,                     // freeze authority (not set)
        6                         // USDT standard 6 decimal places
      );
      console.log(`✅ Newly created USDT Token Mint: ${tokenMint.toString()}`);
    }

    // ========== Step 3: Calculate all PDA addresses ==========
    console.log("\n📋 Step 3: Calculate all PDA addresses");
    
    // Vault PDA: ["vault", vault_name]
    [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), vaultNameBuffer],
      program.programId
    );
    console.log(`✅ Vault PDA: ${vaultPDA.toString()}`);
    
    // Vault Token Account PDA: ["vault_token_account", vault_pda]
    [vaultTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_token_account"), vaultPDA.toBuffer()],
      program.programId
    );
    console.log(`✅ Vault Token Account: ${vaultTokenAccount.toString()}`);
    
    
    // ========== Step 4: Create reward source account ==========
    console.log("\n📋 Step 4: Create reward source account");
    
    try {
      // Use Associated Token Account
      rewardSourceAccount = await getAssociatedTokenAddress(
        tokenMint,
        owner.publicKey
      );
      
      // Check if account already exists
      const accountInfo = await provider.connection.getAccountInfo(rewardSourceAccount);
      if (!accountInfo) {
        console.log("📝 Creating Associated Token Account...");
        await createAssociatedTokenAccount(
          provider.connection,
          owner,                    // Payer
          tokenMint,               // token mint  
          owner.publicKey          // Account owner
        );
      }
      
      console.log(`✅ Reward source account: ${rewardSourceAccount.toString()}`);
    } catch (error) {
      console.error("❌ Failed to create reward source account:", error);
      
      // Fall back to regular token account creation
      console.log("🔄 Trying to create regular token account...");
      rewardSourceAccount = await createAccount(
        provider.connection,
        owner,                    // Payer
        tokenMint,               // token mint
        owner.publicKey          // Account owner
      );
      console.log(`✅ Reward source account (regular): ${rewardSourceAccount.toString()}`);
    }
    
    // ========== Step 5: Mint USDT to reward source account ==========
    console.log("\n📋 Step 5: Mint USDT to reward source account");
    const rewardAmount = 1_000_000; // 1 USDT
    
    try {
      await mintTo(
        provider.connection,
        owner,
        tokenMint,
        rewardSourceAccount,
        owner.publicKey,
        rewardAmount
      );
      console.log(`✅ Minted ${rewardAmount / 1e6} USDT to reward source account`);
    } catch (error) {
      console.error("❌ Failed to mint USDT:", error);
      console.log("⚠️  Possible reasons:");
      console.log("   1. Current wallet is not the authority of token mint");
      console.log("   2. Using existing token mint, no mint authority");
      console.log("   3. Need to get USDT from other sources");
      
      // If mint fails, skip this step but continue with initialization
      console.log("🔄 Skipping minting step, continuing with initialization...");
    }
    
    console.log(`📝 Note: rewardsTokenAccount should maintain a balance of 0, this is normal`);
    
    // ========== Step 6: Initialize Vault contract ==========
    console.log("\n📋 Step 6: Initialize Vault contract");
    console.log("📝 Vault configuration parameters:");
    console.log(`   - Name: ${vaultName}`);
    console.log(`   - Platform account: ${contract_info.platform_account} (receives 50% of rewards)`);
    console.log(`   - Unstake lockup period: ${contract_info.unstake_lockup_period} hours`);
    console.log(`   - Management fee: ${contract_info.management_fee}% annualized`);
    console.log(`   - Minimum stake amount: ${contract_info.min_stake_amount} USDT`);
    console.log(`   - Maximum total assets: Unlimited`);
    
    await program.methods
      .initializeVault({
        name: Array.from(vaultNameBuffer),           // Vault name (32 bytes)
        platformAccount: new PublicKey(contract_info.platform_account), // Platform account for 50% reward sharing
        unstakeLockupPeriod: new anchor.BN(contract_info.unstake_lockup_period * 60 * 60), // 24h lockup period (minimum requirement)
        managementFee: new anchor.BN(contract_info.management_fee),           // 0% annualized management fee (000 basis points)
        minStakeAmount: new anchor.BN(contract_info.min_stake_amount * 1e6),    // 1 USDT minimum stake
        maxTotalAssets: null,                        // Unlimited total assets
      })
      .accounts({
        vault: vaultPDA,                             // Vault PDA
        owner: owner.publicKey,                      // Admin wallet
        tokenMint: tokenMint,                        // USDT mint
        vaultTokenAccount: vaultTokenAccount,        // Vault token account
        tokenProgram: TOKEN_PROGRAM_ID,              // SPL Token program
        systemProgram: SystemProgram.programId,     // System program
        rent: SYSVAR_RENT_PUBKEY,                   // Rent sysvar
      })
      .signers([owner])                             // Admin signature
      .rpc();
    
    console.log("✅ Vault contract initialization successful!");
    
    // ========== Step 7: Verify initialization results ==========
    console.log("\n📋 Step 7: Verify initialization results");
    const vault = await program.account.vault.fetch(vaultPDA);
    
    console.log("🔍 Vault status verification:");
    console.log(`   ✅ Owner: ${vault.owner.toString()}`);
    console.log(`   ✅ Platform Account: ${vault.platformAccount.toString()}`);
    console.log(`   ✅ Token Mint: ${vault.tokenMint.toString()}`);
    console.log(`   ✅ Total Shares: ${vault.totalShares.toString()}`);
    console.log(`   ✅ Total Assets: ${vault.totalAssets.toString()}`);
    console.log(`   ✅ Management Fee: ${vault.managementFee.toString()} basis points (${vault.managementFee.toNumber() / 100}%)`);
    console.log(`   ✅ Min Stake Amount: ${vault.minStakeAmount.toNumber() / 1e6} USDT`);
    console.log(`   ✅ Lockup Period: ${vault.unstakeLockupPeriod.toNumber() / 3600} hours`);
    console.log(`   ✅ Is Paused: ${vault.isPaused}`);
    console.log(`   ✅ Created At: ${new Date(vault.createdAt.toNumber() * 1000).toISOString()}`);
    
    // ========== Initialization complete summary ==========
    console.log("\n🎉 ========== Initialization complete summary ==========");
    console.log(`🏛️  Vault name: ${vaultName}`);
    console.log(`🔑 Admin address: ${owner.publicKey.toString()}`);
    console.log(`💰 Token Mint: ${tokenMint.toString()}`);
    console.log(`📦 Vault PDA: ${vaultPDA.toString()}`);
    console.log(`🏦 Vault Token Account: ${vaultTokenAccount.toString()}`);
    console.log(`💸 Reward source account: ${rewardSourceAccount.toString()}`);
    console.log(`💼 Management fee: ${vault.managementFee.toNumber() / 100}% annualized`);
    console.log(`⏰ Unstake lockup period: ${vault.unstakeLockupPeriod.toNumber() / 86400} days`);
    console.log(`💵 Minimum stake: ${vault.minStakeAmount.toNumber() / 1e6} USDT`);
    console.log("\n✅ Vault has been successfully initialized, users can now start staking!");
    
    // ========== Save important information to environment variables ==========
    console.log("\n📝 Suggest saving the following information to environment variables:");
    console.log(`export VAULT_PROGRAM_ID="${program.programId.toString()}"`);
    console.log(`export VAULT_NAME="${vaultName}"`);
    console.log(`export TOKEN_MINT="${tokenMint.toString()}"`);
    console.log(`export VAULT_PDA="${vaultPDA.toString()}"`);
    console.log(`export ADMIN_WALLET="${owner.publicKey.toString()}"`);
    console.log(`export RPC_URL="https://api.devnet.solana.com"`);
  });
});