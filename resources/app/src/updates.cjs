'use strict';
const fs = require('node:fs/promises'), path = require('node:path');

const REPO = 'lemo1bot/env-miner-windows';
const GITHUB_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const RAW_VERSION_URL = `https://raw.githubusercontent.com/${REPO}/main/version.json`;

function compare(a, b) {
  if (!a || !b) return 0;
  const parse = v => String(v).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const x = parse(a), y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length, 3); i++) {
    const xi = x[i] || 0, yi = y[i] || 0;
    if (xi !== yi) return xi > yi ? 1 : -1;
  }
  return 0;
}

class Updates {
  constructor(dir, request, currentVersion, changed) {
    this.file = path.join(dir, 'update-state.json');
    this.request = request;
    this.version = currentVersion || '1.0.0';
    this.changed = changed;
    this.result = null;
    this.error = null;
    this.pending = null;
    this.at = null;
  }

  async load() {
    try {
      const d = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (d && d.lastChecked) this.at = d.lastChecked;
      if (d && d.result) this.result = d.result;
    } catch {}
  }

  async check() {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      try {
        let releaseInfo = null;
        // 1. Check GitHub API
        try {
          const body = await this.request(GITHUB_RELEASE_API, {
            timeout: 10000,
            headers: { 'Accept': 'application/vnd.github.v3+json' }
          });
          const gh = JSON.parse(body.toString('utf8'));
          if (gh && gh.tag_name) {
            const asset = (gh.assets || []).find(a => a.name.endsWith('.zip')) || {};
            releaseInfo = {
              version: gh.tag_name.replace(/^v/i, ''),
              displayVersion: gh.tag_name,
              name: gh.name || gh.tag_name,
              notes: (gh.body || 'New release available on GitHub').split('\n').filter(Boolean).slice(0, 5),
              url: asset.browser_download_url || gh.html_url || `https://github.com/${REPO}/releases/latest`,
              publishedAt: gh.published_at ? Date.parse(gh.published_at) : Date.now()
            };
          }
        } catch (apiErr) {
          // 2. Fallback to raw version manifest
          try {
            const rawBody = await this.request(RAW_VERSION_URL, { timeout: 8000 });
            const raw = JSON.parse(rawBody.toString('utf8'));
            if (raw && raw.version) {
              releaseInfo = {
                version: raw.version,
                displayVersion: raw.displayVersion || ('v' + raw.version),
                notes: Array.isArray(raw.notes) ? raw.notes : [raw.notes || 'Update available'],
                url: raw.downloadUrl || `https://github.com/${REPO}/releases/latest`,
                publishedAt: raw.publishedAt || Date.now()
              };
            }
          } catch {}
        }

        if (!releaseInfo) throw new Error('No release information available from GitHub');

        this.result = releaseInfo;
        this.error = null;
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        await fs.writeFile(this.file, JSON.stringify({ lastChecked: Date.now(), result: this.result }, null, 2), 'utf8');
      } catch (e) {
        this.error = e.message;
      } finally {
        this.at = Date.now();
        this.pending = null;
        this.changed?.();
      }
      return this.snapshot();
    })();
    return this.pending;
  }

  snapshot() {
    const isAvail = !!this.result && compare(this.result.version, this.version) > 0;
    return {
      at: this.at,
      error: this.error,
      checking: !!this.pending,
      available: isAvail,
      release: this.result
    };
  }

  downloadUrl() {
    if (!this.result?.url) throw new Error('No download URL available');
    return this.result.url;
  }
}

module.exports = { Updates, compare };
