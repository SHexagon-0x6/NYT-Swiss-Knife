(async function () {
  'use strict';
  const { el } = Margin;
  const fixture = document.querySelector('#fixture');
  const panel = document.querySelector('#margin-host').attachShadow({ mode: 'open' });
  const results = [];
  const layout = [['1','2','#','3','4'],['5','','6','',''],['#','7','','','#'],['8','','','','9'],['10','','#','11','']];
  const numbers = { across: [1,3,5,7,8,10,11], down: [1,2,3,4,6,8,9] };
  let adapter, ctx, board;
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const tip = () => document.querySelector('#margin-crossword-tooltip');
  const shown = () => tip() && !tip().hidden;
  const text = () => tip()?.shadowRoot.textContent || '';
  function cell(row, col) { return board.querySelector(`[data-row="${row}"][data-col="${col}"]`); }
  function hover(node) { node.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, relatedTarget: document.body })); }
  function clueSections(native = false) {
    const wrap = el('div', { className: 'fixture-clues' });
    for (const direction of ['across', 'down']) {
      const section = el('section', native ? { className: 'ClueList-wrapper--example' } : { 'data-margin-clue-direction': direction });
      section.append(el('h3', { className: 'ClueList-title--example', textContent: direction === 'across' ? 'Across' : 'Down' }));
      const list = el('ol');
      for (const number of numbers[direction]) {
        list.append(el('li', native ? {} : { 'data-margin-clue-number': number },
          el(native ? 'span' : 'b', native ? { className: 'Clue-label--example', textContent: String(number) } : { textContent: `${number}. ` }),
          el('span', { className: native ? 'Clue-text--example' : '', textContent: `Original ${direction} clue ${number}` })
        ));
      }
      section.append(list); wrap.append(section);
    }
    return wrap;
  }
  function setup(options = {}) {
    adapter?.destroy(); panel.replaceChildren(); fixture.replaceChildren();
    board = el('div', { className: 'fixture-board', 'data-margin-game': 'crossword' });
    layout.forEach((row, r) => row.forEach((number, c) => board.append(el('div', {
      className: 'fixture-cell', tabIndex: 0, 'data-margin-crossword-cell': '', 'data-row': r, 'data-col': c,
      'data-number': number === '#' ? '' : number, 'data-block': String(number === '#'), textContent: number === '#' ? '' : number
    }))));
    fixture.append(board, clueSections());
    ctx = { el, panel, state: options.state || {}, save() { ctx.saved = (ctx.saved || 0) + 1; }, notice() {}, settings: {}, isPreview: true };
    if (options.features) ctx.feature = (name, fallback = true) => options.features[name] ?? fallback;
    adapter = MarginGames.crossword.mount(ctx);
  }
  function run(name, fn) { try { fn(); results.push(`PASS ${name}`); } catch (error) { results.push(`FAIL ${name}: ${error.message}`); } }
  run('middle of an entry shows both existing Across and Down clues', () => {
    setup(); hover(cell(1,1));
    assert(shown() && text().includes('5 Across') && text().includes('2 Down'), 'wrong clue starts for unnumbered cell');
    assert(text().includes('Original across clue 5') && text().includes('Original down clue 2'), 'missing existing clue text');
    assert(!ctx.state.crossword?.entries && !ctx.saved, 'hover created stored notebook data');
  });
  run('numbered start resolves both directions and black squares hide the tooltip', () => {
    setup(); hover(cell(0,0)); assert(text().includes('1 Across') && text().includes('1 Down'), 'numbered start not mapped');
    hover(cell(0,2)); assert(!shown(), 'block showed a clue');
  });
  run('pointer leaves hide the tooltip and existing accessibility references survive', () => {
    setup(); const target = cell(1,1); target.setAttribute('aria-describedby', 'existing-description'); hover(target);
    assert(target.getAttribute('aria-describedby').includes('margin-crossword-tooltip'), 'tooltip reference missing');
    target.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
    assert(!shown() && target.getAttribute('aria-describedby') === 'existing-description', 'leave did not clean own reference');
  });
  run('keyboard focus shows equivalent clues; Escape hides without stealing navigation', () => {
    setup(); cell(3,3).focus();
    assert(shown() && text().includes('8 Across') && text().includes('3 Down'), 'focus missing same clues');
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    cell(3,3).dispatchEvent(escape);
    assert(!shown() && !escape.defaultPrevented, 'Escape was stolen or tooltip remained');
  });
  run('nearby clue panel stays inside the viewport and supports reading long clues', () => {
    setup(); Object.assign(board.style, { position: 'fixed', right: '0', bottom: '0' }); adapter.refresh(); hover(cell(4,4));
    const rect = tip().getBoundingClientRect(), gridRect = board.getBoundingClientRect();
    assert(rect.left >= 7 && rect.top >= 7 && rect.right <= innerWidth - 7 && rect.bottom <= innerHeight - 7, 'top clue panel left viewport');
    const square=cell(4,4).getBoundingClientRect();assert(rect.bottom<=square.top-4||rect.top>=square.bottom+4,'clue panel obscures the hovered square');
  });
  run('clue hover can be disabled independently of letter cycling', () => {
    const features = { clueHover: true, letterCycle: false }; setup({ features });
    hover(cell(1,1)); assert(shown(), 'hover depends on letter cycling');
    features.clueHover = false; adapter.refresh(); hover(cell(1,1)); cell(1,1).focus();
    assert(!shown() && !cell(1,1).hasAttribute('aria-describedby'), 'disabled hover still exposes clues');
    features.letterCycle = true; adapter.refresh(); hover(cell(1,1));
    assert(!shown(), 'cycling re-enabled hover');
    features.clueHover = true; adapter.refresh(); hover(cell(1,1));
    assert(shown() && text().includes('5 Across'), 're-enabled hover did not reconnect');
    assert(!panel.querySelector('.mc-notebook,input,textarea,select'), 'removed notebook or duplicate settings remain');
  });
  run('same-row Across entries and a Down-only start resolve to their own clues', () => {
    setup();
    const first = cell(1,0), downOnly = cell(1,1), separator = cell(1,2), second = cell(1,3), target = cell(1,4);
    first.setAttribute('data-number','41'); downOnly.setAttribute('data-number','43');
    separator.removeAttribute('data-block'); separator.classList.add('xwd__cell--block'); separator.style.backgroundColor = '#000';
    second.setAttribute('data-number','42');
    for (const [direction, number, clue] of [['across',41,'First separate Across entry'],['across',42,'Second separate Across entry'],['down',43,'Down-only numbered start']]) {
      fixture.querySelector(`[data-margin-clue-direction="${direction}"] ol`).append(el('li', { 'data-margin-clue-number': String(number) }, el('span', { textContent: clue })));
    }
    adapter.refresh(); hover(target);
    assert(shown() && text().includes('42 Across') && text().includes('Second separate Across entry') && !text().includes('41 Across'), 'second same-row entry received the first entry clue');
    hover(downOnly);
    assert(shown() && text().includes('41 Across') && text().includes('43 Down'), 'Down-only start incorrectly split the Across entry');
    separator.className = 'fixture-cell'; separator.style.backgroundColor = ''; separator.setAttribute('data-number','');
    adapter.refresh(); hover(target);
    assert(shown() && text().includes('42 Across') && text().includes('41 Across'), 'overlapping entries containing the same square were omitted');
  });
  run('37 Down and 43 Across appear only for squares belonging to those entries', () => {
    setup();
    cell(0,1).setAttribute('data-number','37'); cell(1,0).setAttribute('data-number','43');
    for(const [direction,number] of [['down',37],['across',43]]){
      fixture.querySelector(`[data-margin-clue-direction="${direction}"] ol`).append(el('li',{'data-margin-clue-number':number},el('span',{textContent:`Relevant clue ${number}`})));
    }
    adapter.refresh(); hover(cell(1,1));
    assert(shown()&&text().includes('37 Down')&&text().includes('43 Across'),'intersecting clues were omitted');
    hover(cell(0,1));
    assert(text().includes('37 Down')&&!text().includes('43 Across'),'unrelated clue elsewhere in the column was included');
    for(let row=0;row<5;row++)cell(row,1).setAttribute('data-letter','A');
    adapter.refresh(); hover(cell(1,1));
    assert(shown()&&text().includes('43 Across')&&!text().includes('37 Down'),'filled entry was repeated');
    for(let col=0;col<5;col++)cell(1,col).setAttribute('data-letter','B');
    adapter.refresh(); hover(cell(1,1)); assert(!shown(),'all-filled intersection still showed clues');
  });
  run('hover shows visible letters as boxes and counts only unfilled cells',()=>{
    setup();cell(1,0).setAttribute('data-letter','A');adapter.refresh();hover(cell(1,1));
    const entry=[...tip().shadowRoot.querySelectorAll('.entry')].find(n=>n.querySelector('.label').textContent==='5 Across');
    assert(entry.querySelectorAll('.letter-box').length===5&&entry.querySelector('.letter-box').textContent==='A','visible word pattern missing');
    assert(entry.querySelector('.blank-count').textContent==='4 blanks left'&&entry.querySelectorAll('.letter-box.current').length===1,'blank count or pointed square missing');
  });
  run('typing dismisses the preview without consuming input or stealing focus',()=>{
    setup();const target=cell(1,1);target.focus();hover(target);
    let received=0;target.addEventListener('keydown',()=>received++);
    const letter=new KeyboardEvent('keydown',{key:'a',bubbles:true,cancelable:true});target.dispatchEvent(letter);
    assert(received===1&&!letter.defaultPrevented&&document.activeElement===target&&!shown(),'preview interfered with native typing');
    target.setAttribute('data-letter','A');adapter.refresh();hover(target);
    assert(!shown(),'refresh or synthetic hover reopened the preview during typing');
    const r=target.getBoundingClientRect();target.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:r.x+10,clientY:r.y+10}));
    assert(shown()&&getComputedStyle(tip().shadowRoot.querySelector('.tip')).pointerEvents==='none','deliberate mouse movement did not restore a noninteractive preview');
    const virtualInput=new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'B'});target.dispatchEvent(virtualInput);assert(!shown()&&!virtualInput.defaultPrevented,'virtual keyboard input was intercepted or left hover visible');
  });
  run('removed or replaced boards cannot leave stale tooltip content', () => {
    setup(); const target = cell(1,1); hover(target); board.remove(); adapter.refresh();
    assert(!shown() && !target.hasAttribute('aria-describedby'), 'stale board tooltip stayed visible');
  });
  run('unmatched clue numbers fail safely instead of inventing content', () => {
    setup(); fixture.querySelectorAll('[data-margin-clue-number]').forEach(node => node.remove()); adapter.refresh(); hover(cell(1,1));
    assert(!shown(), 'missing clue list invented content');
  });
  run('hidden clue lists are never read and plain text cannot become markup', () => {
    setup(); fixture.querySelector('[data-margin-clue-direction="down"]').hidden = true; adapter.refresh(); hover(cell(1,1));
    assert(!shown(), 'read hidden direction list');
    fixture.querySelector('[data-margin-clue-direction="down"]').hidden = false;
    fixture.querySelector('[data-margin-clue-direction="across"] [data-margin-clue-number="5"] span').textContent = '<img src=x onerror=alert(1)>';
    adapter.refresh(); hover(cell(1,1));
    assert(shown() && text().includes('<img') && !tip().shadowRoot.querySelector('img'), 'clue text interpreted as markup');
  });
  run('structurally incomplete square grids fail safely', () => {
    setup(); cell(0,0).remove(); adapter.refresh(); hover(cell(1,1)); assert(!shown(), 'incomplete geometry accepted');
  });
  run('SVG cell geometry and ClueList headings work without preview data attributes', () => {
    setup(); const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('width', '240'); svg.setAttribute('height', '240');
    // aria-hidden does not mean visually hidden; NYT can use a separate accessible grid.
    svg.setAttribute('aria-hidden', 'true');
    const group = document.createElementNS(ns, 'g'); group.setAttribute('data-group', 'cells'); svg.append(group);
    layout.forEach((row, r) => row.forEach((number, c) => {
      const g = document.createElementNS(ns, 'g'); g.setAttribute('data-group', 'cell'); g.setAttribute('data-test-coordinates', `${r},${c}`);
      const rect = document.createElementNS(ns, 'rect'); rect.setAttribute('x', c * 48); rect.setAttribute('y', r * 48); rect.setAttribute('width', '48'); rect.setAttribute('height', '48'); rect.setAttribute('fill', number === '#' ? '#000' : '#fff'); rect.setAttribute('stroke', '#333');
      rect.setAttribute('class', `Cell-cell--example${number === '#' ? ' Cell-block--example' : ''}`); g.append(rect);
      if (number && number !== '#') { const label = document.createElementNS(ns, 'text'); label.setAttribute('x', c * 48 + 3); label.setAttribute('y', r * 48 + 14); label.setAttribute('class', 'Cell-label--example'); label.textContent = number; g.append(label); }
      group.append(g);
    }));
    fixture.replaceChildren(svg, clueSections(true)); adapter.refresh();
    hover(svg.querySelector('[data-test-coordinates="1,1"] rect'));
    assert(shown() && text().includes('5 Across') && text().includes('2 Down'), 'native SVG/clue selectors not mapped');
  });
  run('Bonus ARIA rows include presentation black cells and native clue text spans', () => {
    setup(); const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('width', '240'); svg.setAttribute('height', '240');
    const grid = document.createElementNS(ns, 'g'); grid.setAttribute('role', 'grid'); grid.setAttribute('aria-rowcount', '5'); grid.setAttribute('aria-colcount', '5'); svg.append(grid);
    layout.forEach((values, row) => {
      const group = document.createElementNS(ns, 'g'); group.setAttribute('role', 'row'); grid.append(group);
      values.forEach((number, col) => {
        const node = document.createElementNS(ns, 'g'); node.setAttribute('class', 'xwd__cell'); node.setAttribute('data-testid', 'cell-g'); node.setAttribute('role', number === '#' ? 'presentation' : 'gridcell');
        if (number === '#') node.setAttribute('aria-hidden', 'true');
        else { node.setAttribute('aria-rowindex', row + 1); node.setAttribute('aria-colindex', col + 1); }
        const rect = document.createElementNS(ns, 'rect'); rect.setAttribute('x', col * 48); rect.setAttribute('y', row * 48); rect.setAttribute('width', '48'); rect.setAttribute('height', '48'); rect.setAttribute('fill', number === '#' ? '#000' : '#fff'); rect.setAttribute('class', 'xwd__cell--cell xwd__cell--nested'); node.append(rect);
        if (number !== '#') { const letter = document.createElementNS(ns, 'text'); letter.setAttribute('data-testid', 'cell-text'); letter.setAttribute('x', col * 48 + 20); letter.setAttribute('y', row * 48 + 32); letter.textContent = row===1&&col===1?'':'A'; node.append(letter); }
        if (number && number !== '#') { const label = document.createElementNS(ns, 'text'); label.setAttribute('data-testid', 'cell-text'); label.setAttribute('x', col * 48 + 3); label.setAttribute('y', row * 48 + 14); label.textContent = number; node.append(label); }
        group.append(node);
      });
    });
    const clues = clueSections(true);
    clues.querySelectorAll('.Clue-label--example').forEach(node => node.className = 'xwd__clue--label');
    clues.querySelectorAll('.Clue-text--example').forEach(node => node.className = 'xwd__clue--text');
    fixture.replaceChildren(svg, clues); adapter.refresh();
    const target = grid.querySelector('[aria-rowindex="2"][aria-colindex="2"]'); hover(target.querySelector('rect'));
    assert(shown() && text().includes('5 Across') && text().includes('2 Down') && text().includes('Original across clue 5'), 'Bonus presentation holes or letter-before-number SVG text broke clue mapping');
    hover(grid.querySelector('[role="presentation"] rect')); assert(!shown(), 'Bonus black square shows a clue');
    target.setAttribute('aria-colindex', '3'); adapter.refresh(); hover(target);
    assert(!shown(), 'inconsistent Bonus coordinates accepted');
  });
  run('obscured and blurred native clue lists stay hidden until the game reveals them', () => {
    setup(); const list = fixture.querySelector('[data-margin-clue-direction="down"] ol');
    list.className = 'xwd__clue-list--list xwd__clue-list--obscured'; adapter.refresh(); hover(cell(1,1));
    assert(!shown(), 'obscured native clues were exposed');
    list.className = 'xwd__clue-list--list'; list.style.filter = 'blur(4px)'; adapter.refresh(); hover(cell(1,1));
    assert(!shown(), 'CSS-blurred clues were exposed');
    list.style.filter = 'none'; list.style.opacity = '0'; adapter.refresh(); hover(cell(1,1));
    assert(!shown(), 'transparent clues were exposed');
    list.style.opacity = '1'; list.setAttribute('aria-hidden', 'true'); adapter.refresh(); hover(cell(1,1));
    assert(!shown(), 'hidden native clue list was exposed');
    list.removeAttribute('aria-hidden'); adapter.refresh(); hover(cell(1,1));
    assert(shown() && text().includes('Original down clue 2'), 'revealed native clues did not reconnect');
  });
  run('long clues remain complete in a scrollable nearby panel', () => {
    setup();
    fixture.querySelector('[data-margin-clue-direction="across"] [data-margin-clue-number="5"] span').textContent = 'Original clue text '.repeat(60);
    fixture.querySelector('[data-margin-clue-direction="down"] [data-margin-clue-number="2"] span').textContent = 'Original clue text '.repeat(60);
    adapter.refresh(); hover(cell(1,1)); const rect = tip().getBoundingClientRect();
    assert(shown() && rect.top >= 7 && rect.bottom <= innerHeight - 7, 'long tooltip escaped viewport');
    const content = tip().shadowRoot.querySelector('.tip');
    assert(text().includes('Original clue text '.repeat(59).trim()) && !text().includes('see list for full text'), 'long clue text was truncated');
    assert(getComputedStyle(content).pointerEvents === 'none' && !content.hasAttribute('tabindex'), 'long preview can intercept clicks or keyboard focus');
  });
  run('ARIA grid coordinates and explicitly labelled numbers map without preview selectors', () => {
    setup(); const target = cell(1,1);
    board.removeAttribute('data-margin-game'); board.setAttribute('role', 'grid');
    board.querySelectorAll('[data-margin-crossword-cell]').forEach(node => {
      node.setAttribute('role', 'gridcell');
      node.setAttribute('aria-rowindex', Number(node.getAttribute('data-row')) + 1);
      node.setAttribute('aria-colindex', Number(node.getAttribute('data-col')) + 1);
      const number = node.getAttribute('data-number');
      node.setAttribute('aria-label', node.getAttribute('data-block') === 'true' ? 'Black square' : number ? `Number ${number}` : 'Empty square');
      for (const attribute of ['data-row','data-col','data-number','data-block','data-margin-crossword-cell']) node.removeAttribute(attribute);
    });
    adapter.refresh(); hover(target);
    assert(shown() && text().includes('5 Across') && text().includes('2 Down'), 'ARIA grid not recognized');
  });
  try {
    setup(); cell(1,1).setAttribute('aria-selected', 'true');
    const move = () => { cell(1,1).removeAttribute('aria-selected'); cell(1,3).setAttribute('aria-selected', 'true'); };
    board.addEventListener('keydown', move, { once: true });
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    board.dispatchEvent(event);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert(shown() && text().includes('5 Across') && text().includes('3 Down') && !event.defaultPrevented, 'native arrow selection not reflected');
    results.push('PASS native keyboard-selected cell previews clues without intercepting the arrow key');
  } catch (error) { results.push(`FAIL native keyboard-selected cell previews clues without intercepting the arrow key: ${error.message}`); }
  run('destroy removes tooltip and all hover/focus event effects', () => {
    setup(); const target = cell(1,1); hover(target); adapter.destroy(); adapter = null; hover(target); target.focus();
    assert(!tip() && !target.hasAttribute('aria-describedby'), 'teardown leaked tooltip or cell annotation');
  });
  adapter?.destroy();
  document.querySelector('#results').textContent = results.join('\n');
  document.body.dataset.testStatus = results.some(result => result.startsWith('FAIL')) ? 'failed' : 'passed';
  document.title = `Crossword hover tests: ${document.body.dataset.testStatus}`;
})();
