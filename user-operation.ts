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

// config
interface VaultConfig {
  programId: PublicKey;
  vaultName: string;
  tokenMint: PublicKey;
  rpcUrl: string;
}

// user operations
export class VaultUserOperations {
  private program: Program<SimpleVault>;
  private provider: anchor.AnchorProvider;
  private config: VaultConfig;
  private userWallet: Keypair;

  constructor(config: VaultConfig, userWallet: Keypair) {
    this.config = config;
    this.userWallet = userWallet;
    
    // set connection
    const connection = new Connection(config.rpcUrl, "confirmed");
    this.provider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(userWallet),
      { commitment: "confirmed" }
    );
    
    // set program
    anchor.setProvider(this.provider);
    
    // load idl
    let idl;
    try {
      idl = JSON.parse(fs.readFileSync("./target/idl/simple_vault.json", "utf8"));
    } catch (error) {
      console.warn("Failed to load local IDL file, trying relative path...");
      try {
        idl = require("./target/idl/simple_vault.json");
      } catch (e) {
        throw new Error("Failed to load IDL file. Please ensure the contract is compiled and the IDL file is generated.");
      }
    }
    
    this.program = new Program(idl, this.provider) as Program<SimpleVault>;
  }

  // get pda address
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

  // 1. initialize user depositor account
  async initializeDepositor(): Promise<string> {
    try {
      const [vaultPDA] = this.getVaultPDA();
      const [vaultDepositorPDA] = this.getVaultDepositorPDA();

      console.log("🔧 initialize user depositor account...");
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

      console.log("✅ depositor account initialized successfully!");
      console.log(`Transaction: ${tx}`);
      return tx;
    } catch (error) {
      console.error("❌ initialize depositor account failed:", error);
      throw error;
    }
  }

  // 2. stake operation
  async stake(amount: number): Promise<string> {
    try {
      const [vaultPDA] = this.getVaultPDA();
      const [vaultDepositorPDA] = this.getVaultDepositorPDA();
      const [vaultTokenAccountPDA] = this.getVaultTokenAccountPDA();

      // get user token account
      const userTokenAccount = await getAssociatedTokenAddress(
        this.config.tokenMint,
        this.userWallet.publicKey
      );

      console.log("💰 execute stake operation...");
      console.log(`stake amount: ${amount / 1e6} USDT`);
      console.log(`user token account: ${userTokenAccount.toString()}`);

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

      console.log("✅ stake operation successful!");
      console.log(`Transaction: ${tx}`);
      return tx;
    } catch (error) {
      console.error("❌ stake operation failed:", error);
      throw error;
    }
  }

  // 3. request unstake
  async requestUnstake(amount: number): Promise<string> {
    try {
      const [vaultPDA] = this.getVaultPDA();
      const [vaultDepositorPDA] = this.getVaultDepositorPDA();

      console.log("📤 request unstake...");
      console.log(`unstake amount: ${amount / 1e6} USDT`);

      const tx = await this.program.methods
        .requestUnstake(new anchor.BN(amount))
        .accounts({
          vault: vaultPDA,
          vaultDepositor: vaultDepositorPDA,
          authority: this.userWallet.publicKey,
        } as any)
        .signers([this.userWallet])
        .rpc();

      console.log("✅ request unstake submitted successfully!");
      console.log(`Transaction: ${tx}`);
      console.log("⏰ please wait for the lockup period to end and execute the unstake operation");
      return tx;
    } catch (error) {
      console.error("❌ request unstake failed:", error);
      throw error;
    }
  }

  // 4. execute unstake
  async unstake(): Promise<string> {
    try {
      const [vaultPDA] = this.getVaultPDA();
      const [vaultDepositorPDA] = this.getVaultDepositorPDA();
      const [vaultTokenAccountPDA] = this.getVaultTokenAccountPDA();

      // get user token account
      const userTokenAccount = await getAssociatedTokenAddress(
        this.config.tokenMint,
        this.userWallet.publicKey
      );

      console.log("💸 execute unstake...");

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

      console.log("✅ unstake operation successful!");
      console.log(`Transaction: ${tx}`);
      return tx;
    } catch (error) {
      console.error("❌ unstake operation failed:", error);
      throw error;
    }
  }

  // 5. cancel unstake request
  async cancelUnstakeRequest(): Promise<string> {
    try {
      const [vaultPDA] = this.getVaultPDA();
      const [vaultDepositorPDA] = this.getVaultDepositorPDA();

      console.log("🚫 cancel unstake request...");

      const tx = await this.program.methods
        .cancelUnstakeRequest()
        .accounts({
          vault: vaultPDA,
          vaultDepositor: vaultDepositorPDA,
          authority: this.userWallet.publicKey,
        } as any)
        .signers([this.userWallet])
        .rpc();

      console.log("✅ unstake request cancelled!");
      console.log(`Transaction: ${tx}`);
      return tx;
    } catch (error) {
      console.error("❌ cancel unstake request failed:", error);
      throw error;
    }
  }

  // 6. sync rebase
  async syncRebase(): Promise<string> {
    try {
      const [vaultPDA] = this.getVaultPDA();
      const [vaultDepositorPDA] = this.getVaultDepositorPDA();

      console.log("🔄 sync rebase...");

      const tx = await this.program.methods
        .syncRebase()
        .accounts({
          vault: vaultPDA,
          vaultDepositor: vaultDepositorPDA,
          authority: this.userWallet.publicKey,
        } as any)
        .signers([this.userWallet])
        .rpc();

      console.log("✅ rebase sync successful!");
      console.log(`Transaction: ${tx}`);
      return tx;
    } catch (error) {
      console.error("❌ sync rebase failed:", error);
      throw error;
    }
  }

  // === query methods ===

  // query vault info
  async getVaultInfo(): Promise<any> {
    try {
      const [vaultPDA] = this.getVaultPDA();
      const vaultAccount = await this.program.account.vault.fetch(vaultPDA);
      
      console.log("📊 vault info:");
      console.log(`owner: ${vaultAccount.owner.toString()}`);
      console.log(`platform account: ${vaultAccount.platformAccount.toString()}`);
      console.log(`total assets: ${vaultAccount.totalAssets.toNumber() / 1e6} USDT`);
      console.log(`total shares: ${vaultAccount.totalShares.toNumber()}`);
      console.log(`total rewards: ${vaultAccount.totalRewards.toNumber() / 1e6} USDT`);
      console.log(`owner shares: ${vaultAccount.ownerShares.toNumber()}`);
      console.log(`management fee: ${vaultAccount.managementFee.toNumber() / 100}%`);
      console.log(`minimum stake amount: ${vaultAccount.minStakeAmount.toNumber() / 1e6} USDT`);
      console.log(`unstake lockup period: ${vaultAccount.unstakeLockupPeriod.toNumber() / 3600} hours`);
      console.log(`is paused: ${vaultAccount.isPaused}`);
      console.log(`shares base: ${vaultAccount.sharesBase}`);
      console.log(`rebase version: ${vaultAccount.rebaseVersion}`);
      console.log(`created at: ${new Date(vaultAccount.createdAt.toNumber() * 1000).toLocaleString()}`);
      
      return vaultAccount;
    } catch (error) {
      console.error("❌ get vault info failed:", error);
      throw error;
    }
  }

  // query user depositor info
  async getUserInfo(): Promise<any> {
    try {
      const [vaultDepositorPDA] = this.getVaultDepositorPDA();
      const depositorAccount = await this.program.account.vaultDepositor.fetch(vaultDepositorPDA);
      
      console.log("👤 user info:");
      console.log(`shares: ${depositorAccount.shares.toNumber()}`);
      console.log(`total staked: ${depositorAccount.totalStaked.toNumber() / 1e6} USDT`);
      console.log(`total unstaked: ${depositorAccount.totalUnstaked.toNumber() / 1e6} USDT`);
      console.log(`last rebase version: ${depositorAccount.lastRebaseVersion}`);
      
      // unstake request info
      const unstakeRequest = depositorAccount.unstakeRequest;
      if (unstakeRequest.shares.toNumber() > 0) {
        console.log("📤 unstake request:");
        console.log(`request shares: ${unstakeRequest.shares.toNumber()}`);
        console.log(`request time: ${new Date(unstakeRequest.requestTime.toNumber() * 1000).toLocaleString()}`);
      } else {
        console.log("📤 no pending unstake request");
      }
      
      return depositorAccount;
    } catch (error) {
      console.error("❌ get user info failed:", error);
      throw error;
    }
  }

  // calculate user asset value
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
      
      console.log("💎 user asset value:");
      console.log(`shares: ${userShares}`);
      console.log(`asset value: ${userAssetValue / 1e6} USDT`);
      console.log(`current share value: ${totalShares > 0 ? (totalAssets / totalShares).toFixed(6) : 0} USDT/share`);
      
      return userAssetValue;
    } catch (error) {
      console.error("❌ calculate user asset value failed:", error);
      throw error;
    }
  }

  // query user token balance
  async getUserTokenBalance(): Promise<number> {
    try {
      const userTokenAccount = await getAssociatedTokenAddress(
        this.config.tokenMint,
        this.userWallet.publicKey
      );
      
      // check if account exists
      const accountInfo = await this.provider.connection.getAccountInfo(userTokenAccount);
      if (!accountInfo) {
        console.log("💰 用户Token余额:");
        console.log(`USDT余额: 0 USDT (账户不存在)`);
        return 0;
      }
      
      const tokenAccountInfo = await getAccount(this.provider.connection, userTokenAccount);
      const balance = Number(tokenAccountInfo.amount);
      
      console.log("💰 user token balance:");
      console.log(`USDT balance: ${balance / 1e6} USDT`);
      
      return balance;
    } catch (error) {
      console.error("❌ get user token balance failed:", error);
      console.log("hint: user may not have created a token account");
      return 0;
    }
  }

  // check unstake request status
  async checkUnstakeRequestStatus(): Promise<{canUnstake: boolean, remainingTime: number}> {
    try {
      const [vaultPDA] = this.getVaultPDA();
      const [vaultDepositorPDA] = this.getVaultDepositorPDA();
      
      const vaultAccount = await this.program.account.vault.fetch(vaultPDA);
      const depositorAccount = await this.program.account.vaultDepositor.fetch(vaultDepositorPDA);
      
      const unstakeRequest = depositorAccount.unstakeRequest;
      const lockupPeriod = vaultAccount.unstakeLockupPeriod.toNumber();
      
      if (unstakeRequest.shares.toNumber() === 0) {
        console.log("📤 no pending unstake request");
        return { canUnstake: false, remainingTime: 0 };
      }
      
      const requestTime = unstakeRequest.requestTime.toNumber();
      const currentTime = Math.floor(Date.now() / 1000);
      const unlockTime = requestTime + lockupPeriod;
      const remainingTime = Math.max(0, unlockTime - currentTime);
      const canUnstake = remainingTime === 0;
      
      console.log("⏰ unstake request status:");
      console.log(`request time: ${new Date(requestTime * 1000).toLocaleString()}`);
      console.log(`unlock time: ${new Date(unlockTime * 1000).toLocaleString()}`);
      console.log(`remaining time: ${Math.floor(remainingTime / 3600)} hours ${Math.floor((remainingTime % 3600) / 60)} minutes`);
      console.log(`can unstake: ${canUnstake ? "yes" : "no"}`);
      
      return { canUnstake, remainingTime };
    } catch (error) {
      console.error("❌ check unstake request status failed:", error);
      throw error;
    }
  }

  // get reward distribution info
  async getRewardDistributionInfo(): Promise<void> {
    try {
      const [vaultPDA] = this.getVaultPDA();
      const vaultAccount = await this.program.account.vault.fetch(vaultPDA);
      
      console.log("💰 reward distribution info:");
      console.log("  - platform account receives 50% of all rewards");
      console.log("  - vault users receive 50% of all rewards (auto-compounded)");
      console.log(`  - platform account: ${vaultAccount.platformAccount.toString()}`);
      console.log(`  - total rewards distributed: ${vaultAccount.totalRewards.toNumber() / 1e6} USDT`);
      console.log(`  - rewards per share: ${vaultAccount.rewardsPerShare.toString()}`);
      console.log(`  - last reward update: ${new Date(vaultAccount.lastRewardsUpdate.toNumber() * 1000).toLocaleString()}`);
      
    } catch (error) {
      console.error("❌ get reward distribution info failed:", error);
      throw error;
    }
  }

  // get full user report
  async getUserReport(): Promise<void> {
    try {
      console.log("📋 ===== full user report =====");
      console.log();
      
      await this.getVaultInfo();
      console.log();
      
      // check if user account exists
      try {
        await this.getUserInfo();
      } catch (error) {
        console.log("👤 user info: user account not initialized");
        console.log("hint: please call initializeDepositor() to create user account");
      }
      console.log();
      
      try {
        await this.getUserAssetValue();
      } catch (error) {
        console.log("💎 user asset value: 0 USDT (user account not exists)");
      }
      console.log();
      
      await this.getUserTokenBalance();
      console.log();
      
      try {
        await this.checkUnstakeRequestStatus();
      } catch (error) {
        console.log("⏰ unstake request status: no unstake request (user account not exists)");
      }
      console.log();
      
      await this.getRewardDistributionInfo();
      console.log();
      
      console.log("📋 ===== report end =====");
    } catch (error) {
      console.error("❌ generate user report failed:", error);
      throw error;
    }
  }
}

// example
export async function example() {
  // config
  const config: VaultConfig = {
    programId: new PublicKey("YOUR_PROGRAM_ID"), // replace with actual program id
    vaultName: "TestVault",
    tokenMint: new PublicKey("YOUR_TOKEN_MINT"), // replace with actual token mint
    rpcUrl: clusterApiUrl("devnet"),
  };

  // load user wallet
  const userWallet = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync("path/to/user-wallet.json", "utf8")))
  );

  // create operation instance
  const operations = new VaultUserOperations(config, userWallet);

  try {
    // example operation flow
    console.log("start user operation example...");
    
    // 1. initialize depositor account
    // await operations.initializeDepositor();
    
    // 2. query info
    await operations.getUserReport();
    
    // 3. stake operation
    // await operations.stake(100 * 1e6); // stake 100 USDT
    
    // 4. request unstake
    // await operations.requestUnstake(50 * 1e6); // request unstake 50 USDT
    
    // 5. wait for the lockup period to end and execute unstake
    // await operations.unstake();
    
  } catch (error) {
    console.error("operation failed:", error);
  }
}

// create config helper function
export function createConfig(programId: string, vaultName: string, tokenMint: string, rpcUrl?: string): VaultConfig {
  return {
    programId: new PublicKey(programId),
    vaultName,
    tokenMint: new PublicKey(tokenMint),
    rpcUrl: rpcUrl || clusterApiUrl("devnet"),
  };
}

// load wallet from file helper function
export function loadWallet(walletPath: string): Keypair {
  try {
    const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf8"));
    return Keypair.fromSecretKey(Buffer.from(secretKey));
  } catch (error) {
    throw new Error(`failed to load wallet file ${walletPath}: ${error}`);
  }
}

// if directly run this file
if (require.main === module) {
  example();
}