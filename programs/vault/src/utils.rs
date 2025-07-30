use anchor_lang::prelude::*;

pub fn get_current_timestamp() -> i64 {
    Clock::get().unwrap().unix_timestamp
}

/// Vault signer seeds - returns seeds that can be used with CpiContext
pub fn get_vault_signer_seeds<'a>(name: &'a [u8], bump: &'a [u8]) -> [&'a [u8]; 3] {
    [b"vault", name, bump]
}