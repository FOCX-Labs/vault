use crate::constants::*;
use crate::error::*;
use crate::math::{vault_math, SafeCast, SafeMath};
use crate::utils::*;
use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct Vault {
    /// The name of the vault
    pub name: [u8; 32],
    /// The vault's pubkey
    pub pubkey: Pubkey,
    /// The owner/admin of the vault
    pub owner: Pubkey,
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
    /// Bump seed for PDA
    pub bump: u8,
    /// Reserved for future use
    pub _reserved: [u64; 6],
}

impl Vault {
    pub const LEN: usize = 8 + // discriminator
        32 + // name
        32 + // pubkey
        32 + // owner
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
        1 + // bump
        48; // _reserved

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
    ) -> VaultResult {
        self.name = name;
        self.pubkey = pubkey;
        self.owner = owner;
        self.token_mint = token_mint;
        self.vault_token_account = vault_token_account;
        self.rewards_token_account = rewards_token_account;
        self.total_shares = 0;
        self.total_assets = 0;
        self.total_rewards = 0;
        self.rewards_per_share = 0;
        self.last_rewards_update = get_current_timestamp();
        self.unstake_lockup_period = params
            .unstake_lockup_period
            .unwrap_or(DEFAULT_UNSTAKE_LOCKUP);
        self.management_fee = params.management_fee.unwrap_or(DEFAULT_MANAGEMENT_FEE);
        self.min_stake_amount = params.min_stake_amount.unwrap_or(0);
        self.max_total_assets = params.max_total_assets.unwrap_or(u64::MAX);
        self.is_paused = false;
        self.created_at = get_current_timestamp();
        self.last_fee_update = get_current_timestamp();
        self.shares_base = 0;
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

        // Apply management fee before changing assets
        self.apply_management_fee()?;

        let shares = vault_math::calculate_shares(amount, self.total_shares, self.total_assets)?;

        self.total_shares = self.total_shares.safe_add(shares)?;
        self.total_assets = self.total_assets.safe_add(amount)?;

        Ok(shares)
    }

    pub fn unstake(&mut self, shares: u64) -> VaultResult<u64> {
        if shares == 0 {
            return Err(VaultError::InvalidAmount);
        }

        if shares > self.total_shares {
            return Err(VaultError::InsufficientFunds);
        }

        // Apply rebase and fees before calculating assets
        self.apply_rebase()?;
        self.apply_management_fee()?;

        let assets = vault_math::calculate_assets(shares, self.total_shares, self.total_assets)?;

        self.total_shares = self.total_shares.safe_sub(shares)?;
        self.total_assets = self.total_assets.safe_sub(assets)?;

        Ok(assets)
    }

    pub fn add_rewards(&mut self, amount: u64) -> VaultResult {
        if self.total_shares == 0 {
            return Ok(());
        }

        // Apply rebase before updating rewards
        self.apply_rebase()?;

        self.rewards_per_share = vault_math::calculate_rewards_per_share(
            amount,
            self.total_shares,
            self.rewards_per_share,
        )?;

        self.total_rewards = self.total_rewards.safe_add(amount)?;

        self.last_rewards_update = get_current_timestamp();

        Ok(())
    }

    pub fn update_config(&mut self, params: UpdateVaultConfigParams) -> VaultResult {
        if let Some(unstake_lockup_period) = params.unstake_lockup_period {
            if unstake_lockup_period < MIN_UNSTAKE_LOCKUP_DAYS * ONE_DAY
                || unstake_lockup_period > MAX_UNSTAKE_LOCKUP_DAYS * ONE_DAY
            {
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

    pub fn get_signer_seeds(&self) -> Vec<&[u8]> {
        vec![b"vault", self.name.as_ref(), &[self.bump]]
    }

    /// Apply rebase mechanism when shares become too large relative to assets
    pub fn apply_rebase(&mut self) -> VaultResult<Option<u128>> {
        if self.total_assets == 0 || self.total_shares <= self.total_assets {
            return Ok(None);
        }

        let (expo_diff, rebase_divisor) =
            vault_math::calculate_rebase_factor(self.total_shares, self.total_assets)?;

        if expo_diff > 0 {
            // Apply rebase by dividing shares
            self.total_shares = (self
                .total_shares
                .safe_cast::<u128>()?
                .safe_div(rebase_divisor)?)
            .safe_cast()?;
            self.shares_base = self.shares_base.safe_add(expo_diff)?;

            msg!(
                "Vault rebase applied: expo_diff={}, divisor={}",
                expo_diff,
                rebase_divisor
            );
            return Ok(Some(rebase_divisor));
        }

        Ok(None)
    }

    /// Apply time-based management fee
    pub fn apply_management_fee(&mut self) -> VaultResult<u64> {
        let current_time = get_current_timestamp();
        let time_elapsed = current_time.safe_sub(self.last_fee_update)?;

        if time_elapsed <= 0 {
            return Ok(0);
        }

        let fee_amount = vault_math::calculate_management_fee(
            self.total_assets,
            self.management_fee,
            time_elapsed,
            self.last_fee_update,
        )?;

        if fee_amount > 0 && self.total_shares > 0 {
            // Convert fee to shares that go to the vault owner
            // This effectively reduces the value per share for other users
            let fee_shares =
                vault_math::calculate_shares(fee_amount, self.total_shares, self.total_assets)?;

            self.total_shares = self.total_shares.safe_add(fee_shares)?;

            msg!(
                "Management fee applied: {} tokens, {} shares",
                fee_amount,
                fee_shares
            );
        }

        self.last_fee_update = current_time;
        Ok(fee_amount)
    }

    /// Get the effective share value considering rebase
    pub fn get_effective_share_value(&self) -> VaultResult<u128> {
        if self.total_shares == 0 {
            return Ok(0);
        }

        let base_value = (self.total_assets.safe_cast::<u128>()?)
            .safe_mul(PRECISION.safe_cast::<u128>()?)?
            .safe_div(self.total_shares.safe_cast::<u128>()?)?;

        // Adjust for rebase factor
        let rebase_multiplier = 10u128.pow(self.shares_base);
        base_value.safe_mul(rebase_multiplier)
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
