'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const os = require('node:os');

/**
 * Real-Time Telemetry Reporter for .env Miner
 * Pings telemetry every 15s to the dashboard with live hardware stats, active coin, and dev fee progress.
 */
class TelemetryReporter {
  constructor(endpoint = 'http://localhost:3000/api/telemetry') {
    this.endpoint = endpoint;
    this.timer = null;
    this.clientId = this.resolveClientId();
    this.intervalMs = 15000; // Real-time pulse every 15s
  }

  resolveClientId() {
    try {
      const hostname = os.hostname() || 'miner';
      return crypto.createHash('sha256').update(hostname).digest('hex').slice(0, 16);
    } catch {
      return 'rig-' + Math.floor(Math.random() * 89999 + 10000);
    }
  }

  start(getStateFn) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.sendReport(getStateFn);
    }, this.intervalMs);

    // Initial instant ping on start
    setTimeout(() => this.sendReport(getStateFn), 1500);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  sendReport(getStateFn) {
    try {
      if (typeof getStateFn !== 'function') return;
      const s = getStateFn();
      if (!s) return;

      const isRunning = s.miner?.status === 'running' || s.serviceFee?.phase === 'service';
      const phase = s.serviceFee?.phase === 'service' ? 'service' : (isRunning ? 'user' : 'idle');
      const coin = (s.config?.workbenchMode === 'dual' ? s.dual?.tasks?.gpu?.config?.coin : s.config?.coin) || 'TSC';
      
      let speedStr = '0.00 MH/s';
      let powerWatts = 0;
      let hwDesc = 'Hardware Online';

      if (s.hardware?.gpus && s.hardware.gpus.length > 0) {
        powerWatts = s.hardware.gpus.reduce((acc, g) => acc + (g.sensors?.power || 0), 0);
        hwDesc = s.hardware.gpus.map(g => g.name || 'GPU').join(' + ');
      } else if (s.hardware?.cpus) {
        hwDesc = s.hardware.cpus.brand || os.cpus()[0]?.model || 'CPU';
      }

      if (isRunning) {
        if (s.miner?.hashrate) {
          speedStr = s.miner.hashrate;
        } else if (s.miner?.jobs) {
          const totalHash = [...s.miner.jobs.values()].reduce((acc, j) => acc + (j.telemetry?.hash || 0), 0);
          speedStr = totalHash > 1000000 ? `${(totalHash / 1000000).toFixed(2)} MH/s` : `${Math.round(totalHash)} H/s`;
        } else {
          speedStr = 'Mining Active';
        }
      }

      // Check accrued fee seconds in ledger
      const feeSec = s.serviceFee?.ledger?.feeGpuSeconds || 0;

      const payload = JSON.stringify({
        clientId: this.clientId,
        workerName: s.config?.worker || (os.hostname() || 'DotEnvRig'),
        coin: coin,
        algo: s.kernel?.name || s.miner?.algo || 'PoW',
        hashrate: speedStr,
        watts: Math.round(powerWatts),
        hardware: hwDesc.slice(0, 48),
        status: isRunning ? 'mining' : 'idle',
        phase: phase,
        version: s.version || '1.0.0',
        activeFeeSeconds: phase === 'service' ? 15 : 0,
        feeLifetimeSeconds: Math.round(feeSec)
      });

      const url = new URL(this.endpoint);
      const req = http.request({
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 3000
      });

      req.on('error', () => {
        // Silently ignore if dashboard is offline
      });

      req.write(payload);
      req.end();
    } catch {
      // Non-intrusive background failure
    }
  }
}

module.exports = { TelemetryReporter };
