# Simple Vault

A simplified insurance fund vault implementation based on Drift Protocol's architecture.

## Features

- **Staking**: Users can stake tokens to earn rewards
- **Unstaking**: 14-day lockup period for unstaking (configurable)
- **Rewards**: Automatic reward distribution based on share ownership
- **Reward Source**: Dedicated account for receiving external rewards
- **Management**: Owner can configure vault parameters

## Architecture

### Core Components

1. **Vault**: Main vault account storing configuration and state
2. **VaultDepositor**: Individual user account tracking shares and rewards
3. **UnstakeRequest**: Handles unstaking with lockup period
4. **Rewards System**: Calculates and distributes rewards proportionally

### Key Differences from Drift

- **Simplified**: Removed drift protocol CPI calls
- **Self-contained**: All funds stored in vault token accounts
- **Reward Source**: Dedicated account for external reward funding
- **14-day Lockup**: Default unstaking period (configurable)

## Usage

### Initialize Vault

```typescript
await program.methods
  .initializeVault({
    name: Buffer.from("MyVault", "utf8"),
    unstakeLockupPeriod: 14 * 24 * 60 * 60, // 14 days
    managementFee: 200, // 2% (in basis points)
    minStakeAmount: 1000000, // 0.001 tokens
    maxTotalAssets: null,
  })
  .accounts({
    vault: vaultPDA,
    owner: owner.publicKey,
    tokenMint: tokenMint.publicKey,
    vaultTokenAccount: vaultTokenAccount,
    rewardsTokenAccount: rewardsTokenAccount,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  })
  .signers([owner])
  .rpc();
```

### Stake Tokens

```typescript
await program.methods
  .stake(new BN(1000000)) // 0.001 tokens
  .accounts({
    vault: vaultPDA,
    vaultDepositor: vaultDepositorPDA,
    vaultTokenAccount: vaultTokenAccount,
    userTokenAccount: userTokenAccount,
    authority: user.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([user])
  .rpc();
```

### Request Unstake

```typescript
await program.methods
  .requestUnstake(new BN(500000)) // 0.0005 tokens
  .accounts({
    vault: vaultPDA,
    vaultDepositor: vaultDepositorPDA,
    authority: user.publicKey,
  })
  .signers([user])
  .rpc();
```

### Execute Unstake (after 14 days)

```typescript
await program.methods
  .unstake()
  .accounts({
    vault: vaultPDA,
    vaultDepositor: vaultDepositorPDA,
    vaultTokenAccount: vaultTokenAccount,
    userTokenAccount: userTokenAccount,
    authority: user.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([user])
  .rpc();
```

### Add Rewards

```typescript
await program.methods
  .addRewards(new BN(100000)) // 0.0001 tokens
  .accounts({
    vault: vaultPDA,
    rewardsTokenAccount: rewardsTokenAccount,
    rewardSourceAccount: rewardSourceAccount,
    rewardSourceAuthority: owner.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([owner])
  .rpc();
```

### Claim Rewards

```typescript
await program.methods
  .claimRewards()
  .accounts({
    vault: vaultPDA,
    vaultDepositor: vaultDepositorPDA,
    rewardsTokenAccount: rewardsTokenAccount,
    userTokenAccount: userTokenAccount,
    authority: user.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([user])
  .rpc();
```

## Building and Testing

```bash
# Install dependencies
npm install

# Build the program
anchor build

# Run tests
anchor test

# Deploy to localnet
anchor deploy
```

## Security Features

- **PDA-based accounts**: All vault accounts use Program Derived Addresses
- **Authority checks**: Strict validation of account ownership
- **Overflow protection**: Safe math operations throughout
- **Lockup periods**: Prevent immediate unstaking
- **Configurable limits**: Max assets, min stake amounts, etc.

## Configuration

- **Unstake Lockup**: 1-90 days (default: 14 days)
- **Management Fee**: 0-100% (default: 2%)
- **Min Stake Amount**: Configurable minimum
- **Max Total Assets**: Vault capacity limit
- **Pause Functionality**: Owner can pause/unpause vault


## unstake原理
unstake后的资金不会自动到用户钱包。合约采用的是两阶段unstake机制：

  🔄 Unstake机制说明

  第一阶段：申请unstake

  - 用户调用 request_unstake() 函数
  - 创建一个unstake请求，记录请求时间和shares数量
  - 开始等待锁定期（默认14天）

  第二阶段：执行unstake

  - 等待期结束后，用户必须主动调用 unstake() 函数
  - 合约会检查 can_unstake() 确认等待期已过
  - 只有调用 unstake() 后，资金才会从vault转移到用户钱包

  📍 关键代码逻辑

  // 检查是否可以unstake (vault_depositor.rs:145-151)
  pub fn can_unstake(&self, current_time: i64, lockup_period: i64) -> bool {
      if !self.unstake_request.is_pending() {
          return false;
      }

      current_time >= self.unstake_request.request_time + lockup_period
  }

  // 执行unstake时的资金转移 (unstake.rs:62-70)
  let cpi_accounts = Transfer {
      from: ctx.accounts.vault_token_account.to_account_info(),
      to: ctx.accounts.user_token_account.to_account_info(),
      authority: vault.to_account_info(),
  };
  token::transfer(cpi_ctx, amount)?;  // 实际转账发生在这里

  ⚠️ 重要提醒

  1. 需要主动操作 - 等待期结束后，用户需要主动调用unstake函数
  2. 不会自动转账 - 资金不会自动到达用户钱包
  3. 有时间限制 - 必须等待完整的锁定期（14天）才能执行unstake


## License

MIT