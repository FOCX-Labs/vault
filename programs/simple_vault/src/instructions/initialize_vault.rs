use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::*;
use crate::error::*;

#[derive(Accounts)]
#[instruction(params: InitializeVaultParams)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = owner,
        space = Vault::LEN,
        seeds = [b"vault", params.name.as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub token_mint: Account<'info, Mint>,
    
    #[account(
        init,
        payer = owner,
        token::mint = token_mint,
        token::authority = vault,
        seeds = [b"vault_token_account", vault.key().as_ref()],
        bump
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn initialize_vault(
    ctx: Context<InitializeVault>,
    params: InitializeVaultParams,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let vault_key = vault.key();
    
    vault.initialize(
        params.name,
        vault_key,
        ctx.accounts.owner.key(),
        ctx.accounts.token_mint.key(),
        ctx.accounts.vault_token_account.key(),
        crate::state::vault::InitializeVaultParams {
            unstake_lockup_period: params.unstake_lockup_period,
            management_fee: params.management_fee,
            min_stake_amount: params.min_stake_amount,
            max_total_assets: params.max_total_assets,
        },
        ctx.bumps.vault,
    )?;
    
    msg!("Vault initialized: {}", vault.key());
    
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitializeVaultParams {
    pub name: [u8; 32],
    pub unstake_lockup_period: Option<i64>,
    pub management_fee: Option<u64>,
    pub min_stake_amount: Option<u64>,
    pub max_total_assets: Option<u64>,
}
