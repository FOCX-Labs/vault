use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::error::*;
use crate::math::SafeMath;

#[derive(Accounts)]
pub struct Stake<'info> {
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

pub fn stake(
    ctx: Context<Stake>,
    amount: u64,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let vault_depositor = &mut ctx.accounts.vault_depositor;
    
    if amount == 0 {
        return Err(VaultError::InvalidAmount.into());
    }
    
    // Transfer tokens from user to vault FIRST
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    token::transfer(cpi_ctx, amount)?;
    
    // Calculate shares to mint AFTER successful token transfer
    let shares = vault.stake(amount)?;
    
    // Update vault depositor
    vault_depositor.stake(shares, 0)?;
    vault_depositor.total_staked = vault_depositor.total_staked.safe_add(amount)?;
    
    msg!("Staked {} tokens, received {} shares", amount, shares);
    
    Ok(())
}