// 错误处理测试用例
// 测试各种错误条件和异常情况

#[cfg(test)]
mod error_handling_tests {
    use simple_vault::math::{SafeMath, vault_math};
    use simple_vault::error::*;
    use simple_vault::constants::*;

    #[test]
    fn test_all_error_conditions() {
        // 测试所有可能的错误条件
        
        // 测试MathOverflow
        assert!(u64::MAX.safe_add(1).is_err());
        assert!(u64::MAX.safe_mul(2).is_err());
        
        // 测试DivisionByZero
        assert!(10u64.safe_div(0).is_err());
        assert!(vault_math::calculate_shares(1000, 1000, 0).is_err());
        
        // 测试InvalidAmount (通过零金额)
        assert_eq!(vault_math::calculate_shares(0, 1000, 1000).unwrap(), 0);
        
        // 测试InvalidSharesCalculation
        assert!(vault_math::calculate_shares_for_assets(1000, 0, 1000).is_err());
    }

    #[test]
    fn test_overflow_edge_cases() {
        // 测试各种溢出边界情况
        let max_u64 = u64::MAX;
        let max_u128 = u128::MAX;
        
        // u64溢出测试
        assert!(max_u64.safe_add(1).is_err());
        assert!(max_u64.safe_mul(2).is_err());
        assert!((max_u64 - 1).safe_add(1).is_ok());
        
        // u128溢出测试
        assert!(max_u128.safe_add(1).is_err());
        assert!(max_u128.safe_mul(2).is_err());
        assert!((max_u128 - 1).safe_add(1).is_ok());
        
        // 计算中的溢出
        assert!(vault_math::calculate_shares(max_u64, max_u64, 1).is_err());
        assert!(vault_math::calculate_assets(max_u64, 1, max_u64).is_err());
    }

    #[test]
    fn test_zero_division_scenarios() {
        // 测试所有可能的零除法情况
        
        // 直接零除法
        assert!(10u64.safe_div(0).is_err());
        assert!(10u128.safe_div(0).is_err());
        assert!(10i64.safe_div(0).is_err());
        
        // 在复杂计算中的零除法
        assert!(vault_math::calculate_shares(1000, 1000, 0).is_err());
        assert!(vault_math::calculate_shares_for_assets(1000, 1000, 0).is_err());
        
        // 奖励计算中的零除法保护
        let result = vault_math::calculate_rewards_per_share(1000, 0, 0);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 0);
    }

    #[test]
    fn test_negative_number_handling() {
        // 测试负数处理
        let negative_i64 = -100i64;
        
        // 负数转换为无符号数应该失败
        assert!(simple_vault::math::SafeCast::<u64>::safe_cast(&negative_i64).is_err());
        assert!(simple_vault::math::SafeCast::<u128>::safe_cast(&negative_i64).is_err());
        
        // 负数时间在管理费计算中应该返回0
        let fee = vault_math::calculate_management_fee(1000, 200, negative_i64, 0).unwrap();
        assert_eq!(fee, 0);
    }

    #[test]
    fn test_boundary_value_calculations() {
        // 测试边界值计算
        
        // 最小值
        assert_eq!(vault_math::calculate_shares(1, 1, 1).unwrap(), 1);
        assert_eq!(vault_math::calculate_assets(1, 1, 1).unwrap(), 1);
        
        // 接近最大值
        let near_max = u64::MAX / 2;
        assert!(vault_math::calculate_shares(near_max, near_max, near_max).is_ok());
        assert!(vault_math::calculate_assets(near_max, near_max, near_max).is_ok());
        
        // 超过最大值
        assert!(vault_math::calculate_shares(u64::MAX, u64::MAX, 1).is_err());
    }

    #[test]
    fn test_precision_boundary_cases() {
        // 测试精度边界情况
        
        // 极小值计算
        let tiny_amount = 1u64;
        let huge_supply = u64::MAX / 2;
        let huge_assets = u64::MAX / 2;
        
        let shares = vault_math::calculate_shares(tiny_amount, huge_supply, huge_assets).unwrap();
        // 应该得到至少1个share（精度保护）
        assert!(shares >= 1);
        
        // 极大比例计算
        let large_amount = u64::MAX / 2;
        let tiny_supply = 1u64;
        let tiny_assets = 1u64;
        
        // 这种情况应该处理溢出
        let result = vault_math::calculate_shares(large_amount, tiny_supply, tiny_assets);
        // 可能成功或失败，取决于具体数值
        if result.is_ok() {
            assert!(result.unwrap() > 0);
        }
    }

    #[test]
    fn test_management_fee_error_conditions() {
        // 测试管理费计算的错误条件
        
        // 零资产
        assert_eq!(vault_math::calculate_management_fee(0, 200, 365 * 24 * 60 * 60, 0).unwrap(), 0);
        
        // 零费率
        assert_eq!(vault_math::calculate_management_fee(1000, 0, 365 * 24 * 60 * 60, 0).unwrap(), 0);
        
        // 零时间
        assert_eq!(vault_math::calculate_management_fee(1000, 200, 0, 0).unwrap(), 0);
        
        // 负时间
        assert_eq!(vault_math::calculate_management_fee(1000, 200, -100, 0).unwrap(), 0);
    }

    #[test]
    fn test_rebase_calculation_errors() {
        // 测试rebase计算的错误条件
        
        // 零资产情况
        let (expo_diff, divisor) = vault_math::calculate_rebase_factor(1000, 0).unwrap();
        assert_eq!(expo_diff, 0);
        assert_eq!(divisor, 1);
        
        // 正常情况不需要rebase
        let (expo_diff, divisor) = vault_math::calculate_rebase_factor(1000, 2000).unwrap();
        assert_eq!(expo_diff, 0);
        assert_eq!(divisor, 1);
        
        // 需要rebase的情况
        let (expo_diff, divisor) = vault_math::calculate_rebase_factor(1_000_000, 100).unwrap();
        assert!(expo_diff > 0);
        assert!(divisor > 1);
    }

    #[test]
    fn test_safe_cast_edge_cases() {
        // 测试安全转换的边界情况
        
        // u64 -> u128 (总是安全的)
        assert!(simple_vault::math::SafeCast::<u128>::safe_cast(&u64::MAX).is_ok());
        assert!(simple_vault::math::SafeCast::<u128>::safe_cast(&0u64).is_ok());
        
        // u128 -> u64 (可能溢出)
        assert!(simple_vault::math::SafeCast::<u64>::safe_cast(&(u64::MAX as u128)).is_ok());
        assert!(simple_vault::math::SafeCast::<u64>::safe_cast(&((u64::MAX as u128) + 1)).is_err());
        
        // i64 -> u64 (负数会失败)
        assert!(simple_vault::math::SafeCast::<u64>::safe_cast(&100i64).is_ok());
        assert!(simple_vault::math::SafeCast::<u64>::safe_cast(&(-1i64)).is_err());
        
        // u64 -> i64 (大数会失败)
        assert!(simple_vault::math::SafeCast::<i64>::safe_cast(&(i64::MAX as u64)).is_ok());
        assert!(simple_vault::math::SafeCast::<i64>::safe_cast(&((i64::MAX as u64) + 1)).is_err());
    }

    #[test]
    fn test_reward_calculation_edge_cases() {
        // 测试奖励计算的边界情况
        
        // 零shares情况
        let result = vault_math::calculate_rewards_per_share(1000, 0, 0);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 0);
        
        // 零奖励情况
        let result = vault_math::calculate_rewards_per_share(0, 1000, 0);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 0);
        
        // 待领取奖励的边界情况
        let pending = vault_math::calculate_pending_rewards(0, 1000, 0);
        assert!(pending.is_ok());
        assert_eq!(pending.unwrap(), 0);
        
        // 债务超过奖励的情况
        let pending = vault_math::calculate_pending_rewards(1000, 500, 1000);
        assert!(pending.is_ok());
        assert_eq!(pending.unwrap(), 0);
    }

    #[test]
    fn test_extreme_precision_scenarios() {
        // 测试极端精度场景
        
        // 1 wei对1 ether的比例
        let tiny_amount = 1u64;
        let huge_total = 1_000_000_000_000_000_000u64; // 1 ether in wei
        
        let shares = vault_math::calculate_shares(tiny_amount, huge_total, huge_total).unwrap();
        assert!(shares >= 1); // 精度保护应该生效
        
        // 反向计算
        let assets = vault_math::calculate_assets(shares, huge_total + shares, huge_total + tiny_amount).unwrap();
        // 应该接近原始金额
        assert!(assets >= tiny_amount);
    }
}