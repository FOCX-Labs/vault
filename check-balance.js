const anchor = require('@coral-xyz/anchor');
const { PublicKey } = require('@solana/web3.js');
const { getAccount } = require('@solana/spl-token');
const fs = require('fs');
const contractInfo = require('./client/contract_info.json');

async function checkBalance() {
  console.log('🔍 Checking user2 balance...');
  
  // Setup provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SimpleVault;
  
  // Load test accounts
  const testAccounts = JSON.parse(fs.readFileSync('./test-accounts.json', 'utf8'));
  const user2TokenAccount = new PublicKey(testAccounts.user2.tokenAccount);
  const user2Keypair = anchor.web3.Keypair.fromSecretKey(Buffer.from(testAccounts.user2.keypair));
  
  // Get token balance
  const tokenAccount = await getAccount(provider.connection, user2TokenAccount);
  const balance = Number(tokenAccount.amount) / 1e9;
  
  console.log(`💰 user2 Token Balance: ${balance} USDC`);
  
  // Get vault depositor info
  const vaultPDA = new PublicKey(contractInfo.vault_pda);
  const programId = new PublicKey(contractInfo.programId);
  
  const [user2VaultDepositor] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_depositor"), vaultPDA.toBuffer(), user2Keypair.publicKey.toBuffer()],
    programId
  );
  
  try {
    const depositor = await program.account.vaultDepositor.fetch(user2VaultDepositor);
    const vault = await program.account.vault.fetch(vaultPDA);
    
    const shares = depositor.shares.toNumber();
    const value = Math.floor((shares * vault.totalAssets.toNumber()) / vault.totalShares.toNumber());
    
    console.log(`📊 user2 Vault Info:`);
    console.log(`   Shares: ${shares}`);
    console.log(`   Value: ${value / 1e9} USDC`);
    console.log(`   Share %: ${(shares * 100 / vault.totalShares.toNumber()).toFixed(2)}%`);
    
  } catch (error) {
    console.log(`❌ Could not fetch vault depositor: ${error.message}`);
  }
  
  console.log(`\n✅ Balance check completed!`);
}

checkBalance().catch(console.error);