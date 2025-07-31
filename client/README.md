# Use client to interact with vault contract


## Contract Info

Information about the contract is all in the `contract_info.json` file.

```json
{
    "programId": "EHiKn3J5wywNG2rHV2Qt74AfNqtJajhPerkVzYXudEwn",
    "usdc_address": "DXDVt289yXEcqXDd9Ub3HqSBTWwrmNB8DzQEagv9Svtu",
    "admin_address": "3FJ4EYCddqi4HpGnvXNPuFFwVpoZYahoC2W6y4aY6fxv",
    "platform_account": "9tQwmpAqY8p4ERKPXZEnQc2MAd1juwsFAxv1NF9pNojq",
    "vault_name": "Insurance Fund Vault",
    "vault_pda": "8hDcWvDXvZHcqneLAPBQMjCY9Bpwatdyv16fx7Pf3fys",
    "vault_token_account": "GSzHB4ZRdA26yZRXRnSvTx41YJFQnBivifaNn6XKHQy1",
    "unstake_lockup_period": 24,
    "management_fee": 0,
    "min_stake_amount": 1
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
