#!/usr/bin/env node

import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { SimpleVault } from '../target/types/simple_vault'
import { PublicKey, Connection, Keypair } from '@solana/web3.js'
import * as fs from 'fs'
import * as os from 'os'
import contract_info from './contract_info.json'

interface VaultAdminConfig {
  programId: PublicKey
  vaultName: string
  rpcUrl: string
}

export class VaultAdminOperations {
  private program: Program<SimpleVault>
  private provider: anchor.AnchorProvider
  private config: VaultAdminConfig
  private adminWallet: Keypair

  constructor(config: VaultAdminConfig, adminWallet: Keypair) {
    this.config = config
    this.adminWallet = adminWallet

    const connection = new Connection(config.rpcUrl, 'confirmed')
    this.provider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(adminWallet),
      { commitment: 'confirmed' }
    )

    anchor.setProvider(this.provider)

    let idl
    try {
      idl = JSON.parse(
        fs.readFileSync('../target/idl/simple_vault.json', 'utf8')
      )
    } catch (error) {
      console.warn('Failed to load local IDL file, trying relative path...')
      try {
        idl = require('../target/idl/simple_vault.json')
      } catch (e) {
        throw new Error(
          'Failed to load IDL file. Please ensure the contract is compiled and the IDL file is generated.'
        )
      }
    }

    this.program = new Program(idl, this.provider) as Program<SimpleVault>
  }

  private getVaultPDA(): [PublicKey, number] {
    const vaultNameBuffer = Buffer.alloc(32)
    vaultNameBuffer.write(this.config.vaultName)

    return PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), vaultNameBuffer],
      this.config.programId
    )
  }

  async updateVaultConfig(params: {
    unstakeLockupPeriod?: number // in hours
    managementFee?: number // in basis points (e.g., 100 = 1%)
    minStakeAmount?: number // in USDC (will be converted to 6 decimals)
    maxTotalAssets?: number | null // in USDC (will be converted to 6 decimals), null means unlimited
    isPaused?: boolean
  }): Promise<string> {
    try {
      const [vaultPDA] = this.getVaultPDA()

      console.log('🔧 Updating vault configuration...')
      console.log(`Vault PDA: ${vaultPDA.toString()}`)
      console.log(`Admin: ${this.adminWallet.publicKey.toString()}`)

      // Convert parameters to appropriate format - need to provide all fields
      const updateParams: any = {
        unstakeLockupPeriod: null,
        managementFee: null,
        minStakeAmount: null,
        maxTotalAssets: null,
        isPaused: null,
        platformAccount: null,
      }

      if (params.unstakeLockupPeriod !== undefined) {
        updateParams.unstakeLockupPeriod = new anchor.BN(
          params.unstakeLockupPeriod * 60 * 60
        ) // convert hours to seconds
        console.log(
          `📝 Unstake lockup period: ${params.unstakeLockupPeriod} hours`
        )
      }

      if (params.managementFee !== undefined) {
        updateParams.managementFee = new anchor.BN(params.managementFee)
        console.log(
          `📝 Management fee: ${params.managementFee} basis points (${
            params.managementFee / 100
          }%)`
        )
      }

      if (params.minStakeAmount !== undefined) {
        updateParams.minStakeAmount = new anchor.BN(params.minStakeAmount * 1e9) // convert to 6 decimals
        console.log(`📝 Minimum stake amount: ${params.minStakeAmount} USDC`)
      }

      if (params.maxTotalAssets !== undefined) {
        if (params.maxTotalAssets === null) {
          updateParams.maxTotalAssets = new anchor.BN(0) // 0 means unlimited in Rust
          console.log(`📝 Maximum total assets: Unlimited`)
        } else {
          updateParams.maxTotalAssets = new anchor.BN(
            params.maxTotalAssets * 1e9
          ) // convert to 6 decimals
          console.log(`📝 Maximum total assets: ${params.maxTotalAssets} USDC`)
        }
      }

      if (params.isPaused !== undefined) {
        updateParams.isPaused = params.isPaused
        console.log(`📝 Vault paused status: ${params.isPaused}`)
      }

      const tx = await this.program.methods
        .updateVaultConfig(updateParams)
        .accounts({
          vault: vaultPDA,
          owner: this.adminWallet.publicKey,
        })
        .signers([this.adminWallet])
        .rpc()

      console.log('✅ Vault configuration updated successfully!')
      console.log(`Transaction: ${tx}`)
      return tx
    } catch (error) {
      console.error('❌ Update vault configuration failed:', error)
      throw error
    }
  }

  async getVaultInfo(): Promise<any> {
    try {
      const [vaultPDA] = this.getVaultPDA()
      const vaultAccount = await this.program.account.vault.fetch(vaultPDA)

      console.log('📊 Current vault configuration:')
      console.log(
        `Name: ${Buffer.from(vaultAccount.name).toString().replace(/\0/g, '')}`
      )
      console.log(`Owner: ${vaultAccount.owner.toString()}`)
      console.log(
        `Platform account: ${vaultAccount.platformAccount.toString()}`
      )
      console.log(
        `Total assets: ${
          Number(vaultAccount.totalAssets.toString()) / 1e9
        } USDC`
      )
      console.log(`Total shares: ${vaultAccount.totalShares.toString()}`)
      console.log(
        `Management fee: ${Number(
          vaultAccount.managementFee.toString()
        )} basis points (${
          Number(vaultAccount.managementFee.toString()) / 100
        }%)`
      )
      console.log(
        `Minimum stake amount: ${
          Number(vaultAccount.minStakeAmount.toString()) / 1e9
        } USDC`
      )
      console.log(
        `Maximum total assets: ${
          vaultAccount.maxTotalAssets.toString() === '0'
            ? 'Unlimited'
            : Number(vaultAccount.maxTotalAssets.toString()) / 1e9 + ' USDC'
        }`
      )
      console.log(
        `Unstake lockup period: ${
          Number(vaultAccount.unstakeLockupPeriod.toString()) / 3600
        } hours`
      )
      console.log(`Is paused: ${vaultAccount.isPaused}`)
      console.log(
        `Created at: ${new Date(
          Number(vaultAccount.createdAt.toString()) * 1000
        ).toLocaleString()}`
      )

      return vaultAccount
    } catch (error) {
      console.error('❌ Get vault info failed:', error)
      throw error
    }
  }
}

// Command line parameter parsing
const args = process.argv.slice(2)
const command = args[0]

const HELP_TEXT = `
🏦 Vault Admin CLI - Configuration Update Tool

Usage:
  node update-vault-params.ts <command> [options]

Available commands:
  help                              Show help information
  info                              Show current vault configuration
  update-lockup <hours>             Update unstake lockup period (hours)
  update-lockup-min <minutes>       Update unstake lockup period (minutes)
  update-fee <basis_points>         Update management fee (basis points, e.g., 100 = 1%)
  update-min-stake <amount>         Update minimum stake amount (USDC)
  update-max-assets <amount>        Update maximum total assets (USDC), use 'unlimited' for no limit
  pause                             Pause the vault
  unpause                           Unpause the vault
  update-multiple                   Update multiple parameters interactively

Configuration options:
  --wallet <path>                   Specify admin wallet file path (default: ~/.config/solana/id.json)
  --rpc <url>                       Specify RPC node URL (default: devnet)

Examples:
  node update-vault-params.ts info                           # Show current vault configuration
  node update-vault-params.ts update-lockup 48              # Set lockup period to 48 hours
  node update-vault-params.ts update-lockup-min 5          # Set lockup period to 5 minutes
  node update-vault-params.ts update-fee 200                # Set management fee to 2%
  node update-vault-params.ts update-min-stake 10           # Set minimum stake to 10 USDC
  node update-vault-params.ts update-max-assets unlimited   # Remove asset limit
  node update-vault-params.ts pause                         # Pause the vault
`

// Get option value
function getOption(option: string, defaultValue?: string): string | undefined {
  const index = args.indexOf(option)
  if (index > -1 && index + 1 < args.length) {
    return args[index + 1]
  }
  return defaultValue
}

// Load configuration
async function loadAdminConfig() {
  const config: VaultAdminConfig = {
    programId: new PublicKey(contract_info.programId),
    vaultName: contract_info.vault_name || 'Insurance Fund Vault',
    rpcUrl:
      getOption('--rpc', 'https://api.devnet.solana.com') ||
      'https://api.devnet.solana.com',
  }

  // Load admin wallet
  const walletPath =
    getOption('--wallet', `${os.homedir()}/.config/solana/id.json`) ||
    `${os.homedir()}/.config/solana/id.json`

  if (!fs.existsSync(walletPath)) {
    throw new Error(`Admin wallet file does not exist: ${walletPath}`)
  }

  const adminWallet = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(walletPath, 'utf8')))
  )

  console.log(`🔑 Using admin wallet: ${adminWallet.publicKey.toString()}`)
  console.log(`📄 Wallet file: ${walletPath}`)

  // Verify admin wallet matches expected address
  if (adminWallet.publicKey.toString() !== contract_info.admin_address) {
    console.warn(`⚠️  Admin wallet address mismatch:`)
    console.warn(`   Expected: ${contract_info.admin_address}`)
    console.warn(`   Actual: ${adminWallet.publicKey.toString()}`)
    console.warn(`   Continuing anyway...`)
  }

  return { config, adminWallet }
}

// Main function
async function main() {
  try {
    if (!command || command === 'help') {
      console.log(HELP_TEXT)
      return
    }

    const { config, adminWallet } = await loadAdminConfig()
    const operations = new VaultAdminOperations(config, adminWallet)

    switch (command) {
      case 'info':
        console.log('📊 Getting current vault configuration...')
        await operations.getVaultInfo()
        break

      case 'update-lockup':
        const lockupHours = parseFloat(args[1])
        if (isNaN(lockupHours) || lockupHours <= 0) {
          throw new Error('Please provide a valid lockup period in hours')
        }
        // Validate minimum 10 minutes (0.167 hours) as per contract
        if (lockupHours < 10 / 60) {
          throw new Error(
            `❌ Lockup period must be at least 10 minutes (${(10 / 60).toFixed(
              3
            )} hours). You provided: ${lockupHours} hours`
          )
        }
        // Validate maximum 90 days as per contract
        if (lockupHours > 90 * 24) {
          throw new Error(
            `❌ Lockup period must not exceed ${
              90 * 24
            } hours (90 days). You provided: ${lockupHours} hours`
          )
        }
        console.log(
          `⏰ Updating unstake lockup period to ${lockupHours} hours...`
        )
        await operations.updateVaultConfig({ unstakeLockupPeriod: lockupHours })
        break

      case 'update-lockup-min':
        const lockupMinutes = parseFloat(args[1])
        if (isNaN(lockupMinutes) || lockupMinutes <= 0) {
          throw new Error('Please provide a valid lockup period in minutes')
        }
        const lockupHoursFromMin = lockupMinutes / 60
        // Validate minimum 10 minutes as per contract
        if (lockupMinutes < 10) {
          throw new Error(
            `❌ Lockup period must be at least 10 minutes. You provided: ${lockupMinutes} minutes`
          )
        }
        // Validate maximum 90 days (129600 minutes) as per contract
        if (lockupMinutes > 90 * 24 * 60) {
          throw new Error(
            `❌ Lockup period must not exceed ${
              90 * 24 * 60
            } minutes (90 days). You provided: ${lockupMinutes} minutes`
          )
        }
        console.log(
          `⏰ Updating unstake lockup period to ${lockupMinutes} minutes (${lockupHoursFromMin.toFixed(
            3
          )} hours)...`
        )
        await operations.updateVaultConfig({
          unstakeLockupPeriod: lockupHoursFromMin,
        })
        break

      case 'update-fee':
        const feeBasisPoints = parseInt(args[1])
        if (isNaN(feeBasisPoints) || feeBasisPoints < 0) {
          throw new Error(
            'Please provide a valid management fee in basis points (e.g., 100 = 1%)'
          )
        }
        console.log(
          `💰 Updating management fee to ${feeBasisPoints} basis points (${
            feeBasisPoints / 100
          }%)...`
        )
        await operations.updateVaultConfig({ managementFee: feeBasisPoints })
        break

      case 'update-min-stake':
        const minStakeAmount = parseFloat(args[1])
        if (isNaN(minStakeAmount) || minStakeAmount <= 0) {
          throw new Error('Please provide a valid minimum stake amount in USDC')
        }
        console.log(
          `💵 Updating minimum stake amount to ${minStakeAmount} USDC...`
        )
        await operations.updateVaultConfig({ minStakeAmount })
        break

      case 'update-max-assets':
        const maxAssetsInput = args[1]
        if (!maxAssetsInput) {
          throw new Error(
            "Please provide maximum total assets amount in USDC or 'unlimited'"
          )
        }

        let maxTotalAssets: number | null
        if (maxAssetsInput.toLowerCase() === 'unlimited') {
          maxTotalAssets = null
          console.log(`📈 Removing maximum total assets limit...`)
        } else {
          const maxAssetsAmount = parseFloat(maxAssetsInput)
          if (isNaN(maxAssetsAmount) || maxAssetsAmount <= 0) {
            throw new Error(
              "Please provide a valid maximum total assets amount in USDC or 'unlimited'"
            )
          }
          maxTotalAssets = maxAssetsAmount
          console.log(
            `📈 Updating maximum total assets to ${maxAssetsAmount} USDC...`
          )
        }
        await operations.updateVaultConfig({ maxTotalAssets })
        break

      case 'pause':
        console.log('⏸️ Pausing the vault...')
        await operations.updateVaultConfig({ isPaused: true })
        break

      case 'unpause':
        console.log('▶️ Unpausing the vault...')
        await operations.updateVaultConfig({ isPaused: false })
        break

      case 'update-multiple':
        console.log(
          '🔧 Interactive multiple parameter update not implemented yet.'
        )
        console.log('Please use individual commands for now.')
        break

      default:
        console.error(`❌ Unknown command: ${command}`)
        console.log(
          "\nUse 'node update-vault-params.ts help' to view help information"
        )
        process.exit(1)
    }

    console.log('\n✅ Operation completed!')
  } catch (error) {
    console.error('❌ Operation failed:', error)
    process.exit(1)
  }
}

main()
