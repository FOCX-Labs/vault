use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Insufficient funds")]
    InsufficientFunds,
    
    #[msg("Invalid amount")]
    InvalidAmount,
    
    #[msg("Unstake lockup period not finished")]
    UnstakeLockupNotFinished,
    
    #[msg("No unstake request found")]
    NoUnstakeRequest,
    
    #[msg("Unstake request already exists")]
    UnstakeRequestAlreadyExists,
    
    #[msg("Invalid vault configuration")]
    InvalidVaultConfig,
    
    #[msg("Unauthorized")]
    Unauthorized,
    
    #[msg("Vault is paused")]
    VaultPaused,
    
    #[msg("Invalid shares calculation")]
    InvalidSharesCalculation,
    
    #[msg("Math overflow")]
    MathOverflow,
    
    #[msg("Division by zero")]
    DivisionByZero,
    
    #[msg("Invalid token mint")]
    InvalidTokenMint,
    
    #[msg("Invalid token account")]
    InvalidTokenAccount,
    
    #[msg("Vault is full")]
    VaultIsFull,
    
    #[msg("Minimum stake amount not met")]
    MinimumStakeAmountNotMet,
    
    #[msg("No active shares available for price reference")]
    NoActiveShares,
    
    #[msg("Stake cooldown period not met (MEV protection)")]
    StakeCooldownNotMet,
    
    #[msg("Vault state invariant violation - critical accounting error")]
    InvariantViolation,
    
    #[msg("Cannot stake when all shares are pending unstake")]
    CannotStakeWhenAllSharesPending,
    
    #[msg("Insufficient liquidity in vault for withdrawal")]
    InsufficientLiquidity,
    
    #[msg("Unauthorized reward source")]
    UnauthorizedRewardSource,
}

pub type VaultResult<T> = std::result::Result<T, VaultError>;