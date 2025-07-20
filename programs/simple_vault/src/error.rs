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
}

pub type VaultResult<T> = std::result::Result<T, VaultError>;