use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::error::*;
use crate::math::{SafeMath, vault_math};

#[derive(Accounts)]
pub struct WithdrawManagementFee<'info> {
    #[account(
        mut,
        constraint = vault.owner == owner.key() @ VaultError::Unauthorized
    )]
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
        constraint = owner_token_account.mint == vault.token_mint @ VaultError::InvalidTokenMint,
        constraint = owner_token_account.owner == owner.key() @ VaultError::Unauthorized,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn withdraw_management_fee(
    ctx: Context<WithdrawManagementFee>,
    shares_to_withdraw: Option<u64>,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    
    if vault.owner_shares == 0 {
        return Err(VaultError::InsufficientFunds.into());
    }
    
    // Determine how many shares to withdraw
    let shares = shares_to_withdraw.unwrap_or(vault.owner_shares);
    
    if shares == 0 {
        return Err(VaultError::InvalidAmount.into());
    }
    
    if shares > vault.owner_shares {
        return Err(VaultError::InsufficientFunds.into());
    }
    
    // Validate that we're only withdrawing owner's accumulated shares
    if vault.total_shares < shares {
        return Err(VaultError::InsufficientFunds.into());
    }
    
    // Calculate the assets to withdraw
    let assets = vault_math::calculate_assets(shares, vault.total_shares, vault.total_assets)?;
    
    if assets == 0 {
        return Err(VaultError::InvalidAmount.into());
    }
    
    // Update vault state
    vault.total_shares = vault.total_shares.safe_sub(shares)?;
    vault.total_assets = vault.total_assets.safe_sub(assets)?;
    vault.owner_shares = vault.owner_shares.safe_sub(shares)?;
    
    // Transfer tokens to owner
    let vault_seeds = vault.get_signer_seeds();
    let signer_seeds = &[vault_seeds.as_slice()];
    
    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.owner_token_account.to_account_info(),
        authority: vault.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    
    token::transfer(cpi_ctx, assets)?;
    
    msg!("Vault owner withdrew {} shares ({} tokens) as management fee", shares, assets);
    
    Ok(())
}