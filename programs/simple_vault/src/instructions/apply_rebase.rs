use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::*;

#[derive(Accounts)]
pub struct ApplyRebase<'info> {
    #[account(
        mut,
        constraint = vault.owner == owner.key() @ VaultError::Unauthorized
    )]
    pub vault: Account<'info, Vault>,
    
    pub owner: Signer<'info>,
}

pub fn apply_rebase(
    ctx: Context<ApplyRebase>,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    
    // Apply vault rebase - this will affect all users' shares proportionally
    if let Some(rebase_divisor) = vault.apply_rebase()? {
        msg!("Global rebase applied to vault with divisor: {}", rebase_divisor);
        msg!("All user shares will be automatically adjusted by the same factor");
    } else {
        msg!("No rebase needed");
    }
    
    Ok(())
}