#!/usr/bin/env node

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SimpleVault } from "./target/types/simple_vault";
import { 
  TOKEN_PROGRAM_ID, 
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { 
  Keypair,
  PublicKey,
  Connection,
} from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import contract_info from "./contract_info.json";

// 奖励注入配置
interface RewardConfig {
  programId: PublicKey;
  vaultName: string;
  tokenMint: PublicKey;
  rpcUrl: string;
  vaultPDA: PublicKey;
  vaultTokenAccount: PublicKey;
  platformTokenAccount: PublicKey;
  rewardSourceAccount: PublicKey;
}

// 奖励注入类
class RewardInjector {
  private program: Program<SimpleVault>;
  private provider: anchor.AnchorProvider;
  private config: RewardConfig;
  private adminWallet: Keypair;

  constructor(config: RewardConfig, adminWallet: Keypair) {
    this.config = config;
    this.adminWallet = adminWallet;
    
    // 设置连接
    const connection = new Connection(config.rpcUrl, "confirmed");
    this.provider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(adminWallet),
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

  // 注入奖励 - 支持50-50分成
  // - vault_token_account: 接收用户50%的奖励
  // - platform_token_account: 接收平台50%的奖励
  async injectRewards(amountUsdt: number): Promise<string> {
    try {
      const amountRaw = Math.floor(amountUsdt * 1e6); // 转换为最小单位
      
      console.log("🎁 开始注入奖励 (50-50分成)...");
      console.log(`总奖励金额: ${amountUsdt} USDT (${amountRaw} 最小单位)`);
      console.log(`Vault PDA: ${this.config.vaultPDA.toString()}`);
      console.log(`Vault Token Account: ${this.config.vaultTokenAccount.toString()}`);
      console.log(`Platform Token Account: ${this.config.platformTokenAccount.toString()}`);
      console.log(`Reward Source Account: ${this.config.rewardSourceAccount.toString()}`);
      
      // 检查奖励来源账户余额
      const sourceBalance = await this.checkSourceBalance();
      if (sourceBalance < amountRaw) {
        throw new Error(`奖励来源账户余额不足。需要: ${amountUsdt} USDT, 当前: ${sourceBalance / 1e6} USDT`);
      }
      
      console.log(`✅ 奖励来源账户余额充足: ${sourceBalance / 1e6} USDT`);
      
      // 计算分成 (50-50)
      const platformShare = Math.floor(amountRaw * 0.5);
      const vaultShare = amountRaw - platformShare;
      
      console.log("💰 奖励分成详情:");
      console.log(`  - 平台账户将获得: ${platformShare / 1e6} USDT (50%)`);
      console.log(`  - Vault用户将获得: ${vaultShare / 1e6} USDT (50%)`);
      
      // 执行奖励注入 (新的add_rewards支持50-50分成)
      const tx = await this.program.methods
        .addRewards(new anchor.BN(amountRaw))
        .accounts({
          vault: this.config.vaultPDA,
          vaultTokenAccount: this.config.vaultTokenAccount,
          rewardSourceAccount: this.config.rewardSourceAccount,
          platformTokenAccount: this.config.platformTokenAccount,
          rewardSourceAuthority: this.adminWallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([this.adminWallet])
        .rpc();

      console.log("✅ 奖励注入成功!");
      console.log(`Transaction: ${tx}`);
      
      // 查看注入后的vault状态
      await this.checkVaultStatus();
      
      return tx;
    } catch (error) {
      console.error("❌ 奖励注入失败:", error);
      throw error;
    }
  }

  // 检查奖励来源账户余额
  async checkSourceBalance(): Promise<number> {
    try {
      const tokenAccountInfo = await getAccount(this.provider.connection, this.config.rewardSourceAccount);
      const balance = Number(tokenAccountInfo.amount);
      console.log(`📊 奖励来源账户余额: ${balance / 1e6} USDT`);
      return balance;
    } catch (error) {
      console.error("❌ 获取奖励来源账户余额失败:", error);
      throw error;
    }
  }

  // 检查vault状态
  async checkVaultStatus(): Promise<void> {
    try {
      const vaultAccount = await this.program.account.vault.fetch(this.config.vaultPDA);
      
      console.log("\n📊 Vault状态 (奖励注入后):");
      console.log(`总资产: ${vaultAccount.totalAssets.toNumber() / 1e6} USDT`);
      console.log(`总份额: ${vaultAccount.totalShares.toNumber()}`);
      console.log(`总奖励: ${vaultAccount.totalRewards.toNumber() / 1e6} USDT`);
      console.log(`每份额奖励: ${vaultAccount.rewardsPerShare.toString()}`);
      console.log(`最后奖励更新时间: ${new Date(vaultAccount.lastRewardsUpdate.toNumber() * 1000).toLocaleString()}`);
      
      // 检查vault token account余额
      const vaultTokenAccount = await getAccount(
        this.provider.connection, 
        this.config.vaultTokenAccount
      );
      console.log(`Vault Token Account余额: ${Number(vaultTokenAccount.amount) / 1e6} USDT`);
      
      // 检查平台token account余额
      try {
        const platformTokenAccount = await getAccount(
          this.provider.connection, 
          this.config.platformTokenAccount
        );
        console.log(`Platform Token Account余额: ${Number(platformTokenAccount.amount) / 1e6} USDT`);
      } catch (error) {
        console.log("Platform Token Account: 账户不存在或尚未创建");
      }
      
    } catch (error) {
      console.error("❌ 获取vault状态失败:", error);
      throw error;
    }
  }

  // 批量注入奖励
  async batchInjectRewards(amounts: number[]): Promise<string[]> {
    const txs: string[] = [];
    
    console.log(`🔄 开始批量注入奖励 (${amounts.length} 笔)`);
    
    for (let i = 0; i < amounts.length; i++) {
      const amount = amounts[i];
      console.log(`\n--- 第 ${i + 1}/${amounts.length} 笔奖励注入 ---`);
      
      try {
        const tx = await this.injectRewards(amount);
        txs.push(tx);
        console.log(`✅ 第 ${i + 1} 笔注入完成`);
        
        // 如果不是最后一笔，等待一段时间
        if (i < amounts.length - 1) {
          console.log("⏳ 等待3秒后继续...");
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } catch (error) {
        console.error(`❌ 第 ${i + 1} 笔注入失败:`, error);
        throw error;
      }
    }
    
    console.log(`\n🎉 批量注入完成! 总共注入 ${amounts.reduce((sum, amount) => sum + amount, 0)} USDT`);
    return txs;
  }

  // 模拟奖励注入 (不实际执行)
  async simulateRewardInjection(amountUsdt: number): Promise<void> {
    console.log("🔍 模拟奖励注入...");
    console.log(`模拟注入金额: ${amountUsdt} USDT`);
    
    // 检查当前状态
    await this.checkVaultStatus();
    
    // 检查余额
    const sourceBalance = await this.checkSourceBalance();
    
    // 计算50-50分成预期
    const amountRaw = Math.floor(amountUsdt * 1e6);
    const platformShare = Math.floor(amountRaw * 0.5);
    const vaultShare = amountRaw - platformShare;
    
    console.log("\n📋 注入后预期状态 (50-50分成):");
    console.log(`奖励来源账户余额将变为: ${(sourceBalance - amountRaw) / 1e6} USDT`);
    console.log(`平台账户将获得: ${platformShare / 1e6} USDT (50%)`);
    console.log(`Vault用户将获得: ${vaultShare / 1e6} USDT (50%)`);
    console.log(`Vault总奖励将增加: ${vaultShare / 1e6} USDT (仅用户部分)`);
    
    console.log("\n✅ 模拟完成，使用 --execute 参数实际执行");
  }
}

// 加载配置
function loadRewardConfig(): RewardConfig {
  return {
    programId: new PublicKey(contract_info.programId),
    vaultName: contract_info.vault_name || "FOCX_Vault",
    tokenMint: new PublicKey(contract_info.usdc_address),
    rpcUrl: "https://api.devnet.solana.com",
    vaultPDA: new PublicKey(contract_info.vault_pda),
    vaultTokenAccount: new PublicKey(contract_info.vault_token_account),
    platformTokenAccount: new PublicKey("HKSDubsoppVK9tyPBonLZbfu4z16Pb4qQimugnFgARdq"), // 平台账户的ATA
    rewardSourceAccount: new PublicKey("HaX97WCSkm5JnXkxTeyuoPKG96Q6UiqgKBmUK1R9mevi"), // 管理员的ATA作为奖励源
  };
}

// 加载管理员钱包
function loadAdminWallet(): Keypair {
  const walletPath = `${os.homedir()}/.config/solana/id.json`;
  
  if (!fs.existsSync(walletPath)) {
    throw new Error(`管理员钱包文件不存在: ${walletPath}`);
  }
  
  const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf8"));
  return Keypair.fromSecretKey(Buffer.from(secretKey));
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
🎁 奖励注入工具 (支持50-50分成)

使用方法:
  node reward-injection.ts <amount> [options]

参数:
  <amount>          要注入的奖励金额 (USDT)

选项:
  --execute         实际执行注入 (默认为模拟模式)
  --batch "1,2,3"   批量注入多笔奖励

示例:
  node reward-injection.ts 100                    # 模拟注入100 USDT
  node reward-injection.ts 100 --execute          # 实际注入100 USDT
  node reward-injection.ts --batch "10,20,30"     # 批量注入10,20,30 USDT
  node reward-injection.ts --batch "50,100" --execute  # 批量实际注入

功能说明:
  - 奖励将按50-50比例分成: 50%给平台账户，50%给vault用户
  - 平台部分直接转入平台账户的Token Account
  - 用户部分转入vault并自动分配给所有质押用户

注意: 
  - 默认使用模拟模式，添加 --execute 参数才会实际执行
  - 需要管理员权限 (使用 ~/.config/solana/id.json 钱包)
  - 确保奖励来源账户有足够的USDT余额
  - 确保平台账户的Token Account已创建
`);
    return;
  }

  try {
    // 加载配置和钱包
    const config = loadRewardConfig();
    const adminWallet = loadAdminWallet();
    
    console.log(`🔑 使用管理员钱包: ${adminWallet.publicKey.toString()}`);
    
    // 创建奖励注入器
    const injector = new RewardInjector(config, adminWallet);
    
    const isExecute = args.includes("--execute");
    const batchIndex = args.findIndex(arg => arg === "--batch");
    
    if (batchIndex !== -1 && batchIndex + 1 < args.length) {
      // 批量注入
      const batchAmounts = args[batchIndex + 1].split(",").map(amount => parseFloat(amount.trim()));
      
      if (batchAmounts.some(amount => isNaN(amount) || amount <= 0)) {
        throw new Error("批量金额格式错误，请使用逗号分隔的数字，如: '10,20,30'");
      }
      
      if (isExecute) {
        await injector.batchInjectRewards(batchAmounts);
      } else {
        console.log("🔍 批量模拟模式");
        for (let i = 0; i < batchAmounts.length; i++) {
          console.log(`\n--- 第 ${i + 1}/${batchAmounts.length} 笔模拟 ---`);
          await injector.simulateRewardInjection(batchAmounts[i]);
        }
      }
    } else {
      // 单笔注入
      const amount = parseFloat(args[0]);
      
      if (isNaN(amount) || amount <= 0) {
        throw new Error("请提供有效的奖励金额");
      }
      
      if (isExecute) {
        await injector.injectRewards(amount);
      } else {
        await injector.simulateRewardInjection(amount);
      }
    }
    
    console.log("\n🎉 操作完成!");
    
  } catch (error) {
    console.error("❌ 操作失败:", error);
    process.exit(1);
  }
}

// 运行主函数
main();