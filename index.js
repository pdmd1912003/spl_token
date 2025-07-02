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

async function main() {
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
  const mintKeypair  = web3.Keypair.generate();
  console.log('Mint Address:', mintKeypair.publicKey.toBase58());
  
  const mintSpace = splToken.MINT_SIZE;
  const lamports = await connection.getMinimumBalanceForRentExemption(mintSpace);
  
  const createMintAccountInstruction = web3.SystemProgram.createAccount({
    fromPubkey:fromWallet.publicKey,
    newAccountPubkey:mintKeypair.publicKey,
    space:mintSpace,
    lamports,
    programId: splToken.TOKEN_PROGRAM_ID,
  });

  const initializeMintAccountInstruction= splToken.createInitializeMintInstruction(
    mintKeypair.publicKey,
    9,
    fromWallet.publicKey,
    fromWallet.publicKey
  );
   const fromTokenAccount = await splToken.getAssociatedTokenAddress(
    mintKeypair.publicKey,
    fromWallet.publicKey
  );

  const associatedTokenAccountInstruction = splToken.createAssociatedTokenAccountInstruction(
    fromWallet.publicKey,
    fromTokenAccount,
    fromWallet.publicKey,
    mintKeypair.publicKey
  );
  // Mint tokens instruction
  const mintInstruction = splToken.createMintToInstruction(
    mintKeypair.publicKey,
    fromTokenAccount,
    fromWallet.publicKey,
    1_000_000_000_000 // amount
  );


  const metadataProgramId = new web3.PublicKey(
    'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
  );
  const [metadataPDA] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      metadataProgramId.toBuffer(),
      mintKeypair.publicKey.toBuffer()
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
      mint: mintKeypair.publicKey,
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
    const transaction = new web3.Transaction().add(
      createMintAccountInstruction,
      initializeMintAccountInstruction,
      metadataInstruction,
      associatedTokenAccountInstruction,
      mintInstruction
  );

  const signature = await web3.sendAndConfirmTransaction(
    connection,
    transaction,
    [fromWallet, mintKeypair] // Signers
  );

  console.log('Created metadata tx:', signature);
}
main().catch(err => {
  console.error('Error:', err);
});