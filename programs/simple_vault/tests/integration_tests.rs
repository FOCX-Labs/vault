// 集成测试用例
// 测试复杂的业务场景和多步骤操作

#[cfg(test)]
mod integration_tests {
    use simple_vault::math::{SafeMath, vault_math};
    use simple_vault::error::*;
    use simple_vault::constants::*;

    #[test]
    fn test_full_lifecycle_scenario() {
        // 测试完整的vault生命周期
        let mut total_assets = 0u64;
        let mut total_shares = 0u64;
        let mut owner_shares = 0u64;
        
        // 1. 初始存入
        let initial_stake = 1_000_000u64;
        let shares1 = vault_math::calculate_shares(initial_stake, total_shares, total_assets).unwrap();
        total_shares += shares1;
        total_assets += initial_stake;
        
        // 2. 添加奖励
        let reward_amount = 100_000u64;
        total_assets += reward_amount;
        
        // 3. 第二个用户存入
        let second_stake = 500_000u64;
        let shares2 = vault_math::calculate_shares(second_stake, total_shares, total_assets).unwrap();
        total_shares += shares2;
        total_assets += second_stake;
        
        // 4. 应用管理费
        let management_fee_bps = 200u64; // 2%
        let time_elapsed = 365 * 24 * 60 * 60i64; // 1年
        let fee_amount = vault_math::calculate_management_fee(
            total_assets,
            management_fee_bps,
            time_elapsed,
            0
        ).unwrap();
        
        let fee_shares = vault_math::calculate_shares(fee_amount, total_shares, total_assets).unwrap();
        total_shares += fee_shares;
        owner_shares += fee_shares;
        
        // 5. 第一个用户取出一部分
        let withdraw_shares = shares1 / 2;
        let withdraw_assets = vault_math::calculate_assets(withdraw_shares, total_shares, total_assets).unwrap();
        total_shares -= withdraw_shares;
        total_assets -= withdraw_assets;
        
        // 验证最终状态的合理性
        assert!(total_shares > 0);
        assert!(total_assets > 0);
        assert!(owner_shares > 0);
        assert!(withdraw_assets > initial_stake / 2); // 应该包含奖励收益
        
        // 验证share价值增长
        let final_share_value = (total_assets as u128 * PRECISION as u128) / total_shares as u128;
        assert!(final_share_value > PRECISION as u128); // 应该大于1.0
    }

    #[test]
    fn test_multiple_rebase_scenario() {
        // 测试多次rebase的场景
        let mut total_shares = 1_000_000_000u64; // 10亿shares
        let total_assets = 1_000u64;         // 1000 assets
        let mut shares_base = 0u32;
        
        // 模拟多次rebase
        for _i in 0..3 {
            let (expo_diff, divisor) = vault_math::calculate_rebase_factor(total_shares, total_assets).unwrap();
            
            if expo_diff > 0 {
                // 应用rebase
                total_shares = ((total_shares as u128) / divisor) as u64;
                shares_base += expo_diff;
                
                // 验证rebase后的合理性
                assert!(total_shares <= total_assets * 10); // 不应该太极端
            }
        }
        
        // 验证最终状态
        assert!(shares_base > 0); // 应该发生了rebase
        assert!(total_shares > 0); // shares不应该归零
    }

    #[test]
    fn test_precision_across_operations() {
        // 测试多次操作后的精度保持
        let mut total_assets = 1_000_000u64;
        let mut total_shares = 1_000_000u64;
        
        // 进行多次小额存取操作
        for i in 0..100 {
            let stake_amount = 1000u64 + i;
            let new_shares = vault_math::calculate_shares(stake_amount, total_shares, total_assets).unwrap();
            total_shares += new_shares;
            total_assets += stake_amount;
            
            // 立即取出一部分
            let withdraw_shares = new_shares / 2;
            let withdraw_assets = vault_math::calculate_assets(withdraw_shares, total_shares, total_assets).unwrap();
            total_shares -= withdraw_shares;
            total_assets -= withdraw_assets;
        }
        
        // 验证最终状态仍然合理
        assert!(total_shares > 0);
        assert!(total_assets > 0);
        
        // 验证share价值接近初始值（考虑舍入误差）
        let share_value = (total_assets as u128 * 1000u128) / total_shares as u128;
        assert!(share_value >= 990 && share_value <= 1010); // 允许1%的误差
    }

    #[test]
    fn test_edge_case_sequence() {
        // 测试边界条件的序列操作
        let mut total_assets = 1u64;
        let mut total_shares = 1u64;
        
        // 1. 微小金额存入
        let tiny_amount = 1u64;
        let tiny_shares = vault_math::calculate_shares(tiny_amount, total_shares, total_assets).unwrap();
        total_shares += tiny_shares;
        total_assets += tiny_amount;
        
        // 2. 大金额存入
        let large_amount = 1_000_000u64;
        let large_shares = vault_math::calculate_shares(large_amount, total_shares, total_assets).unwrap();
        total_shares += large_shares;
        total_assets += large_amount;
        
        // 3. 中等金额取出
        let medium_shares = total_shares / 2;
        let medium_assets = vault_math::calculate_assets(medium_shares, total_shares, total_assets).unwrap();
        total_shares -= medium_shares;
        total_assets -= medium_assets;
        
        // 4. 验证状态一致性
        assert!(total_shares > 0);
        assert!(total_assets > 0);
        
        // 验证剩余资产和shares的比例合理
        let remaining_ratio = (total_assets as u128 * 1000u128) / total_shares as u128;
        assert!(remaining_ratio > 0);
    }

    #[test]
    fn test_reward_distribution_fairness() {
        // 测试奖励分配的公平性
        let initial_assets = 1_000_000u64;
        let user1_shares = 600_000u64; // 60%
        let user2_shares = 400_000u64; // 40%
        let total_shares = user1_shares + user2_shares;
        
        // 添加奖励
        let reward_amount = 100_000u64;
        let total_assets = initial_assets + reward_amount;
        
        // 计算各用户的资产价值
        let user1_value = vault_math::calculate_assets(user1_shares, total_shares, total_assets).unwrap();
        let user2_value = vault_math::calculate_assets(user2_shares, total_shares, total_assets).unwrap();
        
        // 验证奖励分配比例
        let user1_reward = user1_value - (user1_shares * initial_assets / total_shares);
        let user2_reward = user2_value - (user2_shares * initial_assets / total_shares);
        
        // 奖励应该按照持股比例分配
        let expected_user1_reward = reward_amount * user1_shares / total_shares;
        let expected_user2_reward = reward_amount * user2_shares / total_shares;
        
        // 允许少量舍入误差
        assert!((user1_reward as i64 - expected_user1_reward as i64).abs() <= 1);
        assert!((user2_reward as i64 - expected_user2_reward as i64).abs() <= 1);
    }

    #[test]
    fn test_stress_calculation_accuracy() {
        // 压力测试计算精度
        let test_cases = vec![
            (1u64, 1u64, 1u64),
            (1u64, 1000u64, 1000u64),
            (1000u64, 1u64, 1000u64),
            (u64::MAX / 1000, u64::MAX / 1000, u64::MAX / 1000),
            (100u64, 200u64, 150u64),
            (1u64, u64::MAX / 2, u64::MAX / 2),
        ];
        
        for (amount, total_shares, total_assets) in test_cases {
            if total_assets > 0 {
                // 测试shares计算
                let shares_result = vault_math::calculate_shares(amount, total_shares, total_assets);
                assert!(shares_result.is_ok());
                
                let shares = shares_result.unwrap();
                if shares > 0 {
                    // 测试反向计算
                    let assets_result = vault_math::calculate_assets(shares, total_shares + shares, total_assets + amount);
                    assert!(assets_result.is_ok());
                    
                    let calculated_assets = assets_result.unwrap();
                    // 验证计算精度
                    let diff = if calculated_assets > amount {
                        calculated_assets - amount
                    } else {
                        amount - calculated_assets
                    };
                    assert!(diff <= 1); // 允许1单位的舍入误差
                }
            }
        }
    }

    #[test]
    fn test_management_fee_accumulation() {
        // 测试管理费随时间累积
        let initial_assets = 1_000_000u64;
        let management_fee_bps = 200u64; // 2%
        let total_shares = 1_000_000u64;
        let mut owner_shares = 0u64;
        
        // 模拟一年中的4个季度
        for _quarter in 1..=4 {
            let quarter_seconds = (365 * 24 * 60 * 60 / 4) as i64;
            let fee_amount = vault_math::calculate_management_fee(
                initial_assets,
                management_fee_bps,
                quarter_seconds,
                0
            ).unwrap();
            
            let fee_shares = vault_math::calculate_shares(fee_amount, total_shares, initial_assets).unwrap();
            owner_shares += fee_shares;
        }
        
        // 验证累积的管理费合理
        let annual_fee = vault_math::calculate_management_fee(
            initial_assets,
            management_fee_bps,
            365 * 24 * 60 * 60,
            0
        ).unwrap();
        
        let annual_fee_shares = vault_math::calculate_shares(annual_fee, total_shares, initial_assets).unwrap();
        
        // 季度累积应该接近年度总额
        let diff = if owner_shares > annual_fee_shares {
            owner_shares - annual_fee_shares
        } else {
            annual_fee_shares - owner_shares
        };
        assert!(diff <= annual_fee_shares / 100); // 允许1%的误差
    }
}