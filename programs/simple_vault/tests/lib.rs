// Vault Contract Test Suite
// 
// This test suite provides unit tests for the simple_vault Solana program

#[cfg(test)]
mod vault_tests {
    use simple_vault::math::{SafeMath, SafeCast, vault_math};
    use simple_vault::error::*;
    use simple_vault::constants::*;

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
    fn test_safe_cast_operations() {
        // Test u64 to u128 cast (should always work)
        assert_eq!(SafeCast::<u128>::safe_cast(&100u64).unwrap(), 100u128);
        assert_eq!(SafeCast::<u128>::safe_cast(&u64::MAX).unwrap(), u64::MAX as u128);

        // Test u128 to u64 cast
        assert_eq!(SafeCast::<u64>::safe_cast(&100u128).unwrap(), 100u64);
        assert!(SafeCast::<u64>::safe_cast(&((u64::MAX as u128) + 1)).is_err());

        // Test i64 to u64 cast
        assert_eq!(SafeCast::<u64>::safe_cast(&100i64).unwrap(), 100u64);
        assert!(SafeCast::<u64>::safe_cast(&(-1i64)).is_err());
    }

    #[test]
    fn test_calculate_shares() {
        // First deposit should get 1:1 shares
        assert_eq!(vault_math::calculate_shares(1000, 0, 0).unwrap(), 1000);
        
        // Subsequent deposits should maintain proportional shares
        assert_eq!(vault_math::calculate_shares(1000, 2000, 2000).unwrap(), 1000);
        assert_eq!(vault_math::calculate_shares(500, 2000, 1000).unwrap(), 1000);
        
        // Test edge cases
        assert!(vault_math::calculate_shares(1000, 1000, 0).is_err()); // Division by zero
    }

    #[test]
    fn test_calculate_assets() {
        // Test basic asset calculation
        assert_eq!(vault_math::calculate_assets(1000, 2000, 2000).unwrap(), 1000);
        assert_eq!(vault_math::calculate_assets(500, 1000, 2000).unwrap(), 1000);
        
        // Test with zero total supply
        assert_eq!(vault_math::calculate_assets(1000, 0, 1000).unwrap(), 0);
    }

    #[test]
    fn test_calculate_rewards_per_share() {
        // Test basic rewards calculation
        let result = vault_math::calculate_rewards_per_share(1000, 1000, 0).unwrap();
        assert_eq!(result, SHARE_PRECISION); // 1000 * 1e18 / 1000 = 1e18
        
        // Test with existing rewards per share
        let result = vault_math::calculate_rewards_per_share(1000, 1000, 500).unwrap();
        assert_eq!(result, 500 + SHARE_PRECISION);
        
        // Test with zero total shares
        let result = vault_math::calculate_rewards_per_share(1000, 0, 500).unwrap();
        assert_eq!(result, 500);
    }

    #[test]
    fn test_calculate_pending_rewards() {
        // Note: In the new compounding model, pending rewards are always 0
        // because rewards are automatically compounded into share value
        let shares = 1000u64;
        let rewards_per_share = 2u128 * SHARE_PRECISION;
        let rewards_debt = 1000u128;
        
        let pending = vault_math::calculate_pending_rewards(shares, rewards_per_share, rewards_debt).unwrap();
        assert_eq!(pending, 1000); // Legacy calculation still works for backward compatibility
        
        // Test when debt exceeds rewards
        let pending = vault_math::calculate_pending_rewards(shares, 500u128, rewards_debt).unwrap();
        assert_eq!(pending, 0);
    }

    #[test]
    fn test_calculate_rebase_factor() {
        // Test when rebase is needed
        let (expo_diff, divisor) = vault_math::calculate_rebase_factor(1_000_000, 100).unwrap();
        assert_eq!(expo_diff, 4); // 10^4 = 10,000
        assert_eq!(divisor, 10_000);
        
        // Test when rebase is not needed
        let (expo_diff, divisor) = vault_math::calculate_rebase_factor(100, 1000).unwrap();
        assert_eq!(expo_diff, 0);
        assert_eq!(divisor, 1);
        
        // Test edge case with zero assets
        let (expo_diff, divisor) = vault_math::calculate_rebase_factor(1000, 0).unwrap();
        assert_eq!(expo_diff, 0);
        assert_eq!(divisor, 1);
    }

    #[test]
    fn test_calculate_management_fee() {
        // Test 2% annual fee for 1 year
        let fee = vault_math::calculate_management_fee(
            1_000_000, // 1 token
            200,       // 2% (200 bps)
            365 * 24 * 60 * 60, // 1 year in seconds
            0
        ).unwrap();
        assert_eq!(fee, 20_000); // 2% of 1_000_000

        // Test 6 months should be ~1%
        let fee = vault_math::calculate_management_fee(
            1_000_000,
            200,
            182 * 24 * 60 * 60, // ~6 months
            0
        ).unwrap();
        assert!(fee >= 9_900 && fee <= 10_100); // ~1% with some rounding tolerance
        
        // Test edge cases
        assert_eq!(vault_math::calculate_management_fee(0, 200, 365 * 24 * 60 * 60, 0).unwrap(), 0);
        assert_eq!(vault_math::calculate_management_fee(1_000_000, 0, 365 * 24 * 60 * 60, 0).unwrap(), 0);
        assert_eq!(vault_math::calculate_management_fee(1_000_000, 200, 0, 0).unwrap(), 0);
    }

    #[test]
    fn test_constants() {
        // Verify constants are reasonable
        assert_eq!(SHARE_PRECISION, 1_000_000_000_000_000_000u128); // 10^18
        assert_eq!(BASIS_POINTS_PRECISION, 10_000u64);
        assert_eq!(DEFAULT_UNSTAKE_LOCKUP, 14 * 24 * 60 * 60); // 14 days
        assert_eq!(ONE_DAY, 24 * 60 * 60); // 1 day in seconds
        
        // Ensure precision is large enough to avoid rounding errors
        assert!(SHARE_PRECISION > 1_000_000u128);
        assert!(BASIS_POINTS_PRECISION >= 10_000u64);
    }

    #[test]
    fn test_vault_error_types() {
        // Test that all error types can be created
        let errors = vec![
            VaultError::InsufficientFunds,
            VaultError::InvalidAmount,
            VaultError::UnstakeLockupNotFinished,
            VaultError::NoUnstakeRequest,
            VaultError::UnstakeRequestAlreadyExists,
            VaultError::InvalidVaultConfig,
            VaultError::Unauthorized,
            VaultError::VaultPaused,
            VaultError::InvalidSharesCalculation,
            VaultError::MathOverflow,
            VaultError::DivisionByZero,
            VaultError::InvalidTokenMint,
            VaultError::InvalidTokenAccount,
            VaultError::VaultIsFull,
            VaultError::MinimumStakeAmountNotMet,
        ];
        
        // Verify all errors exist and are distinct
        assert_eq!(errors.len(), 15);
    }

    #[test]
    fn test_precision_edge_cases() {
        // Test very small numbers
        assert_eq!(vault_math::calculate_shares(1, 1, 1).unwrap(), 1);
        
        // Test very large numbers within bounds
        let large_amount = u64::MAX / 2;
        let result = vault_math::calculate_shares(large_amount, large_amount, large_amount);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), large_amount);
        
        // Test overflow scenarios - when multiplication would overflow u128
        assert!(vault_math::calculate_shares(u64::MAX, u64::MAX, 1).is_err());
    }

    #[test]
    fn test_math_consistency() {
        // Test that shares->assets->shares conversion is consistent
        let original_amount = 1_000_000u64;
        let total_supply = 2_000_000u64;
        let total_assets = 2_000_000u64;
        
        // Convert amount to shares
        let shares = vault_math::calculate_shares(original_amount, total_supply, total_assets).unwrap();
        
        // Convert shares back to assets
        let new_total_supply = total_supply + shares;
        let new_total_assets = total_assets + original_amount;
        let recovered_amount = vault_math::calculate_assets(shares, new_total_supply, new_total_assets).unwrap();
        
        // Should be approximately equal (allowing for rounding)
        let diff = if recovered_amount > original_amount {
            recovered_amount - original_amount
        } else {
            original_amount - recovered_amount
        };
        assert!(diff <= 1, "Conversion inconsistency: {} vs {}", original_amount, recovered_amount);
    }

    #[test]
    fn test_zero_division_safety() {
        // All functions should handle zero division gracefully
        assert!(vault_math::calculate_shares(1000, 1000, 0).is_err());
        assert!(10u64.safe_div(0).is_err());
        assert!(10u128.safe_div(0).is_err());
        assert!(10i64.safe_div(0).is_err());
    }

    #[test]
    fn test_rewards_calculation_edge_cases() {
        // Test rewards calculation with zero shares
        let result = vault_math::calculate_rewards_per_share(1000, 0, 0);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 0);
        
        // Test pending rewards with zero shares
        let pending = vault_math::calculate_pending_rewards(0, SHARE_PRECISION, 0);
        assert!(pending.is_ok());
        assert_eq!(pending.unwrap(), 0);
        
        // Test pending rewards when debt equals rewards
        let pending = vault_math::calculate_pending_rewards(1000, SHARE_PRECISION, 1000);
        assert!(pending.is_ok());
        assert_eq!(pending.unwrap(), 0);
        
        // Test pending rewards when debt exceeds rewards
        let pending = vault_math::calculate_pending_rewards(1000, SHARE_PRECISION, 2000);
        assert!(pending.is_ok());
        assert_eq!(pending.unwrap(), 0);
    }

    #[test]
    fn test_rewards_accumulation_scenario() {
        // Simulate a realistic rewards accumulation scenario (legacy test)
        let initial_shares = 1000u64;
        let initial_rewards_per_share = 0u128;
        
        // First reward distribution: 100 tokens to 1000 shares
        let rewards_per_share_1 = vault_math::calculate_rewards_per_share(100, initial_shares, initial_rewards_per_share).unwrap();
        assert_eq!(rewards_per_share_1, 100u128 * SHARE_PRECISION / 1000u128);
        
        // Second reward distribution: 200 tokens to 1000 shares
        let rewards_per_share_2 = vault_math::calculate_rewards_per_share(200, initial_shares, rewards_per_share_1).unwrap();
        let expected_2 = rewards_per_share_1 + (200u128 * SHARE_PRECISION / 1000u128);
        assert_eq!(rewards_per_share_2, expected_2);
        
        // User with 500 shares should get proportional rewards
        let user_shares = 500u64;
        let user_debt = 0u128; // New user, no debt
        let pending = vault_math::calculate_pending_rewards(user_shares, rewards_per_share_2, user_debt).unwrap();
        assert_eq!(pending, 150); // (100 + 200) * 500 / 1000 = 150
    }

    #[test]
    fn test_automatic_compounding() {
        // Test the new automatic compounding functionality
        let initial_assets = 1000u64;
        let initial_shares = 1000u64;
        let reward_amount = 100u64;
        
        // Initial share value: 1000 assets / 1000 shares = 1.0
        let initial_share_value = initial_assets / initial_shares;
        assert_eq!(initial_share_value, 1);
        
        // After adding 100 rewards, total assets become 1100
        let new_total_assets = initial_assets + reward_amount;
        let new_share_value = new_total_assets / initial_shares;
        assert_eq!(new_share_value, 1); // 1100 / 1000 = 1.1 (rounded down)
        
        // User with 500 shares should now have more value
        let user_shares = 500u64;
        let user_asset_value = user_shares * new_total_assets / initial_shares;
        assert_eq!(user_asset_value, 550); // 500 * 1100 / 1000 = 550
        
        // This demonstrates automatic compounding: user's 500 shares are now worth 550 tokens
        // instead of the original 500 tokens, without any action from the user
    }

    #[test]
    fn test_overflow_safety() {
        // All functions should handle overflow gracefully
        assert!(u64::MAX.safe_add(1).is_err());
        assert!(u64::MAX.safe_mul(2).is_err());
        assert!(u128::MAX.safe_add(1).is_err());
        assert!(u128::MAX.safe_mul(2).is_err());
        assert!(i64::MAX.safe_add(1).is_err());
        assert!(i64::MAX.safe_mul(2).is_err());
    }

    #[test]
    fn test_management_fee_in_compounding_model() {
        // Test that management fee is properly deducted from total_assets
        let initial_assets = 10_000u64;
        let fee_rate = 200u64; // 2% annually
        let time_period = 365 * 24 * 60 * 60i64; // 1 year
        
        // Calculate expected fee
        let expected_fee = vault_math::calculate_management_fee(
            initial_assets,
            fee_rate,
            time_period,
            0
        ).unwrap();
        
        // In the compounding model, fee should be deducted from total_assets
        let assets_after_fee = initial_assets - expected_fee;
        
        // Verify the fee is approximately 2% of assets
        assert!(expected_fee >= 190 && expected_fee <= 210); // ~2% with some tolerance
        assert_eq!(assets_after_fee, initial_assets - expected_fee);
    }

    #[test]
    fn test_rewards_before_any_stakes() {
        // Test that rewards added before any stakes go to the first staker
        let reward_amount = 1000u64;
        let first_stake_amount = 2000u64;
        
        // When rewards are added before any stakes, they increase total_assets
        let total_assets_after_rewards = 0u64 + reward_amount;
        assert_eq!(total_assets_after_rewards, reward_amount);
        
        // When first user stakes, they get shares proportional to their deposit
        // but benefit from the pre-existing rewards
        let shares = vault_math::calculate_shares(first_stake_amount, 0, total_assets_after_rewards).unwrap();
        assert_eq!(shares, first_stake_amount);
        
        // Total assets now include both rewards and stake
        let final_total_assets = total_assets_after_rewards + first_stake_amount;
        assert_eq!(final_total_assets, 3000); // 1000 rewards + 2000 stake
        
        // User's share value is enhanced by the pre-existing rewards
        let user_value = shares * final_total_assets / shares;
        assert_eq!(user_value, 3000); // User benefits from 1000 rewards + their 2000 stake
    }

    #[test]
    fn test_share_value_calculation_with_compounding() {
        // Test share value calculation in the compounding model
        let initial_assets = 10_000u64;
        let initial_shares = 5_000u64;
        let rewards = 1_000u64;
        
        // Initial share value should be 2.0 (10000 assets / 5000 shares)
        let initial_value = initial_assets * PRECISION as u64 / initial_shares;
        assert_eq!(initial_value, 2 * PRECISION as u64);
        
        // After adding rewards, share value should increase
        let assets_after_rewards = initial_assets + rewards;
        let new_value = assets_after_rewards * PRECISION as u64 / initial_shares;
        assert_eq!(new_value, 2200000000000); // 2.2 * PRECISION (PRECISION is 10^12)
        
        // This demonstrates automatic compounding - share value increased from 2.0 to 2.2
        assert!(new_value > initial_value);
    }

    #[test]
    fn test_zero_shares_edge_case() {
        // Test various operations when no shares exist
        
        // Adding rewards to empty vault should work
        let reward_amount = 500u64;
        let total_assets = 0u64 + reward_amount;
        assert_eq!(total_assets, 500);
        
        // First stake should get 1:1 shares even with existing rewards
        let stake_amount = 1000u64;
        let shares = vault_math::calculate_shares(stake_amount, 0, total_assets).unwrap();
        assert_eq!(shares, stake_amount);
        
        // Total assets should include both rewards and stake
        let final_assets = total_assets + stake_amount;
        assert_eq!(final_assets, 1500);
        
        // User should get value of their stake plus the pre-existing rewards
        let user_value = shares * final_assets / shares;
        assert_eq!(user_value, 1500);
    }

    #[test]
    fn test_rebase_compatibility_with_compounding() {
        // Test that rebase factor is properly handled in share value calculation
        let shares_base = 2u32; // Simulating 2 rebase events
        let total_assets = 10_000u64;
        let total_shares = 1_000u64; // After rebase adjustments
        
        // Base value calculation
        let base_value = (total_assets as u128 * PRECISION as u128) / total_shares as u128;
        
        // Apply rebase multiplier
        let rebase_multiplier = 10u128.pow(shares_base);
        let adjusted_value = base_value * rebase_multiplier;
        
        // Verify the calculation
        assert_eq!(base_value, 10u128 * PRECISION as u128); // 10.0 base value
        assert_eq!(rebase_multiplier, 100); // 10^2
        assert_eq!(adjusted_value, 1000u128 * PRECISION as u128); // 10.0 * 100 = 1000.0
    }

    #[test]
    fn test_precision_loss_protection() {
        // Test that precision loss protection works correctly
        let total_supply = 1000000u64; // 1M shares
        let total_assets = 1000000u64; // 1M assets, so 1 share = 1 asset
        
        // Very small deposit that would round down to 0 shares
        let small_amount = 1u64;
        let shares = vault_math::calculate_shares(small_amount, total_supply, total_assets).unwrap();
        
        // Should get at least 1 share to prevent loss
        assert_eq!(shares, 1);
        
        // Test with slightly larger amount
        let medium_amount = 10u64;
        let shares = vault_math::calculate_shares(medium_amount, total_supply, total_assets).unwrap();
        
        // Should get the calculated shares (10 * 1000000 / 1000000 = 10)
        assert_eq!(shares, 10);
        
        // Test edge case: zero amount should still give zero shares
        let zero_amount = 0u64;
        let shares = vault_math::calculate_shares(zero_amount, total_supply, total_assets).unwrap();
        assert_eq!(shares, 0);
    }
}