(async () => {
  'use strict';
  const { el } = Margin, fixture = document.querySelector('#fixture'), panel = document.querySelector('#margin-host').attachShadow({ mode: 'open' });
  const results = [], wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let adapter, board, cells, selected, writes, releases, submissions, keypresses, ctx, epoch = 0, options;
  const host = () => document.querySelector('#margin-crossword-cycle');
  const toggle = () => host()?.shadowRoot.querySelector('[data-cycle-action="toggle"]');
  const stop = () => host()?.shadowRoot.querySelector('[data-cycle-action="stop"]');
  const assert = (value, message) => { if (!value) throw Error(message); };
  async function until(check, message, budget = 1800) { for (let elapsed = 0; elapsed < budget; elapsed += 10) { if (check()) return; await wait(10); } throw Error(message); }
  async function run(name, action) { try { await action(); results.push(`PASS ${name}`); } catch (error) { results.push(`FAIL ${name}: ${error.message}`); } }
  function valueNode(index) { return cells[index].querySelector('.crossword-letter,[data-cycle-test-value]'); }
  function letter(index) { return valueNode(index).lastChild?.nodeType === Node.TEXT_NODE ? valueNode(index).lastChild.nodeValue : ''; }
  function select(index) {
    selected = index;
    cells.forEach((cell, i) => cell.setAttribute('aria-selected', String(i === index)));
  }
  function later(fn, delay) { const generation = epoch; setTimeout(() => { if (generation === epoch) fn(); }, delay); }
  function setup(config = {}) {
    adapter?.destroy(); epoch++; panel.replaceChildren(); fixture.replaceChildren();
    options = { selectionDelay: 0, writeDelay: 0, autoAdvance: true, inputEvent: 'keydown', ...config };
    writes = []; releases = []; submissions = 0; keypresses = 0; selected = 1;
    board = el('div', { className: 'grid', 'data-margin-game': 'crossword' });
    cells = Array.from({ length: 9 }, (_, index) => {
      const cell = el('div', { className: 'cell', tabIndex: 0, 'data-margin-crossword-cell': '', 'data-row': String(Math.floor(index / 3)), 'data-col': String(index % 3), 'data-number': String(index + 1), 'data-block': 'false', 'aria-selected': String(index === 1) },
        el('span', { className: 'number', textContent: String(index + 1) }), el('span', { className: 'crossword-letter', 'data-margin-crossword-value': '', textContent: index === 1 ? config.initial || '' : '' }));
      cell.addEventListener('click', () => { if (!options.ignoreSelection) options.selectionDelay ? later(() => select(index), options.selectionDelay) : select(index); });
      return cell;
    });
    board.append(...cells); fixture.append(board);
    const legacy = { scratch: 'Saved note', crossword: { entries: [{ id: 'old', ref: '1 Across', pattern: '?A?', note: 'Keep this note', confidence: 'pencil' }], draft: { ref: '2 Down', pattern: '?B?', note: 'Saved draft', confidence: 'ink' } } };
    const features = { clueHover: false, letterCycle: true, ...(config.features || {}) };
    ctx = { el, panel, state: legacy, settings: {}, isPreview: true, shadowMode: 'open', saves: 0, save() { ctx.saves++; }, notice(message) { ctx.noticeText = message; }, feature(name, fallback = true) { return features[name] ?? fallback; }, features };
    adapter = MarginGames.crossword.mount(ctx);
  }
  function installSVG(nativeMarkup = false) {
    adapter.destroy();
    const ns = 'http://www.w3.org/2000/svg';
    const svg = (tag, attrs) => { const node = document.createElementNS(ns, tag); for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value)); return node; };
    board = svg('svg', { width: 240, height: 240, 'aria-hidden': 'true' });
    const grid = svg('g', { 'data-group': 'cells' }); board.append(grid);
    cells = Array.from({ length: 9 }, (_, index) => {
      const x = index % 3 * 80, y = Math.floor(index / 3) * 80;
      const cell = svg('g', { 'data-group': 'cell', 'data-margin-crossword-cell': '', 'data-number': index + 1, 'aria-selected': String(index === 1), tabindex: 0 });
      const rect = svg('rect', { x, y, width: 80, height: 80, fill: '#fff', stroke: '#aaa' });
      const number = svg('text', { x: x + 4, y: y + 15, class: 'Cell-label--fixture' }); number.textContent = String(index + 1);
      const value = svg('text', { x: x + 40, y: y + 48, ...(nativeMarkup ? { 'data-testid': 'cell-text', 'text-anchor': 'middle', 'data-cycle-test-value': '' } : { class: 'crossword-letter', 'data-margin-crossword-value': '' }) });
      cell.append(rect, number, value); cell.addEventListener('click', () => select(index)); return cell;
    });
    grid.append(...cells); fixture.replaceChildren(board); selected = 1; adapter = MarginGames.crossword.mount(ctx);
  }
  function nativeInput(event) {
    if (event.type === 'keypress') keypresses++;
    if (event.type === 'keydown' && event.key === 'Enter') { submissions++; return; }
    if (options.inputEvent !== 'both' && options.inputEvent !== event.type) return;
    if (!/^[a-z]$/i.test(event.key) || event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('input,textarea,[contenteditable]')) return;
    const index = selected, targetIndex = cells.indexOf(event.target.closest?.('[data-margin-crossword-cell]'));
    const value = event.key.toUpperCase();
    if (options.preventKeydown && event.type === 'keydown') event.preventDefault();
    writes.push({ index, targetIndex, value, time: Date.now(), type: event.type, charCode: event.charCode, which: event.which, keyCode: event.keyCode });
    if (options.ignoreWrite) return;
    const commit = () => {
      if (options.hiddenDuplicateGlyph) {
        const hidden = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        hidden.setAttribute('class', 'xwd__cell--hidden'); hidden.style.display = 'none'; hidden.textContent = value;
        valueNode(index).replaceChildren(hidden, document.createTextNode(value));
      } else valueNode(index).textContent = value;
      if (options.autoAdvance) select((index + 1) % cells.length);
      if (options.completeAt === value) fixture.append(el('div', { role: 'dialog', 'aria-label': 'Puzzle complete', textContent: 'Congratulations!' }));
    };
    options.writeDelay ? later(commit, options.writeDelay) : commit();
  }
  document.addEventListener('keydown', nativeInput); document.addEventListener('keypress', nativeInput);
  document.addEventListener('keyup', event => { if (/^[a-z]$/i.test(event.key)) releases.push(event.key.toUpperCase()); });
  await run('the small cycle control starts at A without requiring a final empty square', async () => {
    setup({ initial: 'M' }); const before = JSON.stringify(ctx.state);
    assert(toggle()?.getAttribute('aria-label') === 'Try A–Z' && writes.length === 0, 'cycle should be idle until requested');
    toggle().click(); await until(() => writes.length === 1, 'start did not type A');
    assert(writes[0].value === 'A' && letter(1) === 'A' && cells.filter((_, i) => !letter(i)).length === 8, 'cycle did not begin at A on the selected square');
    assert(JSON.stringify(ctx.state) === before && ctx.saves === 0, 'cycle changed legacy notes or persisted native letters');
    assert(submissions === 0, 'cycle attempted to submit the puzzle');
  });
  await run('every letter returns to the original square after native auto-advance', async () => {
    setup(); toggle().click(); await until(() => writes.length === 3, 'three letters were not tried', 2600); toggle().click();
    assert(writes.map(write => write.value).join('') === 'ABC' && writes.every(write => write.index === 1 && write.targetIndex === 1), 'native auto-advance moved cycling into another square');
    assert(cells.every((_, index) => index === 1 || !letter(index)), 'a neighboring square was overwritten');
    assert(writes.slice(1).every((write, index) => write.time - writes[index].time >= 650), 'letters were sent too quickly to inspect');
    assert(releases.join('') === 'ABC' && submissions === 0, 'letters lacked native releases or synthesized a submit');
  });
  await run('native asynchronous selection and letter renders settle before continuing', async () => {
    setup({ selectionDelay: 45, writeDelay: 65 }); toggle().click(); await until(() => writes.length === 3, 'delayed native updates did not finish', 3000); toggle().click(); await wait(90);
    assert(writes.every(write => write.index === 1 && write.targetIndex === 1) && letter(1) === 'C' && cells.every((_, index) => index === 1 || !letter(index)), 'async native updates caused a letter to spill into a neighbor');
  });
  await run('Pause and Resume retain the next letter and the same square', async () => {
    setup(); toggle().click(); await until(() => writes.length === 1, 'A was not typed'); toggle().click();
    assert(host().dataset.state === 'paused' && toggle().getAttribute('aria-label') === 'Resume A–Z', 'pause did not expose Resume');
    await wait(850); assert(writes.length === 1, 'letters continued while paused');
    toggle().click(); await until(() => writes.length === 2, 'resume did not continue');
    assert(writes[1].value === 'B' && writes[1].index === 1, 'resume restarted or changed the target');
  });
  await run('pausing before a delayed letter commits preserves its target and next candidate', async () => {
    setup({ writeDelay: 65, selectionDelay: 45 }); toggle().click();
    await until(() => writes.length === 1, 'initial letter event was not sent'); toggle().click();
    await wait(160);
    assert(letter(1) === 'A' && host().dataset.state === 'paused' && toggle().getAttribute('aria-label') === 'Resume A–Z', 'delayed auto-advance discarded the paused target');
    toggle().click(); await until(() => writes.length === 2, 'paused delayed trial did not resume'); await wait(120); toggle().click();
    assert(writes[1].value === 'B' && writes.every(write => write.index === 1) && letter(1) === 'B' && cells.every((_, index) => index === 1 || !letter(index)), 'resume restarted A or wrote to an auto-advanced neighbor');
  });
  await run('an already-present candidate does not misread delayed auto-advance as a manual selection', async () => {
    setup({ initial: 'A', writeDelay: 65, selectionDelay: 45 }); toggle().click();
    await until(() => letter(1) === 'C', 'pre-existing A caused cycling to stop before C', 3000); toggle().click();
    assert(writes.some(write => write.value === 'B') && writes.some(write => write.value === 'C') && writes.every(write => write.index === 1), 'existing A acknowledgement lost the original square');
    assert(cells.every((_, index) => index === 1 || !letter(index)), 'existing candidate spilled into a neighbor');
  });
  await run('a visually exposed aria-hidden SVG board supports safe cycling', async () => {
    setup(); installSVG();
    toggle().click(); await until(() => writes.length === 2, 'visible aria-hidden SVG could not cycle'); toggle().click();
    assert(writes.every(write => write.index === 1 && write.targetIndex === 1) && letter(1) === 'B', 'SVG cycling did not stay in its visible target');
    stop().click(); board.style.filter = 'blur(3px)'; adapter.refresh(); toggle().click(); await wait(850);
    assert(writes.length === 2, 'visual blur was ignored merely because aria-hidden is allowed');
  });
  await run('native keypress-only SVG entry acknowledges hidden duplicate glyphs without duplicate writes', async () => {
    setup({ inputEvent: 'keypress', hiddenDuplicateGlyph: true }); installSVG(true);
    toggle().click(); await until(() => writes.length === 3, 'native keypress-only board did not reach C', 2600); toggle().click();
    assert(writes.map(write => write.value).join('') === 'ABC' && writes.every(write => write.index === 1 && write.targetIndex === 1 && write.type === 'keypress'), 'native keypress entry duplicated a letter or wrote to an adjacent square');
    assert(writes.every(write => write.charCode === write.value.toLowerCase().charCodeAt(0) && write.which === write.charCode && write.keyCode === write.charCode), 'keypress did not carry the native lowercase character codes');
    assert(valueNode(1).textContent === 'CC' && letter(1) === 'C' && valueNode(1).firstElementChild.getClientRects().length === 0, 'fixture did not reproduce the hidden duplicate native SVG glyph');
    assert(releases.join('') === 'ABC' && cells.every((_, index) => index === 1 || !letter(index)), 'native keypress cycling missed releases or changed neighboring squares');
  });
  await run('a keydown handler that prevents default suppresses keypress and avoids duplicate entry', async () => {
    setup({ inputEvent: 'both', preventKeydown: true }); toggle().click();
    await until(() => writes.length === 3, 'keydown-driven board did not reach C', 2600); toggle().click();
    assert(writes.map(write => write.value).join('') === 'ABC' && writes.every(write => write.type === 'keydown' && write.index === 1), 'handled keydown produced duplicate native writes');
    assert(keypresses === 0 && releases.join('') === 'ABC', 'consumed keydown emitted an extra keypress or lost keyup');
  });
  await run('readonly and disabled nested native inputs cannot receive letter trials', async () => {
    for (const attrs of [{ readOnly: true }, { disabled: true }]) {
      setup(); const input = el('input', { value: 'Q', 'aria-label': 'Native square letter', ...attrs });
      cells[1].append(input); let inputEvents = 0; input.addEventListener('input', () => inputEvents++); adapter.refresh();
      toggle().click(); await wait(850);
      assert(input.value === 'Q' && inputEvents === 0 && writes.length === 0, 'uneditable nested input received a value setter or fallback keys');
    }
  });
  await run('Stop ends the sequence and a new explicit start restarts at A', async () => {
    setup(); toggle().click(); await until(() => writes.length === 1, 'A was not typed'); stop().click(); await wait(850);
    assert(writes.length === 1 && toggle().getAttribute('aria-label') === 'Try A–Z', 'stop left the sequence active');
    select(1); adapter.refresh(); toggle().click(); await until(() => writes.length === 2, 'new start did not type');
    assert(writes[1].value === 'A', 'new sequence did not restart at A');
  });
  await run('selecting a different square pauses cycling until an explicit new start', async () => {
    setup(); toggle().click(); await until(() => writes.length === 1, 'A was not typed'); cells[4].click(); await wait(850);
    assert(writes.length === 1 && host().dataset.state !== 'running', 'manual selection did not stop cycling');
    toggle().click(); await until(() => writes.length === 2, 'new selection did not start');
    assert(writes[1].index === 4 && writes[1].value === 'A', 'new selection did not get a new A–Z sequence');
  });
  await run('body-focused native arrow navigation selects a new square for the next explicit start', async () => {
    setup(); toggle().click(); await until(() => writes.length === 1, 'A was not typed');
    document.addEventListener('keydown', event => { if (event.key === 'ArrowRight') select(4); }, { once: true });
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true }));
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }));
    await wait(850);
    assert(writes.length === 1 && selected === 4 && toggle().getAttribute('aria-label') === 'Try A–Z', 'native body navigation did not release the previous trial target');
    toggle().click(); await until(() => writes.length === 2, 'new keyboard-selected square did not start');
    assert(writes[1].index === 4 && writes[1].value === 'A' && letter(1) === 'A', 'keyboard-selected square resumed the old square or skipped A');
  });
  await run('clicking a native clue outside the grid selects the target for a new A–Z sequence', async () => {
    setup();
    const clue = el('button', { type: 'button', textContent: '7 Across: Native clue', onClick: () => select(6) });
    fixture.append(el('section', { 'data-margin-clue-direction': 'across' }, el('ol', {}, el('li', { 'data-margin-clue-number': '7' }, clue))));
    toggle().click(); await until(() => writes.length === 1, 'A was not typed'); clue.click(); await wait(850);
    assert(writes.length === 1 && selected === 6 && toggle().getAttribute('aria-label') === 'Try A–Z', 'native clue selection did not release the old target');
    toggle().click(); await until(() => writes.length === 2, 'clue-selected square did not start');
    assert(writes[1].index === 6 && writes[1].value === 'A' && letter(1) === 'A', 'clue-selected square resumed an old trial or changed its prior letter');
  });
  await run('manual typing pauses the sequence and never resumes itself', async () => {
    setup(); toggle().click(); await until(() => writes.length === 1, 'A was not typed');
    const target = cells[selected]; target.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', code: 'KeyX', bubbles: true, cancelable: true })); target.dispatchEvent(new KeyboardEvent('keyup', { key: 'x', code: 'KeyX', bubbles: true }));
    const count = writes.length; await wait(850);
    assert(count === 2 && writes.length === count && host().dataset.state !== 'running', 'manual input did not suspend automatic letters');
  });
  await run('turning letter cycling off stops pending work and preserves legacy notes', async () => {
    setup(); const before = JSON.stringify(ctx.state); toggle().click(); await until(() => writes.length === 1, 'A was not typed'); ctx.features.letterCycle = false; adapter.refresh(); await wait(850);
    assert(writes.length === 1 && (host().hidden || getComputedStyle(host()).display === 'none'), 'disabled cycle remained active or visible');
    ctx.features.letterCycle = true; adapter.refresh(); await wait(800);
    assert(writes.length === 1 && JSON.stringify(ctx.state) === before, 're-enabling automatically typed or changed notebook data');
  });
  await run('blur and modal completion stop native input without a simulated submit', async () => {
    setup(); toggle().click(); await until(() => writes.length === 1, 'A was not typed'); window.dispatchEvent(new Event('blur')); await wait(850);
    assert(writes.length === 1 && host().dataset.state !== 'running', 'blur left cycling active');
    setup({ completeAt: 'B' }); toggle().click(); await until(() => fixture.querySelector('[role="dialog"]'), 'native completion modal did not appear'); await wait(850);
    assert(writes.map(write => write.value).join('') === 'AB' && submissions === 0 && host().dataset.state !== 'running', 'completion kept typing or fabricated submission');
  });
  await run('navigation and a removed target never continue an old cycle', async () => {
    setup(); toggle().click(); await until(() => writes.length === 1, 'A was not typed');
    const url = location.href; history.replaceState(null, '', `${location.pathname}?different-puzzle=1`); adapter.refresh(); await wait(850); history.replaceState(null, '', url);
    assert(writes.length === 1 && host().dataset.state !== 'running', 'navigation continued old puzzle input');
    setup(); toggle().click(); await until(() => writes.length === 1, 'A was not typed'); cells[1].remove(); adapter.refresh(); await wait(850);
    assert(writes.length === 1, 'removed target allowed more input');
  });
  await run('unacknowledged selection or letter updates stop without spilling input', async () => {
    setup({ ignoreSelection: true }); toggle().click(); await until(() => writes.length === 1, 'initial A was not typed'); await wait(1800);
    assert(writes.length === 1 && cells.every((_, index) => index === 1 || !letter(index)), 'ignored reselection wrote into the auto-advanced square');
    setup({ ignoreWrite: true }); toggle().click(); await until(() => writes.length === 1, 'initial A event was not sent'); await wait(1800);
    assert(writes.length === 1, 'missing render acknowledgement allowed repeated native writes');
  });
  await run('cycling stops after Z and never wraps or auto-submits', async () => {
    setup(); toggle().click(); await until(() => writes.length === 26, 'cycle did not finish A–Z', 20000); await wait(850);
    assert(writes.map(write => write.value).join('') === 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' && writes.every(write => write.index === 1), 'cycle skipped, repeated, or moved letters');
    assert(host().dataset.state === 'done' && toggle().getAttribute('aria-label') === 'Try A–Z' && submissions === 0, 'Z did not finish cleanly');
  });
  await run('destroy cancels future native edits and removes the cycle control', async () => {
    setup(); toggle().click(); await until(() => writes.length === 1, 'A was not typed'); adapter.destroy(); adapter = null; await wait(850);
    assert(writes.length === 1 && !host(), 'destroy left the cycle or its native input timer active');
  });
  adapter?.destroy();
  document.querySelector('#results').textContent = results.join('\n');
  document.body.dataset.testStatus = results.some(line => line.startsWith('FAIL')) ? 'failed' : 'passed';
})();
