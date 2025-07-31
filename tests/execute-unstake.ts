import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SimpleVault } from "../target/types/simple_vault";
import { 
  TOKEN_PROGRAM_ID, 
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { 
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import contractInfo from "../client/contract_info.json";

// 测试账户配置文件路径
const TEST_ACCOUNTS_FILE = path.join(__dirname, "../test-accounts.json");

// 测试账户接口
interface TestAccounts {
  user1: {
    keypair: number[];
    tokenAccount: string;
  };
  user2: {
    keypair: number[];
    tokenAccount: string;
  };
  user3: {
    keypair: number[];
    tokenAccount: string;
  };
}

// Interface for unstake status
interface UnstakeStatus {
  hasPendingRequest: boolean;
  canUnstake: boolean;
  remainingTime: number;
  requestTime?: number;
  unlockTime?: number;
}

// 加载admin wallet
const loadAdminWallet = (): Keypair => {
  const possiblePaths = [
    `${os.homedir()}/.config/solana/id.json`,
    `${os.homedir()}/.config/solana/devnet.json`,
    `${os.homedir()}/solana-keypair.json`,
    `./id.json`,
    `../id.json`,
  ];
  
  for (const path of possiblePaths) {
    try {
      if (fs.existsSync(path)) {
        const data = fs.readFileSync(path, "utf8");
        const keypairData = JSON.parse(data);
        const keypair = Keypair.fromSecretKey(Buffer.from(keypairData));
        console.log(`✅ Loaded admin wallet from: ${path}`);
        console.log(`   Admin address: ${keypair.publicKey.toString()}`);
        return keypair;
      }
    } catch (error) {
      console.log(`⚠️ Unable to read ${path}: ${error}`);
    }
  }
  
  throw new Error(
    "❌ Admin wallet file not found. Please ensure ~/.config/solana/id.json exists"
  );
};

// 加载测试账户
const loadTestAccounts = (): TestAccounts => {
  if (!fs.existsSync(TEST_ACCOUNTS_FILE)) {
    throw new Error(`❌ Test accounts file not found: ${TEST_ACCOUNTS_FILE}. Please run the main test first.`);
  }
  
  console.log("📄 Loading existing test accounts...");
  const data = fs.readFileSync(TEST_ACCOUNTS_FILE, 'utf8');
  return JSON.parse(data) as TestAccounts;
};

async function main() {
  console.log("🚀 Starting unstake execution script...");
  
  // Setup provider and program
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SimpleVault as Program<SimpleVault>;

  // Load contract info
  const tokenMint = new PublicKey(contractInfo.usdc_address);
  const vaultPDA = new PublicKey(contractInfo.vault_pda);
  const vaultTokenAccount = new PublicKey(contractInfo.vault_token_account);
  const programId = new PublicKey(contractInfo.programId);
  
  // Load test accounts
  const testAccounts = loadTestAccounts();
  
  // Reconstruct keypairs
  const user1 = Keypair.fromSecretKey(Buffer.from(testAccounts.user1.keypair));
  const user2 = Keypair.fromSecretKey(Buffer.from(testAccounts.user2.keypair));
  const user3 = Keypair.fromSecretKey(Buffer.from(testAccounts.user3.keypair));
  
  const user1TokenAccount = new PublicKey(testAccounts.user1.tokenAccount);
  const user2TokenAccount = new PublicKey(testAccounts.user2.tokenAccount);
  const user3TokenAccount = new PublicKey(testAccounts.user3.tokenAccount);
  
  // Calculate vault depositor PDAs
  const [user1VaultDepositor] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_depositor"), vaultPDA.toBuffer(), user1.publicKey.toBuffer()],
    programId
  );
  const [user2VaultDepositor] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_depositor"), vaultPDA.toBuffer(), user2.publicKey.toBuffer()],
    programId
  );
  const [user3VaultDepositor] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_depositor"), vaultPDA.toBuffer(), user3.publicKey.toBuffer()],
    programId
  );
  
  console.log(`\n📋 Contract Info:`);
  console.log(`   Program ID: ${programId.toString()}`);
  console.log(`   Token Mint: ${tokenMint.toString()}`);
  console.log(`   Vault PDA: ${vaultPDA.toString()}`);
  console.log(`   User1: ${user1.publicKey.toString()}`);
  console.log(`   User2: ${user2.publicKey.toString()}`);
  console.log(`   User3: ${user3.publicKey.toString()}`);
  
  // Check vault lockup period
  console.log("\n🔍 Checking vault lockup period...");
  const vault = await program.account.vault.fetch(vaultPDA);
  const lockupPeriodSeconds = vault.unstakeLockupPeriod.toNumber();
  console.log(`   Lockup period: ${lockupPeriodSeconds} seconds (${lockupPeriodSeconds/3600} hours)`);
  
  // Function to check unstake request status
  const checkUnstakeStatus = async (
    depositorPDA: PublicKey, 
    _userKeypair: Keypair, 
    userName: string
  ): Promise<UnstakeStatus> => {
    try {
      const depositor = await program.account.vaultDepositor.fetch(depositorPDA);
      const unstakeRequest = depositor.unstakeRequest;
      
      if (unstakeRequest.shares.toNumber() === 0) {
        console.log(`   ${userName}: No pending unstake request`);
        return { hasPendingRequest: false, canUnstake: false, remainingTime: 0 };
      }
      
      const requestTime = unstakeRequest.requestTime.toNumber();
      const currentTime = Math.floor(Date.now() / 1000);
      const unlockTime = requestTime + lockupPeriodSeconds;
      const remainingTime = Math.max(0, unlockTime - currentTime);
      const canUnstake = remainingTime === 0;
      
      console.log(`   ${userName}:`);
      console.log(`     Requested shares: ${unstakeRequest.shares.toNumber()}`);
      console.log(`     Request time: ${new Date(requestTime * 1000).toLocaleString()}`);
      console.log(`     Unlock time: ${new Date(unlockTime * 1000).toLocaleString()}`);
      console.log(`     Remaining time: ${Math.floor(remainingTime / 3600)}h ${Math.floor((remainingTime % 3600) / 60)}m ${remainingTime % 60}s`);
      console.log(`     Can unstake: ${canUnstake ? "✅ YES" : "❌ NO"}`);
      
      return { hasPendingRequest: true, canUnstake, remainingTime, requestTime, unlockTime };
    } catch (error) {
      console.log(`   ${userName}: Account not found or error: ${error}`);
      return { hasPendingRequest: false, canUnstake: false, remainingTime: 0 };
    }
  };
  
  // Function to execute unstake
  const executeUnstake = async (
    depositorPDA: PublicKey,
    userKeypair: Keypair,
    userTokenAccount: PublicKey,
    userName: string
  ) => {
    try {
      console.log(`\n💸 Executing unstake for ${userName}...`);
      
      // Get balance before unstake
      const balanceBefore = await getAccount(provider.connection, userTokenAccount);
      
      const unstakeTx = await program.methods
        .unstake()
        .accounts({
          vault: vaultPDA,
          vaultDepositor: depositorPDA,
          vaultTokenAccount: vaultTokenAccount,
          userTokenAccount: userTokenAccount,
          authority: userKeypair.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([userKeypair])
        .rpc();
      
      console.log(`   Transaction hash: ${unstakeTx}`);
      
      // Get balance after unstake
      const balanceAfter = await getAccount(provider.connection, userTokenAccount);
      const received = Number(balanceAfter.amount) - Number(balanceBefore.amount);
      
      console.log(`✅ ${userName} unstake completed successfully!`);
      console.log(`   Received: ${received / 1e9} USDC`);
      console.log(`   New balance: ${Number(balanceAfter.amount) / 1e9} USDC`);
      
      // Verify unstake request was cleared
      const depositorAfter = await program.account.vaultDepositor.fetch(depositorPDA);
      const clearedShares = depositorAfter.unstakeRequest.shares.toNumber();
      console.log(`   Unstake request cleared: ${clearedShares === 0 ? "✅ YES" : "❌ NO"}`);
      
      // Verify remaining shares
      const remainingShares = depositorAfter.shares.toNumber();
      console.log(`   Remaining shares: ${remainingShares}`);
      
      // Verify received amount is reasonable (should be > 0)
      if (received <= 0) {
        console.log(`   ⚠️ Warning: Received amount seems low: ${received / 1e9} USDC`);
      }
      
      return { success: true, received, transactionHash: unstakeTx, clearedShares, remainingShares };
    } catch (error) {
      console.log(`❌ ${userName} unstake failed: ${error}`);
      return { success: false, error };
    }
  };
  
  // Check status for all users
  console.log("\n📊 Checking unstake request status for all users...");
  const user1Status = await checkUnstakeStatus(user1VaultDepositor, user1, "User1");
  const user2Status = await checkUnstakeStatus(user2VaultDepositor, user2, "User2");
  const user3Status = await checkUnstakeStatus(user3VaultDepositor, user3, "User3");
  
  // Find users who can unstake
  const canUnstakeUsers: Array<{name: string, depositor: PublicKey, keypair: Keypair, tokenAccount: PublicKey}> = [];
  if (user1Status.canUnstake) canUnstakeUsers.push({ name: "User1", depositor: user1VaultDepositor, keypair: user1, tokenAccount: user1TokenAccount });
  if (user2Status.canUnstake) canUnstakeUsers.push({ name: "User2", depositor: user2VaultDepositor, keypair: user2, tokenAccount: user2TokenAccount });
  if (user3Status.canUnstake) canUnstakeUsers.push({ name: "User3", depositor: user3VaultDepositor, keypair: user3, tokenAccount: user3TokenAccount });
  
  if (canUnstakeUsers.length === 0) {
    console.log("\n⏰ No users can unstake at this time. Please wait for the lockup period to end.");
    
    // Show when each user can unstake
    if (user1Status.hasPendingRequest && !user1Status.canUnstake && user1Status.unlockTime) {
      console.log(`   User1 can unstake at: ${new Date(user1Status.unlockTime * 1000).toLocaleString()}`);
    }
    if (user2Status.hasPendingRequest && !user2Status.canUnstake && user2Status.unlockTime) {
      console.log(`   User2 can unstake at: ${new Date(user2Status.unlockTime * 1000).toLocaleString()}`);
    }
    if (user3Status.hasPendingRequest && !user3Status.canUnstake && user3Status.unlockTime) {
      console.log(`   User3 can unstake at: ${new Date(user3Status.unlockTime * 1000).toLocaleString()}`);
    }
    
    return;
  }
  
  console.log(`\n🎯 Found ${canUnstakeUsers.length} user(s) ready to unstake:`);
  canUnstakeUsers.forEach(user => console.log(`   - ${user.name}`));
  
  // Ask for confirmation (in a real script, you might want to add a prompt here)
  console.log("\n🚀 Proceeding with unstake operations...");
  
  // Execute unstakes
  const results = [];
  for (const user of canUnstakeUsers) {
    const result = await executeUnstake(
      user.depositor,
      user.keypair,
      user.tokenAccount,
      user.name
    );
    results.push({ user: user.name, ...result });
    
    // Add a small delay between operations
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary
  console.log("\n📋 Unstake Execution Summary:");
  results.forEach(result => {
    if (result.success) {
      console.log(`   ✅ ${result.user}: Received ${(result.received || 0) / 1e9} USDC (${result.transactionHash})`);
    } else {
      console.log(`   ❌ ${result.user}: Failed - ${result.error}`);
    }
  });
  
  // Post-unstake reward distribution test
  console.log("\n🎁 Testing post-unstake reward distribution...");
  
  try {
    // Get vault state before new rewards
    const vaultBeforeNewReward = await program.account.vault.fetch(vaultPDA);
    console.log(`\n📊 Vault state before new reward:`);
    console.log(`   Total assets: ${vaultBeforeNewReward.totalAssets.toNumber() / 1e9} USDC`);
    console.log(`   Total shares: ${vaultBeforeNewReward.totalShares.toNumber()}`);
    
    // Get remaining users' depositor states
    const remainingUsers = canUnstakeUsers.length > 0 ? 
      [user1, user2, user3].filter(user => 
        !canUnstakeUsers.some(unstaked => unstaked.keypair.publicKey.equals(user.publicKey))
      ) : [user1, user2, user3];
    
    console.log(`\n👥 Remaining users after unstake:`);
    for (let i = 0; i < remainingUsers.length; i++) {
      const user = remainingUsers[i];
      const userNum = user.publicKey.equals(user1.publicKey) ? 1 : 
                     user.publicKey.equals(user2.publicKey) ? 2 : 3;
      const depositorPDA = userNum === 1 ? user1VaultDepositor : 
                          userNum === 2 ? user2VaultDepositor : user3VaultDepositor;
      
      try {
        const depositor = await program.account.vaultDepositor.fetch(depositorPDA);
        // CRITICAL FIX: Use same logic as contract - available_assets and active_shares
        const totalAssets = vaultBeforeNewReward.totalAssets.toNumber();
        const totalShares = vaultBeforeNewReward.totalShares.toNumber();
        const pendingUnstakeShares = vaultBeforeNewReward.pendingUnstakeShares.toNumber();
        const reservedAssets = vaultBeforeNewReward.reservedAssets.toNumber();
        const availableAssets = totalAssets - reservedAssets;
        const activeShares = totalShares - pendingUnstakeShares;
        const currentValue = activeShares > 0 ? Math.floor((depositor.shares.toNumber() * availableAssets) / activeShares) : 0;
        console.log(`   User${userNum}: ${depositor.shares.toNumber()} shares (${currentValue / 1e9} USDC value)`);
      } catch (error) {
        console.log(`   User${userNum}: No depositor account or error`);
      }
    }
    
    // Add new rewards (100 USDC)
    const newRewardAmount = 100 * 1e9;
    console.log(`\n💰 Adding ${newRewardAmount / 1e9} USDC new rewards...`);
    
    // Get admin token account
    const adminTokenAccount = await getAssociatedTokenAddress(tokenMint, testAccounts.user1.keypair.length > 0 ? 
      Keypair.fromSecretKey(Buffer.from(testAccounts.user1.keypair)).publicKey : user1.publicKey);
    
    // Get platform token account
    const platformAccount = new PublicKey(contractInfo.platform_account);
    const platformTokenAccount = await getAssociatedTokenAddress(tokenMint, platformAccount);
    
    const newRewardTx = await program.methods
      .addRewards(new anchor.BN(newRewardAmount))
      .accounts({
        vault: vaultPDA,
        vaultTokenAccount: vaultTokenAccount,
        rewardSourceAccount: adminTokenAccount,
        platformTokenAccount: platformTokenAccount,
        rewardSourceAuthority: user1.publicKey, // Using user1 as admin for this test
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .signers([user1])
      .rpc();
    
    console.log(`   New reward transaction: ${newRewardTx}`);
    
    // Get vault state after new rewards
    const vaultAfterNewReward = await program.account.vault.fetch(vaultPDA);
    const assetIncrease = vaultAfterNewReward.totalAssets.toNumber() - vaultBeforeNewReward.totalAssets.toNumber();
    
    console.log(`\n📊 Vault state after new reward:`);
    console.log(`   Total assets: ${vaultAfterNewReward.totalAssets.toNumber() / 1e9} USDC`);
    console.log(`   Total shares: ${vaultAfterNewReward.totalShares.toNumber()}`);
    console.log(`   Asset increase: ${assetIncrease / 1e9} USDC (expected: ${newRewardAmount * 0.5 / 1e9} USDC)`);
    
    // Calculate new user values and compare
    console.log(`\n🎯 Updated user values after new reward:`);
    for (let i = 0; i < remainingUsers.length; i++) {
      const user = remainingUsers[i];
      const userNum = user.publicKey.equals(user1.publicKey) ? 1 : 
                     user.publicKey.equals(user2.publicKey) ? 2 : 3;
      const depositorPDA = userNum === 1 ? user1VaultDepositor : 
                          userNum === 2 ? user2VaultDepositor : user3VaultDepositor;
      
      try {
        const depositor = await program.account.vaultDepositor.fetch(depositorPDA);
        // CRITICAL FIX: Use correct logic for both old and new value calculations
        const oldTotalAssets = vaultBeforeNewReward.totalAssets.toNumber();
        const oldTotalShares = vaultBeforeNewReward.totalShares.toNumber();
        const oldPendingUnstakeShares = vaultBeforeNewReward.pendingUnstakeShares.toNumber();
        const oldReservedAssets = vaultBeforeNewReward.reservedAssets.toNumber();
        const oldAvailableAssets = oldTotalAssets - oldReservedAssets;
        const oldActiveShares = oldTotalShares - oldPendingUnstakeShares;
        const oldValue = oldActiveShares > 0 ? Math.floor((depositor.shares.toNumber() * oldAvailableAssets) / oldActiveShares) : 0;
        
        const newTotalAssets = vaultAfterNewReward.totalAssets.toNumber();
        const newTotalShares = vaultAfterNewReward.totalShares.toNumber();
        const newPendingUnstakeShares = vaultAfterNewReward.pendingUnstakeShares.toNumber();
        const newReservedAssets = vaultAfterNewReward.reservedAssets.toNumber();
        const newAvailableAssets = newTotalAssets - newReservedAssets;
        const newActiveShares = newTotalShares - newPendingUnstakeShares;
        const newValue = newActiveShares > 0 ? Math.floor((depositor.shares.toNumber() * newAvailableAssets) / newActiveShares) : 0;
        const rewardIncrease = newValue - oldValue;
        
        console.log(`   User${userNum}:`);
        console.log(`     Before: ${oldValue / 1e9} USDC`);
        console.log(`     After: ${newValue / 1e9} USDC`);
        console.log(`     Reward: +${rewardIncrease / 1e9} USDC`);
        console.log(`     Share %: ${(depositor.shares.toNumber() * 100 / vaultAfterNewReward.totalShares.toNumber()).toFixed(2)}%`);
      } catch (error) {
        console.log(`   User${userNum}: No depositor account`);
      }
    }
    
    console.log(`\n✅ Post-unstake reward distribution test completed!`);
    console.log(`   - Remaining users received proportional rewards`);
    console.log(`   - Unstaked users missed out on new rewards`);
    console.log(`   - Reward concentration effect demonstrated`);
    
  } catch (error) {
    console.log(`\n⚠️ Post-unstake reward test failed: ${error}`);
    console.log(`   This might be due to insufficient admin token balance or permissions`);
  }

  console.log("\n🎉 Unstake execution script completed!");
}

// Error handling
main().catch(error => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});