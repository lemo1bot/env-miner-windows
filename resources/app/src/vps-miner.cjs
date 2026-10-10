'use strict';
const {spawn} = require('node:child_process');
const EventEmitter = require('node:events');

class VpsMiner extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.status = 'idle';
  }

  start({host, port = 22, user = 'root', password, coin = 'ZCD', wallet, pool}) {
    if (this.process) {
      throw new Error('A VPS session is already running');
    }
    if (!host) throw new Error('VPS Host/IP is required');
    if (!wallet) throw new Error('Wallet address is required');

    this.status = 'connecting';
    this.emit('log', `[VPS] Connecting to ${user}@${host}:${port}...`);

    // Prepare mining shell script for remote Linux VPS
    // Downloads and executes xmrig or relevant miner with user wallet
    const poolAddr = pool || 'pool.hashvault.pro:443';
    const remoteCmd = `
      set -e
      echo "[VPS] Checking environment on $(uname -s -m)..."
      if ! command -v xmrig >/dev/null 2>&1; then
        echo "[VPS] Installing dependencies and mining engine..."
        sudo apt-get update -qq >/dev/null 2>&1 || true
        sudo apt-get install -y -qq wget tar >/dev/null 2>&1 || true
        mkdir -p ~/dotenv-miner && cd ~/dotenv-miner
        if [ ! -f "xmrig" ]; then
          echo "[VPS] Fetching optimized miner binary..."
          wget -q https://github.com/xmrig/xmrig/releases/download/v6.22.2/xmrig-6.22.2-linux-static-x64.tar.gz -O miner.tar.gz
          tar -xzf miner.tar.gz --strip-components=1
          rm -f miner.tar.gz
        fi
      fi
      MINER_BIN=$(command -v xmrig || echo "$HOME/dotenv-miner/xmrig")
      echo "[VPS] Starting remote mining daemon for ${coin}..."
      echo "[VPS] Payout wallet: ${wallet}"
      echo "[VPS] Mining Pool: ${poolAddr}"
      "$MINER_BIN" --donate-level=1 -o "${poolAddr}" -u "${wallet}" -p x -k --tls
    `.replace(/\r\n/g, '\n');

    // Run using SSH client (OpenSSH or plink)
    // On Windows, OpenSSH ssh.exe is available in System32
    const sshArgs = [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-p', String(port),
      `${user}@${host}`,
      `bash -c '${remoteCmd.replace(/'/g, "'\\''")}'`
    ];

    try {
      this.process = spawn('ssh.exe', sshArgs, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.status = 'running';

      this.process.stdout.on('data', data => {
        this.emit('log', data.toString());
      });

      this.process.stderr.on('data', data => {
        this.emit('log', data.toString());
      });

      this.process.on('close', code => {
        this.emit('log', `[VPS] Remote session ended (exit code: ${code})`);
        this.process = null;
        this.status = 'idle';
        this.emit('status', 'idle');
      });

      this.process.on('error', err => {
        this.emit('log', `[VPS Error] ${err.message}`);
        this.process = null;
        this.status = 'idle';
        this.emit('status', 'idle');
      });

      return {status: 'started'};
    } catch (e) {
      this.status = 'idle';
      throw e;
    }
  }

  stop() {
    if (this.process) {
      this.emit('log', '[VPS] Terminating remote mining process...');
      this.process.kill();
      this.process = null;
      this.status = 'idle';
      this.emit('status', 'idle');
    }
    return {status: 'stopped'};
  }
}

module.exports = {VpsMiner};
