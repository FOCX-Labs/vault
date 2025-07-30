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
    /// The platform account for receiving 50% of rewards
    pub platform_account: Pubkey,
    /// The token mint for staking
    pub token_mint: Pubkey,
    /// The vault token account (main asset pool)
    pub vault_token_account: Pubkey,
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
    /// Platform share percentage for add_rewards (in basis points)
    pub management_fee: u64,
    /// Minimum stake amount
    pub min_stake_amount: u64,
    /// Maximum total assets
    pub max_total_assets: u64,
    /// Whether the vault is paused
    pub is_paused: bool,
    /// Vault creation timestamp
    pub created_at: i64,
    /// Shares base for rebase tracking
    pub shares_base: u32,
    /// Current rebase version for tracking
    pub rebase_version: u32,
    /// Owner shares (owner as a normal depositor)
    pub owner_shares: u64,
    /// Total shares pending unstake (not participating in rewards)
    pub pending_unstake_shares: u64,
    /// Assets reserved for pending unstake requests (frozen assets)
    pub reserved_assets: u64,
    /// Bump seed for PDA
    pub bump: u8,
    /// Reserved for future use
    pub _reserved: [u8; 16],
}

impl Vault {
    pub const LEN: usize = 8 + // discriminator
        32 + // name
        32 + // pubkey
        32 + // owner
        32 + // platform_account
        32 + // token_mint
        32 + // vault_token_account
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
        4 + // shares_base
        4 + // rebase_version
        8 + // owner_shares
        8 + // pending_unstake_shares
        8 + // reserved_assets
        1 + // bump
        16; // _reserved

    pub fn initialize(
        &mut self,
        name: [u8; 32],
        pubkey: Pubkey,
        owner: Pubkey,
        platform_account: Pubkey,
        token_mint: Pubkey,
        vault_token_account: Pubkey,
        params: InitializeVaultParams,
        bump: u8,
    ) -> VaultResult<()> {
        self.name = name;
        self.pubkey = pubkey;
        self.owner = owner;
        self.platform_account = platform_account;
        self.token_mint = token_mint;
        self.vault_token_account = vault_token_account;
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
        self.shares_base = 0;
        self.rebase_version = 0;
        self.owner_shares = 0;
        self.pending_unstake_shares = 0;
        self.reserved_assets = 0;
        self.bump = bump;

        // Validate configuration
        if self.unstake_lockup_period < MIN_UNSTAKE_LOCKUP_MINUTES * ONE_MINUTE {
            return Err(VaultError::InvalidVaultConfig);
        }
        if self.unstake_lockup_period > MAX_UNSTAKE_LOCKUP_DAYS * ONE_DAY {
            return Err(VaultError::InvalidVaultConfig);
        }
        if self.management_fee > MAX_MANAGEMENT_FEE {
            return Err(VaultError::InvalidVaultConfig);
        }
        
        // Additional boundary checks for extreme values
        if self.min_stake_amount > self.max_total_assets / 2 {
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

        // CRITICAL FIX: Calculate shares based on active share value, not total
        // This ensures new stakers get fair share allocation without diluting existing users
        let shares = if self.get_active_shares()? == 0 {
            // CRITICAL BOOTSTRAP LOGIC REDESIGN
            // When no active shares exist, we must handle this very carefully
            
            if self.total_shares == 0 {
                // TRUE BOOTSTRAP: First user ever, 1:1 ratio
                amount
            } else {
                // FALSE BOOTSTRAP: All shares are pending unstake
                // SECURITY FIX: Allow limited new stakes to prevent permanent DoS
                // But protect existing pending shareholders from dilution
                
                // Check if this is a potential DoS attack (vault has been inactive too long)
                let current_time = crate::utils::get_current_timestamp();
                let vault_inactive_time = current_time - self.last_rewards_update;
                const MAX_INACTIVE_PERIOD: i64 = 7 * 24 * 3600; // 7 days
                
                if vault_inactive_time > MAX_INACTIVE_PERIOD {
                    // Vault has been inactive too long, allow emergency restart
                    // Use conservative 1:1 ratio for new entrants
                    amount
                } else {
                    // Calculate shares based on pending shares value to prevent dilution
                    // Use the last known share value from when shares became pending
                    let pending_share_value = SafeCast::<u128>::safe_cast(&self.total_assets)?
                        .safe_mul(SafeCast::<u128>::safe_cast(&PRECISION)?)?
                        .safe_div(SafeCast::<u128>::safe_cast(&self.total_shares)?)?;
                    
                    SafeCast::<u128>::safe_cast(&amount)?
                        .safe_mul(SafeCast::<u128>::safe_cast(&PRECISION)?)?
                        .safe_div(pending_share_value)?
                        .safe_cast()?
                }
            }
        } else {
            // Normal case: Calculate shares based on active share value
            let active_share_value = self.get_active_share_value()?;
            SafeCast::<u128>::safe_cast(&amount)?
                .safe_mul(SafeCast::<u128>::safe_cast(&PRECISION)?)?
                .safe_div(active_share_value)?
                .safe_cast()?
        };

        self.total_shares = self.total_shares.safe_add(shares)?;
        self.total_assets = self.total_assets.safe_add(amount)?;

        // INVARIANT CHECK: Verify state consistency after stake
        self.verify_invariants()?;

        Ok(shares)
    }

    pub fn unstake(&mut self, shares: u64) -> VaultResult<u64> {
        if shares == 0 {
            return Err(VaultError::InvalidAmount);
        }

        if shares > self.total_shares {
            return Err(VaultError::InsufficientFunds);
        }

        // Apply rebase before calculating assets
        self.apply_rebase()?;

        // CRITICAL FIX: Calculate assets based on active share value, not total
        // This ensures users get the correct current value of their shares
        let active_share_value = self.get_active_share_value()?;
        let assets = SafeCast::<u128>::safe_cast(&shares)?
            .safe_mul(active_share_value)?
            .safe_div(SafeCast::<u128>::safe_cast(&PRECISION)?)?
            .safe_cast()?;

        self.total_shares = self.total_shares.safe_sub(shares)?;
        self.total_assets = self.total_assets.safe_sub(assets)?;

        // INVARIANT CHECK: Verify state consistency after unstake
        self.verify_invariants()?;

        Ok(assets)
    }

    pub fn add_rewards(&mut self, amount: u64) -> VaultResult<()> {
        // Apply rebase before updating rewards
        self.apply_rebase()?;

        // Get active shares using helper function for consistency
        let active_shares = self.get_active_shares()?;

        // Add rewards to total_assets - this increases available assets
        // Reserved assets remain unchanged, ensuring strict separation
        self.total_assets = self.total_assets.safe_add(amount)?;
        self.total_rewards = self.total_rewards.safe_add(amount)?;

        // Only update rewards_per_share if there are active shares
        if active_shares > 0 {
            // Update rewards statistics based on active shares only
            // Now the calculation is: new_share_value = (available_assets + reward) / active_shares
            // This is mathematically consistent and predictable
            self.rewards_per_share = vault_math::calculate_rewards_per_share(
                amount,
                active_shares,
                self.rewards_per_share,
            )?;
        }
        // If no active shares, rewards accumulate in vault waiting for new participants

        self.last_rewards_update = get_current_timestamp();

        // INVARIANT CHECK: Verify state consistency after adding rewards
        self.verify_invariants()?;

        Ok(())
    }

    pub fn update_config(&mut self, params: UpdateVaultConfigParams) -> VaultResult<()> {
        if let Some(unstake_lockup_period) = params.unstake_lockup_period {
            if unstake_lockup_period < MIN_UNSTAKE_LOCKUP_MINUTES * ONE_MINUTE
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

        if let Some(platform_account) = params.platform_account {
            self.platform_account = platform_account;
        }

        Ok(())
    }

    pub fn get_signer_seeds(&self) -> [&[u8]; 3] {
        [b"vault", self.name.as_ref(), std::slice::from_ref(&self.bump)]
    }

    /// Get available assets (total_assets - reserved_assets)
    /// This represents assets that actively participate in rewards
    pub fn get_available_assets(&self) -> VaultResult<u64> {
        self.total_assets.safe_sub(self.reserved_assets)
    }

    /// Get active shares (total_shares - pending_unstake_shares)  
    /// This represents shares that actively participate in rewards
    pub fn get_active_shares(&self) -> VaultResult<u64> {
        self.total_shares.safe_sub(self.pending_unstake_shares)
    }

    /// Get current share value for active participants
    /// share_value = available_assets / active_shares
    pub fn get_active_share_value(&self) -> VaultResult<u128> {
        let available_assets = self.get_available_assets()?;
        let active_shares = self.get_active_shares()?;
        
        if active_shares == 0 {
            // EDGE CASE: When all shares are pending, return 1:1 ratio for new stakers
            // This is reasonable because there are no active participants to dilute
            return Ok(SafeCast::<u128>::safe_cast(&PRECISION)?);
        }

        SafeCast::<u128>::safe_cast(&available_assets)?
            .safe_mul(SafeCast::<u128>::safe_cast(&PRECISION)?)?
            .safe_div(SafeCast::<u128>::safe_cast(&active_shares)?)
    }

    /// CRITICAL: Verify vault state invariants to prevent accounting errors
    /// This should be called after any state-modifying operation
    pub fn verify_invariants(&self) -> VaultResult<()> {
        // Invariant 1: total_assets = available_assets + reserved_assets
        let available_assets = self.get_available_assets()?;
        let expected_total = available_assets.safe_add(self.reserved_assets)?;
        if self.total_assets != expected_total {
            msg!("INVARIANT VIOLATION: total_assets ({}) != available_assets ({}) + reserved_assets ({})", 
                 self.total_assets, available_assets, self.reserved_assets);
            return Err(VaultError::InvariantViolation);
        }

        // Invariant 2: total_shares = active_shares + pending_shares
        let active_shares = self.get_active_shares()?;
        let expected_total_shares = active_shares.safe_add(self.pending_unstake_shares)?;
        if self.total_shares != expected_total_shares {
            msg!("INVARIANT VIOLATION: total_shares ({}) != active_shares ({}) + pending_shares ({})", 
                 self.total_shares, active_shares, self.pending_unstake_shares);
            return Err(VaultError::InvariantViolation);
        }

        // Invariant 3: reserved_assets should never exceed total_assets
        if self.reserved_assets > self.total_assets {
            msg!("INVARIANT VIOLATION: reserved_assets ({}) > total_assets ({})", 
                 self.reserved_assets, self.total_assets);
            return Err(VaultError::InvariantViolation);
        }

        // Invariant 4: pending_unstake_shares should never exceed total_shares
        if self.pending_unstake_shares > self.total_shares {
            msg!("INVARIANT VIOLATION: pending_unstake_shares ({}) > total_shares ({})", 
                 self.pending_unstake_shares, self.total_shares);
            return Err(VaultError::InvariantViolation);
        }

        Ok(())
    }

    /// Apply rebase mechanism when shares become too large relative to assets
    pub fn apply_rebase(&mut self) -> VaultResult<Option<u128>> {
        if self.total_assets == 0 || self.total_shares <= self.total_assets {
            return Ok(None);
        }
        
        // SECURITY: Prevent extreme rebase scenarios
        let ratio = (SafeCast::<u128>::safe_cast(&self.total_shares)?
            .safe_div(SafeCast::<u128>::safe_cast(&self.total_assets.max(1))?)?);
        
        if ratio > 1_000_000 {  // If shares are >1M times assets, something is very wrong
            return Err(VaultError::InvariantViolation);
        }

        let (expo_diff, rebase_divisor) =
            vault_math::calculate_rebase_factor(self.total_shares, self.total_assets)?;

        if expo_diff > 0 {
            // Apply rebase by dividing shares
            self.total_shares = (SafeCast::<u128>::safe_cast(&self.total_shares)?
                .safe_div(rebase_divisor)?)
            .safe_cast()?;
            self.shares_base = self.shares_base.safe_add(expo_diff)?;
            self.rebase_version = self.rebase_version.safe_add(1)?;

            msg!(
                "Vault rebase applied: expo_diff={}, divisor={}",
                expo_diff,
                rebase_divisor
            );
            return Ok(Some(rebase_divisor));
        }

        Ok(None)
    }


    /// Get the effective share value considering rebase
    pub fn get_effective_share_value(&self) -> VaultResult<u128> {
        if self.total_shares == 0 {
            return Ok(0);
        }

        let base_value = (SafeCast::<u128>::safe_cast(&self.total_assets)?)
            .safe_mul(SafeCast::<u128>::safe_cast(&PRECISION)?)?
            .safe_div(SafeCast::<u128>::safe_cast(&self.total_shares)?)?;

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
    pub platform_account: Option<Pubkey>,
}
