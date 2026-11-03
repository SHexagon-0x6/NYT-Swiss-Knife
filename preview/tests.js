/* Development-only checks against the real local preview and extension adapters. */
(async () => {
  'use strict';
  const lines = [], output = document.getElementById('results');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (value, message) => { if (!value) throw Error(message); lines.push('PASS '+message); output.textContent = lines.join('\n'); };
  let frame;
  async function open(game) {
    frame?.remove(); frame = document.createElement('iframe'); frame.title = game+' test';
    const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
    frame.src = `index.html?game=${game}`; document.getElementById('fixture').append(frame); await loaded; await wait(350);
    const win = frame.contentWindow, doc = frame.contentDocument;
    const roots = () => [doc.querySelector('#margin-host')?.shadowRoot, ...[...doc.querySelectorAll('[data-margin-inline],[data-margin-overlay]')].map(node => node.shadowRoot)].filter(Boolean);
    const find = selector => roots().map(root => root.querySelector(selector)).find(Boolean);
    const button = name => roots().flatMap(root => [...root.querySelectorAll('button')]).find(node => node.textContent === name || node.getAttribute('aria-label') === name);
    const key = (name, target = doc) => target.dispatchEvent(new win.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
    assert(doc.querySelectorAll('#games a').length === 5 && !!doc.querySelector('#margin-host')?.shadowRoot, `${game}: direct navigation and real adapter load offline`);
    return { win, doc, find, button, key };
  }
  try {
    {
      const { win, doc, find, button, key } = await open('connections');
      const toolbar=doc.querySelector('[data-margin-inline="connections-tools"]');
      assert(toolbar?.previousElementSibling?.textContent === 'Create four groups of four!' && toolbar.nextElementSibling?.matches('[data-testid="connections-board"]'), 'Connections tools sit below the instruction and immediately above the board');
      const tiles = [...doc.querySelectorAll('[data-margin-word]')]; tiles.slice(0,4).forEach(tile => tile.click());
      assert(tiles.filter(tile => tile.getAttribute('aria-pressed') === 'true').length === 4, 'Connections native selection works');
      for(const corner of ['tl','tr','bl','br'])find(`[data-word="BARK"][data-corner="${corner}"]`).click();
      const cornerMarks = ['tl','tr','bl','br'].map(corner => find(`[data-word="BARK"][data-corner="${corner}"]`));
      assert(cornerMarks.every(node => node.textContent === '' && !node.classList.contains('empty')), 'Connections corners show color without tile letters');
      await wait(20);
      const markedRecord = Object.values(JSON.parse(win.localStorage.getItem('margin-preview') || '{}')).find(value => value?.game === 'connections');
      assert(['tl','tr','bl','br'].every((corner,index)=>markedRecord.state.marks.BARK[corner]===index), 'Connections corner colors remain fixed in yellow, green, blue, purple order');
      find('.connection-swatch[data-group="0"]').click();
      assert(!find('[data-word="BARK"][data-corner="tl"]').hidden && find('[data-word="BARK"][data-corner="tr"]').hidden, 'Connections category icons filter visible marks');
      find('.connection-swatch[data-group="0"]').click();
      assert(!find('[data-word="BARK"][data-corner="tr"]').hidden, 'Clicking the active category again restores all colors');
      find('.connection-swatch[data-group="1"]').click(); button('Clear group B marks').click();
      assert(find('[data-word="BARK"][data-corner="tr"]').classList.contains('empty'), 'Connections category cross clears only that color');
      find('.connection-swatch[data-group="1"]').click();
      assert(!find('[data-word="BARK"][data-corner="tl"]').classList.contains('empty'), 'Clearing one Connections category preserves other marks');
      find('.connection-swatch[data-group="0"]').dispatchEvent(new win.MouseEvent('dblclick',{bubbles:true,composed:true}));
      const groupName=find('[aria-label="Group A name"]');groupName.value='Trees';button('Save').click();
      assert(find('.connection-swatch[data-group="0"]').getAttribute('aria-label').includes('Trees'), 'Connections category names can be changed with a double click');
      assert(!!find('[data-word="BARK"][data-corner="tl"]'), 'Closing the category popup immediately restores covered corner controls');
      doc.querySelector('[data-margin-submit]').click(); await wait(250);
      const boardBounds=doc.querySelector('[data-margin-word]').parentElement.getBoundingClientRect();
      button('Previous tries').click();
      assert(find('.connection-history')?.getBoundingClientRect().height > 0 && !!find('.connection-attempt'), 'Connections Tries opens recorded native feedback in a popup');
      const popupBounds=doc.querySelector('[data-margin-word]').parentElement.getBoundingClientRect();
      assert(['x','y','width','height'].every(name=>Math.abs(boardBounds[name]-popupBounds[name])<1), 'Connections Tries popup leaves the native board in place');
      key('Escape');
      assert(!find('.connection-history')?.getClientRects().length, 'Escape closes the Connections Tries popup');
      const records = JSON.parse(win.localStorage.getItem('margin-preview') || '{}');
      records['puzzle:wordle:unrelated-demo'] = { game: 'wordle', updatedAt: Date.now(), state: { scratch: 'Keep me' } };
      win.localStorage.setItem('margin-preview', JSON.stringify(records));
      const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
      doc.querySelector('#reset-demo').click(); await loaded; await wait(300);
      const remaining = JSON.parse(frame.contentWindow.localStorage.getItem('margin-preview') || '{}');
      assert(!Object.keys(remaining).some(key => key.includes(':demo-connections-v2:')) && remaining['puzzle:wordle:unrelated-demo'].state.scratch === 'Keep me', 'Reset removes this demo only and preserves other puzzle notes');
    }
    {
      const { win, doc, key } = await open('sudoku');
      const cell = doc.querySelector('.su-cell[data-cell="2"]'); cell.click(); key('4', cell);
      assert(cell.querySelector('.su-cell__value')?.textContent === '4', 'Sudoku Normal writes a native value');
      doc.querySelector('.su-keyboard__undo').click();
      assert(!cell.querySelector('.su-cell__value'), 'Sudoku native Undo reverses an entry');
      key('5', cell); key('Backspace', cell);
      assert(!cell.querySelector('.su-cell__value'), 'Sudoku erase restores an empty cell');
      const auto = doc.querySelector('label.su-keyboard__auto'), coloredHost = doc.querySelector('[data-margin-inline="sudoku-colored"]');
      assert(auto.parentElement.matches('.su-keyboard__container') && auto.nextElementSibling === coloredHost && !doc.querySelector('[data-margin-inline="sudoku-pencil"],[data-margin-overlay="sudoku"]'), 'Colored candidate sits right below the original Auto candidate, with no Snyder or Center tools');
      const coloredBox = coloredHost.shadowRoot.querySelector('input[type="checkbox"]'); coloredBox.click();
      assert(doc.querySelector('[data-testid="candidate-mode"]').getAttribute('aria-pressed') === 'true', 'Colored candidate switches the preview to Candidate');
      key('3', cell); await wait(50);
      const mark = doc.querySelector('.su-candidates.selected svg.su-candidate[data-candidate="3"]');
      assert(mark?.hasAttribute('data-margin-colored') && win.getComputedStyle(mark.firstElementChild).fill === 'rgb(47, 111, 219)', 'A candidate entered with Blue on is blue');
      coloredBox.click();
      assert(doc.querySelector('[data-testid="candidate-mode"]').getAttribute('aria-pressed') === 'true', 'Turning Colored candidate off keeps Candidate mode');

    }
    {
      const { doc, button, key, find } = await open('wordle');
      const preferences = [...doc.querySelector('#margin-host').shadowRoot.querySelectorAll('[data-feature]')];
      assert(preferences.length === 2 && preferences.some(node => node.dataset.feature === 'letterProtection') && preferences.some(node => node.dataset.feature === 'clickToEdit'), 'Wordle exposes only the two requested settings');
      for (const letter of 'STARE') key(letter); await wait(150);
      const current = doc.querySelectorAll('[data-margin-row]')[2];
      assert(current.querySelectorAll('[data-margin-wordle-conflict]').length > 0, 'Wordle highlights conflicting letters before submission');
      current.children[1].click(); key('H'); await wait(500);
      assert(current.textContent === 'SHARE', 'Wordle click-to-edit replaces one letter while preserving the suffix');
      current.children[1].click(); doc.querySelector('[data-key="T"]').click(); await wait(500);
      assert(current.textContent === 'STARE', 'Wordle on-screen keys also replace the selected letter');
      const boardBounds = current.parentElement.getBoundingClientRect();
      doc.querySelector('[data-margin-enter]').click(); await wait(200);
      assert(find('[role="alertdialog"]')?.hidden === false && doc.querySelectorAll('[data-margin-row]')[2].children[0].dataset.state === 'tbd', 'Wordle warning blocks a conflicting practice guess');
      const warningBounds = current.parentElement.getBoundingClientRect();
      assert(['x', 'y', 'width', 'height'].every(name => Math.abs(warningBounds[name] - boardBounds[name]) < 1), 'Wordle confirmation leaves the native board in place');
      button('Submit anyway').click(); await wait(100);
      assert(doc.querySelectorAll('[data-margin-row]')[2].children[0].dataset.state === 'absent' && doc.querySelectorAll('[data-margin-row]')[3].children[0].dataset.state === 'empty', 'Explicit Wordle override advances exactly one demo row');
      assert(find('[role="alertdialog"]')?.hidden !== false && !current.querySelector('[data-margin-wordle-conflict]'), 'Wordle clears the popup and red highlights after submission');
    }
    for (const game of ['crossword','bonuscrossword']) {
      const { doc, key, find, button } = await open(game); const cells = [...doc.querySelectorAll('[data-margin-crossword-cell]')];
      cells[1].click(); cells[1].focus(); key('A', cells[1]);
      assert(cells[1].querySelector('.crossword-letter').textContent === 'A', `${game}: typing writes the selected square`);
      const before = doc.querySelector('[data-margin-crossword-cell][aria-selected="true"]'); key('ArrowDown', doc.activeElement); await wait(25);
      assert(doc.querySelector('[data-margin-crossword-cell][aria-selected="true"]') !== before, `${game}: arrow navigation moves the active square`);
      cells[6].focus();const hoverRect=cells[6].getBoundingClientRect();cells[6].dispatchEvent(new doc.defaultView.PointerEvent('pointermove',{bubbles:true,clientX:hoverRect.x+8,clientY:hoverRect.y+8}));await wait(30);
      assert(!doc.querySelector('#margin-crossword-tooltip'), `${game}: hover and focus do not show clue previews`);
      const featureNames = [...doc.querySelector('#margin-host').shadowRoot.querySelectorAll('[data-feature]')].map(node => node.dataset.feature).sort();
      assert(featureNames.join(',') === 'candidateNotes,letterCycle' && !find('.mc-notebook'), `${game}: fast trials and Notes are the only Crossword settings`);
      cells[1].click(); await wait(30); const neighbors = cells.map(node => node.querySelector('.crossword-letter')?.textContent || '');
      button('Try A–Z').click(); await wait(45); button('Pause A–Z').click();
      assert(/^[B-Z]$/.test(cells[1].querySelector('.crossword-letter').textContent) && cells.every((node,index) => index === 1 || (node.querySelector('.crossword-letter')?.textContent || '') === neighbors[index]), `${game}: A–Z returns to the same square after native auto-advance`);
      assert(button('Resume A–Z'), `${game}: letter trials can be paused explicitly`); button('Stop A–Z').click();
      const clue = doc.querySelector('[data-margin-clue-direction="down"] button'); clue.click();
      assert(/Down/.test(doc.querySelector('.native-active-clue').textContent), `${game}: clicking a clue changes the active entry`);
    }
    frame.remove(); output.textContent = lines.join('\n')+`\nALL ${lines.length} TESTS PASSED`;
    document.documentElement.dataset.testResult = 'passed';
  } catch (error) { output.textContent = lines.join('\n')+'\nFAIL '+error.stack; document.documentElement.dataset.testResult = 'failed'; }
})();
