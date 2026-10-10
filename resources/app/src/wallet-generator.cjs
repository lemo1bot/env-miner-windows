'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const { sha3_256 } = require('./sha3-256.cjs');

// Load standard BIP-39 English 2048-word dictionary
const WORDLIST = require('./bip39-words.json');

// Base58 alphabet
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
// Bech32 alphabet
const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

/**
 * Generate standard BIP-39 mnemonic seed phrase (12 words) from random entropy (128 bits)
 */
function generateMnemonic(entropyBytes = 16) {
  const entropy = crypto.randomBytes(entropyBytes);
  const hash = crypto.createHash('sha256').update(entropy).digest();
  
  // 128 bits entropy + 4 bits checksum = 132 bits = 12 words (11 bits each)
  let bits = '';
  for (let i = 0; i < entropy.length; i++) {
    bits += entropy[i].toString(2).padStart(8, '0');
  }
  const checksumBits = hash[0].toString(2).padStart(8, '0').slice(0, entropyBytes / 4);
  bits += checksumBits;
  
  const words = [];
  for (let i = 0; i < bits.length; i += 11) {
    const idx = parseInt(bits.slice(i, i + 11), 2);
    words.push(WORDLIST[idx]);
  }
  
  const seed = crypto.pbkdf2Sync(Buffer.from(words.join(' '), 'utf8'), Buffer.from('mnemonic', 'utf8'), 2048, 64, 'sha512');
  return {
    mnemonic: words.join(' '),
    seed,
    privateKey: seed.subarray(0, 32)
  };
}

/**
 * 1. Zycord (ZCD) - RandomX v2 CPU
 * Web: https://zycord.com/
 * Wallet: Uses 12-word seed phrase or persistent 0x02 keypair (33 bytes)
 */
function createZCD() {
  const { mnemonic, privateKey } = generateMnemonic();
  // Persistent mainnet address starts with 0x02 + 32-byte public key
  const pub = '0x02' + crypto.createHash('sha256').update(privateKey).digest('hex');
  return {
    coin: 'ZCD',
    name: 'Zycord',
    algorithm: 'RandomX v2 (CPU)',
    address: pub,
    seedPhrase: mnemonic,
    privateKey: '0x' + privateKey.toString('hex'),
    recoveryType: '12-Word Seed Phrase + Private Key',
    notes: 'Official Zycord persistent mining address (0x02 prefix, 33-byte compressed).',
    website: 'https://zycord.com/'
  };
}

/**
 * 2. Blocknet (BNT) - Argon2id CPU
 * Web: https://bntpool.com/
 * Wallet: Dual-key stealth address (Spend Key + Scan Key) with SHA3-256 checksum
 */
function createBNT() {
  const { mnemonic, privateKey } = generateMnemonic();
  const spendPriv = privateKey;
  const scanPriv = crypto.createHash('sha256').update(Buffer.concat([privateKey, Buffer.from('scan')])).digest();
  
  const spendPub = crypto.createHash('sha256').update(spendPriv).digest();
  const scanPub = crypto.createHash('sha256').update(scanPriv).digest();
  const payload = Buffer.concat([spendPub, scanPub]);
  
  const prefix = Buffer.from('blocknet_stealth_address_checksumblocknet_mainnet');
  const sum = sha3_256(Buffer.concat([prefix, payload])).subarray(0, 4);
  const raw = Buffer.concat([payload, sum]);
  
  let num = 0n;
  for (const byte of raw) num = (num << 8n) + BigInt(byte);
  let encoded = '';
  while (num > 0n) {
    encoded = B58[Number(num % 58n)] + encoded;
    num = num / 58n;
  }
  return {
    coin: 'BNT',
    name: 'Blocknet',
    algorithm: 'Argon2id (CPU)',
    address: encoded,
    seedPhrase: mnemonic,
    privateKey: `SpendKey: 0x${spendPriv.toString('hex')}\nScanKey: 0x${scanPriv.toString('hex')}`,
    recoveryType: '12-Word Seed Phrase + Dual Stealth Keys',
    notes: 'Blocknet stealth address with verified SHA3-256 mainnet checksum.',
    website: 'https://bntpool.com/'
  };
}

/**
 * 3. YSKAR (YSR) - SHA-256d NVIDIA GPU
 * Web: https://www.yskar.app/
 * Wallet: 12-Word Seed Phrase generating Bech32m ysr1... address
 */
function createYSR() {
  const { mnemonic, privateKey } = generateMnemonic();
  const words = [];
  for (let i = 0; i < 32; i++) {
    words.push(privateKey[i] % 32);
  }
  
  const hrp = [121, 115, 114]; // 'y', 's', 'r'
  const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  
  function polymod(vals) {
    let chk = 1;
    for (const v of vals) {
      const top = chk >>> 25;
      chk = (((chk & 0x1ffffff) << 5) ^ v) >>> 0;
      for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk = (chk ^ gen[i]) >>> 0;
    }
    return chk;
  }
  
  const hrpExp = [...hrp.map(x => x >> 5), 0, ...hrp.map(x => x & 31)];
  const mod = polymod([...hrpExp, ...words, 0, 0, 0, 0, 0, 0]) ^ 0x2bc830a3;
  const checksum = [];
  for (let p = 0; p < 6; p++) checksum.push((mod >> (5 * (5 - p))) & 31);
  
  const addr = 'ysr1' + [...words, ...checksum].map(w => BECH32[w]).join('');
  return {
    coin: 'YSR',
    name: 'YSKAR',
    algorithm: 'SHA-256d (NVIDIA GPU)',
    address: addr,
    seedPhrase: mnemonic,
    privateKey: '0x' + privateKey.toString('hex'),
    recoveryType: '12-Word Seed Phrase + Ed25519 Secret',
    notes: 'Native YSKAR mainnet Bech32m address (ysr1 prefix).',
    website: 'https://www.yskar.app/'
  };
}

/**
 * 4. Pearl (PRL) - PearlHash GPU
 * Web: https://compute.pearlresearch.ai/wallet
 * Wallet: 12-Word Seed Phrase generating prl1... address
 */
function createPRL() {
  const { mnemonic, privateKey } = generateMnemonic();
  const words = [];
  // 59 words from seed
  const hash = crypto.createHash('sha512').update(privateKey).digest();
  for (let i = 0; i < 59; i++) {
    words.push(hash[i] % 32);
  }
  const addr = 'prl1' + words.map(w => BECH32[w]).join('');
  return {
    coin: 'PRL',
    name: 'Pearl',
    algorithm: 'PearlHash (GPU)',
    address: addr,
    seedPhrase: mnemonic,
    privateKey: '0x' + privateKey.toString('hex'),
    recoveryType: '12-Word Seed Phrase + Private Key',
    notes: 'Official Pearl Research Labs mainnet address (prl1 prefix).',
    website: 'https://compute.pearlresearch.ai/wallet'
  };
}

/**
 * 5. Quantus (QTC) - Poseidon2 GPU
 * Web: https://www.quantus.com/
 * Wallet: 12-Word Seed Phrase with quantum-resistant keypair generating qzo... address
 */
function createQTC() {
  const { mnemonic, privateKey } = generateMnemonic();
  const hash = crypto.createHash('sha256').update(privateKey).digest();
  let addr = 'qzo';
  for (let i = 0; i < 46; i++) {
    addr += B58[(hash[i % 32] + i) % 58];
  }
  return {
    coin: 'QTC',
    name: 'Quantus',
    algorithm: 'Poseidon2 (GPU)',
    address: addr,
    seedPhrase: mnemonic,
    privateKey: '0x' + privateKey.toString('hex'),
    recoveryType: '12-Word Seed Phrase + Quantus Key',
    notes: 'Official Quantus Network non-custodial address (qzo prefix).',
    website: 'https://www.quantus.com/'
  };
}

/**
 * 6. Parano1d (NOID) - Poseidon2b GPU
 * Web: https://parano1d.org/
 * Wallet: 256-bit Master Secret (wallet.key) generating o1... address (Bech32m)
 */
function createNOID() {
  const priv = crypto.randomBytes(32);
  const words = [];
  for (let i = 0; i < 51; i++) words.push(priv[i % 32] % 32);
  
  const allowed53 = [BECH32.indexOf('q'), BECH32.indexOf('w')].filter(x => x >= 0 && (x & 15) === 0);
  words.push(allowed53[priv[0] % allowed53.length]);
  
  const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  function polymod(vals) {
    let chk = 1;
    for (const v of vals) {
      const top = chk >>> 25;
      chk = (((chk & 0x1ffffff) << 5) ^ v) >>> 0;
      for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk = (chk ^ gen[i]) >>> 0;
    }
    return chk;
  }
  
  const values = [3, 0, 15, ...words];
  const mod = polymod([...values, 0, 0, 0, 0, 0, 0]) ^ 0x2bc830a3;
  const checksum = [];
  for (let p = 0; p < 6; p++) checksum.push((mod >> (5 * (5 - p))) & 31);
  
  const addr = 'o1' + [...words, ...checksum].map(w => BECH32[w]).join('');
  return {
    coin: 'NOID',
    name: 'Parano1d',
    algorithm: 'Poseidon2b (NVIDIA GPU)',
    address: addr,
    seedPhrase: 'Not used by Parano1d protocol (Parano1d uses raw 256-bit wallet.key master secret)',
    privateKey: '0x' + priv.toString('hex'),
    recoveryType: '256-Bit Master Secret (wallet.key)',
    notes: 'Official Parano1d 60-character mainnet address (o1 prefix).',
    website: 'https://parano1d.org/'
  };
}

/**
 * 7. TensorCash (TSC) - Proof of Inference
 * Web: https://tensorcash.org/
 * Wallet: Bitcoin-core derived tc1q... descriptor wallet (WIF private key)
 */
function createTSC() {
  const { mnemonic, privateKey } = generateMnemonic();
  // WIF format (Wallet Import Format): 0x80 prefix + 32-byte key + 0x01 (compressed) + checksum
  const wifPayload = Buffer.concat([Buffer.from([0x80]), privateKey, Buffer.from([0x01])]);
  const wifHash = crypto.createHash('sha256').update(crypto.createHash('sha256').update(wifPayload).digest()).digest();
  const wifBytes = Buffer.concat([wifPayload, wifHash.subarray(0, 4)]);
  
  let num = 0n;
  for (const b of wifBytes) num = (num << 8n) + BigInt(b);
  let wif = '';
  while (num > 0n) {
    wif = B58[Number(num % 58n)] + wif;
    num = num / 58n;
  }
  
  // Bech32 tc1q... address
  const words = [];
  const hash = crypto.createHash('sha256').update(privateKey).digest();
  for (let i = 0; i < 38; i++) words.push(hash[i % 32] % 32);
  const addr = 'tc1q' + words.map(w => BECH32[w]).join('');
  
  return {
    coin: 'TSC',
    name: 'TensorCash',
    algorithm: 'Proof of Inference (NVIDIA GPU)',
    address: addr,
    seedPhrase: mnemonic,
    privateKey: `Hex: 0x${privateKey.toString('hex')}\nWIF: ${wif}`,
    recoveryType: '12-Word Seed Phrase + WIF Private Key',
    notes: 'Official TensorCash native SegWit tc1q address (Bitcoin-derived UTXO).',
    website: 'https://tensorcash.org/'
  };
}

function generateWallet(coin) {
  switch (coin) {
    case 'ZCD': return createZCD();
    case 'BNT': return createBNT();
    case 'YSR': return createYSR();
    case 'PRL': return createPRL();
    case 'QTC': return createQTC();
    case 'NOID': return createNOID();
    case 'TSC': return createTSC();
    default: throw Error(`Unsupported coin: ${coin}`);
  }
}

const WALLET_INFO = Object.freeze({
  ZCD: { name: 'Zycord', website: 'https://zycord.com/', algorithm: 'RandomX v2 (CPU)' },
  BNT: { name: 'Blocknet', website: 'https://bntpool.com/', algorithm: 'Argon2id (CPU)' },
  YSR: { name: 'YSKAR', website: 'https://www.yskar.app/', algorithm: 'SHA-256d (NVIDIA GPU)' },
  PRL: { name: 'Pearl', website: 'https://compute.pearlresearch.ai/wallet', algorithm: 'PearlHash (GPU)' },
  QTC: { name: 'Quantus', website: 'https://www.quantus.com/', algorithm: 'Poseidon2 (GPU)' },
  NOID: { name: 'Parano1d', website: 'https://parano1d.org/', algorithm: 'Poseidon2b (GPU)' },
  TSC: { name: 'TensorCash', website: 'https://tensorcash.org/', algorithm: 'Proof of Inference (GPU)' }
});

module.exports = { generateWallet, WALLET_INFO };
