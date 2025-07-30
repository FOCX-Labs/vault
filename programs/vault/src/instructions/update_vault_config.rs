use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::*;

#[derive(Accounts)]
pub struct UpdateVaultConfig<'info> {
    #[account(
        mut,
        constraint = vault.owner == owner.key() @ VaultError::Unauthorized
    )]
    pub vault: Account<'info, Vault>,
    
    pub owner: Signer<'info>,
}

pub fn update_vault_config(
    ctx: Context<UpdateVaultConfig>,
    params: UpdateVaultConfigParams,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    
    vault.update_config(params)?;
    
    msg!("Vault configuration updated");
    
    Ok(())
}