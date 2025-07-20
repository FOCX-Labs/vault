use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::error::*;

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
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
        seeds = [b"rewards_token_account", vault.key().as_ref()],
        bump,
        constraint = rewards_token_account.key() == vault.rewards_token_account @ VaultError::InvalidTokenAccount,
    )]
    pub rewards_token_account: Account<'info, TokenAccount>,
    
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

pub fn claim_rewards(
    ctx: Context<ClaimRewards>,
) -> Result<()> {
    let vault = &ctx.accounts.vault;
    let vault_depositor = &mut ctx.accounts.vault_depositor;
    
    // In the new compounding model, there are no separate rewards to claim
    // All rewards are automatically compounded into the vault's total_assets
    // Users benefit from increased share value when they unstake
    
    let _rewards = vault_depositor.claim_rewards(vault.rewards_per_share)?;
    
    // Always returns 0 in the new model
    // Calculate share value safely to prevent overflow/division by zero
    let share_value = if vault.total_shares > 0 {
        (vault.total_assets as u128 * 1000u128 / vault.total_shares as u128) as u64
    } else {
        0
    };
    
    let user_value = if vault.total_shares > 0 {
        (vault_depositor.shares as u128 * vault.total_assets as u128 / vault.total_shares as u128) as u64
    } else {
        0
    };
    
    msg!("Rewards are automatically compounded into share value. Current share value: {} per 1000 shares", share_value);
    msg!("User has {} shares worth approximately {} tokens", vault_depositor.shares, user_value);
    
    Ok(())
}