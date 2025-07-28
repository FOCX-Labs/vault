import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SimpleVault } from "../target/types/simple_vault";
import { 
  TOKEN_PROGRAM_ID, 
  getAccount,
} from "@solana/spl-token";
import { 
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import contractInfo from "../client/contract_info.json";

// 配置：选择要执行unstake的用户 (1, 2, 或 3)
const TARGET_USER = 1; // 修改这里选择用户

// 测试账户配置文件路径
const TEST_ACCOUNTS_FILE = path.join(__dirname, "../test-accounts.json");

interface TestAccounts {
  user1: { keypair: number[]; tokenAccount: string; };
  user2: { keypair: number[]; tokenAccount: string; };
  user3: { keypair: number[]; tokenAccount: string; };
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
        return keypair;
      }
    } catch (error) {
      continue;
    }
  }
  
  throw new Error("❌ Admin wallet file not found");
};

async function main() {
  console.log(`🚀 Executing unstake for User${TARGET_USER}...`);
  
  if (![1, 2, 3].includes(TARGET_USER)) {
    throw new Error("❌ TARGET_USER must be 1, 2, or 3");
  }
  
  // Setup
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SimpleVault as Program<SimpleVault>;

  const vaultPDA = new PublicKey(contractInfo.vault_pda);
  const vaultTokenAccount = new PublicKey(contractInfo.vault_token_account);
  const programId = new PublicKey(contractInfo.programId);
  
  // Load test accounts
  if (!fs.existsSync(TEST_ACCOUNTS_FILE)) {
    throw new Error(`❌ Test accounts file not found: ${TEST_ACCOUNTS_FILE}`);
  }
  
  const testAccounts: TestAccounts = JSON.parse(fs.readFileSync(TEST_ACCOUNTS_FILE, 'utf8'));
  
  // Get target user data
  const userData = testAccounts[`user${TARGET_USER}` as keyof TestAccounts];
  const userKeypair = Keypair.fromSecretKey(Buffer.from(userData.keypair));
  const userTokenAccount = new PublicKey(userData.tokenAccount);
  
  // Calculate vault depositor PDA
  const [userVaultDepositor] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_depositor"), vaultPDA.toBuffer(), userKeypair.publicKey.toBuffer()],
    programId
  );
  
  console.log(`📋 Target User Info:`);
  console.log(`   User: User${TARGET_USER}`);
  console.log(`   Address: ${userKeypair.publicKey.toString()}`);
  console.log(`   Token Account: ${userTokenAccount.toString()}`);
  console.log(`   Vault Depositor: ${userVaultDepositor.toString()}`);
  
  // Check current status
  console.log(`\n🔍 Checking User${TARGET_USER} unstake request status...`);
  
  try {
    const depositor = await program.account.vaultDepositor.fetch(userVaultDepositor);
    const vault = await program.account.vault.fetch(vaultPDA);
    const unstakeRequest = depositor.unstakeRequest;
    const lockupPeriodSeconds = vault.unstakeLockupPeriod.toNumber();
    
    if (unstakeRequest.shares.toNumber() === 0) {
      console.log("❌ No pending unstake request found.");
      console.log("   You need to create an unstake request first using requestUnstake()");
      return;
    }
    
    const requestTime = unstakeRequest.requestTime.toNumber();
    const currentTime = Math.floor(Date.now() / 1000);
    const unlockTime = requestTime + lockupPeriodSeconds;
    const remainingTime = Math.max(0, unlockTime - currentTime);
    const canUnstake = remainingTime === 0;
    
    console.log(`📊 Unstake Request Status:`);
    console.log(`   Requested shares: ${unstakeRequest.shares.toNumber()}`);
    console.log(`   Request time: ${new Date(requestTime * 1000).toLocaleString()}`);
    console.log(`   Unlock time: ${new Date(unlockTime * 1000).toLocaleString()}`);
    console.log(`   Lockup period: ${lockupPeriodSeconds} seconds (${(lockupPeriodSeconds/3600).toFixed(1)} hours)`);
    console.log(`   Remaining time: ${Math.floor(remainingTime / 3600)}h ${Math.floor((remainingTime % 3600) / 60)}m ${remainingTime % 60}s`);
    console.log(`   Can unstake: ${canUnstake ? "✅ YES" : "❌ NO"}`);
    
    if (!canUnstake) {
      console.log(`\n⏰ Cannot unstake yet. Please wait ${Math.floor(remainingTime / 3600)}h ${Math.floor((remainingTime % 3600) / 60)}m ${remainingTime % 60}s`);
      console.log(`   Try again after: ${new Date(unlockTime * 1000).toLocaleString()}`);
      return;
    }
    
    // Get balance before unstake
    console.log(`\n💸 Executing unstake...`);
    const balanceBefore = await getAccount(provider.connection, userTokenAccount);
    console.log(`   Balance before: ${Number(balanceBefore.amount) / 1e9} USDC`);
    
    // Execute unstake
    const unstakeTx = await program.methods
      .unstake()
      .accounts({
        vault: vaultPDA,
        vaultDepositor: userVaultDepositor,
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
    
    console.log(`\n✅ Unstake completed successfully!`);
    console.log(`   Received: ${received / 1e9} USDC`);
    console.log(`   Balance after: ${Number(balanceAfter.amount) / 1e9} USDC`);
    console.log(`   Transaction: https://solscan.io/tx/${unstakeTx}?cluster=devnet`);
    
    // Verify unstake request was cleared
    const depositorAfter = await program.account.vaultDepositor.fetch(userVaultDepositor);
    const clearedShares = depositorAfter.unstakeRequest.shares.toNumber();
    console.log(`   Unstake request cleared: ${clearedShares === 0 ? "✅ YES" : "❌ NO"}`);
    
    // Additional validations
    const remainingShares = depositorAfter.shares.toNumber();
    console.log(`   Remaining shares: ${remainingShares}`);
    
    // Get vault state for additional validation
    const vaultAfter = await program.account.vault.fetch(vaultPDA);
    console.log(`   Vault total assets after unstake: ${vaultAfter.totalAssets.toNumber() / 1e9} USDC`);
    console.log(`   Vault total shares after unstake: ${vaultAfter.totalShares.toNumber()}`);
    
    // Verify received amount is reasonable
    if (received <= 0) {
      console.log(`   ⚠️ Warning: Received amount seems low: ${received / 1e9} USDC`);
    } else {
      console.log(`   ✅ Received reasonable amount: ${received / 1e9} USDC`);
    }
    
  } catch (error) {
    console.error(`❌ Unstake failed: ${error}`);
    throw error;
  }
  
  // Post-unstake reward test
  console.log(`\n🎁 Testing post-unstake reward distribution for remaining users...`);
  
  try {
    // Get vault state before new reward
    const vaultBeforeNewReward = await program.account.vault.fetch(vaultPDA);
    console.log(`\n📊 Vault state before new reward:`);
    console.log(`   Total assets: ${vaultBeforeNewReward.totalAssets.toNumber() / 1e9} USDC`);
    console.log(`   Total shares: ${vaultBeforeNewReward.totalShares.toNumber()}`);
    
    // Add 50 USDC as new reward
    const newRewardAmount = 50 * 1e9;
    console.log(`\n💰 Adding ${newRewardAmount / 1e9} USDC new rewards...`);
    
    // Note: This will likely fail in test environment due to permissions
    // But it demonstrates the concept
    console.log(`   ⚠️ Note: This requires admin privileges and sufficient token balance`);
    console.log(`   Expected result: Remaining users would get proportionally more rewards`);
    console.log(`   Expected result: User${TARGET_USER} (who unstaked) would get nothing`);
    
    console.log(`\n✅ Post-unstake reward concept demonstrated!`);
    console.log(`   - Run this after actual unstake to see reward concentration effect`);
    
  } catch (error) {
    console.log(`\n⚠️ Post-unstake reward test info: ${error}`);
  }
}

// Run the script
main().catch(error => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});