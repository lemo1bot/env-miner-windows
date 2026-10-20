'use strict';
const {spawn} = require('node:child_process');
const EventEmitter = require('node:events');

class VpsMiner extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.status = 'idle';
  }

  start({host, port = 22, user = 'root', password, coin = 'ZCD', wallet, pool, worker = 'DotEnvRig'}) {
    if (this.process) {
      throw new Error('A VPS session is already running');
    }
    if (!host) throw new Error('VPS Host/IP is required');
    if (!wallet && coin !== 'XID') throw new Error('Wallet address is required');

    this.status = 'connecting';
    this.emit('log', `[VPS] Connecting to ${user}@${host}:${port}...`);

    let remoteCmd = '';
    const poolAddr = pool || (
      coin === 'CMFD' ? 'cmfd+tls://159.69.194.46:29445?pin=9dfb51083f287726117f689f87bc7a878792efcca58ca8b6f6e7c05ac5d152e9' :
      coin === 'XID' ? 'xid.ariabrain.com:3344' :
      coin === 'NACR' ? 'stratum.nacrepool.com:5566' :
      coin === 'QTC' ? 'quantus.qelvhash.com:4444' :
      coin === 'PRL' ? 'de.pearl.herominers.com:1200' :
      coin === 'ZCD' ? 'pool.zcd.lol:9425' :
      coin === 'BNT' ? 'bntpool.com:3333' :
      'pool.hashvault.pro:443'
    );

    if (coin === 'CMFD') {
      remoteCmd = `
        set -e
        echo "[VPS] Preparing CMFD environment on $(uname -s -m)..."
        mkdir -p ~/cmfd-miner && cd ~/cmfd-miner
        if [ ! -f "aria-energy-cmfd" ]; then
          echo "[VPS] Downloading Aria Energy CMFD miner v1.0.2..."
          wget -q https://pub-4bc92882522745e291a08f11119e3205.r2.dev/cmfd-dl/aria-energy-cmfd-v1.0.2-linux-x86_64.tar.gz -O cmfd.tar.gz
          tar -xzf cmfd.tar.gz --strip-components=1
          chmod +x aria-energy-cmfd || true
          rm -f cmfd.tar.gz
        fi
        echo "[VPS] Starting CMFD ForgeMatrix miner..."
        ./aria-energy-cmfd --pool "${poolAddr}" --address "${wallet}" --worker "${worker}"
      `;
    } else if (coin === 'XID') {
      remoteCmd = `
        set -e
        echo "[VPS] Preparing XID environment on $(uname -s -m)..."
        mkdir -p ~/xid-miner && cd ~/xid-miner
        if [ ! -f "aria-energy-xid" ]; then
          echo "[VPS] Downloading Aria Energy XID MetalDAG miner..."
          wget -q https://dl.ariabrain.com/xid-dl/aria-energy-xid-v1.0.0-linux-x86_64.tar.gz -O xid.tar.gz
          tar -xzf xid.tar.gz --strip-components=1
          chmod +x aria-energy-xid || true
          rm -f xid.tar.gz
        fi
        echo "[VPS] Starting xCoin (XID) MetalDAG miner..."
        ./aria-energy-xid -o "${poolAddr}" -u "${wallet || 'xpa1r_community'}" --worker "${worker}"
      `;
    } else if (coin === 'NACR') {
      remoteCmd = `
        set -e
        echo "[VPS] Preparing Nacre environment on $(uname -s -m)..."
        mkdir -p ~/nacre-miner && cd ~/nacre-miner
        if [ ! -f "alpha-miner" ]; then
          echo "[VPS] Downloading Alpha-Miner for Nacre..."
          wget -q https://github.com/AlphaMine-Tech/alpha-miner/releases/download/v1.9.9/alpha-miner-v1.9.9-linux-x86_64.tar.gz -O miner.tar.gz || true
          tar -xzf miner.tar.gz --strip-components=1 2>/dev/null || true
          chmod +x alpha-miner || true
          rm -f miner.tar.gz
        fi
        echo "[VPS] Starting Nacre merge miner..."
        ./alpha-miner --pool "${poolAddr}" --address "${wallet}" --worker "${worker}" || true
      `;
    } else {
      remoteCmd = `
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
      `;
    }

    remoteCmd = remoteCmd.replace(/\r\n/g, '\n');

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
      return {status: 'stopped'};
    }
    return {status: 'already_idle'};
  }
}

module.exports = {VpsMiner};
