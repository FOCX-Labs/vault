# Use client to interact with vault contract


## Contract Info

Information about the contract is all in the `contract_info.json` file.

```
{
    "programId": "EHiKn3J5wywNG2rHV2Qt74AfNqtJajhPerkVzYXudEwn",
    "usdc_address": "DXDVt289yXEcqXDd9Ub3HqSBTWwrmNB8DzQEagv9Svtu",
    "admin_address": "3FJ4EYCddqi4HpGnvXNPuFFwVpoZYahoC2W6y4aY6fxv",
    "platform_account": "9tQwmpAqY8p4ERKPXZEnQc2MAd1juwsFAxv1NF9pNojq",
    "vault_name": "Insurance Fund Vault",
    "vault_pda": "8hDcWvDXvZHcqneLAPBQMjCY9Bpwatdyv16fx7Pf3fys",
    "vault_token_account": "GSzHB4ZRdA26yZRXRnSvTx41YJFQnBivifaNn6XKHQy1",
    // 720s
    "unstake_lockup_period": 720,
    // 50%
    "management_fee": 5000,
    // The value here is set in the smallest precision of USDC. Currently, the minimum stake is 0.001 USDC, and the precision of USDC is 9 digits, so 1000000 is entered here.
    "min_stake_amount": 1000000
}
```


## Common User Operation

For common users, some routine operations related to staking can be performed, but init is a prerequisite for all operations, and new users need to init first.

1. **Initialize** - Users and system interaction first requires initialization before other contract interactions

    ```shell
    yarn cli init
    ```

2. **Stake** - Stake tokens to the vault

    ```shell
    yarn cli stake <USDC_AMOUNT>
    ```

3. **Request Unstake** - Request to unstake tokens (starts lockup period)

    ```shell
    yarn cli request-unstake <USDC_AMOUNT>
    ```

4. **Cancel Unstake Request** - After requesting unstake, if you change your mind, you can cancel

    ```shell
    yarn cli cancel-unstake
    ```

5. **Execute Unstake** - Execute the unstake operation
   > This operation can only be performed after the waiting period has passed, otherwise it will fail

    ```shell
    yarn cli unstake
    ```

6. **View the withdrawable assets of the current account.**
   ```shell
   yarn cli asset-value
   ```

7. **View the vault info**
   ```shell
   yarn cli vault-info
   ```

8. **View the depositor info(staking info)**
   ```shell
   yarn cli depositor-info
   ```

9. **Calculate APY/APR** - Calculate annual percentage yield based on vault performance
   ```shell
   yarn cli apy                    # Calculate APY/APR based on 30 days (default)
   yarn cli apr 7                  # Calculate APY/APR based on 7 days
   yarn cli apy 90                 # Calculate APY/APR based on 90 days
   ```
   > This shows vault performance metrics including daily yield rate, APR (simple), and APY (compound)

10. **View Stake Statistics** - View detailed statistics of all stakers and their amounts
    ```shell
    yarn cli stake-stats            # Show all stakers with their stake amounts
    yarn cli stakers                # Alias for stake-stats
    ```
    > This displays:
    > - Total number of stakers
    > - Individual staker addresses and their current asset values
    > - Share percentages and rankings
    > - Vault concentration analysis


## Vault Admin Operation
For the vault admin, it can update some parameter information in the vault, including:
- `help`                              Show help information
- `info`                              Show current vault configuration
- `update-lockup <hours>`             Update unstake lockup period (hours)
- `update-lockup-min <minutes>`       Update unstake lockup period (minutes)
- `update-fee <basis_points>`         Update management fee (basis points, e.g., 100 = 1%)
- `update-min-stake <amount>`         Update minimum stake amount (USDC)
- `update-max-assets <amount>`        Update maximum total assets (USDC), use 'unlimited' for no limit
- `pause`                            Pause the vault
- `unpause`                           Unpause the vault
- `update-multiple`                   Update multiple parameters interactively

The code implementation is located in `update-vault-params.ts`. You can run `yarn admin` with subcommands above
