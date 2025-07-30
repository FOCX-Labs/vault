use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::*;

#[derive(Accounts)]
pub struct InitializeVaultDepositor<'info> {
    pub vault: Account<'info, Vault>,
    
    #[account(
        init,
        payer = authority,
        space = VaultDepositor::LEN,
        seeds = [b"vault_depositor", vault.key().as_ref(), authority.key().as_ref()],
        bump
    )]
    pub vault_depositor: Account<'info, VaultDepositor>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn initialize_vault_depositor(
    ctx: Context<InitializeVaultDepositor>,
) -> Result<()> {
    let vault_depositor = &mut ctx.accounts.vault_depositor;
    
    vault_depositor.initialize(
        ctx.accounts.vault.key(),
        ctx.accounts.authority.key(),
    )?;
    
    msg!("Vault depositor initialized: {}", vault_depositor.key());
    
    Ok(())
}