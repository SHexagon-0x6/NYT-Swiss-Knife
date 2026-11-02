(async () => {
  'use strict';
  const { el } = Margin, fixture = document.querySelector('#fixture'), results = [];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (value, message) => { if (!value) throw Error(message); };
  const run = async (name, action) => { try { await action(); results.push(`PASS ${name}`); } catch (error) { results.push(`FAIL ${name}: ${error.message}`); } };
  let adapter, ctx, cells, selected = 0, writes = 0;
  const button = name => document.querySelector('#margin-crossword-cycle').shadowRoot.querySelector(`[data-notes-action="${name}"]`);
  const overlay = () => document.querySelector('#margin-crossword-candidates');
  const marks = key => overlay()?.shadowRoot.querySelector(`[data-square="${key}"]`);
  const value = index => cells[index].querySelector('.crossword-letter');
  function select(index) { selected = index; cells.forEach((cell, i) => cell.setAttribute('aria-selected', String(i===index))); cells[index].focus(); adapter?.refresh(); }
  function key(key, target = cells[selected], options = {}) {
    const code = key.length===1 ? `Key${key.toUpperCase()}` : key==='Control' ? 'ControlLeft' : key;
    for (const type of ['keydown','keypress','keyup']) target.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles:true, cancelable:true, composed:true, ...options }));
  }
  function mount() {
    ctx.bindShortcut = (fn, mode) => Margin.bindShortcut(fn, () => ({ enabled: true, key: mode==='candidates' ? 'Control' : 'Shift' }));
    adapter = MarginGames.crossword.mount(ctx);
  }
  function setup(saved) {
    adapter?.destroy(); adapter = null; selected=0; writes=0; fixture.replaceChildren();
    const board = el('div', { className:'board', 'data-margin-game':'crossword' });
    cells = Array.from({length:9}, (_,i) => el('div', { className:'cell', tabIndex:0, 'data-margin-crossword-cell':'', 'data-row':String(Math.floor(i/3)), 'data-col':String(i%3), 'data-number':String(i+1), 'data-block':'false', 'aria-selected':String(i===0), onClick:()=>select(i) }, el('span', {className:'number', textContent:String(i+1)}), el('span', {className:'crossword-letter'})));
    board.append(...cells); fixture.append(board);
    ctx={ el, isPreview:true, state:saved || {crossword:{entries:[{note:'Keep me'}]}}, saves:0, features:{}, save(){this.saves++;}, notice(){}, feature(name,fallback=true){return this.features[name]??fallback;} };
    mount(); select(0);
  }
  // A keypress-based game reproduces the native Crossword input boundary.
  document.addEventListener('keypress', event => {
    if (event.target.closest?.('input,textarea,[contenteditable]') || !/^[a-z]$/i.test(event.key) || event.ctrlKey || event.metaKey || event.altKey) return;
    writes++; value(selected).textContent=event.key.toUpperCase(); select((selected+1)%9);
  });
  await run('Ctrl toggles candidates and two letters stay in the same empty square', () => {
    setup(); key('Control'); key('a'); key('b');
    assert(button('toggle').getAttribute('aria-pressed')==='true', 'Ctrl did not activate notes');
    assert(marks('0:0')?.textContent==='AB' && selected===0 && !value(0).textContent && writes===0, 'candidates entered a native answer or advanced the square');
    assert(ctx.saves===2 && ctx.state.crossword.entries[0].note==='Keep me', 'marks were not saved or replaced old notes');
    key('a'); assert(marks('0:0').textContent==='B', 'typing an existing candidate did not remove it');
  });
  await run('Undo, erase, Clear all and keyboard undo preserve native answers', () => {
    setup(); button('toggle').click(); key('a'); key('b'); select(1); key('c'); value(5).textContent='X'; adapter.refresh();
    button('erase').click(); assert(!marks('0:1') && marks('0:0').textContent==='AB', 'erase changed other squares');
    button('undo').click(); assert(marks('0:1').textContent==='C', 'erase could not be undone');
    button('clear').click(); assert(!marks('0:0') && !marks('0:1'), 'clear left candidates behind');
    key('z', cells[1], {ctrlKey:true}); assert(marks('0:0').textContent==='AB' && marks('0:1').textContent==='C', 'Ctrl+Z did not restore all marks');
    key('Backspace'); assert(!marks('0:1') && value(5).textContent==='X', 'Backspace affected a native answer');
  });
  await run('filled and blocked squares cannot receive candidate input', () => {
    setup(); button('toggle').click(); value(0).textContent='Q'; key('a'); key('Delete');
    assert(value(0).textContent==='Q' && !ctx.state.crossword.candidates && writes===0, 'candidate mode changed a filled answer');
    cells[0].setAttribute('data-block','true'); adapter.refresh(); key('b',document.body);
    assert(!ctx.state.crossword.candidates, 'blocked square received notes');
  });
  await run('leaving candidate mode restores normal entry and hides marks under answers', () => {
    setup(); button('toggle').click(); key('a'); key('b'); key('Escape'); key('c'); adapter.refresh();
    assert(value(0).textContent==='C' && writes===1 && !marks('0:0'), 'native entry did not resume or candidates covered an answer');
    value(0).textContent=''; adapter.refresh(); assert(marks('0:0').textContent==='AB', 'clearing an answer lost saved candidates');
  });
  await run('saved candidates survive remount and disabling the feature preserves them', () => {
    setup(); key('Control'); key('a'); key('b'); const saved=JSON.parse(JSON.stringify(ctx.state)); setup(saved);
    assert(marks('0:0').textContent==='AB' && button('toggle').getAttribute('aria-pressed')==='false', 'remount lost notes or left entry mode on');
    ctx.features.candidateNotes=false; adapter.refresh(); assert(overlay().hidden && button('toggle').hidden, 'disabled candidates stayed visible');
    key('Control'); assert(button('toggle').getAttribute('aria-pressed')==='false', 'disabled notes could be activated');
    ctx.features.candidateNotes=true; ctx.features.letterCycle=false; adapter.refresh(); key('Control');
    assert(marks('0:0').textContent==='AB' && !button('toggle').hidden && button('toggle').getAttribute('aria-pressed')==='true', 'notes depend on A–Z being enabled');
  });
  await run('notes stay behind native Help, Pause and Settings and leave text fields alone', () => {
    setup(); key('Control'); key('a');
    for (const title of ['Help','Pause','Settings']) {
      const modal=el('div',{role:'dialog',className:'modal'},el('h2',{textContent:title}),el('input'));
      document.body.append(modal); adapter.refresh(); key('x',modal.querySelector('input'));
      assert(overlay().hidden && getComputedStyle(overlay()).display==='none' && ctx.state.crossword.candidates['0:0'].join('')==='A', `${title} was covered or edited notes`);
      const rect=cells[0].getBoundingClientRect(); assert(modal.contains(document.elementFromPoint(rect.left+20,rect.top+20)), 'board stacking eclipsed a native modal');
      const tool=button('toggle').getBoundingClientRect(); assert(modal.contains(document.elementFromPoint(tool.left+10,tool.top+10)), 'candidate toolbar appeared above a native modal');
      modal.remove(); adapter.refresh();
    }
    const input=el('textarea'), editor=el('div',{'contenteditable':''},el('span',{textContent:'Edit here'})); fixture.append(input,editor); key('b',input); key('c',editor.firstElementChild);
    assert(marks('0:0').textContent==='A', 'text field typing changed candidates');
    cells[0].parentElement.style.filter='blur(3px)'; adapter.refresh(); assert(overlay().hidden, 'blurred board exposed notes');
  });
  await run('overlay matches squares under resizing and keeps the native hit target', () => {
    setup(); key('Control'); key('a'); key('b');
    for (const scale of [1,.8,1.2]) {
      fixture.style.transform=`scale(${scale})`; fixture.style.transformOrigin='top left'; window.dispatchEvent(new Event('resize'));
      const actual=marks('0:0').getBoundingClientRect(), expected=cells[0].getBoundingClientRect();
      assert(Math.abs(actual.left-expected.left)<1 && Math.abs(actual.width-expected.width)<1 && Math.abs(actual.top-expected.top)<1, 'candidate overlay drifted away from the square');
      const hit=document.elementFromPoint(actual.left+actual.width/2, actual.top+actual.height/2);
      assert(cells[0].contains(hit), 'overlay intercepted selection');
    }
    fixture.style.transform='';
  });
  await run('starting A–Z leaves candidate mode and only writes native trial letters', async () => {
    setup(); key('Control'); key('a'); key('b');
    const cycle=document.querySelector('#margin-crossword-cycle').shadowRoot;
    cycle.querySelector('[data-cycle-action="toggle"]').click(); await wait(55); cycle.querySelector('[data-cycle-action="stop"]').click();
    assert(button('toggle').getAttribute('aria-pressed')==='false' && writes>=2 && ctx.state.crossword.candidates['0:0'].join('')==='AB', 'A–Z typed into candidate notes');
  });
  await run('native Pencil button returns candidate entry to the game', () => {
    setup(); key('Control'); key('a');
    const pencil=el('button',{'aria-label':'Pencil',textContent:'Pencil'}); fixture.append(pencil); pencil.click(); key('b');
    assert(button('toggle').getAttribute('aria-pressed')==='false' && value(0).textContent==='B' && ctx.state.crossword.candidates['0:0'].join('')==='A', 'Pencil left candidate input active');
  });
  await run('native SVG square annotations do not become entered letters', () => {
    setup(); adapter.destroy(); const ns='http://www.w3.org/2000/svg';
    const svg=(name,attrs)=>{const node=document.createElementNS(ns,name);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);return node;};
    const board=svg('svg',{width:240,height:240,'aria-hidden':true}), grid=svg('g',{'data-group':'cells'}); board.append(grid);
    cells=Array.from({length:9},(_,i)=>{const cell=svg('g',{'data-group':'cell','data-number':i+1,'aria-selected':i===0,tabindex:0}),x=i%3*80,y=Math.floor(i/3)*80;cell.append(svg('rect',{x,y,width:80,height:80,fill:'white',stroke:'#aaa'}),svg('text',{class:'crossword-letter',x:x+40,y:y+50}));cell.addEventListener('click',()=>select(i));return cell;});
    grid.append(...cells);fixture.replaceChildren(board);mount();key('Control');key('x');key('y');
    assert(marks('0:0').textContent==='XY' && !value(0).textContent && !board.contains(overlay()), 'SVG overlay was read as native content');
  });
  await run('destroy removes notes and restores the original board container styles', () => {
    setup(); key('Control'); key('a'); assert(fixture.style.isolation==='isolate', 'fixture lacks local stacking context');
    adapter.destroy(); adapter=null;
    assert(!overlay() && !fixture.style.isolation && !fixture.style.position, 'destroy left annotations or changed page styles');
  });
  adapter?.destroy(); document.querySelector('#results').textContent=results.join('\n');
  document.body.dataset.testStatus=results.some(line=>line.startsWith('FAIL'))?'failed':'passed';
})();
