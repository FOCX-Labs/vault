# User CLI Operation Guide

1. **Initialize** - Users and system interaction first requires initialization before other contract interactions

    ```shell
    yarn cli init
    ```

2. **Stake** - Stake tokens to the vault

    ```shell
    yarn cli stake <USDT_AMOUNT>
    ```

3. **Request Unstake** - Request to unstake tokens (starts lockup period)

    ```shell
    yarn cli request-unstake <USDT_AMOUNT>
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