use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::*;

#[derive(Accounts)]
pub struct ApplyManagementFee<'info> {
    #[account(
        mut,
        constraint = vault.owner == owner.key() @ VaultError::Unauthorized
    )]
    pub vault: Account<'info, Vault>,
    
    pub owner: Signer<'info>,
}

pub fn apply_management_fee(
    ctx: Context<ApplyManagementFee>,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    
    // Apply management fee
    let fee_shares = vault.apply_management_fee()?;
    
    if fee_shares > 0 {
        msg!("Management fee applied: {} shares minted to vault owner", fee_shares);
    } else {
        msg!("No management fee to apply");
    }
    
    Ok(())
}