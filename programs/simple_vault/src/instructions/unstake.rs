use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::error::*;
use crate::utils::*;

#[derive(Accounts)]
pub struct Unstake<'info> {
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
    
    #[account(
        mut,
        seeds = [b"vault_token_account", vault.key().as_ref()],
        bump,
        constraint = vault_token_account.key() == vault.vault_token_account @ VaultError::InvalidTokenAccount,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = user_token_account.mint == vault.token_mint @ VaultError::InvalidTokenMint,
        constraint = user_token_account.owner == authority.key() @ VaultError::Unauthorized,
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn unstake(
    ctx: Context<Unstake>,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let vault_depositor = &mut ctx.accounts.vault_depositor;
    
    // Check if unstake request exists and lockup period has passed
    let current_time = get_current_timestamp();
    if !vault_depositor.can_unstake(current_time, vault.unstake_lockup_period) {
        return Err(VaultError::UnstakeLockupNotFinished.into());
    }
    
    // Execute unstake calculations
    let shares = vault_depositor.execute_unstake(0)?;
    let amount = vault.unstake(shares)?;
    
    // Transfer tokens from vault to user AFTER state updates
    let vault_seeds = vault.get_signer_seeds();
    let signer_seeds = &[vault_seeds.as_slice()];
    
    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: vault.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    
    token::transfer(cpi_ctx, amount)?;
    
    msg!("Unstaked {} shares, received {} tokens", shares, amount);
    
    Ok(())
}