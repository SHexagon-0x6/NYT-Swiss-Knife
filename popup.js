(() => {
  'use strict';
  let ready;
  window.MarginPopupReady = new Promise(resolve => {ready = resolve;});
  const SVG = 'http://www.w3.org/2000/svg';
  function linkIcon() {
    const icon = document.createElementNS(SVG, 'svg');
    icon.setAttribute('viewBox', '0 0 16 16');icon.setAttribute('aria-hidden', 'true');icon.classList.add('link-icon');
    for (const d of ['M9.5 2.5h4v4', 'M13.5 2.5 7.5 8.5', 'M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3']) {
      const path = document.createElementNS(SVG, 'path');path.setAttribute('d', d);icon.append(path);
    }
    return icon;
  }
  function wait(ms) {
    const minutes = Math.max(1, Math.ceil(ms / 60000)), hours = Math.floor(minutes / 60);
    return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
  }
  function mount() {
    const { el, storage, GAMES, latestPuzzleDate, nextRelease } = window.Margin;
    const status = document.getElementById('status');
    const list = document.getElementById('games'), archive = document.getElementById('archive');
    const archived = document.getElementById('archived'), archiveCount = document.getElementById('archive-count');
    const empty = document.getElementById('games-empty'), archiveToggle = document.getElementById('archive-toggle');
    // Archived games stay out of sight behind a small footer link.
    archiveToggle.addEventListener('click', () => {
      archive.hidden = !archive.hidden;
      archiveToggle.setAttribute('aria-expanded', String(!archive.hidden));
    });
    const revisions = new Map(), committed = new Map(), rows = new Map();
    let writes = Promise.resolve(), daily = {};

    function place(id) {
      const row = rows.get(id);
      const enabled = row.input.checked;
      row.node.classList.toggle('archived', !enabled);
      row.status.hidden = !enabled;
      // Keep the original game order inside both lists.
      const target = enabled ? list : archived;
      const after = [...target.children].find(node => Object.keys(GAMES).indexOf(node.dataset.game) > Object.keys(GAMES).indexOf(id));
      if (row.node.parentNode !== target || row.node.nextSibling !== (after || null)) target.insertBefore(row.node, after || null);
      const count = archived.children.length;
      archiveToggle.hidden = !count;archiveCount.textContent = String(count);
      if (!count) { archive.hidden = true;archiveToggle.setAttribute('aria-expanded', 'false'); }
      empty.hidden = list.children.length > 0;
    }
    function paintStatus() {
      const now = new Date();
      for (const [id, row] of rows) {
        const done = typeof daily[id] === 'string' && daily[id] >= latestPuzzleDate(id, now);
        row.status.className = `game-status ${done ? 'done' : 'new'}`;
        row.status.textContent = done ? `Done · next in ${wait(nextRelease(id, now) - now)}` : 'New puzzle ready';
        row.status.title = done ? 'You finished the latest puzzle in this browser.' : 'You have not finished the latest puzzle in this browser.';
      }
    }
    function announce(game, enabled, id) {
      status.replaceChildren(`${game.name} ${enabled ? 'restored' : 'moved to Archive'}.`);
      if (!enabled) status.append(' ', el('button', {type: 'button', className: 'status-undo', textContent: 'Undo', onClick: () => {
        const input = rows.get(id).input;input.checked = true;input.dispatchEvent(new Event('change', {bubbles: true}));
      }}));
    }

    function setEnabled(id, game, input) {
      const enabled = input.checked;
      const revision = (revisions.get(id) || 0) + 1;
      revisions.set(id, revision);
      let previous = committed.get(id);
      place(id);
      // Read and merge inside the queue so rapid changes preserve other game toggles.
      writes = writes.then(async () => {
        previous = committed.get(id);
        const latest = await storage.get('settings') || {};
        const disabled = new Set(latest.disabled || []);
        previous = !disabled.has(id);
        if (enabled) disabled.delete(id); else disabled.add(id);
        await storage.set('settings', { ...latest, disabled: [...disabled] });
        committed.set(id, enabled);
        if (revisions.get(id) === revision) announce(game, enabled, id);
      }).catch(() => {
        if (revisions.get(id) !== revision) return;
        input.checked = previous;place(id);
        status.textContent = `Could not save the ${game.name} setting. Please try again.`;
      });
    }

    async function start() {
      const ids = Object.keys(GAMES);
      const [settings, ...dates] = await Promise.all([storage.get('settings'), ...ids.map(id => storage.get(`daily:${id}`))]);
      daily = Object.fromEntries(ids.map((id, i) => [id, dates[i]]));
      for (const [id, game] of Object.entries(GAMES)) {
        const initial = !settings?.disabled?.includes(id);
        committed.set(id, initial);
        const input = el('input', { type: 'checkbox', checked: initial, 'aria-label': `Enable ${game.name} tools`,
          onChange: event => setEnabled(id, game, event.target) });
        const toggle = el('label', { className: 'toggle' }, input, el('span', { 'aria-hidden': 'true' }));
        const statusNode = el('span', { className: 'game-status' });
        const link = el('a', { className: 'game-link', href: game.url, target: '_blank', rel: 'noopener', title: `Play ${game.name}` },
          el('span', { className: 'game-name', textContent: game.name }), linkIcon());
        const node = el('div', { className: 'game', 'data-game': id },
          el('img', { className: 'game-icon', src: game.icon, alt: '', width: 32, height: 32, 'aria-hidden': 'true' }),
          el('div', { className: 'game-text' }, link, statusNode), toggle);
        rows.set(id, {node, input, status: statusNode});
        place(id);
      }
      paintStatus();
      setInterval(paintStatus, 30000);
      if (window.Margin.extension) chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        let changed = false;
        for (const id of Object.keys(GAMES)) if (changes[`daily:${id}`]) { daily[id] = changes[`daily:${id}`].newValue; changed = true; }
        if (changed) paintStatus();
      });
    }
    start().catch(() => { status.textContent = 'Could not load settings. Close and reopen NYT Games Swiss Knife.'; }).finally(ready);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
