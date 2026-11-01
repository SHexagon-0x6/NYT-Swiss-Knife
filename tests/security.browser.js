(async()=>{
  const results=[];
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const assert=(value,message)=>{if(!value)throw new Error(message);};
  const run=async(name,fn)=>{try{await fn();results.push('PASS '+name);}catch(error){results.push('FAIL '+name+': '+error.message);}};
  await wait(200);
  await run('installed settings use a closed shadow even when the page claims preview mode',()=>{
    assert(Margin.extension===true,'fixture did not reach extension branch');
    assert(!securityFixture.context.isPreview,'page attribute enabled preview behavior');
    assert(document.getElementById('margin-host').shadowRoot===null,'page can inspect notebook shadow');
    assert(securityFixture.context.panel.getRootNode().mode==='closed','trusted adapter lost closed root');
    assert(!document.querySelector('#margin-host textarea'),'page can query notebook inputs');
  });
  await run('inline controls keep closed roots and isolate their keyboard events',()=>{
    const anchor=document.querySelector('[data-puzzle-id]');
    const slot=securityFixture.context.inline('security-test',anchor,'after');
    const host=document.querySelector('[data-margin-inline="security-test"]');
    assert(host.shadowRoot===null&&slot.getRootNode().mode==='closed','inline root is open');
    let leaked=false;const listener=()=>{leaked=true;};document.addEventListener('keydown',listener);
    const input=document.createElement('input');slot.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'a',bubbles:true,composed:true}));
    document.removeEventListener('keydown',listener);
    assert(!leaked,'inline key reached game document');
  });
  await run('programmatic scratch input is bounded before storage',async()=>{
    const input=securityFixture.context.panel.getRootNode().querySelector('textarea');
    input.value='x'.repeat(15000);input.dispatchEvent(new Event('input',{bubbles:true}));await wait(250);
    assert(input.value.length===10000,'input was not clamped');
    const saved=Object.values(securityFixture.records).find(record=>record?.game==='crossword');
    assert(saved?.state.scratch.length===10000,'oversized note reached storage');
  });
  await run('oversized UTF-8 payloads fail without writing a record',async()=>{
    let rejected=false;
    try{await Margin.storage.set('puzzle:oversized',{text:'🙂'.repeat(70000)});}catch(error){rejected=error instanceof RangeError;}
    assert(rejected,'large multibyte payload accepted');
    assert(!securityFixture.records['puzzle:oversized'],'rejected record was written');
  });
  await run('oversized keys fail without writing',async()=>{
    const before=Object.keys(securityFixture.records).length;let rejected=false;
    try{await Margin.storage.set('x'.repeat(1025),{});}catch(error){rejected=error instanceof RangeError;}
    assert(rejected&&Object.keys(securityFixture.records).length===before,'oversized key reached storage');
  });
  await run('page-controlled puzzle identity is bounded before saving',async()=>{
    document.querySelector('[data-puzzle-id]').setAttribute('data-puzzle-id','y'.repeat(20000));
    await wait(200);await securityFixture.context.save();
    assert(Object.keys(securityFixture.records).every(key=>key.length<=1024),'page identifier generated oversized key');
  });
  document.getElementById('results').textContent=results.join('\n');
  document.body.dataset.testStatus=results.some(value=>value.startsWith('FAIL'))?'failed':'passed';
})();
