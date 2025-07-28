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
    
    #[account(
        mut,
        constraint = platform_token_account.mint == vault.token_mint @ VaultError::InvalidTokenMint,
        constraint = platform_token_account.owner == vault.platform_account @ VaultError::InvalidTokenAccount,
    )]
    pub platform_token_account: Account<'info, TokenAccount>,
    
    pub reward_source_authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn add_rewards(
    ctx: Context<AddRewards>,
    amount: u64,
) -> Result<()> {
    use crate::math::{SafeMath, SafeCast};
    
    let vault = &mut ctx.accounts.vault;
    
    if amount == 0 {
        return Err(VaultError::InvalidAmount.into());
    }
    
    // Calculate platform share using vault's management_fee setting
    let platform_share_bps = vault.management_fee; // Platform share in basis points
    const BASIS_POINTS: u64 = 10000;
    
    let platform_share = ((amount as u128)
        .safe_mul(platform_share_bps as u128)?
        .safe_div(BASIS_POINTS as u128)?)
        .safe_cast()?;
    
    let vault_share = amount.safe_sub(platform_share)?;
    
    // Transfer vault share to vault token account
    let vault_cpi_accounts = Transfer {
        from: ctx.accounts.reward_source_account.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.reward_source_authority.to_account_info(),
    };
    let vault_cpi_program = ctx.accounts.token_program.to_account_info();
    let vault_cpi_ctx = CpiContext::new(vault_cpi_program, vault_cpi_accounts);
    
    token::transfer(vault_cpi_ctx, vault_share)?;
    
    // Transfer platform share to platform token account
    let platform_cpi_accounts = Transfer {
        from: ctx.accounts.reward_source_account.to_account_info(),
        to: ctx.accounts.platform_token_account.to_account_info(),
        authority: ctx.accounts.reward_source_authority.to_account_info(),
    };
    let platform_cpi_program = ctx.accounts.token_program.to_account_info();
    let platform_cpi_ctx = CpiContext::new(platform_cpi_program, platform_cpi_accounts);
    
    token::transfer(platform_cpi_ctx, platform_share)?;
    
    // Update vault rewards with only the vault's share
    vault.add_rewards(vault_share)?;
    
    msg!(
        "Added {} total rewards: {} to vault users ({}%), {} to platform ({}% = {} bps)", 
        amount, 
        vault_share,
        (vault_share * 100) / amount,
        platform_share,
        (platform_share * 100) / amount,
        platform_share_bps
    );
    
    Ok(())
}