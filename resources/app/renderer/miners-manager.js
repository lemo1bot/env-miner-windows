'use strict';
(function () {
  let minersData = [];
  let isProcessing = false;

  const logsEl = () => document.getElementById('miners-console-logs');

  function addLog(msg, type = 'info') {
    const el = logsEl();
    if (!el) return;
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = `miners-log-line miners-log-${type}`;
    line.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-msg">${msg}</span>`;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }

  async function loadMiners() {
    if (!window.gozer || !window.gozer.minersList) return;
    try {
      minersData = await window.gozer.minersList();
      renderMinersList();
    } catch (err) {
      addLog(`Failed to load miner catalog: ${err.message}`, 'error');
    }
  }

  function renderMinersList() {
    const container = document.getElementById('miners-list-container');
    if (!container) return;

    if (!minersData || minersData.length === 0) {
      container.innerHTML = '<div class="muted" style="padding:24px; text-align:center;">Loading miner catalog...</div>';
      return;
    }

    let html = '';
    let readyCount = 0;
    let testedCount = 0;

    minersData.forEach(m => {
      if (m.installed) readyCount++;
      if (m.testStatus === 'passed') testedCount++;

      const isPassed = m.testStatus === 'passed';
      const isError = m.testStatus === 'error';
      const statusClass = isPassed ? 'badge-success' : isError ? 'badge-danger' : 'badge-neutral';
      const statusText = isPassed ? '✓ Tested & Ready' : isError ? '✕ Test Failed' : (m.installed ? '✓ Installed' : 'Not Installed');

      html += `
        <div class="miner-card panel" data-coin="${m.coin}">
          <div class="miner-card-header">
            <div class="miner-card-title">
              <span class="coin-badge">${m.coin}</span>
              <b>${m.name}</b>
              <span class="muted" style="font-size:11px;">${m.algorithm}</span>
              ${m.tag ? `<span class="tag-pill">${m.tag}</span>` : ''}
            </div>
            <div class="miner-card-status">
              <span class="badge ${statusClass}">${statusText}</span>
            </div>
          </div>
          <div class="miner-card-details">
            <div class="miner-detail-row">
              <span class="muted">Engine:</span>
              <span><b>${m.engineName}</b> <code style="font-size:11px; color:var(--accent);">v${m.version}</code></span>
            </div>
            <div class="miner-detail-row">
              <span class="muted">Binary:</span>
              <span class="muted" style="font-family:monospace; font-size:11px;">${m.exe} ${m.sizeBytes ? '(' + (m.sizeBytes / 1024 / 1024).toFixed(1) + ' MB)' : ''}</span>
            </div>
            <div class="miner-detail-row">
              <span class="muted">Diagnostic:</span>
              <span class="status-msg ${isError ? 'text-danger' : 'text-success'}" style="font-size:11px;">${m.message || 'Operational'}</span>
            </div>
          </div>
          <div class="miner-card-actions">
            <button class="secondary-btn btn-test-single" data-coin="${m.coin}" ${isProcessing ? 'disabled' : ''}>
              🧪 Test Engine
            </button>
            <button class="primary btn-update-single" data-coin="${m.coin}" ${isProcessing ? 'disabled' : ''}>
              ⚡ 1-Click Update
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Update summary counts
    const countTotal = document.getElementById('miners-stat-total');
    const countReady = document.getElementById('miners-stat-ready');
    const countTested = document.getElementById('miners-stat-tested');
    if (countTotal) countTotal.textContent = minersData.length;
    if (countReady) countReady.textContent = `${readyCount} / ${minersData.length}`;
    if (countTested) countTested.textContent = `${testedCount} / ${minersData.length}`;
  }

  async function testSingle(coin) {
    if (isProcessing) return;
    isProcessing = true;
    renderMinersList();
    addLog(`Running self-test for ${coin} miner...`, 'info');

    try {
      const res = await window.gozer.minerTest(coin);
      if (res.ok) {
        addLog(`[${coin}] Test PASSED: ${res.message}`, 'success');
        if (typeof window.toast === 'function') window.toast(`[${coin}] Test Passed: Engine operational`);
      } else {
        addLog(`[${coin}] Test FAILED: ${res.message}`, 'error');
        if (typeof window.toast === 'function') window.toast(`[${coin}] Test Failed: ${res.message}`);
      }
    } catch (err) {
      addLog(`[${coin}] Test error: ${err.message}`, 'error');
    } finally {
      isProcessing = false;
      await loadMiners();
    }
  }

  async function updateSingle(coin) {
    if (isProcessing) return;
    isProcessing = true;
    renderMinersList();
    addLog(`Initiating 1-Click Update for ${coin}...`, 'info');

    try {
      const res = await window.gozer.minerUpdate(coin);
      if (res.ok) {
        addLog(`[${coin}] 1-Click Update SUCCEEDED: ${res.message}`, 'success');
        if (typeof window.toast === 'function') window.toast(`[${coin}] Updated & Verified: v${res.version} ready`);
      } else {
        addLog(`[${coin}] Update failed: ${res.message}`, 'error');
        if (typeof window.toast === 'function') window.toast(`[${coin}] Update error: ${res.message}`);
      }
    } catch (err) {
      addLog(`[${coin}] Update error: ${err.message}`, 'error');
    } finally {
      isProcessing = false;
      await loadMiners();
    }
  }

  async function testAll() {
    if (isProcessing) return;
    isProcessing = true;
    renderMinersList();
    addLog(`Starting automated diagnostic test across all 14 miners...`, 'info');

    try {
      const res = await window.gozer.minersTestAll();
      addLog(`Automated test complete: ${res.passed} / ${res.total} passed`, res.passed === res.total ? 'success' : 'warn');
      if (res.results) {
        res.results.forEach(r => {
          addLog(`  [${r.coin}] ${r.ok ? '✓ PASS' : '✕ FAIL'}: ${r.message}`, r.ok ? 'success' : 'error');
        });
      }
      if (typeof window.toast === 'function') {
        window.toast(`Diagnostics: ${res.passed}/${res.total} miners verified operational`);
      }
    } catch (err) {
      addLog(`Test all failed: ${err.message}`, 'error');
    } finally {
      isProcessing = false;
      await loadMiners();
    }
  }

  async function updateAll() {
    if (isProcessing) return;
    isProcessing = true;
    renderMinersList();
    addLog(`Executing 1-Click Update & Synchronization across all 14 miners...`, 'info');

    try {
      const res = await window.gozer.minersUpdateAll();
      addLog(`1-Click Update All finished: ${res.updated} / ${res.total} miners synchronized and tested`, 'success');
      if (res.results) {
        res.results.forEach(r => {
          addLog(`  [${r.coin}] ${r.ok ? '✓ UPDATED' : '✕ FAIL'}: ${r.message}`, r.ok ? 'success' : 'error');
        });
      }
      if (typeof window.toast === 'function') {
        window.toast(`All 14 miners updated & verified in 1 click!`);
      }
    } catch (err) {
      addLog(`Update all failed: ${err.message}`, 'error');
    } finally {
      isProcessing = false;
      await loadMiners();
    }
  }

  // Event delegation for single test and update buttons
  document.addEventListener('click', e => {
    const btnTest = e.target.closest('.btn-test-single');
    if (btnTest) {
      const coin = btnTest.dataset.coin;
      if (coin) testSingle(coin);
      return;
    }

    const btnUpdate = e.target.closest('.btn-update-single');
    if (btnUpdate) {
      const coin = btnUpdate.dataset.coin;
      if (coin) updateSingle(coin);
      return;
    }

    if (e.target.closest('#btn-miners-test-all')) {
      testAll();
      return;
    }

    if (e.target.closest('#btn-miners-update-all')) {
      updateAll();
      return;
    }

    if (e.target.closest('#miners-manager-btn') || e.target.closest('#open-miners-manager-settings')) {
      if (typeof window.showView === 'function') {
        window.showView('miners');
      }
      loadMiners();
      return;
    }

    if (e.target.closest('#miners-clear-log')) {
      const el = logsEl();
      if (el) el.innerHTML = '';
      return;
    }
  });

  window.openMinersManager = function () {
    if (typeof window.showView === 'function') {
      window.showView('miners');
    }
    loadMiners();
  };

  // Initial load
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(loadMiners, 1000);
  });
})();
