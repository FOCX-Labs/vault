use anchor_lang::prelude::*;
use crate::constants::*;
use crate::error::*;
use crate::utils::*;
use crate::state::UnstakeRequest;
use crate::math::{SafeMath, SafeCast, vault_math};

#[account]
#[derive(Default)]
pub struct VaultDepositor {
    /// The vault this depositor belongs to
    pub vault: Pubkey,
    /// The depositor's authority
    pub authority: Pubkey,
    /// The depositor's shares
    pub shares: u64,
    /// The depositor's rewards debt (for reward calculation)
    pub rewards_debt: u128,
    /// Last time rewards were claimed
    pub last_rewards_claim: i64,
    /// Unstake request
    pub unstake_request: UnstakeRequest,
    /// Total amount staked
    pub total_staked: u64,
    /// Total amount unstaked
    pub total_unstaked: u64,
    /// Total rewards claimed
    pub total_rewards_claimed: u64,
    /// When the depositor was created
    pub created_at: i64,
    /// Last rebase version user has synced with
    pub last_rebase_version: u32,
    /// Reserved for future use
    pub _reserved: [u64; 7],
}

impl VaultDepositor {
    pub const LEN: usize = 8 + // discriminator
        32 + // vault
        32 + // authority
        8 + // shares
        16 + // rewards_debt
        8 + // last_rewards_claim
        UnstakeRequest::LEN + // unstake_request
        8 + // total_staked
        8 + // total_unstaked
        8 + // total_rewards_claimed
        8 + // created_at
        4 + // last_rebase_version
        56; // _reserved

    pub fn initialize(
        &mut self,
        vault: Pubkey,
        authority: Pubkey,
    ) -> VaultResult<()> {
        self.vault = vault;
        self.authority = authority;
        self.shares = 0;
        self.rewards_debt = 0;
        self.last_rewards_claim = get_current_timestamp();
        self.unstake_request = UnstakeRequest::default();
        self.total_staked = 0;
        self.total_unstaked = 0;
        self.total_rewards_claimed = 0;
        self.created_at = get_current_timestamp();
        self.last_rebase_version = 0;
        
        Ok(())
    }

    pub fn stake(&mut self, shares: u64, _rewards_per_share: u128) -> VaultResult<()> {
        // Add new shares - with automatic compounding, no need to track rewards debt
        self.shares = self.shares.safe_add(shares)?;
        
        // Note: rewards_per_share is ignored in the new compounding model
        // Rewards are automatically compounded into the vault's total_assets
        
        Ok(())
    }

    pub fn unstake(&mut self, shares: u64, _rewards_per_share: u128) -> VaultResult<()> {
        if shares > self.shares {
            return Err(VaultError::InsufficientFunds);
        }
        
        // Reduce shares - with automatic compounding, no need to track rewards debt
        self.shares = self.shares.safe_sub(shares)?;
        
        // Note: rewards_per_share is ignored in the new compounding model
        // User automatically benefits from compounded rewards through share value appreciation
        
        Ok(())
    }

    pub fn claim_rewards(&mut self, _rewards_per_share: u128) -> VaultResult<u64> {
        // In the new compounding model, there are no separate rewards to claim
        // All rewards are automatically compounded into the vault's total_assets
        // Users benefit from increased share value when they unstake
        
        // For backward compatibility, we return 0 rewards
        // Users should unstake to realize their compounded gains
        self.last_rewards_claim = get_current_timestamp();
        
        Ok(0)
    }

    pub fn calculate_pending_rewards(&self, _rewards_per_share: u128) -> VaultResult<u64> {
        // In the new compounding model, there are no separate pending rewards
        // All rewards are automatically compounded into share value
        // Users can see their gains by comparing current share value vs initial investment
        Ok(0)
    }

    pub fn request_unstake(&mut self, shares: u64, request_time: i64) -> VaultResult<()> {
        if shares == 0 {
            return Err(VaultError::InvalidAmount);
        }
        
        if shares > self.shares {
            return Err(VaultError::InsufficientFunds);
        }
        
        if self.unstake_request.is_pending() {
            return Err(VaultError::UnstakeRequestAlreadyExists);
        }
        
        self.unstake_request.shares = shares;
        self.unstake_request.request_time = request_time;
        
        Ok(())
    }

    pub fn cancel_unstake_request(&mut self) -> VaultResult<()> {
        if !self.unstake_request.is_pending() {
            return Err(VaultError::NoUnstakeRequest);
        }
        
        self.unstake_request.reset();
        
        Ok(())
    }

    pub fn can_unstake(&self, current_time: i64, lockup_period: i64) -> bool {
        if !self.unstake_request.is_pending() {
            return false;
        }
        
        current_time >= self.unstake_request.request_time + lockup_period
    }

    pub fn execute_unstake(&mut self, rewards_per_share: u128) -> VaultResult<u64> {
        if !self.unstake_request.is_pending() {
            return Err(VaultError::NoUnstakeRequest);
        }
        
        let shares = self.unstake_request.shares;
        
        self.unstake(shares, rewards_per_share)?;
        
        self.total_unstaked = self.total_unstaked.safe_add(shares)?;
        
        self.unstake_request.reset();
        
        Ok(shares)
    }

    /// Legacy function for backward compatibility
    /// In the new compounding model, rewards debt is not used
    fn update_rewards_debt(&mut self, _rewards_per_share: u128) -> VaultResult<()> {
        // No longer needed in the compounding model
        // Keeping for backward compatibility
        Ok(())
    }

    /// Apply rebase to user's shares with precision protection and version tracking
    pub fn apply_rebase(&mut self, rebase_divisor: u128, new_rebase_version: u32) -> VaultResult<()> {
        if rebase_divisor <= 1 {
            return Ok(());
        }

        // Protect against precision loss - ensure user keeps at least 1 share if they had any
        let original_shares = self.shares;
        self.shares = (SafeCast::<u128>::safe_cast(&self.shares)?.safe_div(rebase_divisor)?).safe_cast()?;
        
        // If user had shares but rebase reduced them to 0, give them 1 share minimum
        if original_shares > 0 && self.shares == 0 {
            self.shares = 1;
        }
        
        // Update unstake request shares if pending
        if self.unstake_request.is_pending() {
            let original_request_shares = self.unstake_request.shares;
            self.unstake_request.shares = (SafeCast::<u128>::safe_cast(&self.unstake_request.shares)?.safe_div(rebase_divisor)?).safe_cast()?;
            
            // Apply same precision protection to unstake request
            if original_request_shares > 0 && self.unstake_request.shares == 0 {
                self.unstake_request.shares = 1;
            }
        }

        // Update rebase version to prevent race conditions
        self.last_rebase_version = new_rebase_version;

        Ok(())
    }

    /// Check if user needs to sync with vault rebase
    pub fn needs_rebase_sync(&self, vault_rebase_version: u32) -> bool {
        self.last_rebase_version < vault_rebase_version
    }
}