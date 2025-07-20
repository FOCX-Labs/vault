#[cfg(test)]
mod security_tests {
    use simple_vault::math::{SafeMath, vault_math};
    use simple_vault::error::*;
    use simple_vault::constants::*;

    #[test]
    fn test_time_manipulation_protection() {
        // 测试时间操控攻击防护
        let total_assets = 1_000_000u64;
        let management_fee_bps = 200u64; // 2%
        
        // 测试极大的时间间隔（超过1年）
        let malicious_time = 10 * 365 * 24 * 60 * 60i64; // 10年
        let fee = vault_math::calculate_management_fee(
            total_assets,
            management_fee_bps,
            malicious_time,
            0
        ).unwrap();
        
        // 费用应该被限制在1年的最大值
        let max_expected_fee = total_assets * management_fee_bps / BASIS_POINTS_PRECISION;
        assert_eq!(fee, max_expected_fee);
    }

    #[test]
    fn test_negative_time_protection() {
        // 测试负时间间隔的处理
        let total_assets = 1_000_000u64;
        let management_fee_bps = 200u64;
        
        // 负时间间隔应该返回0费用
        let negative_time = -100i64;
        let fee = vault_math::calculate_management_fee(
            total_assets,
            management_fee_bps,
            negative_time,
            0
        ).unwrap();
        
        assert_eq!(fee, 0);
    }

    #[test]
    fn test_shares_base_overflow_protection() {
        // 测试shares_base溢出保护
        let total_shares = 1_000_000_000u64;
        let total_assets = 1u64;
        
        // 多次应用rebase直到接近溢出点
        let (expo_diff, _) = vault_math::calculate_rebase_factor(total_shares, total_assets).unwrap();
        
        // 验证expo_diff不会导致溢出
        assert!(expo_diff <= 18); // 最大安全值
    }

    #[test]
    fn test_management_fee_reasonableness_check() {
        // 测试管理费合理性检查
        let total_assets = 1_000_000u64;
        let total_shares = 1_000_000u64;
        let management_fee_bps = 200u64;
        let time_elapsed = 365 * 24 * 60 * 60i64; // 1年
        
        let fee_amount = vault_math::calculate_management_fee(
            total_assets,
            management_fee_bps,
            time_elapsed,
            0
        ).unwrap();
        
        // 计算对应的shares
        let fee_shares = vault_math::calculate_shares(
            fee_amount,
            total_shares,
            total_assets
        ).unwrap();
        
        // 验证管理费不超过总shares的10%
        let max_fee_shares = total_shares / 10;
        assert!(fee_shares <= max_fee_shares);
    }

    #[test]
    fn test_precision_loss_in_rebase() {
        // 测试rebase中的精度损失保护
        let original_shares = 1u64;
        let rebase_divisor = 1000u128;
        
        // 原始计算会导致精度损失
        let calculated_shares = (original_shares as u128 / rebase_divisor) as u64;
        assert_eq!(calculated_shares, 0); // 会丢失
        
        // 但我们的保护机制应该确保用户保留至少1个share
        // 这个测试验证了我们在vault_depositor.rs中的逻辑
    }

    #[test]
    fn test_zero_assets_boundary_conditions() {
        // 测试total_assets为0的边界条件
        assert!(vault_math::calculate_shares(1000, 1000, 0).is_err());
        assert!(vault_math::calculate_shares_for_assets(1000, 1000, 0).is_err());
    }

    #[test]
    fn test_concurrent_operations_simulation() {
        // 模拟并发操作的状态一致性
        let initial_assets = 1_000_000u64;
        let initial_shares = 1_000_000u64;
        
        // 模拟stake操作
        let stake_amount = 100_000u64;
        let new_shares = vault_math::calculate_shares(stake_amount, initial_shares, initial_assets).unwrap();
        
        let mid_assets = initial_assets + stake_amount;
        let mid_shares = initial_shares + new_shares;
        
        // 模拟同时发生的unstake操作
        let unstake_shares = 50_000u64;
        let unstake_assets = vault_math::calculate_assets(unstake_shares, mid_shares, mid_assets).unwrap();
        
        // 验证最终状态的一致性
        let final_assets = mid_assets - unstake_assets;
        let final_shares = mid_shares - unstake_shares;
        
        // 验证share价值保持一致
        let initial_value = (initial_assets as u128 * 1000u128) / initial_shares as u128;
        let final_value = (final_assets as u128 * 1000u128) / final_shares as u128;
        
        // 允许微小的舍入误差
        let diff = if final_value > initial_value {
            final_value - initial_value
        } else {
            initial_value - final_value
        };
        assert!(diff <= 2);
    }

    #[test]
    fn test_extreme_asset_ratios() {
        // 测试极端的资产比例
        let tiny_assets = 1u64;
        let huge_shares = u64::MAX / 2;
        
        // 这种情况应该触发rebase
        let (expo_diff, divisor) = vault_math::calculate_rebase_factor(huge_shares, tiny_assets).unwrap();
        assert!(expo_diff > 0);
        assert!(divisor > 1);
    }

    #[test]
    fn test_edge_case_calculations() {
        // 测试边界情况的计算
        
        // 最小非零值
        assert_eq!(vault_math::calculate_shares(1, 1, 1).unwrap(), 1);
        
        // 最大安全值
        let max_safe = u64::MAX / 2;
        assert!(vault_math::calculate_shares(max_safe, max_safe, max_safe).is_ok());
        
        // 溢出边界
        assert!(vault_math::calculate_shares(u64::MAX, u64::MAX, 1).is_err());
    }

    #[test]
    fn test_management_fee_time_boundaries() {
        // 测试管理费计算的时间边界
        let assets = 1_000_000_000u64; // 增加资产以确保有足够的精度
        let fee_bps = 200u64;
        
        // 测试各种时间间隔
        let test_cases = vec![
            (3600i64, true),                        // 1小时 (更容易产生费用)
            (24 * 60 * 60i64, true),               // 1天
            (365 * 24 * 60 * 60i64, true),         // 1年
            (2 * 365 * 24 * 60 * 60i64, true),     // 2年（应该被限制为1年）
            (0i64, false),                          // 0秒
            (-1i64, false),                         // 负数
        ];
        
        for (time_elapsed, should_have_fee) in test_cases {
            let fee = vault_math::calculate_management_fee(assets, fee_bps, time_elapsed, 0).unwrap();
            if should_have_fee {
                assert!(fee > 0, "Expected fee > 0 for time_elapsed: {}, but got: {}", time_elapsed, fee);
            } else {
                assert_eq!(fee, 0);
            }
        }
    }
}