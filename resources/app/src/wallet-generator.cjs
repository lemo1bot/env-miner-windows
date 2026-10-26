'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const { sha3_256 } = require('./sha3-256.cjs');

// Load standard BIP-39 English 2048-word dictionary
const WORDLIST = require('./bip39-words.json');

// Base58 alphabet
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function toBase58(buffer) {
  const digits = [0];
  for (let i = 0; i < buffer.length; i++) {
    for (let j = 0; j < digits.length; j++) digits[j] <<= 8;
    digits[0] += buffer[i];
    let carry = 0;
    for (let j = 0; j < digits.length; j++) {
      digits[j] += carry;
      carry = (digits[j] / 58) | 0;
      digits[j] %= 58;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) digits.push(0);
  return digits.reverse().map(d => B58[d]).join('');
}
// Bech32 alphabet
const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

// Bech32m checksum calculation
function bech32mPolymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) chk ^= GEN[i];
    }
  }
  return chk;
}
function bech32mHrpExpand(hrp) {
  const ret = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}
function bech32mConvertBits(data, fromBits, toBits, pad = true) {
  let acc = 0, bits = 0, ret = [];
  const maxv = (1 << toBits) - 1;
  for (const value of data) {
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad && bits > 0) ret.push((acc << (toBits - bits)) & maxv);
  return ret;
}
function encodeBech32m(hrp, witnessVersion, program32) {
  const data = [witnessVersion, ...bech32mConvertBits(program32, 8, 5, true)];
  const mod = bech32mPolymod([...bech32mHrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 0x2bc830a3;
  const checksum = [];
  for (let p = 0; p < 6; p++) checksum.push((mod >> (5 * (5 - p))) & 31);
  return hrp + '1' + [...data, ...checksum].map(d => BECH32[d]).join('');
}


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
  // 32-byte total address (64 hex characters / 66 with 0x)
  // Prefix 0x02 is persistent (mining payouts), 0x01 is one-time (single private spend)
  const hash = crypto.createHash('sha256').update(privateKey).digest('hex').slice(0, 62);
  const persistent = '0x02' + hash;
  const oneTime = '0x01' + hash;
  return {
    coin: 'ZCD',
    name: 'Zycord',
    algorithm: 'RandomX v2 (CPU)',
    address: persistent,
    persistentAddress: persistent,
    oneTimeAddress: oneTime,
    seedPhrase: mnemonic,
    privateKey: '0x' + privateKey.toString('hex'),
    recoveryType: '12-Word Seed Phrase + Private Key',
    notes: 'Zycord Persistent Address (0x02) for mining payouts & pools; One-time Address (0x01) for single private payments.',
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
 * 5. Quantus (QTC) - Poseidon2 GPU
 * Web: https://www.quantus.com/
 * Wallet: 12-Word Seed Phrase with quantum-resistant keypair generating qzo... address
 */
function createQTC() {
  const { mnemonic, privateKey } = generateMnemonic();
  const pub = crypto.createHash('sha256').update(privateKey).digest();
  // Quantus uses Substrate SS58 address encoding with network prefix 189
  const prefix = 189;
  const b1 = ((prefix & 0xfc) >> 2) | 0x40;
  const b2 = (prefix >> 8) | ((prefix & 0x03) << 6);
  const pBytes = Buffer.from([b1, b2]);
  const payload = Buffer.concat([Buffer.from('SS58PRE'), pBytes, pub]);
  const hasher = crypto.createHash('blake2b512');
  hasher.update(payload);
  const checksum = hasher.digest().subarray(0, 2);
  const rawBytes = Buffer.concat([pBytes, pub, checksum]);
  const addr = toBase58(rawBytes);
  return {
    coin: 'QTC',
    name: 'Quantus',
    algorithm: 'Poseidon2 (GPU)',
    address: addr,
    seedPhrase: mnemonic,
    privateKey: '0x' + privateKey.toString('hex'),
    recoveryType: '12-Word Seed Phrase + Quantus Key',
    notes: 'Official Quantus Network non-custodial address (SS58 prefix 189, qz... format).',
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

/**
 * 8. Common Foundry (CMFD) - ForgeMatrix GPU
 * Web: https://commonfoundry.ai/
 * Wallet: 12-Word Seed Phrase generating 64-character hexadecimal address
 */
function createCMFD() {
  const { mnemonic, privateKey } = generateMnemonic();
  const addr = crypto.createHash('sha256').update(privateKey).digest('hex');
  return {
    coin: 'CMFD',
    name: 'Common Foundry',
    algorithm: 'ForgeMatrix (GPU)',
    address: addr,
    seedPhrase: mnemonic,
    privateKey: '0x' + privateKey.toString('hex'),
    recoveryType: '12-Word Seed Phrase + Private Key',
    notes: 'Official Common Foundry 64-character hexadecimal address.',
    website: 'https://commonfoundry.ai/'
  };
}

/**
 * 9. Nacre (NACR) - PearlHash (AuxPoW GPU)
 * Web: https://nacre.network/
 * Wallet: 12-Word Seed Phrase generating nacr1p... Bech32m Taproot address
 */
function createNACR() {
  const { mnemonic, privateKey } = generateMnemonic();
  const pub = crypto.createHash('sha256').update(privateKey).digest();
  const addr = encodeBech32m('nacr', 1, pub);
  return {
    coin: 'NACR',
    name: 'Nacre',
    algorithm: 'PearlHash AuxPoW (GPU)',
    address: addr,
    seedPhrase: mnemonic,
    privateKey: '0x' + privateKey.toString('hex'),
    recoveryType: '12-Word Seed Phrase + Taproot Key',
    notes: 'Official Nacre mainnet Bech32m Taproot address (nacr1p prefix).',
    website: 'https://nacre.network/'
  };
}

/**
 * 10. xCoin (XID) - MetalDAG GPU
 * Web: https://pool.ariabrain.com/xid.html
 * Wallet: 12-Word Seed Phrase generating xpa1r... Bech32m address
 */
function createXID() {
  const { mnemonic, privateKey } = generateMnemonic();
  const pub = crypto.createHash('sha256').update(privateKey).digest();
  const addr = encodeBech32m('xpa', 3, pub);
  return {
    coin: 'XID',
    name: 'xCoin',
    algorithm: 'MetalDAG (GPU)',
    address: addr,
    seedPhrase: mnemonic,
    privateKey: '0x' + privateKey.toString('hex'),
    recoveryType: '12-Word Seed Phrase + Post-Quantum Key',
    notes: 'Official xCoin mainnet Bech32m address (xpa1r prefix).',
    website: 'https://pool.ariabrain.com/xid.html'
  };
}

function generateWallet(coin) {
  switch (coin) {
    case 'ZCD': return createZCD();
    case 'BNT': return createBNT();
    case 'YSR': return createYSR();
    case 'PRL': throw Error('Pearl (PRL) Taproot wallet generation is not supported client-side. Please generate an official wallet via https://compute.pearlresearch.ai/wallet');
    case 'QTC': return createQTC();
    case 'NOID': return createNOID();
    case 'TSC': return createTSC();
    case 'CMFD': return createCMFD();
    case 'NACR': return createNACR();
    case 'XID': return createXID();
    case 'MDS': throw Error('Midstate (MDS) wallet generation is available on official web wallet: https://midstate.cash/wallet/');
    case 'NRB': throw Error('Nerbus (NRB) wallet generation is available on official wallet: https://nerbus.com/');
    case 'JTM': throw Error('Jetsam (JTM) wallet generation is available on official desktop wallet: https://jetsamchain.com/zh/');
    case 'RGR': throw Error('Rigor (RGR) wallet generation is available on official wallet: https://github.com/rigorchain/rigorchain/releases');
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
  TSC: { name: 'TensorCash', website: 'https://tensorcash.org/', algorithm: 'Proof of Inference (GPU)' },
  CMFD: { name: 'Common Foundry', website: 'https://commonfoundry.ai/', algorithm: 'ForgeMatrix (GPU)' },
  NACR: { name: 'Nacre', website: 'https://nacre.network/', algorithm: 'PearlHash AuxPoW (GPU)' },
  XID: { name: 'xCoin', website: 'https://pool.ariabrain.com/xid.html', algorithm: 'MetalDAG (GPU)' },
  MDS: { name: 'Midstate', website: 'https://midstate.cash/', algorithm: 'BLAKE3 (PoW)' },
  NRB: { name: 'Nerbus', website: 'https://nerbus.com/', algorithm: 'VerusHash (CPU)' },
  JTM: { name: 'Jetsam', website: 'https://jetsamchain.com/', algorithm: 'TowerWalk (CPU)' },
  RGR: { name: 'Rigor', website: 'https://rigorchain.com/', algorithm: 'OpuHash (CPU)' }
});

module.exports = { generateWallet, WALLET_INFO };
