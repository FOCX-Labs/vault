#!/usr/bin/env node

import { VaultUserOperations, createConfig, loadWallet } from "./user-operation";
import * as fs from "fs";
import * as os from "os";
import { PublicKey } from "@solana/web3.js";
import contract_info from "./contract_info.json";

// Command line parameter parsing
const args = process.argv.slice(2);
const command = args[0];

// Help information
const HELP_TEXT = `
🏦 Vault CLI - User operation tool

Usage:
  node cli.ts <command> [options]

Available commands:
  help                     Show help information
  init                     Initialize user depositor account
  stake <amount>           Stake specified amount (USDT)
  request-unstake <amount> Request unstake specified amount
  unstake                  Execute unstake (requires lockup period to end)
  cancel-unstake           Cancel unstake request
  sync-rebase              Sync rebase
  info                     View vault information
  balance                  View user token balance
  user-info                View user depositor information
  asset-value              View user asset value
  unstake-status           View unstake request status
  reward-info              View reward distribution information
  report                   Generate complete user report

Configuration options:
  --wallet <path>          Specify wallet file path (default: ~/.config/solana/id.json)
  --rpc <url>              Specify RPC node URL (default: devnet)

Examples:
  node cli.ts init                          # Initialize user account
  node cli.ts stake 100                     # Stake 100 USDT
  node cli.ts request-unstake 50            # Request unstake 50 USDT
  node cli.ts report                        # View complete report
  node cli.ts info                          # View vault information
  node cli.ts balance                       # View USDT balance
  node cli.ts --wallet ./my-wallet.json stake 200  # Use specified wallet to stake 200 USDT
`;

// Get option value
function getOption(option: string, defaultValue?: string): string | undefined {
  const index = args.indexOf(option);
  if (index > -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return defaultValue;
}

// Load configuration
async function loadConfig() {
  // Load configuration from contract_info.json
  const config = createConfig(
    contract_info.programId,
    contract_info.vault_name || "FOCX_Vault",
    contract_info.usdt_address,
    getOption("--rpc", "https://api.devnet.solana.com") || "https://api.devnet.solana.com"
  );

  // Load wallet
  const walletPath = getOption("--wallet", `${os.homedir()}/.config/solana/id.json`) || `${os.homedir()}/.config/solana/id.json`;
  
  if (!fs.existsSync(walletPath)) {
    throw new Error(`Wallet file does not exist: ${walletPath}`);
  }
  
  const wallet = loadWallet(walletPath);
  console.log(`🔑 Using wallet: ${wallet.publicKey.toString()}`);
  console.log(`📄 Wallet file: ${walletPath}`);
  
  return { config, wallet };
}

// Main function
async function main() {
  try {
    if (!command || command === "help") {
      console.log(HELP_TEXT);
      return;
    }

    // Load configuration
    const { config, wallet } = await loadConfig();
    const operations = new VaultUserOperations(config, wallet);

    // Execute command
    switch (command) {
      case "init":
        console.log("🔧 Initializing user depositor account...");
        await operations.initializeDepositor();
        break;

      case "stake":
        const stakeAmount = parseFloat(args[1]);
        if (isNaN(stakeAmount) || stakeAmount <= 0) {
          throw new Error("Please provide a valid stake amount");
        }
        console.log(`💰 Staking ${stakeAmount} USDT...`);
        await operations.stake(stakeAmount * 1e6);
        break;

      case "request-unstake":
        const requestAmount = parseFloat(args[1]);
        if (isNaN(requestAmount) || requestAmount <= 0) {
          throw new Error("Please provide a valid unstake amount");
        }
        console.log(`📤 Requesting unstake ${requestAmount} USDT...`);
        await operations.requestUnstake(requestAmount * 1e6);
        break;

      case "unstake":
        console.log("💸 Executing unstake...");
        await operations.unstake();
        break;

      case "cancel-unstake":
        console.log("🚫 Cancelling unstake request...");
        await operations.cancelUnstakeRequest();
        break;

      case "sync-rebase":
        console.log("🔄 Syncing rebase...");
        await operations.syncRebase();
        break;

      case "info":
        console.log("📊 Getting vault information...");
        await operations.getVaultInfo();
        break;

      case "balance":
        console.log("💰 Getting user token balance...");
        await operations.getUserTokenBalance();
        break;

      case "user-info":
        console.log("👤 Getting user depositor information...");
        await operations.getUserInfo();
        break;

      case "asset-value":
        console.log("💎 Calculating user asset value...");
        await operations.getUserAssetValue();
        break;

      case "unstake-status":
        console.log("⏰ Checking unstake request status...");
        await operations.checkUnstakeRequestStatus();
        break;

      case "reward-info":
        console.log("💰 Getting reward distribution information...");
        await operations.getRewardDistributionInfo();
        break;

      case "report":
        console.log("📋 Generating complete user report...");
        await operations.getUserReport();
        break;

      default:
        console.error(`❌ Unknown command: ${command}`);
        console.log("\nUse 'node cli.ts help' to view help information");
        process.exit(1);
    }

    console.log("\n✅ Operation completed!");
    
  } catch (error) {
    console.error("❌ Operation failed:", error);
    process.exit(1);
  }
}

main();