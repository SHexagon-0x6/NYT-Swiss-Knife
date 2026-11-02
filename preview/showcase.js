// Optional staging of ORIGINAL demonstration data, never loaded by the extension.
(() => {
  const params=new URL(location.href).searchParams;
  if(!params.has('showcase'))return;
  document.documentElement.classList.add('showcase');
  setTimeout(()=>{
    const root=document.getElementById('margin-host')?.shadowRoot;
    if(!root)return;
    const roots=()=>[root,...[...document.querySelectorAll('[data-margin-inline],#margin-connections-overlay')].map(node=>node.shadowRoot).filter(Boolean)];
    const find=selector=>roots().map(node=>node.querySelector(selector)).find(Boolean);
    const button=text=>roots().flatMap(node=>[...node.querySelectorAll('button')]).find(node=>node.textContent===text);
    switch(params.get('game')||'connections'){
      case 'connections':{
        for(const word of ['BARK','STEM','LEAF'])find(`[data-word="${word}"][data-corner="tl"]`).click();
        for(const word of ['NOTE','KEY','SCALE','REST'])find(`[data-word="${word}"][data-corner="bl"]`).click();
        break;
      }
      case 'sudoku':{
        button('Snyder').click();document.querySelector('[data-margin-cell="2"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));document.querySelector('[data-margin-cell="2"]').click();
        for(const n of [1,4])document.querySelector(`[data-margin-sudoku-digit="${n}"]`).click();
        button('Center').click();for(const n of [2,6])document.querySelector(`[data-margin-sudoku-digit="${n}"]`).click();
        break;
      }
      case 'wordle':{
        for(const key of 'STARE')document.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));
        document.querySelector('[data-margin-enter]').click();break;
      }
      case 'crossword':{
        const cell=document.querySelector('[data-margin-crossword-cell][data-row="1"][data-col="1"]');
        cell?.focus({preventScroll:true});
        break;
      }
    }
  },500);
})();
