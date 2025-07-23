use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::error::*;

#[derive(Accounts)]
pub struct AddRewards<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    
    #[account(
        mut,
        seeds = [b"vault_token_account", vault.key().as_ref()],
        bump,
        constraint = vault_token_account.key() == vault.vault_token_account @ VaultError::InvalidTokenAccount,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = reward_source_account.mint == vault.token_mint @ VaultError::InvalidTokenMint,
    )]
    pub reward_source_account: Account<'info, TokenAccount>,
    
    pub reward_source_authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn add_rewards(
    ctx: Context<AddRewards>,
    amount: u64,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    
    if amount == 0 {
        return Err(VaultError::InvalidAmount.into());
    }
    
    // Transfer rewards to the vault token account FIRST
    let cpi_accounts = Transfer {
        from: ctx.accounts.reward_source_account.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.reward_source_authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    token::transfer(cpi_ctx, amount)?;
    
    // Update vault rewards AFTER successful token transfer
    vault.add_rewards(amount)?;
    
    msg!("Added {} rewards to vault", amount);
    
    Ok(())
}