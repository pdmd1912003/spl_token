const fs = require('fs');
const path = require('path');
const web3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const {
  createCreateMetadataAccountV3Instruction,
} = require('@metaplex-foundation/mpl-token-metadata');


function loadOrCreateKeypair(filePath) {
  if (fs.existsSync(filePath)) {
    const secret = Uint8Array.from(JSON.parse(fs.readFileSync(filePath)));
    return web3.Keypair.fromSecretKey(secret);
  } else {
    const keypair = web3.Keypair.generate();
    fs.writeFileSync(filePath, JSON.stringify(Array.from(keypair.secretKey)));
    console.log(`Created new keypair & saved to ${filePath}`);
    return keypair;
  }
}
(async () => {
  const connection = new web3.Connection(web3.clusterApiUrl('devnet'), 'confirmed');

  const fromWallet = loadOrCreateKeypair(path.join(__dirname, 'wallet.json'));
  const toWallet = web3.Keypair.generate();

  console.log('From Wallet:', fromWallet.publicKey.toBase58());
  console.log('To Wallet:', toWallet.publicKey.toBase58());

  const balance = await connection.getBalance(fromWallet.publicKey);
  if (balance < web3.LAMPORTS_PER_SOL) {
    console.log('Low balance, requesting airdrop...');
    const sig = await connection.requestAirdrop(fromWallet.publicKey, 2 * web3.LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
    console.log('Airdropped 2 SOL');
  } else {
    console.log(`Balance: ${balance / web3.LAMPORTS_PER_SOL} SOL`);
  }
  const mint = await splToken.createMint(
    connection,
    fromWallet,
    fromWallet.publicKey,
    null,
    9
  );
  console.log('Mint Address:', mint.toBase58());
  const fromTokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
    connection,
    fromWallet,
    mint,
    fromWallet.publicKey
  );

  const toTokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
    connection,
    fromWallet,
    mint,
    toWallet.publicKey
  );
  await splToken.mintTo(
    connection,
    fromWallet,
    mint,
    fromTokenAccount.address,
    fromWallet,
    1_000_000_000_000
  );
  console.log('Minted tokens to source wallet');

  await splToken.transfer(
    connection,
    fromWallet,
    fromTokenAccount.address,
    toTokenAccount.address,
    fromWallet.publicKey,
    500_000_000_000
  );
  console.log('Transferred tokens');

  // === Tạo Metadata ===
  const metadataProgramId = new web3.PublicKey(
    'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
  );

  const [metadataPDA] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      metadataProgramId.toBuffer(),
      mint.toBuffer(),
    ],
    metadataProgramId
  );

  const tokenMetadata = {
    name: 'Super Token',
    symbol: 'SUPER',
    uri: 'https://bronze-voluntary-shrimp-569.mypinata.cloud/ipfs/bafkreihworwf4fyi3zux3nqq3tiyjgmpxhlnkyenagr4vj4hmrmmfs46nm',
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null,
  };

  const metadataInstruction = createCreateMetadataAccountV3Instruction(
    {
      metadata: metadataPDA,
      mint: mint,
      mintAuthority: fromWallet.publicKey,
      payer: fromWallet.publicKey,
      updateAuthority: fromWallet.publicKey,
    },
    {
      createMetadataAccountArgsV3: {
        data: tokenMetadata,
        isMutable: true,
        collectionDetails: null,
      },
    }
  );

  const transaction = new web3.Transaction().add(metadataInstruction);

  const sig = await web3.sendAndConfirmTransaction(
    connection,
    transaction,
    [fromWallet]
  );

  console.log('Created metadata tx:', sig);
})();
