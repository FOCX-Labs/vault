use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::*;
use crate::math::{SafeMath, SafeCast};
use crate::constants::*;

#[derive(Accounts)]
pub struct CancelUnstakeRequest<'info> {
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

pub fn cancel_unstake_request(
    ctx: Context<CancelUnstakeRequest>,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let vault_depositor = &mut ctx.accounts.vault_depositor;
    
    if !vault_depositor.unstake_request.is_pending() {
        return Err(VaultError::NoUnstakeRequest.into());
    }
    
    // Get the details from the request
    let shares = vault_depositor.unstake_request.shares;
    let asset_per_share_at_request = vault_depositor.unstake_request.asset_per_share_at_request;
    
    // CRITICAL ACCOUNTING FIX: Calculate the correct amount to unfreeze
    // The original frozen amount should be used, not recalculated
    let original_frozen_amount = SafeCast::<u128>::safe_cast(&shares)?
        .safe_mul(asset_per_share_at_request)?
        .safe_div(SafeCast::<u128>::safe_cast(&PRECISION)?)?;
    let original_frozen_amount = SafeCast::<u64>::safe_cast(&original_frozen_amount)?;
    
    // Calculate current value of these shares for accounting adjustment
    let current_share_value = vault.get_active_share_value()?;
    let current_value = SafeCast::<u128>::safe_cast(&shares)?
        .safe_mul(current_share_value)?
        .safe_div(SafeCast::<u128>::safe_cast(&PRECISION)?)?;
    let current_value = SafeCast::<u64>::safe_cast(&current_value)?;
    
    // Return shares to active pool
    vault.pending_unstake_shares = vault.pending_unstake_shares.safe_sub(shares)?;
    
    // CRITICAL FIX: Must restore user's active shares
    // This allows them to earn rewards again on the cancelled portion
    vault_depositor.shares = vault_depositor.shares.safe_add(shares)?;
    
    // CRITICAL ACCOUNTING FIX: Properly handle asset difference during cancel
    vault.reserved_assets = vault.reserved_assets.safe_sub(original_frozen_amount)?;
    
    // CRITICAL: Must adjust total_assets to maintain accounting balance
    // The shares are returning to active pool at current value, not frozen value
    if current_value > original_frozen_amount {
        // Vault gains from rewards - add the difference to total_assets
        let gain = current_value.safe_sub(original_frozen_amount)?;
        vault.total_assets = vault.total_assets.safe_add(gain)?;
    } else if current_value < original_frozen_amount {
        // Vault loses value (rare case) - subtract the difference from total_assets
        let loss = original_frozen_amount.safe_sub(current_value)?;
        vault.total_assets = vault.total_assets.safe_sub(loss)?;
    }
    // If equal, no adjustment needed
    
    // Cancel the unstake request
    vault_depositor.unstake_request.reset();
    
    // INVARIANT CHECK: Verify vault state consistency after cancel
    vault.verify_invariants()?;
    
    msg!("Unstake request cancelled, {} shares returned (frozen: {}, current: {})", shares, original_frozen_amount, current_value);
    
    Ok(())
}