/// Time constants
pub const ONE_MINUTE: i64 = 60;
pub const ONE_HOUR: i64 = ONE_MINUTE * 60;
pub const ONE_DAY: i64 = ONE_HOUR * 24;
pub const ONE_WEEK: i64 = ONE_DAY * 7;
pub const FOURTEEN_DAYS: i64 = ONE_DAY * 14;

/// Precision constants
pub const PRECISION: u64 = 1_000_000_000_000; // 1e12
pub const SHARE_PRECISION: u128 = 1_000_000_000_000_000_000; // 1e18

/// Vault configuration limits
pub const MAX_UNSTAKE_LOCKUP_DAYS: i64 = 90;
pub const MIN_UNSTAKE_LOCKUP_MINUTES: i64 = 10; // Changed from 1 day to 10 minutes
pub const DEFAULT_UNSTAKE_LOCKUP: i64 = FOURTEEN_DAYS;

/// Fee constants (in basis points)
pub const MAX_MANAGEMENT_FEE: u64 = 10000; // 100% (for platform share in add_rewards)
pub const DEFAULT_MANAGEMENT_FEE: u64 = 5000; // 50% (default platform share in add_rewards)
pub const BASIS_POINTS_PRECISION: u64 = 10000;