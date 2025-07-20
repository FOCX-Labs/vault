import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SimpleVault } from "./target/types/simple_vault";
import { 
  TOKEN_PROGRAM_ID, 
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { 
  SystemProgram, 
  Keypair,
  PublicKey,
  Connection,
  clusterApiUrl,
} from "@solana/web3.js";
import * as fs from "fs";

// 配置信息
interface VaultConfig {
  programId: PublicKey;
  vaultName: string;
  tokenMint: PublicKey;
  rpcUrl: string;
}

// 用户操作类
export class VaultUserOperations {
  private program: Program<SimpleVault>;
  private provider: anchor.AnchorProvider;
  private config: VaultConfig;
  private userWallet: Keypair;

  constructor(config: VaultConfig, userWallet: Keypair) {
    this.config = config;
    this.userWallet = userWallet;
    
    // 设置连接
    const connection = new Connection(config.rpcUrl, "confirmed");
    this.provider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(userWallet),
      { commitment: "confirmed" }
    );
    
    // 设置程序
    anchor.setProvider(this.provider);
    
    // 动态加载IDL
    let idl;
    try {
      idl = JSON.parse(fs.readFileSync("./target/idl/simple_vault.json", "utf8"));
    } catch (error) {
      console.warn("无法加载本地IDL文件，尝试使用相对路径...");
      try {
        idl = require("./target/idl/simple_vault.json");
      } catch (e) {
        throw new Error("无法加载IDL文件。请确保已编译合约并生成IDL文件。");
      }
    }
    
    this.program = new Program(idl, this.provider) as Program<SimpleVault>;
  }

  // 获取PDA地址
  private getVaultPDA(): [PublicKey, number] {
    const vaultNameBuffer = Buffer.alloc(32);
    vaultNameBuffer.write(this.config.vaultName);
    
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), vaultNameBuffer],
      this.config.programId
    );
  }

  private getVaultDepositorPDA(): [PublicKey, number] {
    const [vaultPDA] = this.getVaultPDA();
    
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault_depositor"),
        vaultPDA.toBuffer(),
        this.userWallet.publicKey.toBuffer(),
      ],
      this.config.programId
    );
  }

  private getVaultTokenAccountPDA(): [PublicKey, number] {
    const [vaultPDA] = this.getVaultPDA();
    
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault_token_account"), vaultPDA.toBuffer()],
      this.config.programId
    );
  }

  // 1. 初始化用户depositor账户
  async initializeDepositor(): Promise<string> {
    try {
      const [vaultPDA] = this.getVaultPDA();
      const [vaultDepositorPDA] = this.getVaultDepositorPDA();

      console.log("🔧 初始化用户depositor账户...");
      console.log(`Vault PDA: ${vaultPDA.toString()}`);
      console.log(`User Depositor PDA: ${vaultDepositorPDA.toString()}`);

      const tx = await this.program.methods
        .initializeVaultDepositor()
        .accounts({
          vault: vaultPDA,
          vaultDepositor: vaultDepositorPDA,
          authority: this.userWallet.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([this.userWallet])
        .rpc();

      console.log("✅ Depositor账户初始化成功!");
      console.log(`Transaction: ${tx}`);
      return tx;
    } catch (error) {
      console.error("❌ 初始化depositor账户失败:", error);
      throw error;
    }
  }

  // 2. 质押操作
  async stake(amount: number): Promise<string> {
    try {
      const [vaultPDA] = this.getVaultPDA();
      const [vaultDepositorPDA] = this.getVaultDepositorPDA();
      const [vaultTokenAccountPDA] = this.getVaultTokenAccountPDA();

      // 获取用户token账户
      const userTokenAccount = await getAssociatedTokenAddress(
        this.config.tokenMint,
        this.userWallet.publicKey
      );

      console.log("💰 执行质押操作...");
      console.log(`质押金额: ${amount / 1e6} USDT`);
      console.log(`用户Token账户: ${userTokenAccount.toString()}`);

      const tx = await this.program.methods
        .stake(new anchor.BN(amount))
        .accounts({
          vault: vaultPDA,
          vaultDepositor: vaultDepositorPDA,
          vaultTokenAccount: vaultTokenAccountPDA,
          userTokenAccount: userTokenAccount,
          authority: this.userWallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([this.userWallet])
        .rpc();

      console.log("✅ 质押成功!");
      console.log(`Transaction: ${tx}`);
      return tx;
    } catch (error) {
      console.error("❌ 质押失败:", error);
      throw error;
    }
  }

  // 3. 请求解质押
  async requestUnstake(amount: number): Promise<string> {
    try {
      const [vaultPDA] = this.getVaultPDA();
      const [vaultDepositorPDA] = this.getVaultDepositorPDA();

      console.log("📤 请求解质押...");
      console.log(`解质押金额: ${amount / 1e6} USDT`);

      const tx = await this.program.methods
        .requestUnstake(new anchor.BN(amount))
        .accounts({
          vault: vaultPDA,
          vaultDepositor: vaultDepositorPDA,
          authority: this.userWallet.publicKey,
        } as any)
        .signers([this.userWallet])
        .rpc();

      console.log("✅ 解质押请求提交成功!");
      console.log(`Transaction: ${tx}`);
      console.log("⏰ 请等待锁定期结束后执行unstake操作");
      return tx;
    } catch (error) {
      console.error("❌ 请求解质押失败:", error);
      throw error;
    }
  }

  // 4. 执行解质押
  async unstake(): Promise<string> {
    try {
      const [vaultPDA] = this.getVaultPDA();
      const [vaultDepositorPDA] = this.getVaultDepositorPDA();
      const [vaultTokenAccountPDA] = this.getVaultTokenAccountPDA();

      // 获取用户token账户
      const userTokenAccount = await getAssociatedTokenAddress(
        this.config.tokenMint,
        this.userWallet.publicKey
      );

      console.log("💸 执行解质押...");

      const tx = await this.program.methods
        .unstake()
        .accounts({
          vault: vaultPDA,
          vaultDepositor: vaultDepositorPDA,
          vaultTokenAccount: vaultTokenAccountPDA,
          userTokenAccount: userTokenAccount,
          authority: this.userWallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([this.userWallet])
        .rpc();

      console.log("✅ 解质押成功!");
      console.log(`Transaction: ${tx}`);
      return tx;
    } catch (error) {
      console.error("❌ 解质押失败:", error);
      throw error;
    }
  }

  // 5. 取消解质押请求
  async cancelUnstakeRequest(): Promise<string> {
    try {
      const [vaultPDA] = this.getVaultPDA();
      const [vaultDepositorPDA] = this.getVaultDepositorPDA();

      console.log("🚫 取消解质押请求...");

      const tx = await this.program.methods
        .cancelUnstakeRequest()
        .accounts({
          vault: vaultPDA,
          vaultDepositor: vaultDepositorPDA,
          authority: this.userWallet.publicKey,
        } as any)
        .signers([this.userWallet])
        .rpc();

      console.log("✅ 解质押请求已取消!");
      console.log(`Transaction: ${tx}`);
      return tx;
    } catch (error) {
      console.error("❌ 取消解质押请求失败:", error);
      throw error;
    }
  }

  // 6. 同步rebase
  async syncRebase(): Promise<string> {
    try {
      const [vaultPDA] = this.getVaultPDA();
      const [vaultDepositorPDA] = this.getVaultDepositorPDA();

      console.log("🔄 同步rebase...");

      const tx = await this.program.methods
        .syncRebase()
        .accounts({
          vault: vaultPDA,
          vaultDepositor: vaultDepositorPDA,
          authority: this.userWallet.publicKey,
        } as any)
        .signers([this.userWallet])
        .rpc();

      console.log("✅ Rebase同步成功!");
      console.log(`Transaction: ${tx}`);
      return tx;
    } catch (error) {
      console.error("❌ 同步rebase失败:", error);
      throw error;
    }
  }

  // === 查询方法 ===

  // 查询vault信息
  async getVaultInfo(): Promise<any> {
    try {
      const [vaultPDA] = this.getVaultPDA();
      const vaultAccount = await this.program.account.vault.fetch(vaultPDA);
      
      console.log("📊 Vault信息:");
      console.log(`总资产: ${vaultAccount.totalAssets.toNumber() / 1e6} USDT`);
      console.log(`总份额: ${vaultAccount.totalShares.toNumber()}`);
      console.log(`管理费率: ${vaultAccount.managementFee.toNumber() / 100}%`);
      console.log(`最小质押金额: ${vaultAccount.minStakeAmount.toNumber() / 1e6} USDT`);
      console.log(`解质押锁定期: ${vaultAccount.unstakeLockupPeriod.toNumber() / 86400} 天`);
      console.log(`是否暂停: ${vaultAccount.isPaused}`);
      console.log(`Shares Base: ${vaultAccount.sharesBase}`);
      console.log(`Rebase版本: ${vaultAccount.rebaseVersion}`);
      
      return vaultAccount;
    } catch (error) {
      console.error("❌ 获取vault信息失败:", error);
      throw error;
    }
  }

  // 查询用户depositor信息
  async getUserInfo(): Promise<any> {
    try {
      const [vaultDepositorPDA] = this.getVaultDepositorPDA();
      const depositorAccount = await this.program.account.vaultDepositor.fetch(vaultDepositorPDA);
      
      console.log("👤 用户信息:");
      console.log(`持有份额: ${depositorAccount.shares.toNumber()}`);
      console.log(`总质押金额: ${depositorAccount.totalStaked.toNumber() / 1e6} USDT`);
      console.log(`总解质押金额: ${depositorAccount.totalUnstaked.toNumber() / 1e6} USDT`);
      console.log(`上次rebase版本: ${depositorAccount.lastRebaseVersion}`);
      
      // 解质押请求信息
      const unstakeRequest = depositorAccount.unstakeRequest;
      if (unstakeRequest.shares.toNumber() > 0) {
        console.log("📤 解质押请求:");
        console.log(`请求份额: ${unstakeRequest.shares.toNumber()}`);
        console.log(`请求时间: ${new Date(unstakeRequest.requestTime.toNumber() * 1000).toLocaleString()}`);
      } else {
        console.log("📤 无待处理的解质押请求");
      }
      
      return depositorAccount;
    } catch (error) {
      console.error("❌ 获取用户信息失败:", error);
      throw error;
    }
  }

  // 计算用户资产价值
  async getUserAssetValue(): Promise<number> {
    try {
      const [vaultPDA] = this.getVaultPDA();
      const [vaultDepositorPDA] = this.getVaultDepositorPDA();
      
      const vaultAccount = await this.program.account.vault.fetch(vaultPDA);
      const depositorAccount = await this.program.account.vaultDepositor.fetch(vaultDepositorPDA);
      
      const userShares = depositorAccount.shares.toNumber();
      const totalShares = vaultAccount.totalShares.toNumber();
      const totalAssets = vaultAccount.totalAssets.toNumber();
      
      let userAssetValue = 0;
      if (totalShares > 0) {
        userAssetValue = (userShares * totalAssets) / totalShares;
      }
      
      console.log("💎 用户资产价值:");
      console.log(`持有份额: ${userShares}`);
      console.log(`资产价值: ${userAssetValue / 1e6} USDT`);
      console.log(`当前份额价值: ${totalShares > 0 ? (totalAssets / totalShares).toFixed(6) : 0} USDT/份额`);
      
      return userAssetValue;
    } catch (error) {
      console.error("❌ 计算用户资产价值失败:", error);
      throw error;
    }
  }

  // 查询用户token余额
  async getUserTokenBalance(): Promise<number> {
    try {
      const userTokenAccount = await getAssociatedTokenAddress(
        this.config.tokenMint,
        this.userWallet.publicKey
      );
      
      // 检查账户是否存在
      const accountInfo = await this.provider.connection.getAccountInfo(userTokenAccount);
      if (!accountInfo) {
        console.log("💰 用户Token余额:");
        console.log(`USDT余额: 0 USDT (账户不存在)`);
        return 0;
      }
      
      const tokenAccountInfo = await getAccount(this.provider.connection, userTokenAccount);
      const balance = Number(tokenAccountInfo.amount);
      
      console.log("💰 用户Token余额:");
      console.log(`USDT余额: ${balance / 1e6} USDT`);
      
      return balance;
    } catch (error) {
      console.error("❌ 获取用户token余额失败:", error);
      console.log("提示: 用户可能还没有创建token账户");
      return 0;
    }
  }

  // 检查解质押请求状态
  async checkUnstakeRequestStatus(): Promise<{canUnstake: boolean, remainingTime: number}> {
    try {
      const [vaultPDA] = this.getVaultPDA();
      const [vaultDepositorPDA] = this.getVaultDepositorPDA();
      
      const vaultAccount = await this.program.account.vault.fetch(vaultPDA);
      const depositorAccount = await this.program.account.vaultDepositor.fetch(vaultDepositorPDA);
      
      const unstakeRequest = depositorAccount.unstakeRequest;
      const lockupPeriod = vaultAccount.unstakeLockupPeriod.toNumber();
      
      if (unstakeRequest.shares.toNumber() === 0) {
        console.log("📤 无解质押请求");
        return { canUnstake: false, remainingTime: 0 };
      }
      
      const requestTime = unstakeRequest.requestTime.toNumber();
      const currentTime = Math.floor(Date.now() / 1000);
      const unlockTime = requestTime + lockupPeriod;
      const remainingTime = Math.max(0, unlockTime - currentTime);
      const canUnstake = remainingTime === 0;
      
      console.log("⏰ 解质押请求状态:");
      console.log(`请求时间: ${new Date(requestTime * 1000).toLocaleString()}`);
      console.log(`解锁时间: ${new Date(unlockTime * 1000).toLocaleString()}`);
      console.log(`剩余等待时间: ${Math.floor(remainingTime / 3600)}小时${Math.floor((remainingTime % 3600) / 60)}分钟`);
      console.log(`可以解质押: ${canUnstake ? "是" : "否"}`);
      
      return { canUnstake, remainingTime };
    } catch (error) {
      console.error("❌ 检查解质押请求状态失败:", error);
      throw error;
    }
  }

  // 获取完整用户报告
  async getUserReport(): Promise<void> {
    try {
      console.log("📋 ===== 用户完整报告 =====");
      console.log();
      
      await this.getVaultInfo();
      console.log();
      
      // 检查用户账户是否存在
      try {
        await this.getUserInfo();
      } catch (error) {
        console.log("👤 用户信息: 用户账户尚未初始化");
        console.log("提示: 请先调用 initializeDepositor() 创建用户账户");
      }
      console.log();
      
      try {
        await this.getUserAssetValue();
      } catch (error) {
        console.log("💎 用户资产价值: 0 USDT (用户账户不存在)");
      }
      console.log();
      
      await this.getUserTokenBalance();
      console.log();
      
      try {
        await this.checkUnstakeRequestStatus();
      } catch (error) {
        console.log("⏰ 解质押请求状态: 无解质押请求 (用户账户不存在)");
      }
      console.log();
      
      console.log("📋 ===== 报告结束 =====");
    } catch (error) {
      console.error("❌ 生成用户报告失败:", error);
      throw error;
    }
  }
}

// 使用示例
export async function example() {
  // 配置信息
  const config: VaultConfig = {
    programId: new PublicKey("YOUR_PROGRAM_ID"), // 替换为实际的程序ID
    vaultName: "TestVault",
    tokenMint: new PublicKey("YOUR_TOKEN_MINT"), // 替换为实际的token mint
    rpcUrl: clusterApiUrl("devnet"),
  };

  // 加载用户钱包
  const userWallet = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync("path/to/user-wallet.json", "utf8")))
  );

  // 创建操作实例
  const operations = new VaultUserOperations(config, userWallet);

  try {
    // 示例操作流程
    console.log("开始用户操作示例...");
    
    // 1. 初始化depositor账户
    // await operations.initializeDepositor();
    
    // 2. 查询信息
    await operations.getUserReport();
    
    // 3. 质押操作
    // await operations.stake(100 * 1e6); // 质押100 USDT
    
    // 4. 请求解质押
    // await operations.requestUnstake(50 * 1e6); // 解质押50 USDT
    
    // 5. 等待锁定期结束后执行解质押
    // await operations.unstake();
    
  } catch (error) {
    console.error("操作失败:", error);
  }
}

// 创建配置的辅助函数
export function createConfig(programId: string, vaultName: string, tokenMint: string, rpcUrl?: string): VaultConfig {
  return {
    programId: new PublicKey(programId),
    vaultName,
    tokenMint: new PublicKey(tokenMint),
    rpcUrl: rpcUrl || clusterApiUrl("devnet"),
  };
}

// 从文件加载钱包的辅助函数
export function loadWallet(walletPath: string): Keypair {
  try {
    const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf8"));
    return Keypair.fromSecretKey(Buffer.from(secretKey));
  } catch (error) {
    throw new Error(`无法加载钱包文件 ${walletPath}: ${error}`);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  example();
}