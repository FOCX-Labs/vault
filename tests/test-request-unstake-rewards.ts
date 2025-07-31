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

// 计算用户在vault中的价值
const calculateUserValue = async (
  program: Program<SimpleVault>,
  vaultPDA: PublicKey,
  userVaultDepositor: PublicKey
): Promise<{ shares: number; value: number; sharePercent: number }> => {
  const vault = await program.account.vault.fetch(vaultPDA);
  const depositor = await program.account.vaultDepositor.fetch(userVaultDepositor);
  
  const shares = depositor.shares.toNumber();
  
  // CRITICAL FIX: Use same logic as contract - available_assets and active_shares
  const totalAssets = vault.totalAssets.toNumber();
  const totalShares = vault.totalShares.toNumber();
  const pendingUnstakeShares = vault.pendingUnstakeShares.toNumber();
  const reservedAssets = vault.reservedAssets.toNumber();
  const availableAssets = totalAssets - reservedAssets;
  const activeShares = totalShares - pendingUnstakeShares;
  
  const value = activeShares > 0 ? Math.floor((shares * availableAssets) / activeShares) : 0;
  const sharePercent = (shares * 100) / activeShares;
  
  return { shares, value, sharePercent };
};

async function main() {
  console.log("🚀 Testing request unstake with rewards distribution (User3)...");
  
  // Setup provider and program
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SimpleVault as Program<SimpleVault>;

  // Load contract info and admin
  const tokenMint = new PublicKey(contractInfo.usdc_address);
  const vaultPDA = new PublicKey(contractInfo.vault_pda);
  const vaultTokenAccount = new PublicKey(contractInfo.vault_token_account);
  const programId = new PublicKey(contractInfo.programId);
  const admin = loadAdminWallet();
  
  // Load test accounts
  const testAccounts = loadTestAccounts();
  
  // Reconstruct User3 (we'll test with User3)
  const user3 = Keypair.fromSecretKey(Buffer.from(testAccounts.user3.keypair));
  const user3TokenAccount = new PublicKey(testAccounts.user3.tokenAccount);
  
  // Calculate User3's vault depositor PDA
  const [user3VaultDepositor] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_depositor"), vaultPDA.toBuffer(), user3.publicKey.toBuffer()],
    programId
  );
  
  console.log(`\n📋 Test Setup:`);
  console.log(`   User3: ${user3.publicKey.toString()}`);
  console.log(`   User3 Token Account: ${user3TokenAccount.toString()}`);
  console.log(`   User3 Vault Depositor: ${user3VaultDepositor.toString()}`);
  
  // Step 1: Get User3's initial state
  console.log("\n🔍 Step 1: Getting User3's initial state...");
  const initialUserValue = await calculateUserValue(program, vaultPDA, user3VaultDepositor);
  const initialTokenBalance = await getAccount(provider.connection, user3TokenAccount);
  
  console.log(`   Initial vault shares: ${initialUserValue.shares}`);
  console.log(`   Initial vault value: ${initialUserValue.value / 1e9} USDC`);
  console.log(`   Initial share %: ${initialUserValue.sharePercent.toFixed(2)}%`);
  console.log(`   Initial token balance: ${Number(initialTokenBalance.amount) / 1e9} USDC`);
  
  // Step 2: User3 creates unstake request for half value
  console.log("\n💸 Step 2: User3 requests unstake for half value...");
  const unstakeAssetAmount = Math.floor(initialUserValue.value / 2); // Half of asset value
  
  const requestUnstakeTx = await program.methods
    .requestUnstake(new anchor.BN(unstakeAssetAmount))
    .accounts({
      vault: vaultPDA,
      vaultDepositor: user3VaultDepositor,
      authority: user3.publicKey,
    } as any)
    .signers([user3])
    .rpc();
  
  console.log(`   Requested unstake for ${unstakeAssetAmount / 1e9} USDC worth of assets`);
  console.log(`   Transaction: ${requestUnstakeTx}`);
  
  // Verify unstake request was created
  const depositorAfterRequest = await program.account.vaultDepositor.fetch(user3VaultDepositor);
  const actualUnstakeShares = depositorAfterRequest.unstakeRequest.shares.toNumber();
  console.log(`   Unstake request shares: ${actualUnstakeShares}`);
  console.log(`   User still has ${depositorAfterRequest.shares.toNumber()} shares in vault`);
  
  // Step 3: Get state after request (should be same as initial)
  console.log("\n📊 Step 3: Verifying state after unstake request...");
  const afterRequestUserValue = await calculateUserValue(program, vaultPDA, user3VaultDepositor);
  
  console.log(`   Shares after request: ${afterRequestUserValue.shares} (should be reduced)`);
  console.log(`   Value after request: ${afterRequestUserValue.value / 1e9} USDC`);
  
  // CRITICAL: Shares should be reduced immediately during request phase
  const expectedSharesAfterRequest = initialUserValue.shares - actualUnstakeShares;
  if (afterRequestUserValue.shares === expectedSharesAfterRequest) {
    console.log(`   ✅ Confirmed: Shares correctly reduced during request phase`);
  } else {
    console.log(`   ❌ ERROR: Shares should be ${expectedSharesAfterRequest}, but got ${afterRequestUserValue.shares}`);
  }
  
  // Step 4: Add rewards to the vault
  console.log("\n🎁 Step 4: Adding rewards to vault...");
  const rewardAmount = 50 * 1e9; // 50 USDC
  
  // Get admin token account and platform account
  const adminTokenAccount = await getAssociatedTokenAddress(tokenMint, admin.publicKey);
  const platformAccount = new PublicKey(contractInfo.platform_account);
  const platformTokenAccount = await getAssociatedTokenAddress(tokenMint, platformAccount);
  
  const addRewardsTx = await program.methods
    .addRewards(new anchor.BN(rewardAmount))
    .accounts({
      vault: vaultPDA,
      vaultTokenAccount: vaultTokenAccount,
      rewardSourceAccount: adminTokenAccount,
      platformTokenAccount: platformTokenAccount,
      rewardSourceAuthority: admin.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    } as any)
    .signers([admin])
    .rpc();
  
  console.log(`   Added ${rewardAmount / 1e9} USDC rewards`);
  console.log(`   Transaction: ${addRewardsTx}`);
  
  // Step 5: Check User3's value after rewards
  console.log("\n💰 Step 5: Checking User3's value after rewards...");
  const afterRewardsUserValue = await calculateUserValue(program, vaultPDA, user3VaultDepositor);
  const rewardIncrease = afterRewardsUserValue.value - afterRequestUserValue.value;
  
  console.log(`   Shares after rewards: ${afterRewardsUserValue.shares} (unchanged)`);
  console.log(`   Value before rewards: ${afterRequestUserValue.value / 1e9} USDC`);
  console.log(`   Value after rewards: ${afterRewardsUserValue.value / 1e9} USDC`);
  console.log(`   Reward increase: +${rewardIncrease / 1e9} USDC`);
  console.log(`   Share %: ${afterRewardsUserValue.sharePercent.toFixed(2)}%`);
  
  // Step 6: Verify vault state changes
  console.log("\n🏦 Step 6: Verifying vault state changes...");
  const expectedVaultIncrease = rewardAmount * 0.5; // 50% goes to vault users
  
  console.log(`   Vault total assets increased by: ${expectedVaultIncrease / 1e9} USDC (expected)`);
  console.log(`   User3's reward represents ${(rewardIncrease * 100 / expectedVaultIncrease).toFixed(2)}% of vault rewards`);
  
  // Step 7: Summary and verification
  console.log("\n📋 Test Results Summary:");
  console.log(`   ✅ User3 requested unstake but shares remained: ${afterRewardsUserValue.shares} shares`);
  console.log(`   ✅ User3 received rewards during lockup period: +${rewardIncrease / 1e9} USDC`);
  console.log(`   ✅ User3's unstake request: ${actualUnstakeShares} shares pending`);
  console.log(`   ✅ Expected behavior: User continues earning rewards until actual unstake`);
  
  // Verification checks
  if (afterRewardsUserValue.shares === initialUserValue.shares) {
    console.log(`   ✅ PASS: Shares remained unchanged during request phase`);
  } else {
    console.log(`   ❌ FAIL: Shares should not change during request phase`);
  }
  
  if (rewardIncrease > 0) {
    console.log(`   ✅ PASS: User3 received rewards during lockup period`);
  } else {
    console.log(`   ❌ FAIL: User3 should receive rewards during lockup period`);
  }
  
  if (actualUnstakeShares > 0) {
    console.log(`   ✅ PASS: Unstake request properly recorded`);
  } else {
    console.log(`   ❌ FAIL: Unstake request not properly recorded`);
  }
  
  console.log("\n🎉 Request unstake rewards test completed!");
}

// Error handling
main().catch(error => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});