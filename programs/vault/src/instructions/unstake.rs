use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::error::*;
use crate::utils::*;
use crate::math::{SafeMath, SafeCast};
use crate::constants::*;

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
    
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn unstake(
    ctx: Context<Unstake>,
) -> Result<()> {
    // Manually verify that the vault account is the correct PDA
    let expected_vault_key = Pubkey::find_program_address(
        &[b"vault", &ctx.accounts.vault.name],
        ctx.program_id
    ).0;
    
    if ctx.accounts.vault.key() != expected_vault_key {
        return Err(VaultError::InvalidVaultConfig.into());
    }
    
    // Check if unstake request exists and lockup period has passed
    let current_time = get_current_timestamp();
    if !ctx.accounts.vault_depositor.can_unstake(current_time, ctx.accounts.vault.unstake_lockup_period) {
        return Err(VaultError::UnstakeLockupNotFinished.into());
    }
    
    // Get unstake request details
    let shares = ctx.accounts.vault_depositor.unstake_request.shares;
    let asset_per_share_at_request = ctx.accounts.vault_depositor.unstake_request.asset_per_share_at_request;
    
    if shares == 0 {
        return Err(VaultError::NoUnstakeRequest.into());
    }
    
    // Calculate amount based on the frozen share value at request time
    let amount = SafeCast::<u128>::safe_cast(&shares)?
        .safe_mul(asset_per_share_at_request)?
        .safe_div(SafeCast::<u128>::safe_cast(&PRECISION)?)?;
    let amount = SafeCast::<u64>::safe_cast(&amount)?;
    
    // CRITICAL SECURITY FIX: Verify vault has sufficient liquidity
    if ctx.accounts.vault_token_account.amount < amount {
        return Err(VaultError::InsufficientLiquidity.into());
    }
    
    // Prepare vault seeds for signing before any mutations
    // Use complete 32-byte name array (including trailing zeros) for PDA calculation
    let vault_name = ctx.accounts.vault.name;
    let vault_bump = ctx.accounts.vault.bump;
    
    // Debug: Verify our PDA calculation
    let expected_vault_pda = Pubkey::find_program_address(
        &[b"vault", &vault_name],
        ctx.program_id
    ).0;
    
    msg!("Vault account: {}", ctx.accounts.vault.key());
    msg!("Expected PDA: {}", expected_vault_pda);
    msg!("Vault bump: {}", vault_bump);
    msg!("PDA matches: {}", ctx.accounts.vault.key() == expected_vault_pda);
    
    // CRITICAL FIX: Use the actual bump from PDA calculation, not the stored (wrong) bump
    let (_, actual_bump) = Pubkey::find_program_address(
        &[b"vault", &vault_name],
        ctx.program_id
    );
    
    msg!("Using actual bump: {} instead of stored bump: {}", actual_bump, vault_bump);
    
    let vault_seeds = &[
        b"vault",
        vault_name.as_ref(),
        &[actual_bump]
    ];
    let signer_seeds = &[vault_seeds.as_slice()];
    
    // Transfer tokens from vault to user BEFORE state updates to avoid borrowing issues
    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    
    token::transfer(cpi_ctx, amount)?;
    
    // Now update state after successful transfer
    let vault = &mut ctx.accounts.vault;
    let vault_depositor = &mut ctx.accounts.vault_depositor;
    
    // CRITICAL: Release both pending shares and corresponding reserved assets
    // This maintains the strict separation between active and frozen resources
    vault.pending_unstake_shares = vault.pending_unstake_shares.safe_sub(shares)?;
    vault.reserved_assets = vault.reserved_assets.safe_sub(amount)?;
    
    // Update vault state - subtract from both total counters
    vault.total_shares = vault.total_shares.safe_sub(shares)?;
    vault.total_assets = vault.total_assets.safe_sub(amount)?;
    
    // Mathematical verification:
    // - User gets exactly the frozen asset amount (predictable)
    // - Available assets = total_assets - reserved_assets (unchanged ratio)
    // - Active share value = available_assets / active_shares (unchanged)
    
    // Note: User's shares were already reduced during request_unstake
    // No need to reduce again here
    vault_depositor.total_unstaked = vault_depositor.total_unstaked.safe_add(amount)?;
    vault_depositor.unstake_request.reset();
    
    // INVARIANT CHECK: Verify vault state consistency after unstake
    vault.verify_invariants()?;
    
    msg!("Unstaked {} shares, received {} tokens (frozen value), released {} reserved assets", shares, amount, amount);
    
    Ok(())
}