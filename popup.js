(() => {
  'use strict';
  let ready;
  window.MarginPopupReady = new Promise(resolve => {ready = resolve;});
  function mount() {
    const { el, storage, GAMES } = window.Margin;
    const status = document.getElementById('status');
    const revisions = new Map(), committed = new Map();
    let writes = Promise.resolve();

    function setEnabled(id, game, input) {
      const enabled = input.checked;
      const revision = (revisions.get(id) || 0) + 1;
      revisions.set(id, revision);
      let previous = committed.get(id);
      // Read and merge inside the queue so rapid changes preserve other game toggles.
      writes = writes.then(async () => {
        previous = committed.get(id);
        const latest = await storage.get('settings') || {};
        const disabled = new Set(latest.disabled || []);
        previous = !disabled.has(id);
        if (enabled) disabled.delete(id); else disabled.add(id);
        await storage.set('settings', { ...latest, disabled: [...disabled] });
        committed.set(id, enabled);
        if (revisions.get(id) === revision) status.textContent = `${game.name} tools ${enabled ? 'enabled' : 'disabled'}.`;
      }).catch(() => {
        if (revisions.get(id) !== revision) return;
        input.checked = previous;
        status.textContent = `Could not save the ${game.name} setting. Please try again.`;
      });
    }

    async function start() {
      const settings = await storage.get('settings') || {};
      for (const [id, game] of Object.entries(GAMES)) {
        const initial = !settings.disabled?.includes(id);
        committed.set(id, initial);
        const enabled = el('input', { type: 'checkbox', checked: initial, 'aria-label': `Enable ${game.name} tools`,
          onChange: event => setEnabled(id, game, event.target) });
        document.getElementById('games').append(el('div', { className: 'game', 'data-game': id },
          el('img', { className: 'game-icon', src: game.icon, alt: '', width: 32, height: 32, 'aria-hidden': 'true' }),
          el('span', { className: 'game-name', textContent: game.name }),
          el('label', { className: 'toggle' }, enabled, el('span', { 'aria-hidden': 'true' }))));
      }
    }
    start().catch(() => { status.textContent = 'Could not load settings. Close and reopen NYT Games Swiss Knife.'; }).finally(ready);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
