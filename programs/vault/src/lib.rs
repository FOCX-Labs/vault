use anchor_lang::prelude::*;
use instructions::*;
use state::*;

pub mod constants;
pub mod error;
mod instructions;
pub mod math;
pub mod state;
mod utils;

declare_id!("EHiKn3J5wywNG2rHV2Qt74AfNqtJajhPerkVzYXudEwn");

#[program]
pub mod simple_vault {
    use super::*;

    /// Initialize the vault
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        params: instructions::initialize_vault::InitializeVaultParams,
    ) -> Result<()> {
        instructions::initialize_vault(ctx, params)
    }

    /// Initialize a vault depositor
    pub fn initialize_vault_depositor(
        ctx: Context<InitializeVaultDepositor>,
    ) -> Result<()> {
        instructions::initialize_vault_depositor(ctx)
    }

    /// Stake tokens to the vault
    pub fn stake(
        ctx: Context<Stake>,
        amount: u64,
    ) -> Result<()> {
        instructions::stake(ctx, amount)
    }

    /// Request to unstake tokens (14 days lockup)
    pub fn request_unstake(
        ctx: Context<RequestUnstake>,
        amount: u64,
    ) -> Result<()> {
        instructions::request_unstake(ctx, amount)
    }

    /// Execute unstake after lockup period
    pub fn unstake(
        ctx: Context<Unstake>,
    ) -> Result<()> {
        instructions::unstake(ctx)
    }

    /// Cancel unstake request
    pub fn cancel_unstake_request(
        ctx: Context<CancelUnstakeRequest>,
    ) -> Result<()> {
        instructions::cancel_unstake_request(ctx)
    }

    /// Add rewards to the vault (only owner/admin)
    pub fn add_rewards(
        ctx: Context<AddRewards>,
        amount: u64,
    ) -> Result<()> {
        instructions::add_rewards(ctx, amount)
    }


    /// Update vault configuration (only owner)
    pub fn update_vault_config(
        ctx: Context<UpdateVaultConfig>,
        params: UpdateVaultConfigParams,
    ) -> Result<()> {
        instructions::update_vault_config(ctx, params)
    }

    /// Apply rebase to vault (only vault owner)
    pub fn apply_rebase(
        ctx: Context<ApplyRebase>,
    ) -> Result<()> {
        instructions::apply_rebase(ctx)
    }

    /// Sync user shares with vault rebase
    pub fn sync_rebase(
        ctx: Context<SyncRebase>,
    ) -> Result<()> {
        instructions::sync_rebase(ctx)
    }

}