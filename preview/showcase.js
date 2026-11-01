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
      case 'strands':{
        button('Draw').click();
        const nodes=[...document.querySelectorAll('[data-margin-letter]')];
        function draw(indices){indices.forEach((i,n)=>{const r=nodes[i].getBoundingClientRect();nodes[i].dispatchEvent(new PointerEvent(n?'pointermove':'pointerdown',{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2,pointerId:1,buttons:1}));});const r=nodes[indices.at(-1)].getBoundingClientRect();nodes[indices.at(-1)].dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2,pointerId:1}));}
        find('[aria-label="Use yellow highlights"]').click();draw([0,1,2,3,4,5]);find('[aria-label="Use blue highlights"]').click();draw([18,19,20,21,22,23]);break;
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
