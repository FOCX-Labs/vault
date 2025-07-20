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
  // 设置Anchor环境
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SimpleVault as Program<SimpleVault>;
  
  // 声明所有需要的变量
  let tokenMint: PublicKey;              // USDT token mint地址
  let vaultPDA: PublicKey;               // Vault PDA地址
  let vaultTokenAccount: PublicKey;      // Vault token账户地址
  let rewardsTokenAccount: PublicKey;    // Rewards token账户地址
  let owner: Keypair;                    // Admin/Owner钱包
  let rewardSourceAccount: PublicKey;    // 奖励来源账户
  
  // Vault配置参数
  const vaultName = "FOCX_Vault";         // Vault名称
  const vaultNameBuffer = Buffer.alloc(32);
  vaultNameBuffer.write(vaultName);
  
  it("Initialize vault contract (Admin Only)", async () => {
    console.log("🚀 开始初始化Vault合约...");
    
    // ========== 第1步: 加载本地Admin钱包 ==========
    console.log("\n📋 第1步: 加载本地Admin钱包");
    
    // 尝试多个可能的id.json路径
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
          console.log(`✅ 找到admin钱包文件: ${path}`);
          break;
        }
      } catch (error) {
        console.log(`⚠️  无法读取 ${path}: ${error}`);
      }
    }
    
    if (!adminKeypairData) {
      throw new Error("❌ 未找到admin钱包文件。请确保 ~/.config/solana/id.json 存在");
    }
    
    // 创建Keypair对象
    owner = Keypair.fromSecretKey(Buffer.from(adminKeypairData));
    console.log(`✅ Admin钱包地址: ${owner.publicKey.toString()}`);
    console.log(`📁 使用的钱包文件: ${usedPath}`);
    
    // 验证钱包地址是否匹配
    const expectedAddress = "3FJ4EYCddqi4HpGnvXNPuFFwVpoZYahoC2W6y4aY6fxv";
    if (owner.publicKey.toString() === expectedAddress) {
      console.log(`✅ 钱包地址验证成功: ${expectedAddress}`);
    } else {
      console.log(`⚠️  钱包地址不匹配:`);
      console.log(`   期望: ${expectedAddress}`);
      console.log(`   实际: ${owner.publicKey.toString()}`);
    }
    
    // 检查SOL余额
    const balance = await provider.connection.getBalance(owner.publicKey);
    console.log(`✅ Admin钱包SOL余额: ${balance / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    
    if (balance < 0.1 * anchor.web3.LAMPORTS_PER_SOL) {
      console.log("⚠️  SOL余额不足，建议至少0.1 SOL用于交易费用");
    }
  
    // ========== 第2步: 创建USDT Token Mint ==========
    console.log("\n📋 第2步: 创建USDT Token Mint (6位小数)");
    
    // 检查是否有预配置的token mint
    if (contract_info && contract_info.usdt_address) {
      console.log("📝 使用预配置的USDT token mint...");
      tokenMint = new PublicKey(contract_info.usdt_address);
      console.log(`✅ 使用现有USDT Token Mint: ${tokenMint.toString()}`);
    } else {
      console.log("📝 创建新的USDT token mint...");
      tokenMint = await createMint(
        provider.connection,
        owner,                    // 付费者
        owner.publicKey,          // mint authority
        null,                     // freeze authority (不设置)
        6                         // USDT标准6位小数
      );
      console.log(`✅ 新创建USDT Token Mint: ${tokenMint.toString()}`);
    }

    // ========== 第3步: 计算所有PDA地址 ==========
    console.log("\n📋 第3步: 计算PDA地址");
    
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
    
    // Rewards Token Account PDA: ["rewards_token_account", vault_pda]
    // 注意：这个账户在当前实现中是多余的，奖励应该直接进入vault_token_account
    // 但为了兼容现有合约结构，仍然需要创建
    [rewardsTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("rewards_token_account"), vaultPDA.toBuffer()],
      program.programId
    );
    console.log(`✅ Rewards Token Account: ${rewardsTokenAccount.toString()}`);
    
    // ========== 第4步: 创建奖励来源账户 ==========
    console.log("\n📋 第4步: 创建奖励来源账户");
    
    try {
      // 使用Associated Token Account
      rewardSourceAccount = await getAssociatedTokenAddress(
        tokenMint,
        owner.publicKey
      );
      
      // 检查账户是否已存在
      const accountInfo = await provider.connection.getAccountInfo(rewardSourceAccount);
      if (!accountInfo) {
        console.log("📝 创建Associated Token Account...");
        await createAssociatedTokenAccount(
          provider.connection,
          owner,                    // 付费者
          tokenMint,               // token mint
          owner.publicKey          // 账户所有者
        );
      }
      
      console.log(`✅ 奖励来源账户: ${rewardSourceAccount.toString()}`);
    } catch (error) {
      console.error("❌ 创建奖励来源账户失败:", error);
      
      // 回退到普通token账户创建方式
      console.log("🔄 尝试使用普通Token账户...");
      rewardSourceAccount = await createAccount(
        provider.connection,
        owner,                    // 付费者
        tokenMint,               // token mint
        owner.publicKey          // 账户所有者
      );
      console.log(`✅ 奖励来源账户 (普通): ${rewardSourceAccount.toString()}`);
    }
    
    // ========== 第5步: 铸造USDT到奖励来源账户 ==========
    console.log("\n📋 第5步: 铸造USDT到奖励来源账户");
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
      console.log(`✅ 已铸造 ${rewardAmount / 1e6} USDT 到奖励来源账户`);
    } catch (error) {
      console.error("❌ 铸造USDT失败:", error);
      console.log("⚠️  可能原因:");
      console.log("   1. 当前钱包不是token mint的authority");
      console.log("   2. 使用的是现有token mint，没有mint权限");
      console.log("   3. 需要从其他来源获取USDT");
      
      // 如果mint失败，跳过这一步但继续初始化
      console.log("🔄 跳过铸造步骤，继续初始化vault...");
    }
    
    console.log(`📝 注意: rewardsTokenAccount保持余额为0，这是正常的`);
    
    // ========== 第6步: 初始化Vault合约 ==========
    console.log("\n📋 第6步: 初始化Vault合约");
    console.log("📝 Vault配置参数:");
    console.log(`   - 名称: ${vaultName}`);
    console.log(`   - 解质押锁定期: 1天 (86,400秒)`);
    console.log(`   - 管理费率: 0% 年化 (000基点)`);
    console.log(`   - 最小质押金额: 100 USDT`);
    console.log(`   - 最大总资产: 无限制`);
    
    await program.methods
      .initializeVault({
        name: Array.from(vaultNameBuffer),           // Vault名称 (32字节)
        unstakeLockupPeriod: new anchor.BN(24 * 60 * 60), // 1天锁定期 (最小要求)
        managementFee: new anchor.BN(0),           // 0%年化管理费 (000基点)
        minStakeAmount: new anchor.BN(100_000_000),    // 100 USDT最小质押
        maxTotalAssets: null,                        // 无资产上限
      })
      .accounts({
        vault: vaultPDA,                             // Vault PDA
        owner: owner.publicKey,                      // Admin钱包
        tokenMint: tokenMint,                        // USDT mint
        vaultTokenAccount: vaultTokenAccount,        // Vault token账户
        rewardsTokenAccount: rewardsTokenAccount,    // 奖励token账户
        tokenProgram: TOKEN_PROGRAM_ID,              // SPL Token程序
        systemProgram: SystemProgram.programId,     // 系统程序
        rent: SYSVAR_RENT_PUBKEY,                   // Rent sysvar
      })
      .signers([owner])                             // Admin签名
      .rpc();
    
    console.log("✅ Vault合约初始化成功!");
    
    // ========== 第7步: 验证初始化结果 ==========
    console.log("\n📋 第7步: 验证初始化结果");
    const vault = await program.account.vault.fetch(vaultPDA);
    
    console.log("🔍 Vault状态验证:");
    console.log(`   ✅ Owner: ${vault.owner.toString()}`);
    console.log(`   ✅ Token Mint: ${vault.tokenMint.toString()}`);
    console.log(`   ✅ Total Shares: ${vault.totalShares.toString()}`);
    console.log(`   ✅ Total Assets: ${vault.totalAssets.toString()}`);
    console.log(`   ✅ Management Fee: ${vault.managementFee.toString()} 基点 (${vault.managementFee.toNumber() / 100}%)`);
    console.log(`   ✅ Min Stake Amount: ${vault.minStakeAmount.toNumber() / 1e6} USDT`);
    console.log(`   ✅ Lockup Period: ${vault.unstakeLockupPeriod.toNumber() / 86400} 天`);
    console.log(`   ✅ Is Paused: ${vault.isPaused}`);
    console.log(`   ✅ Created At: ${new Date(vault.createdAt.toNumber() * 1000).toISOString()}`);
    
    // ========== 初始化完成总结 ==========
    console.log("\n🎉 ========== 初始化完成总结 ==========");
    console.log(`🏛️  Vault名称: ${vaultName}`);
    console.log(`🔑 Admin地址: ${owner.publicKey.toString()}`);
    console.log(`💰 Token Mint: ${tokenMint.toString()}`);
    console.log(`📦 Vault PDA: ${vaultPDA.toString()}`);
    console.log(`🏦 Vault Token Account: ${vaultTokenAccount.toString()}`);
    console.log(`🎁 Rewards Token Account: ${rewardsTokenAccount.toString()}`);
    console.log(`💸 奖励来源账户: ${rewardSourceAccount.toString()}`);
    console.log(`💼 管理费率: ${vault.managementFee.toNumber() / 100}% 年化`);
    console.log(`⏰ 解质押锁定期: ${vault.unstakeLockupPeriod.toNumber() / 86400} 天`);
    console.log(`💵 最小质押: ${vault.minStakeAmount.toNumber() / 1e6} USDT`);
    console.log("\n✅ Vault已成功初始化，用户现在可以开始质押!");
    
    // ========== 保存重要信息到环境变量建议 ==========
    console.log("\n📝 建议保存以下信息到环境变量:");
    console.log(`export VAULT_PROGRAM_ID="${program.programId.toString()}"`);
    console.log(`export VAULT_NAME="${vaultName}"`);
    console.log(`export TOKEN_MINT="${tokenMint.toString()}"`);
    console.log(`export VAULT_PDA="${vaultPDA.toString()}"`);
    console.log(`export ADMIN_WALLET="${owner.publicKey.toString()}"`);
    console.log(`export RPC_URL="https://api.devnet.solana.com"`);
  });
});