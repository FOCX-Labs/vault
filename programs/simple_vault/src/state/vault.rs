use anchor_lang::prelude::*;
use crate::constants::*;
use crate::error::*;
use crate::utils::*;
use crate::math::{SafeMath, SafeCast, vault_math};

#[account]
#[derive(Default)]
pub struct Vault {
    /// The name of the vault
    pub name: [u8; 32],
    /// The vault's pubkey
    pub pubkey: Pubkey,
    /// The owner/admin of the vault
    pub owner: Pubkey,
    /// Owner's accumulated management fee shares
    pub owner_shares: u64,
    /// The token mint for staking
    pub token_mint: Pubkey,
    /// The vault token account (insurance fund)
    pub vault_token_account: Pubkey,
    /// The rewards token account
    pub rewards_token_account: Pubkey,
    /// Total supply of shares
    pub total_shares: u64,
    /// Total assets in the vault
    pub total_assets: u64,
    /// Total rewards distributed
    pub total_rewards: u64,
    /// Rewards per share (scaled by SHARE_PRECISION)
    pub rewards_per_share: u128,
    /// Last time rewards were updated
    pub last_rewards_update: i64,
    /// Unstake lockup period in seconds
    pub unstake_lockup_period: i64,
    /// Management fee in basis points
    pub management_fee: u64,
    /// Minimum stake amount
    pub min_stake_amount: u64,
    /// Maximum total assets
    pub max_total_assets: u64,
    /// Whether the vault is paused
    pub is_paused: bool,
    /// Vault creation timestamp
    pub created_at: i64,
    /// Last fee update timestamp
    pub last_fee_update: i64,
    /// Shares base for rebase tracking
    pub shares_base: u32,
    /// Rebase version number to prevent race conditions
    pub rebase_version: u32,
    /// Bump seed for PDA
    pub bump: u8,
    /// Reserved for future use
    pub _reserved: [u64; 5],
}

impl Vault {
    pub const LEN: usize = 8 + // discriminator
        32 + // name
        32 + // pubkey
        32 + // owner
        8 + // owner_shares
        32 + // token_mint
        32 + // vault_token_account
        32 + // rewards_token_account
        8 + // total_shares
        8 + // total_assets
        8 + // total_rewards
        16 + // rewards_per_share
        8 + // last_rewards_update
        8 + // unstake_lockup_period
        8 + // management_fee
        8 + // min_stake_amount
        8 + // max_total_assets
        1 + // is_paused
        8 + // created_at
        8 + // last_fee_update
        4 + // shares_base
        4 + // rebase_version
        1 + // bump
        40; // _reserved

    pub fn initialize(
        &mut self,
        name: [u8; 32],
        pubkey: Pubkey,
        owner: Pubkey,
        token_mint: Pubkey,
        vault_token_account: Pubkey,
        rewards_token_account: Pubkey,
        params: InitializeVaultParams,
        bump: u8,
    ) -> VaultResult<()> {
        self.name = name;
        self.pubkey = pubkey;
        self.owner = owner;
        self.owner_shares = 0;
        self.token_mint = token_mint;
        self.vault_token_account = vault_token_account;
        self.rewards_token_account = rewards_token_account;
        self.total_shares = 0;
        self.total_assets = 0;
        self.total_rewards = 0;
        self.rewards_per_share = 0;
        self.last_rewards_update = get_current_timestamp();
        self.unstake_lockup_period = params.unstake_lockup_period
            .unwrap_or(DEFAULT_UNSTAKE_LOCKUP);
        self.management_fee = params.management_fee
            .unwrap_or(DEFAULT_MANAGEMENT_FEE);
        self.min_stake_amount = params.min_stake_amount.unwrap_or(0);
        self.max_total_assets = params.max_total_assets.unwrap_or(u64::MAX);
        self.is_paused = false;
        self.created_at = get_current_timestamp();
        self.last_fee_update = get_current_timestamp();
        self.shares_base = 0;
        self.rebase_version = 0;
        self.bump = bump;
        
        // Validate configuration
        if self.unstake_lockup_period < MIN_UNSTAKE_LOCKUP_DAYS * ONE_DAY {
            return Err(VaultError::InvalidVaultConfig);
        }
        if self.unstake_lockup_period > MAX_UNSTAKE_LOCKUP_DAYS * ONE_DAY {
            return Err(VaultError::InvalidVaultConfig);
        }
        if self.management_fee > MAX_MANAGEMENT_FEE {
            return Err(VaultError::InvalidVaultConfig);
        }
        
        Ok(())
    }

    pub fn stake(&mut self, amount: u64) -> VaultResult<u64> {
        if self.is_paused {
            return Err(VaultError::VaultPaused);
        }
        
        if amount < self.min_stake_amount {
            return Err(VaultError::MinimumStakeAmountNotMet);
        }
        
        if self.total_assets.safe_add(amount)? > self.max_total_assets {
            return Err(VaultError::VaultIsFull);
        }
        
        // Apply rebase if needed before calculating shares
        self.apply_rebase()?;
        
        // Note: Management fee is no longer automatically applied during stake
        // It should be applied periodically by the vault owner or through a separate instruction
        
        let shares = vault_math::calculate_shares(amount, self.total_shares, self.total_assets)?;
        
        self.total_shares = self.total_shares.safe_add(shares)?;
        self.total_assets = self.total_assets.safe_add(amount)?;
        
        Ok(shares)
    }

    pub fn unstake(&mut self, shares: u64) -> VaultResult<u64> {
        if self.is_paused {
            return Err(VaultError::VaultPaused);
        }
        
        if shares == 0 {
            return Err(VaultError::InvalidAmount);
        }
        
        if shares > self.total_shares {
            return Err(VaultError::InsufficientFunds);
        }
        
        // Apply rebase before calculating assets
        self.apply_rebase()?;
        
        // Note: Management fee is no longer automatically applied during unstake
        // It should be applied periodically by the vault owner or through a separate instruction
        
        let assets = vault_math::calculate_assets(shares, self.total_shares, self.total_assets)?;
        
        // Validate that we have enough assets to withdraw
        if assets > self.total_assets {
            return Err(VaultError::InsufficientFunds);
        }
        
        self.total_shares = self.total_shares.safe_sub(shares)?;
        self.total_assets = self.total_assets.safe_sub(assets)?;
        
        Ok(assets)
    }

    pub fn add_rewards(&mut self, amount: u64) -> VaultResult<()> {
        if self.is_paused {
            return Err(VaultError::VaultPaused);
        }
        
        // Apply rebase before updating assets
        self.apply_rebase()?;
        
        // Add rewards directly to total_assets for automatic compounding
        // This increases the value of each share automatically
        // If no shares exist, these rewards will benefit the first staker
        self.total_assets = self.total_assets.safe_add(amount)?;
        self.total_rewards = self.total_rewards.safe_add(amount)?;
        
        self.last_rewards_update = get_current_timestamp();
        
        // Calculate share value safely to prevent overflow
        let share_value = if self.total_shares > 0 {
            match (self.total_assets as u128).safe_mul(1000u128)?.safe_div(self.total_shares as u128) {
                Ok(val) => val.safe_cast().unwrap_or(0),
                Err(_) => 0,
            }
        } else {
            match (self.total_assets as u128).safe_mul(1000u128) {
                Ok(val) => val.safe_cast().unwrap_or(0),
                Err(_) => 0,
            }
        };
        
        msg!("Added {} rewards to vault assets, new share value: {}", amount, share_value);
        
        Ok(())
    }

    pub fn update_config(&mut self, params: UpdateVaultConfigParams) -> VaultResult<()> {
        if let Some(unstake_lockup_period) = params.unstake_lockup_period {
            if unstake_lockup_period < MIN_UNSTAKE_LOCKUP_DAYS * ONE_DAY
                || unstake_lockup_period > MAX_UNSTAKE_LOCKUP_DAYS * ONE_DAY {
                return Err(VaultError::InvalidVaultConfig);
            }
            self.unstake_lockup_period = unstake_lockup_period;
        }
        
        if let Some(management_fee) = params.management_fee {
            if management_fee > MAX_MANAGEMENT_FEE {
                return Err(VaultError::InvalidVaultConfig);
            }
            self.management_fee = management_fee;
        }
        
        if let Some(min_stake_amount) = params.min_stake_amount {
            self.min_stake_amount = min_stake_amount;
        }
        
        if let Some(max_total_assets) = params.max_total_assets {
            self.max_total_assets = max_total_assets;
        }
        
        if let Some(is_paused) = params.is_paused {
            self.is_paused = is_paused;
        }
        
        Ok(())
    }

    pub fn get_signer_seeds(&self) -> [&[u8]; 3] {
        [b"vault", self.name.as_ref(), std::slice::from_ref(&self.bump)]
    }

    /// Apply rebase mechanism when shares become too large relative to assets
    pub fn apply_rebase(&mut self) -> VaultResult<Option<u128>> {
        if self.total_assets == 0 || self.total_shares <= self.total_assets {
            return Ok(None);
        }

        let (expo_diff, rebase_divisor) = vault_math::calculate_rebase_factor(
            self.total_shares, 
            self.total_assets
        )?;

        if expo_diff > 0 {
            // Prevent shares_base overflow - cap at maximum safe value
            let max_shares_base = 18u32; // 10^18 is still manageable
            if self.shares_base.safe_add(expo_diff)? > max_shares_base {
                return Err(VaultError::MathOverflow);
            }

            // Apply rebase by dividing shares
            self.total_shares = (SafeCast::<u128>::safe_cast(&self.total_shares)?.safe_div(rebase_divisor)?).safe_cast()?;
            self.shares_base = self.shares_base.safe_add(expo_diff)?;
            
            // Increment rebase version to prevent race conditions
            self.rebase_version = self.rebase_version.safe_add(1)?;

            msg!("Vault rebase applied: expo_diff={}, divisor={}, version={}", expo_diff, rebase_divisor, self.rebase_version);
            return Ok(Some(rebase_divisor));
        }

        Ok(None)
    }

    /// Apply time-based management fee with atomic operations
    pub fn apply_management_fee(&mut self) -> VaultResult<u64> {
        let current_time = get_current_timestamp();
        
        // Prevent time manipulation by ensuring time is not in the future
        if current_time < self.last_fee_update {
            return Err(VaultError::InvalidVaultConfig);
        }
        
        let time_elapsed = current_time.safe_sub(self.last_fee_update)?;

        if time_elapsed <= 0 {
            return Ok(0);
        }

        // Take snapshot of current state to prevent race conditions
        let snapshot_total_assets = self.total_assets;
        let snapshot_total_shares = self.total_shares;

        let fee_amount = vault_math::calculate_management_fee(
            snapshot_total_assets,
            self.management_fee,
            time_elapsed,
            self.last_fee_update,
        )?;

        if fee_amount > 0 && snapshot_total_shares > 0 {
            // In the compounding model, management fee is collected by minting new shares to vault owner
            // This dilutes existing shares but preserves the total_assets value
            // The owner receives shares equivalent to the fee amount
            let fee_shares = vault_math::calculate_shares(
                fee_amount, 
                snapshot_total_shares, 
                snapshot_total_assets
            )?;

            // Validate fee_shares is reasonable (not more than 10% of total shares)
            let max_fee_shares = snapshot_total_shares.safe_div(10)?;
            if fee_shares > max_fee_shares {
                return Err(VaultError::InvalidAmount);
            }

            self.total_shares = self.total_shares.safe_add(fee_shares)?;
            self.owner_shares = self.owner_shares.safe_add(fee_shares)?;
            
            msg!("Management fee applied: {} tokens worth of shares ({} shares) minted to vault owner", fee_amount, fee_shares);
            
            // Return the fee_shares for tracking purposes
            self.last_fee_update = current_time;
            return Ok(fee_shares);
        }

        self.last_fee_update = current_time;
        Ok(0)
    }

    /// Get the current share value in the compounding model
    pub fn get_share_value(&self) -> VaultResult<u128> {
        if self.total_shares == 0 {
            return Ok(PRECISION.into()); // Default 1.0 value when no shares exist
        }

        // In the compounding model, share value is simply total_assets / total_shares
        // scaled by precision for better accuracy
        let share_value = SafeCast::<u128>::safe_cast(&self.total_assets)?
            .safe_mul(SafeCast::<u128>::safe_cast(&PRECISION)?)?
            .safe_div(SafeCast::<u128>::safe_cast(&self.total_shares)?)?;

        // Adjust for rebase factor if any rebase has occurred
        let rebase_multiplier = 10u128.pow(self.shares_base);
        share_value.safe_mul(rebase_multiplier)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitializeVaultParams {
    pub unstake_lockup_period: Option<i64>,
    pub management_fee: Option<u64>,
    pub min_stake_amount: Option<u64>,
    pub max_total_assets: Option<u64>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct UpdateVaultConfigParams {
    pub unstake_lockup_period: Option<i64>,
    pub management_fee: Option<u64>,
    pub min_stake_amount: Option<u64>,
    pub max_total_assets: Option<u64>,
    pub is_paused: Option<bool>,
}