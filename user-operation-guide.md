# Vault用户操作指南

## 📋 目录
1. [准备工作](#准备工作)
2. [环境配置](#环境配置)
3. [基础操作流程](#基础操作流程)
4. [TypeScript操作示例](#typescript操作示例)
5. [用户操作详解](#用户操作详解)
6. [查询功能](#查询功能)
7. [风险提示与注意事项](#风险提示与注意事项)
8. [常见问题解答](#常见问题解答)

## 🛠️ 准备工作

### 1. 获取必要信息
在开始使用vault之前，你需要从管理员处获取以下信息：
- **Program ID**: vault合约的程序地址
- **Vault Name**: vault的名称标识
- **Token Mint**: USDT token的mint地址
- **RPC URL**: Solana RPC节点地址（通常是devnet）

### 2. 准备钱包
```bash
# 创建新钱包或使用现有钱包
solana-keygen new --outfile ~/my-user-wallet.json

# 设置为当前钱包
solana config set --keypair ~/my-user-wallet.json

# 获取一些测试SOL（用于支付交易费）
solana airdrop 2
```

### 3. 获取USDT测试币
联系管理员获取一些测试USDT token用于质押操作。

## ⚙️ 环境配置

### 1. 安装依赖
```bash
# 确保项目依赖已安装
npm install

# 安装必要的Solana工具
npm install @solana/web3.js @solana/spl-token @coral-xyz/anchor
```

### 2. 配置参数
修改`user-operation.ts`文件中的配置信息：
```typescript
const config: VaultConfig = {
  programId: new PublicKey("你的程序ID"),
  vaultName: "TestVault", // 或其他vault名称
  tokenMint: new PublicKey("你的USDT_token_mint地址"),
  rpcUrl: "https://api.devnet.solana.com",
};
```

## 🚀 基础操作流程

### 用户典型操作序列：
1. **初始化** → 创建用户账户
2. **质押** → 存入USDT获得shares
3. **查询** → 监控投资状态和收益
4. **请求解质押** → 申请提取资金
5. **等待锁定期** → 等待解锁时间
6. **执行解质押** → 取回资金和收益

## 💻 TypeScript操作示例

### 1. 基础设置
```typescript
import { VaultUserOperations } from './user-operation';
import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';

// 加载钱包
const userWallet = Keypair.fromSecretKey(
  Buffer.from(JSON.parse(fs.readFileSync("~/my-user-wallet.json", "utf8")))
);

// 创建操作实例
const vaultOps = new VaultUserOperations(config, userWallet);
```

### 2. 完整操作示例
```typescript
async function userVaultDemo() {
  try {
    // 1. 初始化用户账户（仅需要做一次）
    console.log("步骤1: 初始化用户账户");
    await vaultOps.initializeDepositor();
    
    // 2. 查看当前状态
    console.log("步骤2: 查看初始状态");
    await vaultOps.getUserReport();
    
    // 3. 执行质押操作
    console.log("步骤3: 质押100 USDT");
    await vaultOps.stake(100 * 1e6); // 100 USDT
    
    // 4. 查看质押后状态
    console.log("步骤4: 查看质押后状态");
    await vaultOps.getUserReport();
    
    // 5. 请求解质押（部分）
    console.log("步骤5: 请求解质押50 USDT");
    await vaultOps.requestUnstake(50 * 1e6);
    
    // 6. 检查解质押请求状态
    console.log("步骤6: 检查解质押请求状态");
    const status = await vaultOps.checkUnstakeRequestStatus();
    
    if (!status.canUnstake) {
      console.log(`需要等待 ${Math.floor(status.remainingTime / 3600)} 小时才能解质押`);
    }
    
    // 7. 等待锁定期结束后执行解质押
    // await vaultOps.unstake(); // 在锁定期结束后调用
    
  } catch (error) {
    console.error("操作失败:", error);
  }
}
```

## 📖 用户操作详解

### 1. initializeDepositor() - 初始化用户账户
```typescript
await vaultOps.initializeDepositor();
```
- **目的**: 为用户创建专用的depositor账户
- **费用**: 需要支付账户创建费用（约0.002 SOL）
- **频率**: 每个用户只需要执行一次
- **注意**: 如果账户已存在会返回错误

### 2. stake(amount) - 质押操作
```typescript
await vaultOps.stake(100 * 1e6); // 质押100 USDT
```
- **参数**: amount为最小单位（USDT为6位小数，所以100 USDT = 100 * 1e6）
- **限制**: 金额需要满足最小质押要求
- **收益**: 质押后开始获得vault产生的收益
- **手续费**: 需要支付Solana交易费用

### 3. requestUnstake(amount) - 请求解质押
```typescript
await vaultOps.requestUnstake(50 * 1e6); // 请求解质押50 USDT价值的shares
```
- **参数**: 要解质押的USDT数量（按当前价值计算）
- **锁定期**: 请求后需要等待锁定期（通常14天）
- **状态**: 请求期间资金仍在vault中继续产生收益
- **限制**: 每次只能有一个活跃的解质押请求

### 4. unstake() - 执行解质押
```typescript
await vaultOps.unstake();
```
- **前提**: 必须先调用requestUnstake()并等待锁定期结束
- **收益**: 取回资金时包含持有期间的所有收益
- **清零**: 执行后解质押请求状态被清零

### 5. cancelUnstakeRequest() - 取消解质押请求
```typescript
await vaultOps.cancelUnstakeRequest();
```
- **时机**: 在锁定期内可以随时取消
- **恢复**: 取消后资金继续在vault中投资
- **重新申请**: 取消后可以立即发起新的解质押请求

### 6. syncRebase() - 同步Rebase
```typescript
await vaultOps.syncRebase();
```
- **目的**: 同步vault的shares调整
- **时机**: 当vault执行rebase后用户需要同步
- **自动化**: 通常在其他操作中会自动执行

## 🔍 查询功能

### 1. 获取完整报告
```typescript
await vaultOps.getUserReport();
```
输出示例：
```
📋 ===== 用户完整报告 =====

📊 Vault信息:
总资产: 1500000.0 USDT
总份额: 1480000
管理费率: 2%
最小质押金额: 1.0 USDT
解质押锁定期: 14 天

👤 用户信息:
持有份额: 100000
总质押金额: 100.0 USDT
总解质押金额: 0.0 USDT
📤 无待处理的解质押请求

💎 用户资产价值:
持有份额: 100000
资产价值: 101.351351 USDT
当前份额价值: 1.013514 USDT/份额

💰 用户Token余额:
USDT余额: 900.0 USDT
```

### 2. 单独查询功能
```typescript
// 查询vault基本信息
await vaultOps.getVaultInfo();

// 查询用户基本信息
await vaultOps.getUserInfo();

// 计算用户资产价值
const value = await vaultOps.getUserAssetValue();

// 查询钱包余额
const balance = await vaultOps.getUserTokenBalance();

// 检查解质押状态
const status = await vaultOps.checkUnstakeRequestStatus();
```

## ⚠️ 风险提示与注意事项

### 资金安全
1. **私钥保护**: 妥善保管钱包私钥，不要分享给任何人
2. **测试环境**: 当前为测试网环境，请勿投入真实资金
3. **合约风险**: 智能合约可能存在bug，请谨慎投资

### 操作风险
1. **锁定期**: 解质押有14天锁定期，期间无法取回资金
2. **管理费**: vault会收取年化管理费（通常2-3%）
3. **收益波动**: 收益可能为正也可能为负
4. **流动性**: 大额解质押可能需要等待

### 技术风险
1. **网络延迟**: Solana网络拥堵可能导致交易延迟
2. **交易失败**: 网络问题可能导致交易失败，需要重试
3. **账户状态**: 确保账户有足够SOL支付交易费用

## ❓ 常见问题解答

### Q: 我需要支付哪些费用？
A: 
- **Solana交易费**: 每笔交易约0.000005 SOL
- **账户创建费**: 首次初始化约0.002 SOL
- **管理费**: vault自动从收益中扣除（年化2-3%）

### Q: 多久能看到收益？
A: 收益实时反映在shares价值中，可通过查询功能实时查看。

### Q: 解质押锁定期多长？
A: 
- **测试环境**: 通常5分钟
- **生产环境**: 通常14天

### Q: 如果在锁定期内需要资金怎么办？
A: 可以取消解质押请求，然后发起新的部分解质押请求。

### Q: 可以投资多少钱？
A: 
- **最小金额**: 通常1 USDT
- **最大金额**: 根据vault容量限制

### Q: 如何知道vault的表现？
A: 通过查看shares价值变化和getUserReport()中的信息。

### Q: 出现错误怎么办？
A: 
1. 检查网络连接
2. 确认钱包有足够SOL
3. 检查参数配置
4. 查看控制台错误信息
5. 联系技术支持

## 🔗 有用的工具和链接

- **Solana Explorer**: https://explorer.solana.com/?cluster=devnet
- **Token查看**: 使用`spl-token balance <TOKEN_ADDRESS>`
- **交易查看**: 在explorer中搜索交易hash
- **账户查看**: 在explorer中查看账户状态

## 📞 获取帮助

如果遇到问题：
1. 检查本指南的常见问题部分
2. 查看控制台错误信息
3. 联系vault管理员
4. 检查Solana网络状态

---

**⚠️ 重要提醒**: 
- 这是测试环境，请勿投入真实资金
- 在操作前请仔细阅读每个步骤
- 保管好你的钱包私钥
- 投资有风险，请谨慎决策