use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::*;
use crate::utils::*;
use crate::math::vault_math;

#[derive(Accounts)]
pub struct RequestUnstake<'info> {
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
    let vault = &ctx.accounts.vault;
    let vault_depositor = &mut ctx.accounts.vault_depositor;
    
    if amount == 0 {
        return Err(VaultError::InvalidAmount.into());
    }
    
    // Calculate shares to unstake
    let shares = if amount == u64::MAX {
        // Unstake all shares
        vault_depositor.shares
    } else {
        // Use consistent calculation logic from vault_math
        vault_math::calculate_shares_for_assets(amount, vault.total_shares, vault.total_assets)?
    };
    
    if shares == 0 {
        return Err(VaultError::InvalidAmount.into());
    }
    
    // Create unstake request
    let current_time = get_current_timestamp();
    vault_depositor.request_unstake(shares, current_time)?;
    
    msg!("Unstake request created for {} shares", shares);
    
    Ok(())
}