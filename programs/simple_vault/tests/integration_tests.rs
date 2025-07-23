// 集成测试用例
// 测试复杂的业务场景和多步骤操作

#[cfg(test)]
mod integration_tests {
    use simple_vault::math::{SafeMath, vault_math};
    use simple_vault::error::*;
    use simple_vault::constants::*;

    #[test]
    fn test_full_lifecycle_scenario() {
        // test full lifecycle scenario
        let mut total_assets = 0u64;
        let mut total_shares = 0u64;
        let mut owner_shares = 0u64;
        
        // 1. initial stake
        let initial_stake = 1_000_000u64;
        let shares1 = vault_math::calculate_shares(initial_stake, total_shares, total_assets).unwrap();
        total_shares += shares1;
        total_assets += initial_stake;
        
        // 2. add rewards
        let reward_amount = 100_000u64;
        total_assets += reward_amount;
        
        // 3. second user stake
        let second_stake = 500_000u64;
        let shares2 = vault_math::calculate_shares(second_stake, total_shares, total_assets).unwrap();
        total_shares += shares2;
        total_assets += second_stake;
        
        // 4. apply management fee
        let management_fee_bps = 200u64; // 2%
        let time_elapsed = 365 * 24 * 60 * 60i64; // 1 year
        let fee_amount = vault_math::calculate_management_fee(
            total_assets,
            management_fee_bps,
            time_elapsed,
            0
        ).unwrap();
        
        let fee_shares = vault_math::calculate_shares(fee_amount, total_shares, total_assets).unwrap();
        total_shares += fee_shares;
        owner_shares += fee_shares;
        
        // 5. first user withdraw
        let withdraw_shares = shares1 / 2;
        let withdraw_assets = vault_math::calculate_assets(withdraw_shares, total_shares, total_assets).unwrap();
        total_shares -= withdraw_shares;
        total_assets -= withdraw_assets;
        
        // verify final state
        assert!(total_shares > 0);
        assert!(total_assets > 0);
        assert!(owner_shares > 0);
        assert!(withdraw_assets > initial_stake / 2); // should include reward收益
        
        // verify share value growth
        let final_share_value = (total_assets as u128 * PRECISION as u128) / total_shares as u128;
        assert!(final_share_value > PRECISION as u128); // should be greater than 1.0
    }

    #[test]
    fn test_multiple_rebase_scenario() {
        // test multiple rebase scenario
        let mut total_shares = 1_000_000_000u64; // 1000 million shares
        let total_assets = 1_000u64;         // 1000 assets
        let mut shares_base = 0u32;
        
        // simulate multiple rebase
        for _i in 0..3 {
            let (expo_diff, divisor) = vault_math::calculate_rebase_factor(total_shares, total_assets).unwrap();
            
            if expo_diff > 0 {
                // apply rebase
                total_shares = ((total_shares as u128) / divisor) as u64;
                shares_base += expo_diff;
                
                // verify rebase
                assert!(total_shares <= total_assets * 10); // should not be too extreme
            }
        }
        
        // verify final state
        assert!(shares_base > 0); // should have rebased
        assert!(total_shares > 0); // shares should not be zero
    }

    #[test]
    fn test_precision_across_operations() {
        // test precision across operations
        let mut total_assets = 1_000_000u64;
        let mut total_shares = 1_000_000u64;
        
        // perform multiple small stake and withdraw operations
        for i in 0..100 {
            let stake_amount = 1000u64 + i;
            let new_shares = vault_math::calculate_shares(stake_amount, total_shares, total_assets).unwrap();
            total_shares += new_shares;
            total_assets += stake_amount;
            
            // immediately withdraw some shares
            let withdraw_shares = new_shares / 2;
            let withdraw_assets = vault_math::calculate_assets(withdraw_shares, total_shares, total_assets).unwrap();
            total_shares -= withdraw_shares;
            total_assets -= withdraw_assets;
        }
        
        // verify final state
        assert!(total_shares > 0);
        assert!(total_assets > 0);
        
        // verify share value is close to initial value (consider rounding error)
        let share_value = (total_assets as u128 * 1000u128) / total_shares as u128;
        assert!(share_value >= 990 && share_value <= 1010); // allow 1% error
    }

    #[test]
    fn test_edge_case_sequence() {
        // test edge case sequence operations
        let mut total_assets = 1u64;
        let mut total_shares = 1u64;
        
        // 1. small amount stake
        let tiny_amount = 1u64;
        let tiny_shares = vault_math::calculate_shares(tiny_amount, total_shares, total_assets).unwrap();
        total_shares += tiny_shares;
        total_assets += tiny_amount;
        
        // 2. large amount stake
        let large_amount = 1_000_000u64;
        let large_shares = vault_math::calculate_shares(large_amount, total_shares, total_assets).unwrap();
        total_shares += large_shares;
        total_assets += large_amount;
        
        // 3. medium amount withdraw
        let medium_shares = total_shares / 2;
        let medium_assets = vault_math::calculate_assets(medium_shares, total_shares, total_assets).unwrap();
        total_shares -= medium_shares;
        total_assets -= medium_assets;
        
        // 4. verify state consistency
        assert!(total_shares > 0);
        assert!(total_assets > 0);
        
        // verify remaining assets and shares ratio
        let remaining_ratio = (total_assets as u128 * 1000u128) / total_shares as u128;
        assert!(remaining_ratio > 0);
    }

    #[test]
    fn test_reward_distribution_fairness() {
        // test reward distribution fairness
        let initial_assets = 1_000_000u64;
        let user1_shares = 600_000u64; // 60%
        let user2_shares = 400_000u64; // 40% 
        let total_shares = user1_shares + user2_shares;
        
        // add rewards
        let reward_amount = 100_000u64;
        let total_assets = initial_assets + reward_amount;
        
        // calculate each user's asset value
        let user1_value = vault_math::calculate_assets(user1_shares, total_shares, total_assets).unwrap();
        let user2_value = vault_math::calculate_assets(user2_shares, total_shares, total_assets).unwrap();
        
        // verify reward distribution ratio
        let user1_reward = user1_value - (user1_shares * initial_assets / total_shares);
        let user2_reward = user2_value - (user2_shares * initial_assets / total_shares);
        
        // reward should be distributed according to share ratio
        let expected_user1_reward = reward_amount * user1_shares / total_shares;
        let expected_user2_reward = reward_amount * user2_shares / total_shares;
        
        // allow small rounding error
        assert!((user1_reward as i64 - expected_user1_reward as i64).abs() <= 1);
        assert!((user2_reward as i64 - expected_user2_reward as i64).abs() <= 1);
    }

    #[test]
    fn test_stress_calculation_accuracy() {
        // stress test calculation accuracy
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
                // test shares calculation
                let shares_result = vault_math::calculate_shares(amount, total_shares, total_assets);
                assert!(shares_result.is_ok());
                
                let shares = shares_result.unwrap();
                if shares > 0 {
                    // test reverse calculation
                    let assets_result = vault_math::calculate_assets(shares, total_shares + shares, total_assets + amount);
                    assert!(assets_result.is_ok());
                    
                    let calculated_assets = assets_result.unwrap();
                    // verify calculation accuracy
                    let diff = if calculated_assets > amount {
                        calculated_assets - amount
                    } else {
                        amount - calculated_assets
                    };
                    assert!(diff <= 1); // allow 1 unit rounding error
                }
            }
        }
    }

    #[test]
    fn test_management_fee_accumulation() {
        // test management fee accumulation
        let initial_assets = 1_000_000u64;
        let management_fee_bps = 200u64; // 2%
        let total_shares = 1_000_000u64;
        let mut owner_shares = 0u64;
        
        // simulate 4 quarters in a year
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
        
        // verify accumulated management fee
        let annual_fee = vault_math::calculate_management_fee(
            initial_assets,
            management_fee_bps,
            365 * 24 * 60 * 60,
            0
        ).unwrap();
        
        let annual_fee_shares = vault_math::calculate_shares(annual_fee, total_shares, initial_assets).unwrap();
        
        // quarterly accumulation should be close to annual total
        let diff = if owner_shares > annual_fee_shares {
            owner_shares - annual_fee_shares
        } else {
            annual_fee_shares - owner_shares
        };
        assert!(diff <= annual_fee_shares / 100); // allow 1% error
    }

    #[test]
    fn test_add_rewards_complete_scenario() {
        // test complete add_rewards scenario: stake -> add_rewards -> verify asset increase
        println!("=== Testing Add Rewards Complete Scenario ===");
        
        let mut total_assets = 0u64;
        let mut total_shares = 0u64;
        let mut total_rewards = 0u64;
        let mut rewards_per_share = 0u128;
        
        // 1. user1 stake 100 USDT
        let user1_stake = 100_000_000u64; // 100 USDT (6 decimals)
        let user1_shares = vault_math::calculate_shares(user1_stake, total_shares, total_assets).unwrap();
        total_shares += user1_shares;
        total_assets += user1_stake;
        
        println!("After User1 stakes {} USDT:", user1_stake as f64 / 1e6);
        println!("  Total Assets: {} USDT", total_assets as f64 / 1e6);
        println!("  Total Shares: {}", total_shares);
        println!("  User1 Shares: {}", user1_shares);
        
        // verify initial state
        assert_eq!(total_assets, user1_stake);
        assert_eq!(total_shares, user1_shares);
        assert_eq!(user1_shares, user1_stake); // 1:1 ratio initially
        
        // 2. user2 stake 200 USDT  
        let user2_stake = 200_000_000u64; // 200 USDT
        let user2_shares = vault_math::calculate_shares(user2_stake, total_shares, total_assets).unwrap();
        total_shares += user2_shares;
        total_assets += user2_stake;
        
        println!("\nAfter User2 stakes {} USDT:", user2_stake as f64 / 1e6);
        println!("  Total Assets: {} USDT", total_assets as f64 / 1e6);
        println!("  Total Shares: {}", total_shares);
        println!("  User2 Shares: {}", user2_shares);
        
        // verify two users stake after state
        assert_eq!(total_assets, 300_000_000u64); // 100 + 200 USDT
        assert_eq!(total_shares, 300_000_000u64);
        
        // 3. add rewards 60 USDT
        let reward_amount = 60_000_000u64; // 60 USDT
        
        // simulate vault.add_rewards() logic
        // first increase total_assets (this is the key part we fixed)
        total_assets += reward_amount;
        total_rewards += reward_amount;
        
        // update rewards_per_share (for statistics)
        if total_shares > 0 {
            rewards_per_share = vault_math::calculate_rewards_per_share(
                reward_amount,
                total_shares,
                rewards_per_share,
            ).unwrap();
        }
        
        println!("\nAfter adding {} USDT rewards:", reward_amount as f64 / 1e6);
        println!("  Total Assets: {} USDT", total_assets as f64 / 1e6);
        println!("  Total Shares: {} (unchanged)", total_shares);
        println!("  Total Rewards: {} USDT", total_rewards as f64 / 1e6);
        println!("  Rewards Per Share: {}", rewards_per_share);
        
        // verify state after adding rewards
        assert_eq!(total_assets, 360_000_000u64); // 300 + 60 USDT
        assert_eq!(total_shares, 300_000_000u64); // shares unchanged
        assert_eq!(total_rewards, reward_amount);
        
        // 4. calculate each user's asset value (including rewards)
        let user1_value = vault_math::calculate_assets(user1_shares, total_shares, total_assets).unwrap();
        let user2_value = vault_math::calculate_assets(user2_shares, total_shares, total_assets).unwrap();
        
        println!("\nUser asset values after rewards:");
        println!("  User1 Value: {} USDT (original: {} USDT)", user1_value as f64 / 1e6, user1_stake as f64 / 1e6);
        println!("  User2 Value: {} USDT (original: {} USDT)", user2_value as f64 / 1e6, user2_stake as f64 / 1e6);
        
        // calculate each user's reward
        let user1_reward = user1_value - user1_stake;
        let user2_reward = user2_value - user2_stake;
        
        println!("  User1 Reward: {} USDT", user1_reward as f64 / 1e6);
        println!("  User2 Reward: {} USDT", user2_reward as f64 / 1e6);
        
        // verify reward distribution correctness
        // User1 holds 1/3 shares, should get 1/3 reward = 20 USDT
        // User2 holds 2/3 shares, should get 2/3 reward = 40 USDT
        let expected_user1_reward = (reward_amount * user1_shares) / total_shares;
        let expected_user2_reward = (reward_amount * user2_shares) / total_shares;
        
        println!("\nExpected rewards:");
        println!("  User1 Expected: {} USDT", expected_user1_reward as f64 / 1e6);
        println!("  User2 Expected: {} USDT", expected_user2_reward as f64 / 1e6);
        
        // verify reward distribution correctness (allow rounding error)
        assert!((user1_reward as i64 - expected_user1_reward as i64).abs() <= 1);
        assert!((user2_reward as i64 - expected_user2_reward as i64).abs() <= 1);
        
        // verify total reward equals allocated reward
        assert_eq!(user1_reward + user2_reward, reward_amount);
        
        // verify user actually received reward
        assert!(user1_value > user1_stake);
        assert!(user2_value > user2_stake);
        
        // 5. verify share value growth
        let share_value_before = (300_000_000u128 * 1e18 as u128) / 300_000_000u128; // 1.0
        let share_value_after = (total_assets as u128 * 1e18 as u128) / total_shares as u128; // 1.2
        
        println!("\nShare value change:");
        println!("  Before rewards: {}", share_value_before as f64 / 1e18);
        println!("  After rewards: {}", share_value_after as f64 / 1e18);
        
        // share value should grow from 1.0 to 1.2 (20% growth)
        let expected_growth = (reward_amount as u128 * 1e18 as u128) / 300_000_000u128;
        assert_eq!(share_value_after - share_value_before, expected_growth);
        
        println!("\n✅ All add_rewards tests passed!");
    }

    #[test]
    fn test_add_rewards_zero_shares() {
        // test add rewards with zero shares
        println!("=== Testing Add Rewards with Zero Shares ===");
        
        let mut total_assets = 0u64;
        let mut total_shares = 0u64;
        let mut total_rewards = 0u64;
        let mut rewards_per_share = 0u128;
        
        // add rewards without any stake
        let reward_amount = 50_000_000u64; // 50 USDT
        
        // simulate vault.add_rewards() logic after fix
        total_assets += reward_amount; // this is the fix: even if shares=0, increase assets
        total_rewards += reward_amount;
        
        // since total_shares = 0, don't update rewards_per_share
        if total_shares > 0 {
            rewards_per_share = vault_math::calculate_rewards_per_share(
                reward_amount,
                total_shares, 
                rewards_per_share,
            ).unwrap();
        }
        
        println!("After adding {} USDT rewards with zero shares:", reward_amount as f64 / 1e6);
        println!("  Total Assets: {} USDT", total_assets as f64 / 1e6);
        println!("  Total Shares: {}", total_shares);
        println!("  Total Rewards: {} USDT", total_rewards as f64 / 1e6);
        
        // verify state
        assert_eq!(total_assets, reward_amount);
        assert_eq!(total_shares, 0);
        assert_eq!(total_rewards, reward_amount);
        assert_eq!(rewards_per_share, 0); // no update
        
        // now first user stake, should get all accumulated value
        let user_stake = 100_000_000u64; // 100 USDT
        let user_shares = vault_math::calculate_shares(user_stake, total_shares, total_assets).unwrap();
        total_shares += user_shares;
        total_assets += user_stake;
        
        println!("\nAfter first user stakes {} USDT:", user_stake as f64 / 1e6);
        println!("  Total Assets: {} USDT", total_assets as f64 / 1e6);
        println!("  Total Shares: {}", total_shares);
        println!("  User Shares: {}", user_shares);
        
        // user should get overvalued shares (because of previous reward accumulation)
        let expected_total_value = reward_amount + user_stake; // 50 + 100 = 150 USDT
        assert_eq!(total_assets, expected_total_value);
        
        // user's shares value should equal his investment plus previous accumulated reward
        let user_value = vault_math::calculate_assets(user_shares, total_shares, total_assets).unwrap();
        assert_eq!(user_value, expected_total_value);
        
        println!("  User Value: {} USDT (invested: {} USDT, bonus: {} USDT)", 
            user_value as f64 / 1e6, 
            user_stake as f64 / 1e6,
            (user_value - user_stake) as f64 / 1e6
        );
        
        println!("\n✅ Zero shares rewards test passed!");
    }
}