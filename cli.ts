#!/usr/bin/env node

import { VaultUserOperations, createConfig, loadWallet } from "./user-operation";
import * as fs from "fs";
import * as os from "os";
import { PublicKey } from "@solana/web3.js";
import contract_info from "./contract_info.json";

// 命令行参数解析
const args = process.argv.slice(2);
const command = args[0];

// 帮助信息
const HELP_TEXT = `
🏦 Vault CLI - 用户操作工具

使用方法:
  node cli.ts <command> [options]

可用命令:
  help                    显示帮助信息
  init                    初始化用户depositor账户
  stake <amount>          质押指定金额 (USDT)
  request-unstake <amount> 请求解质押指定金额
  unstake                 执行解质押 (需要锁定期结束)
  cancel-unstake          取消解质押请求
  sync-rebase             同步rebase
  info                    查看vault信息
  balance                 查看用户token余额
  user-info               查看用户depositor信息
  asset-value             查看用户资产价值
  unstake-status          查看解质押请求状态
  report                  生成完整用户报告

配置选项:
  --wallet <path>         指定钱包文件路径 (默认: ~/.config/solana/id.json)
  --rpc <url>             指定RPC节点URL (默认: devnet)

示例:
  node cli.ts init                          # 初始化用户账户
  node cli.ts stake 100                     # 质押100 USDT
  node cli.ts request-unstake 50            # 请求解质押50 USDT
  node cli.ts report                        # 查看完整报告
  node cli.ts info                          # 查看vault信息
  node cli.ts balance                       # 查看USDT余额
  node cli.ts --wallet ./my-wallet.json stake 200  # 使用指定钱包质押200 USDT
`;

// 获取选项值
function getOption(option: string, defaultValue?: string): string | undefined {
  const index = args.indexOf(option);
  if (index > -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return defaultValue;
}

// 加载配置
async function loadConfig() {
  // 从contract_info.json加载配置
  const config = createConfig(
    contract_info.programId,
    contract_info.vault_name || "FOCX_Vault",
    contract_info.usdt_address,
    getOption("--rpc", "https://api.devnet.solana.com") || "https://api.devnet.solana.com"
  );

  // 加载钱包
  const walletPath = getOption("--wallet", `${os.homedir()}/.config/solana/id.json`) || `${os.homedir()}/.config/solana/id.json`;
  
  if (!fs.existsSync(walletPath)) {
    throw new Error(`钱包文件不存在: ${walletPath}`);
  }
  
  const wallet = loadWallet(walletPath);
  console.log(`🔑 使用钱包: ${wallet.publicKey.toString()}`);
  console.log(`📄 钱包文件: ${walletPath}`);
  
  return { config, wallet };
}

// 主函数
async function main() {
  try {
    if (!command || command === "help") {
      console.log(HELP_TEXT);
      return;
    }

    // 加载配置
    const { config, wallet } = await loadConfig();
    const operations = new VaultUserOperations(config, wallet);

    // 执行命令
    switch (command) {
      case "init":
        console.log("🔧 初始化用户depositor账户...");
        await operations.initializeDepositor();
        break;

      case "stake":
        const stakeAmount = parseFloat(args[1]);
        if (isNaN(stakeAmount) || stakeAmount <= 0) {
          throw new Error("请提供有效的质押金额");
        }
        console.log(`💰 质押 ${stakeAmount} USDT...`);
        await operations.stake(stakeAmount * 1e6);
        break;

      case "request-unstake":
        const requestAmount = parseFloat(args[1]);
        if (isNaN(requestAmount) || requestAmount <= 0) {
          throw new Error("请提供有效的解质押金额");
        }
        console.log(`📤 请求解质押 ${requestAmount} USDT...`);
        await operations.requestUnstake(requestAmount * 1e6);
        break;

      case "unstake":
        console.log("💸 执行解质押...");
        await operations.unstake();
        break;

      case "cancel-unstake":
        console.log("🚫 取消解质押请求...");
        await operations.cancelUnstakeRequest();
        break;

      case "sync-rebase":
        console.log("🔄 同步rebase...");
        await operations.syncRebase();
        break;

      case "info":
        console.log("📊 获取vault信息...");
        await operations.getVaultInfo();
        break;

      case "balance":
        console.log("💰 查询用户token余额...");
        await operations.getUserTokenBalance();
        break;

      case "user-info":
        console.log("👤 查询用户depositor信息...");
        await operations.getUserInfo();
        break;

      case "asset-value":
        console.log("💎 计算用户资产价值...");
        await operations.getUserAssetValue();
        break;

      case "unstake-status":
        console.log("⏰ 检查解质押请求状态...");
        await operations.checkUnstakeRequestStatus();
        break;

      case "report":
        console.log("📋 生成完整用户报告...");
        await operations.getUserReport();
        break;

      default:
        console.error(`❌ 未知命令: ${command}`);
        console.log("\n使用 'node cli.ts help' 查看帮助信息");
        process.exit(1);
    }

    console.log("\n✅ 操作完成!");
    
  } catch (error) {
    console.error("❌ 操作失败:", error);
    process.exit(1);
  }
}

// 运行主函数
main();