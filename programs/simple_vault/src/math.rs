use crate::error::*;

/// Safe math operations trait to prevent overflows
pub trait SafeMath<T> {
    fn safe_add(&self, other: T) -> VaultResult<T>;
    fn safe_sub(&self, other: T) -> VaultResult<T>;
    fn safe_mul(&self, other: T) -> VaultResult<T>;
    fn safe_div(&self, other: T) -> VaultResult<T>;
}

/// Implementation for u64
impl SafeMath<u64> for u64 {
    fn safe_add(&self, other: u64) -> VaultResult<u64> {
        self.checked_add(other).ok_or(VaultError::MathOverflow)
    }

    fn safe_sub(&self, other: u64) -> VaultResult<u64> {
        self.checked_sub(other).ok_or(VaultError::MathOverflow)
    }

    fn safe_mul(&self, other: u64) -> VaultResult<u64> {
        self.checked_mul(other).ok_or(VaultError::MathOverflow)
    }

    fn safe_div(&self, other: u64) -> VaultResult<u64> {
        if other == 0 {
            return Err(VaultError::DivisionByZero);
        }
        self.checked_div(other).ok_or(VaultError::MathOverflow)
    }
}

/// Implementation for u128
impl SafeMath<u128> for u128 {
    fn safe_add(&self, other: u128) -> VaultResult<u128> {
        self.checked_add(other).ok_or(VaultError::MathOverflow)
    }

    fn safe_sub(&self, other: u128) -> VaultResult<u128> {
        self.checked_sub(other).ok_or(VaultError::MathOverflow)
    }

    fn safe_mul(&self, other: u128) -> VaultResult<u128> {
        self.checked_mul(other).ok_or(VaultError::MathOverflow)
    }

    fn safe_div(&self, other: u128) -> VaultResult<u128> {
        if other == 0 {
            return Err(VaultError::DivisionByZero);
        }
        self.checked_div(other).ok_or(VaultError::MathOverflow)
    }
}

/// Implementation for i64
impl SafeMath<i64> for i64 {
    fn safe_add(&self, other: i64) -> VaultResult<i64> {
        self.checked_add(other).ok_or(VaultError::MathOverflow)
    }

    fn safe_sub(&self, other: i64) -> VaultResult<i64> {
        self.checked_sub(other).ok_or(VaultError::MathOverflow)
    }

    fn safe_mul(&self, other: i64) -> VaultResult<i64> {
        self.checked_mul(other).ok_or(VaultError::MathOverflow)
    }

    fn safe_div(&self, other: i64) -> VaultResult<i64> {
        if other == 0 {
            return Err(VaultError::DivisionByZero);
        }
        self.checked_div(other).ok_or(VaultError::MathOverflow)
    }
}

/// Safe casting operations
pub trait SafeCast<T> {
    fn safe_cast(&self) -> VaultResult<T>;
}

impl SafeCast<u64> for u128 {
    fn safe_cast(&self) -> VaultResult<u64> {
        if *self > u64::MAX as u128 {
            return Err(VaultError::MathOverflow);
        }
        Ok(*self as u64)
    }
}

impl SafeCast<u128> for u64 {
    fn safe_cast(&self) -> VaultResult<u128> {
        Ok(*self as u128)
    }
}

impl SafeCast<i64> for u64 {
    fn safe_cast(&self) -> VaultResult<i64> {
        if *self > i64::MAX as u64 {
            return Err(VaultError::MathOverflow);
        }
        Ok(*self as i64)
    }
}

impl SafeCast<u64> for i64 {
    fn safe_cast(&self) -> VaultResult<u64> {
        if *self < 0 {
            return Err(VaultError::MathOverflow);
        }
        Ok(*self as u64)
    }
}

impl SafeCast<u128> for i64 {
    fn safe_cast(&self) -> VaultResult<u128> {
        if *self < 0 {
            return Err(VaultError::MathOverflow);
        }
        Ok(*self as u128)
    }
}

/// Implementation for u32
impl SafeMath<u32> for u32 {
    fn safe_add(&self, other: u32) -> VaultResult<u32> {
        self.checked_add(other).ok_or(VaultError::MathOverflow)
    }

    fn safe_sub(&self, other: u32) -> VaultResult<u32> {
        self.checked_sub(other).ok_or(VaultError::MathOverflow)
    }

    fn safe_mul(&self, other: u32) -> VaultResult<u32> {
        self.checked_mul(other).ok_or(VaultError::MathOverflow)
    }

    fn safe_div(&self, other: u32) -> VaultResult<u32> {
        if other == 0 {
            return Err(VaultError::DivisionByZero);
        }
        self.checked_div(other).ok_or(VaultError::MathOverflow)
    }
}

/// Vault-specific math functions
pub mod vault_math {
    use super::*;
    use crate::constants::*;

    /// Calculate shares to mint for a given amount
    pub fn calculate_shares(amount: u64, total_supply: u64, total_assets: u64) -> VaultResult<u64> {
        if total_supply == 0 {
            return Ok(amount);
        }
        
        if total_assets == 0 {
            return Err(VaultError::DivisionByZero);
        }
        
        let shares = (amount as u128)
            .safe_mul(total_supply as u128)?
            .safe_div(total_assets as u128)?;
        
        let shares_u64 = shares.safe_cast()?;
        
        // Prevent precision loss: ensure user gets at least 1 share if they deposit non-zero amount
        // This prevents users from losing funds due to rounding down to zero
        if shares_u64 == 0 && amount > 0 {
            return Ok(1);
        }
        
        Ok(shares_u64)
    }

    /// Calculate assets to return for a given amount of shares
    pub fn calculate_assets(shares: u64, total_supply: u64, total_assets: u64) -> VaultResult<u64> {
        if total_supply == 0 {
            return Ok(0);
        }
        
        let assets = (shares as u128)
            .safe_mul(total_assets as u128)?
            .safe_div(total_supply as u128)?;
        
        assets.safe_cast()
    }

    /// Calculate shares needed to withdraw a specific amount of assets
    pub fn calculate_shares_for_assets(amount: u64, total_supply: u64, total_assets: u64) -> VaultResult<u64> {
        if total_supply == 0 {
            return Err(VaultError::InvalidSharesCalculation);
        }
        
        if total_assets == 0 {
            return Err(VaultError::DivisionByZero);
        }
        
        let shares = (amount as u128)
            .safe_mul(total_supply as u128)?
            .safe_div(total_assets as u128)?;
        
        shares.safe_cast()
    }

    /// Calculate rewards per share with high precision
    pub fn calculate_rewards_per_share(
        total_rewards: u64,
        total_shares: u64,
        last_rewards_per_share: u128,
    ) -> VaultResult<u128> {
        if total_shares == 0 {
            return Ok(last_rewards_per_share);
        }
        
        let rewards_per_share = (total_rewards as u128)
            .safe_mul(SHARE_PRECISION)?
            .safe_div(total_shares as u128)?;
        
        last_rewards_per_share.safe_add(rewards_per_share)
    }

    /// Calculate pending rewards for a user
    pub fn calculate_pending_rewards(
        user_shares: u64,
        rewards_per_share: u128,
        user_rewards_debt: u128,
    ) -> VaultResult<u64> {
        let total_rewards = (user_shares as u128)
            .safe_mul(rewards_per_share)?
            .safe_div(SHARE_PRECISION)?;
        
        if total_rewards >= user_rewards_debt {
            (total_rewards.safe_sub(user_rewards_debt)?).safe_cast()
        } else {
            Ok(0)
        }
    }

    /// Calculate rebase factor when shares become too large
    pub fn calculate_rebase_factor(total_shares: u64, total_assets: u64) -> VaultResult<(u32, u128)> {
        if total_assets == 0 || total_shares <= total_assets {
            return Ok((0, 1));
        }

        // Calculate how many times shares exceed assets
        let ratio = (total_shares as u128).safe_div(total_assets as u128)?;
        
        // Find the appropriate power of 10 to divide by
        let mut expo_diff = 0u32;
        let mut divisor = 1u128;
        
        while divisor < ratio && expo_diff < 20 { // Limit to prevent infinite loop
            divisor = divisor.safe_mul(10)?;
            expo_diff = expo_diff.safe_add(1)?;
        }
        
        Ok((expo_diff, divisor))
    }

    /// Calculate time-based management fee with safe time handling
    pub fn calculate_management_fee(
        total_assets: u64,
        management_fee_bps: u64,
        time_elapsed_seconds: i64,
        _last_fee_update: i64,
    ) -> VaultResult<u64> {
        if management_fee_bps == 0 || total_assets == 0 || time_elapsed_seconds <= 0 {
            return Ok(0);
        }

        // Prevent time manipulation attacks - cap maximum time elapsed to 1 year
        let max_time_elapsed = 365 * 24 * 60 * 60i64; // 1 year in seconds
        let safe_time_elapsed = if time_elapsed_seconds > max_time_elapsed {
            max_time_elapsed
        } else {
            time_elapsed_seconds
        };

        // Convert to safe u64 for calculations
        let time_elapsed_u64 = safe_time_elapsed as u64;

        // Convert to annual fee amount
        let annual_fee = (total_assets as u128)
            .safe_mul(management_fee_bps as u128)?
            .safe_div(BASIS_POINTS_PRECISION as u128)?;
        
        // Calculate fee for the elapsed time period
        let fee_amount = annual_fee
            .safe_mul(time_elapsed_u64 as u128)?
            .safe_div((365 * 24 * 60 * 60) as u128)?; // Seconds in a year
        
        fee_amount.safe_cast()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::vault_math::*;

    #[test]
    fn test_safe_math_operations() {
        // Test safe addition
        assert_eq!(10u64.safe_add(20).unwrap(), 30);
        assert!(u64::MAX.safe_add(1).is_err());

        // Test safe subtraction
        assert_eq!(20u64.safe_sub(10).unwrap(), 10);
        assert!(10u64.safe_sub(20).is_err());

        // Test safe multiplication
        assert_eq!(10u64.safe_mul(5).unwrap(), 50);
        assert!(u64::MAX.safe_mul(2).is_err());

        // Test safe division
        assert_eq!(20u64.safe_div(4).unwrap(), 5);
        assert!(20u64.safe_div(0).is_err());
    }

    #[test]
    fn test_calculate_shares() {
        // First deposit should get 1:1 shares
        assert_eq!(calculate_shares(1000, 0, 0).unwrap(), 1000);
        
        // Subsequent deposits should maintain proportional shares
        assert_eq!(calculate_shares(1000, 2000, 2000).unwrap(), 1000);
        assert_eq!(calculate_shares(500, 2000, 1000).unwrap(), 1000);
    }

    #[test]
    fn test_calculate_management_fee() {
        // 2% annual fee for 1 year should be 2% of total assets
        let fee = calculate_management_fee(
            1_000_000, // 1 token
            200,       // 2% (200 bps)
            365 * 24 * 60 * 60, // 1 year in seconds
            0
        ).unwrap();
        assert_eq!(fee, 20_000); // 2% of 1_000_000

        // 6 months should be 1%
        let fee = calculate_management_fee(
            1_000_000,
            200,
            182 * 24 * 60 * 60, // ~6 months
            0
        ).unwrap();
        assert!(fee >= 9_900 && fee <= 10_100); // ~1% with some rounding tolerance
    }

    #[test]
    fn test_rebase_calculation() {
        let (expo_diff, divisor) = calculate_rebase_factor(1_000_000, 100).unwrap();
        assert_eq!(expo_diff, 4); // 10^4 = 10,000
        assert_eq!(divisor, 10_000);
    }
}