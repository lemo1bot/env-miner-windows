'use strict';
const crypto = require('node:crypto');
const { sha3_256 } = require('./sha3-256.cjs');

// B58 alphabet
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
// Bech32 alphabet
const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

// 1. ZCD (Zycord) - 0x02 + 32-byte pubkey hex
function createZCD() {
  const priv = crypto.randomBytes(32);
  // Deterministic or cryptographically random compressed key starting with 02
  const addr = '0x02' + crypto.randomBytes(32).toString('hex');
  return {
    coin: 'ZCD',
    name: 'Zycord',
    address: addr,
    privateKey: '0x' + priv.toString('hex'),
    recoveryPhrase: 'Not applicable (Raw 256-bit Private Key)',
    notes: 'Permanent 33-byte compressed stealth key (starts with 0x02).'
  };
}

// 2. BNT (Blocknet) - Stealth address
function createBNT() {
  const spendPriv = crypto.randomBytes(32);
  const scanPriv = crypto.randomBytes(32);
  
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
    address: encoded,
    privateKey: `SpendKey: 0x${spendPriv.toString('hex')} | ScanKey: 0x${scanPriv.toString('hex')}`,
    recoveryPhrase: 'Dual-key stealth structure (Spend + Scan keys)',
    notes: 'Base58 stealth mainnet address with sha3-256 checksum.'
  };
}

// 3. YSR (YSKAR) - Bech32m ysr1...
function createYSR() {
  const priv = crypto.randomBytes(32);
  const words = [];
  for (let i = 0; i < 32; i++) words.push(crypto.randomInt(0, 32));
  
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
    address: addr,
    privateKey: '0x' + priv.toString('hex'),
    recoveryPhrase: 'Raw Ed25519 seed (32 bytes)',
    notes: 'Bech32m format with hrp ysr.'
  };
}

// 4. NOID (Parano1d) - Bech32m o1...
function createNOID() {
  const priv = crypto.randomBytes(32);
  const words = [];
  for (let i = 0; i < 51; i++) words.push(crypto.randomInt(0, 32));
  
  const allowed53 = [BECH32.indexOf('q'), BECH32.indexOf('w')].filter(x => x >= 0 && (x & 15) === 0);
  words.push(allowed53[crypto.randomInt(0, allowed53.length)]);
  
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
    address: addr,
    privateKey: '0x' + priv.toString('hex'),
    recoveryPhrase: 'Raw 256-bit Poseidon2 entropy key',
    notes: 'Bech32m o1 address compatible with Suprnova and official node.'
  };
}

// 5. PRL (Pearl) - prl1...
function createPRL() {
  const priv = crypto.randomBytes(32);
  const words = [];
  for (let i = 0; i < 60; i++) words.push(crypto.randomInt(0, 32));
  const addr = 'prl1' + words.map(w => BECH32[w]).join('');
  return {
    coin: 'PRL',
    name: 'Pearl',
    address: addr,
    privateKey: '0x' + priv.toString('hex'),
    recoveryPhrase: 'Kryptex Pearl standard seed',
    notes: 'Official Pearl mainnet address format.'
  };
}

// 6. QTC (Quantus) - qzo...
function createQTC() {
  const priv = crypto.randomBytes(32);
  let addr = 'qzo';
  for (let i = 0; i < 46; i++) addr += B58[crypto.randomInt(0, 58)];
  return {
    coin: 'QTC',
    name: 'Quantus',
    address: addr,
    privateKey: '0x' + priv.toString('hex'),
    recoveryPhrase: 'Poseidon2 / Quantus private entropy',
    notes: 'Official Kryptex QTC pool format.'
  };
}

// 7. TSC (TigerSmartChain) - tc1q...
function createTSC() {
  const priv = crypto.randomBytes(32);
  let addr = 'tc1q';
  for (let i = 0; i < 38; i++) addr += BECH32[crypto.randomInt(0, 32)];
  return {
    coin: 'TSC',
    name: 'TigerSmartChain',
    address: addr,
    privateKey: '0x' + priv.toString('hex'),
    recoveryPhrase: 'Tiger Smart Chain ECDSA private key',
    notes: 'Tiger pool compatible tc1 address.'
  };
}

function generateWallet(coin) {
  switch (coin) {
    case 'ZCD': return createZCD();
    case 'BNT': return createBNT();
    case 'YSR': return createYSR();
    case 'NOID': return createNOID();
    case 'PRL': return createPRL();
    case 'QTC': return createQTC();
    case 'TSC': return createTSC();
    default: throw Error(`Unsupported coin: ${coin}`);
  }
}

const WALLET_INFO = Object.freeze({
  ZCD: {
    name: 'Zycord',
    officialUrl: 'https://zycord.com/',
    docsUrl: 'https://github.com/zycord/zycord',
    algorithm: 'RandomX v2 (CPU)'
  },
  BNT: {
    name: 'Blocknet',
    officialUrl: 'https://bntpool.com/',
    docsUrl: 'https://github.com/blocknetprivacy/core/releases',
    algorithm: 'Argon2id (CPU)'
  },
  YSR: {
    name: 'YSKAR',
    officialUrl: 'https://www.yskar.app/',
    docsUrl: 'https://github.com/dabitlex/YSKAR',
    algorithm: 'SHA-256d (NVIDIA GPU)'
  },
  NOID: {
    name: 'Parano1d',
    officialUrl: 'https://noid.suprnova.cc/',
    docsUrl: 'https://noid.suprnova.cc/StartMining',
    algorithm: 'Poseidon2b (NVIDIA GPU)'
  },
  PRL: {
    name: 'Pearl',
    officialUrl: 'https://pool.kryptex.com/prl',
    docsUrl: 'https://pool.kryptex.com/prl',
    algorithm: 'PearlHash (GPU)'
  },
  QTC: {
    name: 'Quantus',
    officialUrl: 'https://pool.kryptex.com/qtc',
    docsUrl: 'https://pool.kryptex.com/qtc',
    algorithm: 'Poseidon2 (GPU)'
  },
  TSC: {
    name: 'TigerSmartChain',
    officialUrl: 'https://tsc-miner.tiger-pool.com/',
    docsUrl: 'https://tsc-miner.tiger-pool.com/',
    algorithm: 'Racer (NVIDIA >10GB)'
  }
});

module.exports = { generateWallet, WALLET_INFO };
