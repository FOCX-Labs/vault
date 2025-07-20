use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct UnstakeRequest {
    /// Number of shares to unstake
    pub shares: u64,
    /// When the unstake request was made
    pub request_time: i64,
}

impl UnstakeRequest {
    pub const LEN: usize = 8 + // shares
        8; // request_time

    pub fn is_pending(&self) -> bool {
        self.shares > 0
    }

    pub fn reset(&mut self) {
        self.shares = 0;
        self.request_time = 0;
    }

    pub fn can_execute(&self, current_time: i64, lockup_period: i64) -> bool {
        self.is_pending() && current_time >= self.request_time + lockup_period
    }
}