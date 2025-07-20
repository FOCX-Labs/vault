# Vault合约管理员操作指南

## 📋 目录
1. [环境准备](#环境准备)
2. [创建测试用USDT Token](#创建测试用usdt-token)
3. [部署Vault合约](#部署vault合约)
4. [初始化Vault](#初始化vault)
5. [参数配置说明](#参数配置说明)
6. [测试操作流程](#测试操作流程)
7. [管理员日常操作](#管理员日常操作)
8. [监控与维护](#监控与维护)

## 🔧 环境准备

### 1. 安装必要工具
```bash
# 安装Solana CLI
curl -sSf https://release.solana.com/v1.17.0/install | sh

# 重新加载PATH
source ~/.bashrc

# 验证安装
solana --version
```

### 2. 配置Solana环境
```bash
# 设置为devnet
solana config set --url https://api.devnet.solana.com

# 创建或导入钱包
solana-keygen new --outfile ~/solana-admin-wallet.json

# 设置钱包
solana config set --keypair ~/solana-admin-wallet.json

# 检查配置
solana config get
```

### 3. 获取测试SOL
```bash
# 空投测试SOL
solana airdrop 10

# 检查余额
solana balance
```

### 4. 安装Anchor和依赖
```bash
# 安装Anchor
npm install -g @coral-xyz/anchor-cli

# 安装依赖
npm install

# 验证安装
anchor --version
```

## 💰 创建测试用USDT Token

### 1. 创建Token Mint
```bash
# 创建新的token mint
spl-token create-token --decimals 6

# 记录返回的Token Address，例如：
# Creating token 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
```

### 2. 创建Token Account
```bash
# 替换<TOKEN_ADDRESS>为上面创建的token地址
spl-token create-account <TOKEN_ADDRESS>

# 例如：
# spl-token create-account 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
```

### 3. 铸造测试Token
```bash
# 铸造1,000,000 USDT (6位小数)
spl-token mint <TOKEN_ADDRESS> 1000000

# 检查余额
spl-token balance <TOKEN_ADDRESS>
```

### 4. 设置Token元数据（可选）
```bash
# 创建metadata.json文件
cat > metadata.json << EOF
{
  "name": "Test USDT",
  "symbol": "USDT",
  "description": "Test USDT token for vault testing",
  "image": "",
  "decimals": 6
}
EOF

# 上传metadata并设置（需要metaplex工具）
# 这一步是可选的，主要用于在钱包中显示token信息
```

## 🚀 部署Vault合约

### 1. 编译合约
```bash
# 进入项目目录
cd /path/to/vault

# 编译合约
anchor build

# 获取程序ID
solana address -k target/deploy/simple_vault-keypair.json
```

### 2. 部署合约到devnet
```bash
# 部署合约
anchor deploy --provider.cluster devnet

# 验证部署
solana program show <PROGRAM_ID>
```

## 🏗️ 初始化Vault

### 1. 准备初始化参数
```bash
# 记录以下信息：
# - Token Mint Address: <TOKEN_ADDRESS>
# - Admin Wallet Address: <ADMIN_WALLET_ADDRESS>
# - Program ID: <PROGRAM_ID>

# 获取admin钱包地址
solana address
```

### 2. 执行初始化
```bash
# 使用anchor测试进行初始化
anchor test --provider.cluster devnet --skip-deploy

# 或者使用自定义脚本初始化
# 注意：需要先修改tests中的配置参数
```

🔄 Anchor Test 初始化逻辑

  执行流程：

  1. 环境准备 → 创建账户和token mint
  2. Vault初始化 → 使用 initializeVault() 创建vault
  3. 测试执行 → 运行所有测试用例

  📋 初始化的关键参数

  1. Vault 初始化参数 (在 initializeVault() 中)：

  {
    name: Array.from(vaultNameBuffer),           // "TestVault" (32字节数组)
    unstakeLockupPeriod: new anchor.BN(14 * 24 * 60 * 60), // 14天 = 1,209,600秒
    managementFee: new anchor.BN(200),           // 200基点 = 2%年化管理费
    minStakeAmount: new anchor.BN(1000),         // 1000 = 0.001 USDT (最小质押)
    maxTotalAssets: null,                        // 无限制
  }

  2. Token 配置：

  tokenMint: 6 decimals                         // USDT使用6位小数
  userTokenAccount: 10,000,000                  // 用户获得10个token (10 USDT)
  rewardSourceAccount: 5,000,000                // 奖励池5个token (5 USDT)

  3. 账户创建：

  - Vault PDA: ["vault", vaultNameBuffer]
  - Vault Token Account PDA: ["vault_token_account", vaultPDA]
  - Rewards Token Account PDA: ["rewards_token_account", vaultPDA]
  - User Depositor PDA: ["vault_depositor", vaultPDA, userPublicKey]

  🎯 具体初始化的参数值

  | 参数                  | 值           | 说明             |
  |---------------------|-------------|----------------|
  | vaultName           | "TestVault" | vault名称标识      |
  | unstakeLockupPeriod | 1,209,600秒  | 14天锁定期         |
  | managementFee       | 200 基点      | 2%年化管理费        |
  | minStakeAmount      | 1,000       | 0.001 USDT最小质押 |
  | maxTotalAssets      | null        | 无资产上限          |
  | tokenDecimals       | 6           | USDT精度         |
  | isPaused            | false       | vault未暂停       |

  🔧 如何在你的环境中使用

  要在devnet上使用这个初始化脚本，你需要：

  1. 修改测试配置 (创建 devnet-init.ts):

  // tests/devnet-init.ts
  import * as anchor from "@coral-xyz/anchor";
  import { Program } from "@coral-xyz/anchor";
  import { SimpleVault } from "../target/types/simple_vault";

  describe("devnet_initialization", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.SimpleVault as Program<SimpleVault>;

    // 使用你的实际token mint地址
    const tokenMint = new PublicKey("YOUR_USDT_TOKEN_MINT_ADDRESS");
    const vaultName = "MainVault"; // 可以自定义

    it("Initialize vault for devnet", async () => {
      const vaultNameBuffer = Buffer.alloc(32);
      vaultNameBuffer.write(vaultName);

      const [vaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), vaultNameBuffer],
        program.programId
      );

      await program.methods
        .initializeVault({
          name: Array.from(vaultNameBuffer),
          unstakeLockupPeriod: new anchor.BN(14 * 24 * 60 * 60), // 14天
          managementFee: new anchor.BN(200),                      // 2%
          minStakeAmount: new anchor.BN(1_000_000),               // 1 USDT
          maxTotalAssets: new anchor.BN(1_000_000_000_000),       // 1M USDT限制
        })
        .accounts({
          vault: vaultPDA,
          owner: provider.wallet.publicKey,
          tokenMint: tokenMint,
          // ... 其他账户
        })
        .rpc();
    });
  });

  2. 生产环境建议参数:

  {
    name: "ProductionVault",                     // 生产vault名称
    unstakeLockupPeriod: new anchor.BN(14 * 24 * 60 * 60), // 14天
    managementFee: new anchor.BN(300),           // 3%年化费率
    minStakeAmount: new anchor.BN(10_000_000),   // 10 USDT最小质押
    maxTotalAssets: new anchor.BN(10_000_000_000_000), // 10M USDT上限
  }

  3. 测试环境快速参数:

  {
    name: "TestVault",
    unstakeLockupPeriod: new anchor.BN(300),     // 5分钟 (测试用)
    managementFee: new anchor.BN(200),           // 2%
    minStakeAmount: new anchor.BN(1_000_000),    // 1 USDT
    maxTotalAssets: null,                        // 无限制
  }

  🚀 执行命令

  # 初始化vault到devnet
  anchor test --provider.cluster devnet --skip-deploy

  # 只运行特定测试
  anchor test --provider.cluster devnet --skip-deploy --grep "Initialize vault"

  这个脚本会自动创建vault并设置所有必要的参数，你只需要确保：
  1. 有正确的USDT token mint地址
  2. 钱包有足够的SOL支付交易费用
  3. 是vault的owner账户




### 3. 验证初始化
```bash
# 检查vault账户是否创建成功
solana account <VAULT_PDA_ADDRESS>

# 检查token账户是否创建成功
spl-token account-info <VAULT_TOKEN_ACCOUNT>
```

## ⚙️ 参数配置说明

### 关键参数解释

#### 1. `unstake_lockup_period` (解锁期)
- **含义**: 用户请求取款后需要等待的时间（秒）
- **默认值**: 1,209,600 (14天)
- **范围**: 1-30天
- **建议值**: 
  - 测试环境: 300 (5分钟)
  - 生产环境: 1,209,600 (14天)

#### 2. `management_fee` (管理费)
- **含义**: 年化管理费率（基点）
- **默认值**: 200 (2%)
- **范围**: 0-1000 (0%-10%)
- **计算**: 200 basis points = 2%
- **建议值**: 100-500 (1%-5%)

#### 3. `min_stake_amount` (最小质押金额)
- **含义**: 单次质押的最小金额
- **默认值**: 0
- **单位**: 最小token单位 (USDT为微单位)
- **建议值**: 1,000,000 (1 USDT)

#### 4. `max_total_assets` (最大总资产)
- **含义**: vault可容纳的最大资产总量
- **默认值**: u64::MAX (无限制)
- **用途**: 风险控制和容量管理
- **建议值**: 根据业务需求设置

### 配置示例
```bash
# 测试环境配置
{
  "unstake_lockup_period": 300,        # 5分钟
  "management_fee": 200,               # 2%
  "min_stake_amount": 1000000,         # 1 USDT
  "max_total_assets": 100000000000     # 100,000 USDT
}

# 生产环境配置
{
  "unstake_lockup_period": 1209600,    # 14天
  "management_fee": 300,               # 3%
  "min_stake_amount": 10000000,        # 10 USDT
  "max_total_assets": 10000000000000   # 10,000,000 USDT
}
```

## 🧪 测试操作流程

### 1. 创建测试用户
```bash
# 创建用户钱包
solana-keygen new --outfile ~/test-user-wallet.json

# 切换到用户钱包
solana config set --keypair ~/test-user-wallet.json

# 空投SOL
solana airdrop 5

# 创建用户token账户
spl-token create-account <TOKEN_ADDRESS>
```

### 2. 给用户转账测试token
```bash
# 切换回admin钱包
solana config set --keypair ~/solana-admin-wallet.json

# 获取用户token账户地址
spl-token accounts <TOKEN_ADDRESS> --owner <USER_WALLET_ADDRESS>

# 转账1000 USDT给用户
spl-token transfer <TOKEN_ADDRESS> 1000 <USER_TOKEN_ACCOUNT> --fund-recipient
```

### 3. 测试Stake操作
```bash
# 切换到用户钱包
solana config set --keypair ~/test-user-wallet.json

# 初始化用户depositor账户
anchor run initialize-depositor --provider.cluster devnet

# 执行stake操作（质押100 USDT）
anchor run stake --provider.cluster devnet -- 100000000

# 检查结果
spl-token balance <TOKEN_ADDRESS>
```

### 4. 测试Unstake操作
```bash
# 请求unstake（提取50 USDT）
anchor run request-unstake --provider.cluster devnet -- 50000000

# 等待锁定期（测试环境5分钟）
sleep 300

# 执行unstake
anchor run unstake --provider.cluster devnet

# 检查余额
spl-token balance <TOKEN_ADDRESS>
```

### 5. 测试奖励分发
```bash
# 切换到admin钱包
solana config set --keypair ~/solana-admin-wallet.json

# 添加奖励（100 USDT）
anchor run add-rewards --provider.cluster devnet -- 100000000

# 检查用户shares价值是否增加
# 用户无需主动claim，奖励自动复合到share价值中
```

## 👨‍💼 管理员日常操作

### 1. 应用管理费
```bash
# 定期应用管理费（建议每月一次）
anchor run apply-management-fee --provider.cluster devnet

# 提取管理费
anchor run withdraw-management-fee --provider.cluster devnet
```

### 2. 应用Rebase
```bash
# 当shares数量过大时应用rebase
anchor run apply-rebase --provider.cluster devnet

# 检查rebase结果
solana account <VAULT_PDA_ADDRESS>
```

### 3. 更新配置
```bash
# 更新vault配置
anchor run update-vault-config --provider.cluster devnet -- \
  --management-fee 250 \
  --min-stake-amount 2000000
```

### 4. 暂停/恢复操作
```bash
# 紧急暂停vault
anchor run update-vault-config --provider.cluster devnet -- --is-paused true

# 恢复操作
anchor run update-vault-config --provider.cluster devnet -- --is-paused false
```

## 📊 监控与维护

### 1. 检查Vault状态
```bash
# 查看vault账户详情
solana account <VAULT_PDA_ADDRESS>

# 查看vault token余额
spl-token balance <TOKEN_ADDRESS> --owner <VAULT_TOKEN_ACCOUNT>

# 检查shares统计
anchor run get-vault-info --provider.cluster devnet
```

### 2. 监控关键指标
```bash
# 检查total_assets和total_shares比例
# 如果total_shares >> total_assets，需要考虑rebase

# 检查管理费累积
# 定期提取管理费以避免过度累积

# 检查用户unstake请求
# 确保有足够流动性处理提取请求
```

### 3. 日志监控
```bash
# 监控程序日志
solana logs <PROGRAM_ID>

# 查看特定交易日志
solana confirm <TRANSACTION_SIGNATURE> --verbose
```

## 🚨 应急处理

### 1. 紧急暂停
```bash
# 立即暂停所有操作
anchor run update-vault-config --provider.cluster devnet -- --is-paused true
```

### 2. 资金安全检查
```bash
# 检查vault token账户余额
spl-token balance <TOKEN_ADDRESS> --owner <VAULT_TOKEN_ACCOUNT>

# 检查是否有异常大额提取
solana transaction-history <VAULT_TOKEN_ACCOUNT> --limit 50
```

### 3. 升级程序
```bash
# 重新部署新版本
anchor build
anchor deploy --provider.cluster devnet

# 验证升级
solana program show <PROGRAM_ID>
```

## 📝 重要提醒

1. **私钥安全**: 妥善保管admin钱包私钥，建议使用硬件钱包
2. **定期备份**: 定期备份所有关键配置和地址信息
3. **测试先行**: 所有操作先在devnet测试，确认无误后再在mainnet执行
4. **监控alerts**: 设置监控告警，及时发现异常情况
5. **权限管理**: 严格控制admin权限，考虑使用多重签名

## 🔗 有用链接

- [Solana Explorer (Devnet)](https://explorer.solana.com/?cluster=devnet)
- [SPL Token CLI文档](https://spl.solana.com/token)
- [Anchor文档](https://anchor-lang.com/)
- [Solana Web3.js文档](https://solana-labs.github.io/solana-web3.js/)

---

**注意**: 请确保在执行任何操作前仔细阅读并理解每个步骤。如有疑问，请先在测试环境中验证。