use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::*;

#[derive(Accounts)]
pub struct CancelUnstakeRequest<'info> {
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
    let vault_depositor = &mut ctx.accounts.vault_depositor;
    
    // Cancel the unstake request
    vault_depositor.cancel_unstake_request()?;
    
    msg!("Unstake request cancelled");
    
    Ok(())
}