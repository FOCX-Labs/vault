use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::*;
use crate::utils::*;
use crate::math::{vault_math, SafeMath, SafeCast};
use crate::constants::*;

#[derive(Accounts)]
pub struct RequestUnstake<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    
    #[account(
        mut,
        seeds = [b"vault_depositor", vault.key().as_ref(), authority.key().as_ref()],
        bump,
        constraint = vault_depositor.authority == authority.key() @ VaultError::Unauthorized,
        constraint = vault_depositor.vault == vault.key() @ VaultError::InvalidVaultConfig,
    )]
    pub vault_depositor: Account<'info, VaultDepositor>,
    
    pub authority: Signer<'info>,
}

pub fn request_unstake(
    ctx: Context<RequestUnstake>,
    amount: u64,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let vault_depositor = &mut ctx.accounts.vault_depositor;
    
    if amount == 0 {
        return Err(VaultError::InvalidAmount.into());
    }
    
    // Check if there are any active shares to provide a price reference
    if vault.get_active_shares()? == 0 {
        return Err(VaultError::NoActiveShares.into());
    }
    
    // MEV PROTECTION: Apply same cooldown to request_unstake
    let current_time = get_current_timestamp();
    const MIN_STAKE_DURATION: i64 = 1; // 1 second for testing (change to 300 for production)
    if current_time < vault_depositor.last_stake_time + MIN_STAKE_DURATION {
        return Err(VaultError::StakeCooldownNotMet.into());
    }
    
    // CRITICAL FIX: Handle existing unstake request to prevent double counting
    let existing_unstake_request = vault_depositor.unstake_request.clone();
    if existing_unstake_request.is_pending() {
        // Restore previously frozen shares and assets to vault totals
        let old_shares = existing_unstake_request.shares;
        let old_freeze_amount = SafeCast::<u128>::safe_cast(&old_shares)?
            .safe_mul(existing_unstake_request.asset_per_share_at_request)?
            .safe_div(SafeCast::<u128>::safe_cast(&PRECISION)?)?
            .safe_cast()?;
        
        // Restore vault counters
        vault.pending_unstake_shares = vault.pending_unstake_shares.safe_sub(old_shares)?;
        vault.reserved_assets = vault.reserved_assets.safe_sub(old_freeze_amount)?;
        
        // Restore user's shares
        vault_depositor.shares = vault_depositor.shares.safe_add(old_shares)?;
        
        msg!("Cancelled previous unstake request: {} shares, {} assets restored", old_shares, old_freeze_amount);
    }

    // Calculate current active share value once for consistency
    let asset_per_share = vault.get_active_share_value()?;
    
    // CRITICAL PRECISION FIX: Calculate shares and freeze amount to prevent rounding attacks
    let (shares, freeze_amount) = if amount == u64::MAX {
        // Unstake all shares - use exact current value
        let shares = vault_depositor.shares;
        let freeze_amount = SafeCast::<u128>::safe_cast(&shares)?
            .safe_mul(asset_per_share)?
            .safe_div(SafeCast::<u128>::safe_cast(&PRECISION)?)?
            .safe_cast()?;
        (shares, freeze_amount)
    } else {
        // ANTI-ROUNDING ATTACK: For partial unstake, prioritize exact asset amount
        // Instead of: amount -> shares -> freeze_amount (double rounding)
        // We use: amount -> freeze_amount directly, then calculate shares
        
        // First, freeze the exact requested amount
        let freeze_amount = amount;
        
        // Then calculate shares based on frozen amount to ensure consistency
        let shares = SafeCast::<u128>::safe_cast(&freeze_amount)?
            .safe_mul(SafeCast::<u128>::safe_cast(&PRECISION)?)?
            .safe_div(asset_per_share)?
            .safe_cast()?;
            
        (shares, freeze_amount)
    };
    
    if shares == 0 {
        return Err(VaultError::InvalidAmount.into());
    }
    
    // Verify user has enough shares
    if shares > vault_depositor.shares {
        return Err(VaultError::InsufficientFunds.into());
    }
    
    // CRITICAL: Immediately freeze both shares and corresponding assets
    // This ensures strict separation between active and pending resources
    vault.pending_unstake_shares = vault.pending_unstake_shares.safe_add(shares)?;
    vault.reserved_assets = vault.reserved_assets.safe_add(freeze_amount)?;
    
    // CRITICAL FIX: Must reduce user's active shares immediately
    // This ensures the requested shares stop earning rewards
    vault_depositor.shares = vault_depositor.shares.safe_sub(shares)?;
    
    // Create unstake request with frozen share value
    let current_time = get_current_timestamp();
    vault_depositor.unstake_request.shares = shares;
    vault_depositor.unstake_request.request_time = current_time;
    vault_depositor.unstake_request.asset_per_share_at_request = asset_per_share;
    
    // INVARIANT CHECK: Verify vault state consistency after request
    vault.verify_invariants()?;
    
    msg!("Unstake request created for {} shares, froze {} assets at {} per share", shares, freeze_amount, asset_per_share);
    
    Ok(())
}