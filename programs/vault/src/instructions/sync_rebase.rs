use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::*;

#[derive(Accounts)]
pub struct SyncRebase<'info> {
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

pub fn sync_rebase(
    ctx: Context<SyncRebase>,
) -> Result<()> {
    let vault = &ctx.accounts.vault;
    let vault_depositor = &mut ctx.accounts.vault_depositor;
    
    // Check if user needs to sync with vault rebase
    if vault_depositor.needs_rebase_sync(vault.rebase_version) {
        // Calculate the rebase divisor needed to sync user shares with vault
        if vault.shares_base > 0 {
            let rebase_divisor = 10u128.pow(vault.shares_base);
            vault_depositor.apply_rebase(rebase_divisor, vault.rebase_version)?;
            
            msg!("User shares synced with vault rebase, divisor: {}, version: {}", rebase_divisor, vault.rebase_version);
        } else {
            // Even if no shares_base, update the version to prevent unnecessary sync calls
            vault_depositor.last_rebase_version = vault.rebase_version;
            msg!("Rebase version updated to: {}", vault.rebase_version);
        }
    } else {
        msg!("User already synced with latest rebase version: {}", vault.rebase_version);
    }
    
    Ok(())
}