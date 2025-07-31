# Insurance Fund Vault

An Insurance Fund Vault that users can stake stable coins to earn platform fees and help secure the marketplace.

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

## Usage

### Initialize Vault

```typescript
await program.methods
  .initializeVault({
    name: Buffer.from('MyVault', 'utf8'),
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
  .rpc()
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
  .rpc()
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
  .rpc()
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
  .rpc()
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
  .rpc()
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

## Unstake Mechanism

After unstaking, funds are not automatically transferred to the user's wallet. The contract uses a two-phase unstake mechanism:

### 🔄 Unstake Mechanism Explanation

1. **Phase 1: Request Unstake**

- User calls the `request_unstake()` function
- Creates an unstake request, recording the request time and shares amount
- Begins waiting for the lockup period (default 14 days)

2. **Phase 2: Execute Unstake**

- After the waiting period ends, user must actively call the `unstake()` function
- Contract checks `can_unstake()` to confirm the waiting period has passed
- Only after calling `unstake()` will funds be transferred from vault to user wallet

### 📍 Key Code Logic

```rust
  // Check if unstake is possible (vault_depositor.rs:145-151)
  pub fn can_unstake(&self, current_time: i64, lockup_period: i64) -> bool {
      if !self.unstake_request.is_pending() {
          return false;
      }

      current_time >= self.unstake_request.request_time + lockup_period
  }

  // Fund transfer during unstake execution (unstake.rs:62-70)
  let cpi_accounts = Transfer {
      from: ctx.accounts.vault_token_account.to_account_info(),
      to: ctx.accounts.user_token_account.to_account_info(),
      authority: vault.to_account_info(),
  };
  token::transfer(cpi_ctx, amount)?;  // Actual transfer happens here

```

### ⚠️ Important Notes

1. **Active Operation Required** - After the waiting period ends, users need to actively call the unstake function
2. **No Automatic Transfer** - Funds will not automatically reach the user's wallet
3. **Time Restriction** - Must wait for the complete lockup period (14 days) before executing unstake

## License

Apache License 2.0
