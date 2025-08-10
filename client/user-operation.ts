import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { SimpleVault } from '../target/types/simple_vault'
import {
  TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddress,
} from '@solana/spl-token'
import {
  SystemProgram,
  Keypair,
  PublicKey,
  Connection,
  clusterApiUrl,
} from '@solana/web3.js'
import * as fs from 'fs'

// config
interface VaultConfig {
  programId: PublicKey
  vaultName: string
  tokenMint: PublicKey
  rpcUrl: string
}

// user operations
export class VaultUserOperations {
  private program: Program<SimpleVault>
  private provider: anchor.AnchorProvider
  private config: VaultConfig
  private userWallet: Keypair

  constructor(config: VaultConfig, userWallet: Keypair) {
    this.config = config
    this.userWallet = userWallet

    // set connection
    const connection = new Connection(config.rpcUrl, 'confirmed')
    this.provider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(userWallet),
      { commitment: 'confirmed' }
    )

    // set program
    anchor.setProvider(this.provider)

    // load idl
    let idl
    try {
      idl = JSON.parse(
        fs.readFileSync('./target/idl/simple_vault.json', 'utf8')
      )
    } catch (error) {
      console.warn('Failed to load local IDL file, trying relative path...')
      try {
        idl = require('./target/idl/simple_vault.json')
      } catch (e) {
        throw new Error(
          'Failed to load IDL file. Please ensure the contract is compiled and the IDL file is generated.'
        )
      }
    }

    this.program = new Program(idl, this.provider) as Program<SimpleVault>
  }

  // get pda address
  private getVaultPDA(): [PublicKey, number] {
    const vaultNameBuffer = Buffer.alloc(32)
    vaultNameBuffer.write(this.config.vaultName)

    return PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), vaultNameBuffer],
      this.config.programId
    )
  }

  private getVaultDepositorPDA(): [PublicKey, number] {
    const [vaultPDA] = this.getVaultPDA()

    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('vault_depositor'),
        vaultPDA.toBuffer(),
        this.userWallet.publicKey.toBuffer(),
      ],
      this.config.programId
    )
  }

  private getVaultTokenAccountPDA(): [PublicKey, number] {
    const [vaultPDA] = this.getVaultPDA()

    return PublicKey.findProgramAddressSync(
      [Buffer.from('vault_token_account'), vaultPDA.toBuffer()],
      this.config.programId
    )
  }

  // 1. initialize user depositor account
  async initializeDepositor(): Promise<string> {
    try {
      const [vaultPDA] = this.getVaultPDA()
      const [vaultDepositorPDA] = this.getVaultDepositorPDA()

      console.log('🔧 initialize user depositor account...')
      console.log(`Vault PDA: ${vaultPDA.toString()}`)
      console.log(`User Depositor PDA: ${vaultDepositorPDA.toString()}`)

      const tx = await this.program.methods
        .initializeVaultDepositor()
        .accounts({
          vault: vaultPDA,
          vaultDepositor: vaultDepositorPDA,
          authority: this.userWallet.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([this.userWallet])
        .rpc()

      console.log('✅ depositor account initialized successfully!')
      console.log(`Transaction: ${tx}`)
      return tx
    } catch (error) {
      console.error('❌ initialize depositor account failed:', error)
      throw error
    }
  }

  // 2. stake operation
  async stake(amount: number): Promise<string> {
    try {
      const [vaultPDA] = this.getVaultPDA()
      const [vaultDepositorPDA] = this.getVaultDepositorPDA()
      const [vaultTokenAccountPDA] = this.getVaultTokenAccountPDA()

      // get user token account
      const userTokenAccount = await getAssociatedTokenAddress(
        this.config.tokenMint,
        this.userWallet.publicKey
      )

      console.log('💰 execute stake operation...')
      console.log(`stake amount: ${amount / 1e9} USDC`)
      console.log(`user token account: ${userTokenAccount.toString()}`)

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
        .rpc()

      console.log('✅ stake operation successful!')
      console.log(`Transaction: ${tx}`)
      return tx
    } catch (error) {
      console.error('❌ stake operation failed:', error)
      throw error
    }
  }

  // 3. request unstake
  async requestUnstake(amount: number): Promise<string> {
    try {
      const [vaultPDA] = this.getVaultPDA()
      const [vaultDepositorPDA] = this.getVaultDepositorPDA()

      console.log('📤 request unstake...')
      console.log(`unstake amount: ${amount / 1e9} USDC`)

      const tx = await this.program.methods
        .requestUnstake(new anchor.BN(amount))
        .accounts({
          vault: vaultPDA,
          vaultDepositor: vaultDepositorPDA,
          authority: this.userWallet.publicKey,
        } as any)
        .signers([this.userWallet])
        .rpc()

      console.log('✅ request unstake submitted successfully!')
      console.log(`Transaction: ${tx}`)
      console.log(
        '⏰ please wait for the lockup period to end and execute the unstake operation'
      )
      return tx
    } catch (error) {
      console.error('❌ request unstake failed:', error)
      throw error
    }
  }

  // 4. execute unstake
  async unstake(): Promise<string> {
    try {
      const [vaultPDA] = this.getVaultPDA()
      const [vaultDepositorPDA] = this.getVaultDepositorPDA()
      const [vaultTokenAccountPDA] = this.getVaultTokenAccountPDA()

      // get user token account
      const userTokenAccount = await getAssociatedTokenAddress(
        this.config.tokenMint,
        this.userWallet.publicKey
      )

      console.log('💸 execute unstake...')

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
        .rpc()

      console.log('✅ unstake operation successful!')
      console.log(`Transaction: ${tx}`)
      return tx
    } catch (error) {
      console.error('❌ unstake operation failed:', error)
      throw error
    }
  }

  // 5. cancel unstake request
  async cancelUnstakeRequest(): Promise<string> {
    try {
      const [vaultPDA] = this.getVaultPDA()
      const [vaultDepositorPDA] = this.getVaultDepositorPDA()

      console.log('🚫 cancel unstake request...')

      const tx = await this.program.methods
        .cancelUnstakeRequest()
        .accounts({
          vault: vaultPDA,
          vaultDepositor: vaultDepositorPDA,
          authority: this.userWallet.publicKey,
        } as any)
        .signers([this.userWallet])
        .rpc()

      console.log('✅ unstake request cancelled!')
      console.log(`Transaction: ${tx}`)
      return tx
    } catch (error) {
      console.error('❌ cancel unstake request failed:', error)
      throw error
    }
  }

  // 6. sync rebase
  async syncRebase(): Promise<string> {
    try {
      const [vaultPDA] = this.getVaultPDA()
      const [vaultDepositorPDA] = this.getVaultDepositorPDA()

      console.log('🔄 sync rebase...')

      const tx = await this.program.methods
        .syncRebase()
        .accounts({
          vault: vaultPDA,
          vaultDepositor: vaultDepositorPDA,
          authority: this.userWallet.publicKey,
        } as any)
        .signers([this.userWallet])
        .rpc()

      console.log('✅ rebase sync successful!')
      console.log(`Transaction: ${tx}`)
      return tx
    } catch (error) {
      console.error('❌ sync rebase failed:', error)
      throw error
    }
  }

  // === query methods ===

  // query vault info
  async getVaultInfo(): Promise<any> {
    try {
      const [vaultPDA] = this.getVaultPDA()
      const vaultAccount = await this.program.account.vault.fetch(vaultPDA)

      console.log('📊 vault info:')
      console.log(`owner: ${vaultAccount.owner.toString()}`)
      console.log(
        `platform account: ${vaultAccount.platformAccount.toString()}`
      )
      console.log(
        `total assets: ${vaultAccount.totalAssets.toNumber() / 1e9} USDC`
      )
      console.log(`total shares: ${vaultAccount.totalShares.toNumber()}`)
      console.log(
        `total rewards: ${vaultAccount.totalRewards.toNumber() / 1e9} USDC`
      )
      console.log(`owner shares: ${vaultAccount.ownerShares.toNumber()}`)
      console.log(
        `management fee: ${vaultAccount.managementFee.toNumber() / 100}%`
      )
      console.log(
        `minimum stake amount: ${
          vaultAccount.minStakeAmount.toNumber() / 1e9
        } USDC`
      )
      console.log(
        `unstake lockup period: ${
          vaultAccount.unstakeLockupPeriod.toNumber() / 3600
        } hours`
      )
      console.log(`is paused: ${vaultAccount.isPaused}`)
      console.log(`shares base: ${vaultAccount.sharesBase}`)
      console.log(`rebase version: ${vaultAccount.rebaseVersion}`)
      console.log(
        `created at: ${new Date(
          vaultAccount.createdAt.toNumber() * 1000
        ).toLocaleString()}`
      )

      return vaultAccount
    } catch (error) {
      console.error('❌ get vault info failed:', error)
      throw error
    }
  }

  // query user depositor info
  async getUserInfo(): Promise<any> {
    try {
      const [vaultDepositorPDA] = this.getVaultDepositorPDA()
      const depositorAccount = await this.program.account.vaultDepositor.fetch(
        vaultDepositorPDA
      )

      // Calculate user's active stake value
      const activeStakeValue = await this.getUserAssetValue()

      console.log('👤 user info:')
      console.log(`shares: ${depositorAccount.shares.toNumber()}`)
      console.log(
        `active stake: ${(activeStakeValue / 1e9).toFixed(6)} USDC`
      )
      console.log(`last rebase version: ${depositorAccount.lastRebaseVersion}`)

      // unstake request info
      const unstakeRequest = depositorAccount.unstakeRequest
      if (unstakeRequest.shares.toNumber() > 0) {
        // Calculate USDC amount for unstake request
        const PRECISION = 1e12 // 1e12 as defined in constants.rs(decimal of shares)
        const shares = unstakeRequest.shares.toNumber()
        const assetPerShare = Number(unstakeRequest.assetPerShareAtRequest.toString())
        const unstakeUSDCAmount = (shares * assetPerShare) / PRECISION
        
        console.log('📤 unstake request:')
        console.log(`request shares: ${shares}`)
        console.log(`unstake amount: ${(unstakeUSDCAmount / 1e9).toFixed(6)} USDC`)
        console.log(
          `request time: ${new Date(
            unstakeRequest.requestTime.toNumber() * 1000
          ).toLocaleString()}`
        )
      } else {
        console.log('📤 no pending unstake request')
      }

      return depositorAccount
    } catch (error) {
      console.error('❌ get user info failed:', error)
      throw error
    }
  }

  // calculate user asset value
  async getUserAssetValue(): Promise<number> {
    try {
      const [vaultPDA] = this.getVaultPDA()
      const [vaultDepositorPDA] = this.getVaultDepositorPDA()

      const vaultAccount = await this.program.account.vault.fetch(vaultPDA)
      const depositorAccount = await this.program.account.vaultDepositor.fetch(
        vaultDepositorPDA
      )

      const userShares = depositorAccount.shares.toNumber()
      const totalShares = vaultAccount.totalShares.toNumber()
      const totalAssets = vaultAccount.totalAssets.toNumber()
      
      // CRITICAL FIX: Use same logic as contract - available_assets and active_shares
      const pendingUnstakeShares = vaultAccount.pendingUnstakeShares.toNumber()
      const reservedAssets = vaultAccount.reservedAssets.toNumber()
      const availableAssets = totalAssets - reservedAssets
      const activeShares = totalShares - pendingUnstakeShares

      let userAssetValue = 0
      if (activeShares > 0) {
        userAssetValue = (userShares * availableAssets) / activeShares
      }

      console.log('💎 user asset value:')
      console.log(`shares: ${userShares}`)
      console.log(`asset value: ${userAssetValue / 1e9} USDC`)
      console.log(
        `current share value: ${
          activeShares > 0 ? (availableAssets / activeShares).toFixed(6) : 0
        } USDC/share`
      )
      console.log(`available assets: ${availableAssets / 1e9} USDC`)
      console.log(`active shares: ${activeShares}`)

      return userAssetValue
    } catch (error) {
      console.error('❌ calculate user asset value failed:', error)
      throw error
    }
  }

  // query user token balance
  async getUserTokenBalance(): Promise<number> {
    try {
      const userTokenAccount = await getAssociatedTokenAddress(
        this.config.tokenMint,
        this.userWallet.publicKey
      )

      // check if account exists
      const accountInfo = await this.provider.connection.getAccountInfo(
        userTokenAccount
      )
      if (!accountInfo) {
        console.log('💰 用户Token余额:')
        console.log(`USDC余额: 0 USDC (账户不存在)`)
        return 0
      }

      const tokenAccountInfo = await getAccount(
        this.provider.connection,
        userTokenAccount
      )
      const balance = Number(tokenAccountInfo.amount)

      console.log('💰 user token balance:')
      console.log(`USDC balance: ${balance / 1e9} USDC`)

      return balance
    } catch (error) {
      console.error('❌ get user token balance failed:', error)
      console.log('hint: user may not have created a token account')
      return 0
    }
  }

  // check unstake request status
  async checkUnstakeRequestStatus(): Promise<{
    canUnstake: boolean
    remainingTime: number
  }> {
    try {
      const [vaultPDA] = this.getVaultPDA()
      const [vaultDepositorPDA] = this.getVaultDepositorPDA()

      const vaultAccount = await this.program.account.vault.fetch(vaultPDA)
      const depositorAccount = await this.program.account.vaultDepositor.fetch(
        vaultDepositorPDA
      )

      const unstakeRequest = depositorAccount.unstakeRequest
      const lockupPeriod = vaultAccount.unstakeLockupPeriod.toNumber()

      if (unstakeRequest.shares.toNumber() === 0) {
        console.log('📤 no pending unstake request')
        return { canUnstake: false, remainingTime: 0 }
      }

      const requestTime = unstakeRequest.requestTime.toNumber()
      const currentTime = Math.floor(Date.now() / 1000)
      const unlockTime = requestTime + lockupPeriod
      const remainingTime = Math.max(0, unlockTime - currentTime)
      const canUnstake = remainingTime === 0

      // Calculate USDC amount for unstake request
      const PRECISION = 1e12 // 1e12 as defined in constants.rs
      const shares = unstakeRequest.shares.toNumber()
      const assetPerShare = Number(unstakeRequest.assetPerShareAtRequest.toString())
      const unstakeUSDCAmount = (shares * assetPerShare) / PRECISION

      console.log('⏰ unstake request status:')
      console.log(`request shares: ${shares}`)
      console.log(`unstake amount: ${(unstakeUSDCAmount / 1e9).toFixed(6)} USDC`)
      console.log(
        `request time: ${new Date(requestTime * 1000).toLocaleString()}`
      )
      console.log(
        `unlock time: ${new Date(unlockTime * 1000).toLocaleString()}`
      )
      console.log(
        `remaining time: ${Math.floor(remainingTime / 3600)} hours ${Math.floor(
          (remainingTime % 3600) / 60
        )} minutes`
      )
      console.log(`can unstake: ${canUnstake ? 'yes' : 'no'}`)

      return { canUnstake, remainingTime }
    } catch (error) {
      console.error('❌ check unstake request status failed:', error)
      throw error
    }
  }

  // get reward distribution info
  async getRewardDistributionInfo(): Promise<void> {
    try {
      const [vaultPDA] = this.getVaultPDA()
      const vaultAccount = await this.program.account.vault.fetch(vaultPDA)

      console.log('💰 reward distribution info:')
      console.log('  - platform account receives 50% of all rewards')
      console.log(
        '  - vault users receive 50% of all rewards (auto-compounded)'
      )
      console.log(
        `  - platform account: ${vaultAccount.platformAccount.toString()}`
      )
      console.log(
        `  - total rewards distributed: ${
          vaultAccount.totalRewards.toNumber() / 1e9
        } USDC`
      )
      console.log(
        `  - rewards per share: ${vaultAccount.rewardsPerShare.toString()}`
      )
      console.log(
        `  - last reward update: ${new Date(
          vaultAccount.lastRewardsUpdate.toNumber() * 1000
        ).toLocaleString()}`
      )
    } catch (error) {
      console.error('❌ get reward distribution info failed:', error)
      throw error
    }
  }

  // get full user report
  async getUserReport(): Promise<void> {
    try {
      console.log('📋 ===== full user report =====')
      console.log()

      await this.getVaultInfo()
      console.log()

      // check if user account exists
      try {
        await this.getUserInfo()
      } catch (error) {
        console.log('👤 user info: user account not initialized')
        console.log(
          'hint: please call initializeDepositor() to create user account'
        )
      }
      console.log()

      try {
        await this.getUserAssetValue()
      } catch (error) {
        console.log('💎 user asset value: 0 USDC (user account not exists)')
      }
      console.log()

      await this.getUserTokenBalance()
      console.log()

      try {
        await this.checkUnstakeRequestStatus()
      } catch (error) {
        console.log(
          '⏰ unstake request status: no unstake request (user account not exists)'
        )
      }
      console.log()

      await this.getRewardDistributionInfo()
      console.log()

      // Add APY/APR calculation
      try {
        await this.calculateAPYAPR()
      } catch (error) {
        console.log('📈 APY/APR calculation: Unable to calculate (insufficient data)')
      }
      console.log()

      // Add stake statistics
      try {
        await this.getStakeStatistics()
      } catch (error) {
        console.log('📊 Stake statistics: Unable to fetch statistics')
      }
      console.log()

      console.log('📋 ===== report end =====')
    } catch (error) {
      console.error('❌ generate user report failed:', error)
      throw error
    }
  }

  // ============ ADMIN FUNCTIONS ============

  // add rewards (admin only) - 50/50 split between platform and users
  async addRewards(
    amount: number,
    rewardSourceAccount?: PublicKey,
    platformTokenAccount?: PublicKey
  ): Promise<string> {
    try {
      const [vaultPDA] = this.getVaultPDA()
      const [vaultTokenAccountPDA] = this.getVaultTokenAccountPDA()

      // Use provided accounts or calculate default ones
      const sourceAccount =
        rewardSourceAccount ||
        (await getAssociatedTokenAddress(
          this.config.tokenMint,
          this.userWallet.publicKey
        ))

      const platformAccount =
        platformTokenAccount || (await this.getDefaultPlatformTokenAccount())

      console.log('🎁 Adding rewards with 50/50 split...')
      console.log(`Total reward amount: ${amount / 1e9} USDC`)
      console.log(`Platform will receive: ${(amount * 0.5) / 1e9} USDC (50%)`)
      console.log(
        `Vault users will receive: ${(amount * 0.5) / 1e9} USDC (50%)`
      )
      console.log(`Vault PDA: ${vaultPDA.toString()}`)
      console.log(`Vault Token Account: ${vaultTokenAccountPDA.toString()}`)
      console.log(`Platform Token Account: ${platformAccount.toString()}`)
      console.log(`Reward Source Account: ${sourceAccount.toString()}`)

      // Check source account balance
      const sourceBalance = await this.checkTokenBalance(sourceAccount)
      if (sourceBalance < amount) {
        throw new Error(
          `Insufficient balance in reward source account. Required: ${
            amount / 1e9
          } USDC, Available: ${sourceBalance / 1e9} USDC`
        )
      }

      console.log(
        `✅ Source account balance sufficient: ${sourceBalance / 1e9} USDC`
      )

      const tx = await this.program.methods
        .addRewards(new anchor.BN(amount))
        .accounts({
          vault: vaultPDA,
          vaultTokenAccount: vaultTokenAccountPDA,
          rewardSourceAccount: sourceAccount,
          platformTokenAccount: platformAccount,
          rewardSourceAuthority: this.userWallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([this.userWallet])
        .rpc()

      console.log('✅ Rewards added successfully!')
      console.log(`Transaction: ${tx}`)

      // Show updated vault status
      await this.getVaultInfo()

      return tx
    } catch (error) {
      console.error('❌ Add rewards failed:', error)
      throw error
    }
  }

  // Helper function to get default platform token account
  private async getDefaultPlatformTokenAccount(): Promise<PublicKey> {
    try {
      // Get vault info to find platform account
      const [vaultPDA] = this.getVaultPDA()
      const vaultAccount = await this.program.account.vault.fetch(vaultPDA)

      // Return the ATA for the platform account
      return await getAssociatedTokenAddress(
        this.config.tokenMint,
        vaultAccount.platformAccount
      )
    } catch (error) {
      console.error('❌ Failed to get platform token account:', error)
      throw error
    }
  }

  // Helper function to check token account balance
  private async checkTokenBalance(tokenAccount: PublicKey): Promise<number> {
    try {
      const accountInfo = await this.provider.connection.getAccountInfo(
        tokenAccount
      )
      if (!accountInfo) {
        return 0
      }

      const tokenAccountInfo = await getAccount(
        this.provider.connection,
        tokenAccount
      )
      return Number(tokenAccountInfo.amount)
    } catch (error) {
      console.error('❌ Failed to check token balance:', error)
      return 0
    }
  }

  // Simulate reward injection (dry run)
  async simulateRewardInjection(amount: number): Promise<void> {
    try {
      console.log('🔍 Simulating reward injection...')
      console.log(`Simulation amount: ${amount / 1e9} USDC`)

      // Show current vault status
      console.log('\n📊 Current vault status:')
      await this.getVaultInfo()

      // Check source balance
      const sourceAccount = await getAssociatedTokenAddress(
        this.config.tokenMint,
        this.userWallet.publicKey
      )
      const sourceBalance = await this.checkTokenBalance(sourceAccount)

      console.log(
        `\n💰 Reward source account balance: ${sourceBalance / 1e9} USDC`
      )

      // Calculate 50/50 split
      const platformShare = Math.floor(amount * 0.5)
      const vaultShare = amount - platformShare

      console.log('\n📋 Expected results after injection:')
      console.log(
        `Source account balance will become: ${
          (sourceBalance - amount) / 1e9
        } USDC`
      )
      console.log(
        `Platform account will receive: ${platformShare / 1e9} USDC (50%)`
      )
      console.log(`Vault users will receive: ${vaultShare / 1e9} USDC (50%)`)
      console.log(
        `Vault total rewards will increase by: ${vaultShare / 1e9} USDC`
      )

      console.log(
        "\n✅ Simulation complete. Use the 'add-rewards' command to actually execute."
      )
    } catch (error) {
      console.error('❌ Simulation failed:', error)
      throw error
    }
  }

  // Calculate APY/APR based on vault performance
  async calculateAPYAPR(periodDays: number = 30): Promise<{apy: number, apr: number}> {
    try {
      console.log(`📈 Calculating APY/APR based on ${periodDays} days performance...`)
      
      const [vaultPDA] = this.getVaultPDA()
      const vaultAccount = await this.program.account.vault.fetch(vaultPDA)
      
      const totalAssets = vaultAccount.totalAssets.toNumber()
      const totalRewards = vaultAccount.totalRewards.toNumber()
      const totalShares = vaultAccount.totalShares.toNumber()
      const createdAt = vaultAccount.createdAt.toNumber()
      
      // Calculate time periods
      const currentTime = Math.floor(Date.now() / 1000)
      const vaultAgeSeconds = currentTime - createdAt
      const vaultAgeDays = vaultAgeSeconds / (24 * 60 * 60)
      
      console.log(`\n🏦 Vault Performance Metrics:`)
      console.log(`   Vault age: ${vaultAgeDays.toFixed(2)} days`)
      console.log(`   Total assets: ${totalAssets / 1e9} USDC`)
      console.log(`   Total rewards distributed: ${totalRewards / 1e9} USDC`)
      console.log(`   Total shares: ${totalShares}`)
      
      // Calculate yield metrics
      let apy = 0
      let apr = 0
      
      if (totalAssets > 0 && vaultAgeDays > 0 && totalRewards > 0) {
        // For yield calculation, we need to understand:
        // - totalRewards: cumulative rewards added to vault (50% of all add_rewards calls)
        // - totalAssets: current total value in vault (includes compounded growth)
        // - The vault compounds automatically, so share value increases over time
        
        // Method 1: Use total rewards as yield over time
        // This assumes all current assets were there from the beginning (simplified)
        const avgAssets = totalAssets // Approximation: current total as average
        const totalYieldRate = totalRewards / avgAssets
        const dailyYield = totalYieldRate / vaultAgeDays
        
        // APR (simple interest): daily yield × 365
        apr = dailyYield * 365 * 100
        
        // APY (compound interest): (1 + daily yield)^365 - 1
        apy = (Math.pow(1 + dailyYield, 365) - 1) * 100
        
        console.log(`\n📊 Yield Calculations:`)
        console.log(`   Current total assets: ${totalAssets / 1e9} USDC`)
        console.log(`   Total rewards distributed: ${totalRewards / 1e9} USDC`)
        console.log(`   Total yield over ${vaultAgeDays.toFixed(2)} days: ${(totalYieldRate * 100).toFixed(4)}%`)
        console.log(`   Average daily yield rate: ${(dailyYield * 100).toFixed(6)}%`)
        console.log(`   APR (Annual Percentage Rate): ${apr.toFixed(2)}%`)
        console.log(`   APY (Annual Percentage Yield): ${apy.toFixed(2)}%`)
        
        console.log(`\n📋 Calculation Method:`)
        console.log(`   • This calculation uses total rewards distributed as yield`)
        console.log(`   • Assumes current asset level as baseline (simplified model)`)
        console.log(`   • Actual performance may vary due to timing of stakes/unstakes`)
        
        // Show estimated future returns
        console.log(`\n🔮 Estimated Returns (based on historical performance):`)
        console.log(`   1 month (30 days): ${(apr / 12).toFixed(2)}% return`)
        console.log(`   3 months (90 days): ${(apr / 4).toFixed(2)}% return`)
        console.log(`   6 months (180 days): ${(apr / 2).toFixed(2)}% return`)
        console.log(`   1 year (365 days): ${apr.toFixed(2)}% return (APR)`)
        console.log(`   1 year (365 days): ${apy.toFixed(2)}% return (APY, compounded)`)
      } else if (totalRewards === 0) {
        console.log(`\n⚠️ Unable to calculate yield: No rewards distributed yet`)
        console.log(`   Total rewards: ${totalRewards / 1e9} USDC`)
        console.log(`   Wait for rewards to be added to the vault for yield calculation`)
      } else {
        console.log(`\n⚠️ Unable to calculate yield: Insufficient data`)
        console.log(`   Total assets: ${totalAssets}`)
        console.log(`   Vault age: ${vaultAgeDays.toFixed(2)} days`)
      }
      
      console.log(`\n💡 Note: These calculations are based on historical performance and do not guarantee future returns.`)
      
      return { apy, apr }
    } catch (error) {
      console.error('❌ Calculate APY/APR failed:', error)
      throw error
    }
  }

  // Get stake statistics - all addresses and their stake amounts
  async getStakeStatistics(): Promise<void> {
    try {
      console.log('📊 Fetching stake statistics...')
      
      const [vaultPDA] = this.getVaultPDA()
      
      // Get all VaultDepositor accounts for this vault
      const depositorAccounts = await this.program.account.vaultDepositor.all([
        {
          memcmp: {
            offset: 8, // Skip discriminator
            bytes: vaultPDA.toBase58(), // Filter by vault
          },
        },
      ])
      
      console.log(`\n👥 Stake Statistics:`)
      console.log(`   Total stakers: ${depositorAccounts.length}`)
      
      if (depositorAccounts.length === 0) {
        console.log(`   No stakers found for this vault.`)
        return
      }
      
      // Get vault info for calculations
      const vaultAccount = await this.program.account.vault.fetch(vaultPDA)
      const totalAssets = vaultAccount.totalAssets.toNumber()
      const totalShares = vaultAccount.totalShares.toNumber()
      const pendingUnstakeShares = vaultAccount.pendingUnstakeShares.toNumber()
      const reservedAssets = vaultAccount.reservedAssets.toNumber()
      const availableAssets = totalAssets - reservedAssets
      const activeShares = totalShares - pendingUnstakeShares
      
      // Sort by stake amount (descending)
      const stakersData = depositorAccounts
        .map((account) => {
          const depositor = account.account
          const shares = depositor.shares.toNumber()
          const totalStaked = depositor.totalStaked.toNumber()
          const totalUnstaked = depositor.totalUnstaked.toNumber()
          
          // Calculate current asset value using same logic as getUserAssetValue
          let currentValue = 0
          if (activeShares > 0 && shares > 0) {
            currentValue = Math.floor((shares * availableAssets) / activeShares)
          }
          
          // Calculate share percentage
          const sharePercentage = totalShares > 0 ? (shares * 100) / totalShares : 0
          
          return {
            address: depositor.authority,
            shares,
            totalStaked,
            totalUnstaked,
            currentValue,
            sharePercentage,
            hasUnstakeRequest: depositor.unstakeRequest.shares.toNumber() > 0,
            unstakeRequestShares: depositor.unstakeRequest.shares.toNumber(),
          }
        })
        .filter(staker => staker.shares > 0) // Only show active stakers
        .sort((a, b) => b.currentValue - a.currentValue) // Sort by current value descending
      
      console.log(`   Active stakers: ${stakersData.length}`)
      console.log(`   Total vault assets: ${totalAssets / 1e9} USDC`)
      console.log(`   Available assets: ${availableAssets / 1e9} USDC`)
      console.log(`   Reserved assets: ${reservedAssets / 1e9} USDC`)
      console.log(`   Total shares: ${totalShares}`)
      console.log(`   Active shares: ${activeShares}`)
      
      console.log(`\n📋 Detailed Staker Information:`)
      console.log(`${'Rank'.padEnd(4)} ${'Address'.padEnd(44)} ${'Shares'.padEnd(12)} ${'Current Value'.padEnd(15)} ${'Share %'.padEnd(8)} ${'Total Staked'.padEnd(15)} ${'Total Unstaked'.padEnd(17)} ${'Pending Unstake'}`)
      console.log('='.repeat(140))
      
      stakersData.forEach((staker, index) => {
        const rank = (index + 1).toString().padEnd(4)
        const address = staker.address.toBase58().padEnd(44)
        const shares = staker.shares.toString().padEnd(12)
        const currentValue = `${(staker.currentValue / 1e9).toFixed(6)} USDC`.padEnd(15)
        const sharePercent = `${staker.sharePercentage.toFixed(2)}%`.padEnd(8)
        const totalStaked = `${(staker.totalStaked / 1e9).toFixed(6)} USDC`.padEnd(15)
        const totalUnstaked = `${(staker.totalUnstaked / 1e9).toFixed(6)} USDC`.padEnd(17)
        const pendingUnstake = staker.hasUnstakeRequest ? 
          `${staker.unstakeRequestShares} shares` : 
          'None'
        
        console.log(`${rank} ${address} ${shares} ${currentValue} ${sharePercent} ${totalStaked} ${totalUnstaked} ${pendingUnstake}`)
      })
      
      // Summary statistics
      const totalCurrentValue = stakersData.reduce((sum, staker) => sum + staker.currentValue, 0)
      const totalStakedAmount = stakersData.reduce((sum, staker) => sum + staker.totalStaked, 0)
      const totalUnstakedAmount = stakersData.reduce((sum, staker) => sum + staker.totalUnstaked, 0)
      const stakersWithPendingUnstake = stakersData.filter(s => s.hasUnstakeRequest).length
      
      console.log('\n📈 Summary Statistics:')
      console.log(`   Total current value: ${totalCurrentValue / 1e9} USDC`)
      console.log(`   Total staked amount: ${totalStakedAmount / 1e9} USDC`)
      console.log(`   Total unstaked amount: ${totalUnstakedAmount / 1e9} USDC`)
      console.log(`   Stakers with pending unstake: ${stakersWithPendingUnstake}`)
      console.log(`   Average stake per user: ${(totalCurrentValue / stakersData.length) / 1e9} USDC`)
      
      // Distribution analysis
      if (stakersData.length > 0) {
        const top10Percent = Math.max(1, Math.floor(stakersData.length * 0.1))
        const top10Value = stakersData.slice(0, top10Percent).reduce((sum, s) => sum + s.currentValue, 0)
        const top10Concentration = (top10Value / totalCurrentValue) * 100
        
        console.log(`\n🎯 Concentration Analysis:`)
        console.log(`   Top 10% of stakers (${top10Percent} users) control: ${top10Concentration.toFixed(2)}% of total value`)
        console.log(`   Largest staker controls: ${stakersData[0].sharePercentage.toFixed(2)}% of total shares`)
        console.log(`   Smallest staker controls: ${stakersData[stakersData.length - 1].sharePercentage.toFixed(2)}% of total shares`)
      }
      
    } catch (error) {
      console.error('❌ Get stake statistics failed:', error)
      throw error
    }
  }
}

// example
export async function example() {
  // config
  const config: VaultConfig = {
    programId: new PublicKey('YOUR_PROGRAM_ID'), // replace with actual program id
    vaultName: 'TestVault',
    tokenMint: new PublicKey('YOUR_TOKEN_MINT'), // replace with actual token mint
    rpcUrl: clusterApiUrl('devnet'),
  }

  // load user wallet
  const userWallet = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync('path/to/user-wallet.json', 'utf8')))
  )

  // create operation instance
  const operations = new VaultUserOperations(config, userWallet)

  try {
    // example operation flow
    console.log('start user operation example...')

    // 1. initialize depositor account
    // await operations.initializeDepositor();

    // 2. query info
    await operations.getUserReport()

    // 3. stake operation
    // await operations.stake(100 * 1e9); // stake 100 USDC

    // 4. request unstake
    // await operations.requestUnstake(50 * 1e9); // request unstake 50 USDC

    // 5. wait for the lockup period to end and execute unstake
    // await operations.unstake();
  } catch (error) {
    console.error('operation failed:', error)
  }
}

// create config helper function
export function createConfig(
  programId: string,
  vaultName: string,
  tokenMint: string,
  rpcUrl?: string
): VaultConfig {
  return {
    programId: new PublicKey(programId),
    vaultName,
    tokenMint: new PublicKey(tokenMint),
    rpcUrl: rpcUrl || clusterApiUrl('devnet'),
  }
}

// load wallet from file helper function
export function loadWallet(walletPath: string): Keypair {
  try {
    const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf8'))
    return Keypair.fromSecretKey(Buffer.from(secretKey))
  } catch (error) {
    throw new Error(`failed to load wallet file ${walletPath}: ${error}`)
  }
}

// if directly run this file
if (require.main === module) {
  example()
}
