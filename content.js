(() => {
  'use strict';
  if (document.getElementById('margin-host')) return;
  const {el, storage, GAMES, localDate, gameForPath, extension, latestPuzzleDate} = window.Margin;
  const isPreview = document.documentElement.dataset.marginPreview === 'true' && !extension;
  const shadowMode = extension ? 'closed' : 'open';
  const owned = '#margin-host,[data-margin-inline],[data-margin-overlay]';
  const cssURL = extension ? chrome.runtime.getURL('ui.css') : new URL('../ui.css', location.href).href;
  let current = null, adapter = null, context = null, disposed = false;
  let refreshTimer, noticeTimer, scratchTimer, initCounter = 0;
  const slots = new Map();
  const FEATURES = {
    connections:[['cornerLabels','Color corner marks'],['groupSubmit','Submit marked groups'],['attemptHistory','Previous tries'],['difficulty','Daily difficulty']],
    sudoku:[['coloredCandidates','Colored candidate']],
    wordle:[['letterProtection','Warn about conflicting letters'],['clickToEdit','Click to edit letters']],
    crossword:[['letterCycle','Try letters A–Z'],['candidateNotes','Notes']]
  };
  let preferenceWrites=Promise.resolve(), pendingWrites=0, geometryFrame=0;
  const slotGeometry=new ResizeObserver(()=>geometry());
  const host = el('div', {id:'margin-host'});
  host.dataset.marginOrder = '100';
  // Reuse this host in native Settings, or anchor its popover in the toolbar.
  Object.assign(host.style, {display:'none',position:'fixed',width:'154px',height:'30px',margin:'0',padding:'0',boxSizing:'border-box',zIndex:'2147483001',overflowAnchor:'none'});
  document.documentElement.append(host);
  const shadow = host.attachShadow({mode:shadowMode});
  function prepareRoot(root) {
    root.append(el('link', {rel:'stylesheet', href:cssURL}));
    for (const event of ['keydown','keyup','keypress','pointerdown','pointerup','click']) root.addEventListener(event, e=>e.stopPropagation());
  }
  prepareRoot(shadow);
  const panel = el('div', {className:'game-panel'});
  const featurePanel=el('fieldset',{className:'feature-controls'},el('legend',{textContent:'Tools for this game'}));
  let recordingShortcut = null, embeddedSettings = false;
  function shortcutRow(label, mode) {
    const button=el('button',{type:'button',className:'shortcut-key','aria-label':`Configure ${label} shortcut`,onClick:()=>{
      recordingShortcut={button,mode};renderFeatures();button.textContent='Press a key…';button.setAttribute('aria-pressed','true');
    }});
    const clear=el('button',{type:'button',className:'shortcut-clear','aria-label':`Disable ${label} shortcut`,textContent:'×',onClick:()=>setShortcut(context,current.game,{key:''},mode)});
    return el('div',{className:'shortcut-setting',...(mode?{'data-shortcut-mode':mode}:{})},el('span',{textContent:label}),el('div',{className:'row'},button,clear));
  }
  const shortcutControls=shortcutRow('Pencil mode');
  const candidateShortcutControls=shortcutRow('Notes','candidates');
  const coloredShortcutControls=shortcutRow('Colored candidate key','colored');
  function recordShortcut(event){
    if(!recordingShortcut||!context)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(event.key==='Escape'){recordingShortcut=null;renderFeatures();return;}
    if(event.repeat||event.isComposing)return;
    const modifier=['Shift','Control','Alt','Meta'].includes(event.key);
    if(modifier&&event.type==='keydown')return;
    if(!modifier&&event.type==='keyup')return;
    if(!modifier&&!/^(?:[a-z0-9]|F(?:[1-9]|1[0-2]))$/i.test(event.key))return;
    const {mode}=recordingShortcut;recordingShortcut=null;
    setShortcut(context,current.game,{key:modifier?event.key:event.key.toUpperCase(),code:event.code,
      ctrlKey:event.ctrlKey&&event.key!=='Control',altKey:event.altKey&&event.key!=='Alt',shiftKey:event.shiftKey&&event.key!=='Shift',metaKey:event.metaKey&&event.key!=='Meta'},mode);
  }
  window.addEventListener('keydown',recordShortcut,true);window.addEventListener('keyup',recordShortcut,true);
  const savedLabel = el('span', {className:'save-status', textContent:'Saved on this device'});
  const scratch = el('textarea', {className:'field', placeholder:'Your own notes…', maxLength:10000, 'aria-label':'Your puzzle notes', spellcheck:false});
  scratch.addEventListener('input', ()=>{
    if (!context) return;
    scratch.value = scratch.value.slice(0,10000);
    context.state.scratch = scratch.value;
    clearTimeout(scratchTimer);
    const active = context;
    scratchTimer = setTimeout(()=>active.save(),200);
  });
  const settingsLabel = el('span', {textContent:'Notes & settings'});
  const settingsIcon=document.createElementNS('http://www.w3.org/2000/svg','svg');
  settingsIcon.setAttribute('viewBox','0 0 24 24');
  settingsIcon.setAttribute('aria-hidden','true');
  settingsIcon.classList.add('settings-icon');
  const gear=document.createElementNS('http://www.w3.org/2000/svg','path');
  gear.setAttribute('d','M9.4 3h5.2l.5 2.4 1.5.9 2.4-.7 2.6 4.5-1.8 1.7v1.8l1.8 1.7-2.6 4.5-2.4-.7-1.5.9-.5 2.4H9.4l-.5-2.4-1.5-.9-2.4.7-2.6-4.5 1.8-1.7v-1.8l-1.8-1.7L5 5.6l2.4.7 1.5-.9L9.4 3Z');
  const hole=document.createElementNS('http://www.w3.org/2000/svg','circle');
  hole.setAttribute('cx','12');hole.setAttribute('cy','12.7');hole.setAttribute('r','3.2');
  settingsIcon.append(gear,hole);
  const scratchLabel=el('label', {className:'notes'}, el('span',{className:'section-label',textContent:'Your notes'}),scratch);
  const settingsTitle=el('strong',{textContent:'Notes & settings'});
  const settingsClose=el('button',{type:'button',className:'settings-close','aria-label':'Close notes and settings',textContent:'×',onClick:()=>closeSettings(true)});
  const settingsContent=el('div', {className:'settings-content',role:'region','aria-label':'Puzzle tools and settings'},
    el('div',{className:'settings-heading'},settingsTitle,settingsClose),
    featurePanel,shortcutControls,candidateShortcutControls,coloredShortcutControls,panel,scratchLabel,el('div',{className:'settings-footer'},savedLabel));
  const settingsTrigger=el('summary', {}, settingsIcon,settingsLabel);
  const settings = el('details', {className:'game-settings'},
    settingsTrigger,settingsContent);
  const toast = el('div', {className:'notice',role:'status','aria-live':'polite',hidden:true});
  shadow.append(settings,toast);
  function closeSettings(focus=false){
    settings.open=false;
    if(focus)settings.querySelector('summary').focus({preventScroll:true});
  }
  settings.addEventListener('toggle',()=>{placeSettings();});
  function outsidePointer(event){if(!embeddedSettings&&settings.open&&!event.composedPath().includes(host))closeSettings();}
  function escapeSettings(event){
    if(event.key!=='Escape'||!settings.open)return;
    if(embeddedSettings){
      const dialog=host.closest('dialog,[role="dialog"],[data-native-settings]');
      const close=[...dialog?.querySelectorAll('button')||[]].find(node=>!node.closest(owned)&&/^close$/i.test(node.getAttribute('aria-label')||node.textContent.trim()));
      if(close){event.preventDefault();event.stopImmediatePropagation();close.click();nativeControl(/\bsettings\b/i)?.focus({preventScroll:true});}
    }else{event.preventDefault();event.stopImmediatePropagation();closeSettings(true);}
  }
  window.addEventListener('pointerdown',outsidePointer,true);
  window.addEventListener('keydown',escapeSettings,true);
  function notice(message) {
    toast.textContent=message; toast.hidden=false;
    clearTimeout(noticeTimer); noticeTimer=setTimeout(()=>toast.hidden=true,4500);
  }
  function isOwned(node) { return node?.nodeType===1 && (node.id==='margin-host' || node.hasAttribute('data-margin-inline')); }
  function place(node, anchor, position='after') {
    if (!anchor?.isConnected || anchor.closest?.(owned) || anchor===node || node.contains(anchor)) return false;
    const order=Number(node.dataset.marginOrder)||10;
    if (position==='append' || position==='prepend') {
      if (node.parentNode!==anchor) position==='append'?anchor.append(node):anchor.prepend(node);
      return true;
    }
    let before;
    const parent=anchor.parentNode;
    if (position==='before') {
      before=anchor;
      while (isOwned(before.previousSibling) && before.previousSibling!==node && Number(before.previousSibling.dataset.marginOrder)>order) before=before.previousSibling;
    } else {
      let previous=anchor;
      while (isOwned(previous.nextSibling) && previous.nextSibling!==node && Number(previous.nextSibling.dataset.marginOrder)<=order) previous=previous.nextSibling;
      before=previous.nextSibling;
    }
    if (before!==node && (node.parentNode!==parent || node.nextSibling!==before)) parent.insertBefore(node,before);
    return true;
  }
  function theme(node, anchor) {
    let bg=null;
    for (let parent=anchor; parent && parent.nodeType===1; parent=parent.parentElement) {
      const color=getComputedStyle(parent).backgroundColor;
      if (color && color!=='transparent' && !/rgba\([^)]*,\s*0\s*\)/.test(color)) {bg=color;break;}
    }
    const rgb=bg?.match(/[\d.]+/g)?.slice(0,3).map(Number);
    const dark=rgb && rgb.reduce((sum,v)=>sum+v,0)<300;
    const values=dark?{'--ink':'#f8f8f8','--muted':'#aaa','--line':'#494a4b','--paper':'#121213','--surface':'#272729'}:{'--ink':'#121212','--muted':'#666','--line':'#d3d6da','--paper':'#fff','--surface':'#f6f6f6'};
    for (const [key,value] of Object.entries(values)) if (node.style.getPropertyValue(key)!==value) node.style.setProperty(key,value);
  }
  function matchNativeStyle(node, control, panel=null) {
    if(!control)return;
    const rect=control.getBoundingClientRect();
    const icon=control.querySelector('svg,img,i,[class*="icon"],[class*="Icon"]');
    const iconRect=icon?.getBoundingClientRect();
    const row=panel&&[...panel.querySelectorAll('label,p,span,div,strong,h3')].find(n=>
      visible(n)&&!n.closest(`${owned},button,a,h1,h2,h4,[aria-hidden="true"]`)&&
      [...n.childNodes].some(child=>child.nodeType===Node.TEXT_NODE&&child.textContent.trim())&&parseFloat(getComputedStyle(n).fontSize)>=14);
    const textStyle=getComputedStyle(row||control);
    const inset=panel&&row?Math.max(0,Math.min(80,row.getBoundingClientRect().left-node.getBoundingClientRect().left)):0;
    const values={
      '--settings-inset':`${inset}px`,
      '--tool-font':textStyle.fontFamily,
      '--tool-size':`${Math.max(14,parseFloat(textStyle.fontSize)||16)}px`,
      '--tool-weight':textStyle.fontWeight,
      '--toolbar-width':`${Math.max(40,Math.min(64,rect.width||48))}px`,
      '--toolbar-height':`${Math.max(40,Math.min(56,rect.height||48))}px`,
      '--toolbar-icon-size':`${Math.max(24,Math.min(32,iconRect?.height||28))}px`
    };
    for(const [key,value]of Object.entries(values))if(node.style.getPropertyValue(key)!==value)node.style.setProperty(key,value);
  }
  function inline(name, anchor, position='after', options={}) {
    let slot=slots.get(name);
    if (!slot) {
      const node=el('div', {'data-margin-inline':name});
      node.dataset.marginOrder=String(options.order ?? 10);
      Object.assign(node.style,{display:'block',width:'100%',maxWidth:'640px',margin:'8px auto',flex:'0 0 auto',boxSizing:'border-box'});
      const root=node.attachShadow({mode:shadowMode}); prepareRoot(root);
      const container=el('div',{className:'inline-root'}); root.append(container);
      slot={node,root,container};slots.set(name,slot);
      slotGeometry.observe(node);
    }
    if (options.width==='auto') slot.node.style.width='auto';
    else if (typeof options.width==='number') slot.node.style.maxWidth=`${Math.max(0,options.width)}px`;
    if (options.display==='inline-block') slot.node.style.display='inline-block';
    if (place(slot.node,anchor,position)) {
      slot.anchor=anchor;
      theme(slot.node,anchor);
      if (!options.width) {
        const width=anchor.getBoundingClientRect().width;
        slot.node.style.maxWidth=`${Math.min(640,Math.max(280,Math.round(width)))}px`;
      }
    }
    return slot.container;
  }
  function clearSlots() {slotGeometry.disconnect();for (const slot of slots.values()) slot.node.remove(); slots.clear();}
  function visible(node) {return node?.getClientRects().length && getComputedStyle(node).visibility!=='hidden';}
  function findAnchor(game) {
    const preview=document.querySelector(`[data-margin-game="${game}"]`);
    if (visible(preview)) return preview;
    if (game==='connections') {
      const submit=[...document.querySelectorAll('button')].find(node=>!node.closest(owned)&&visible(node)&&/^submit$/i.test(node.textContent.trim()));
      return submit?.parentElement || document.querySelector('[data-testid="connections-board"]');
    }
    if (game==='sudoku') return document.querySelector('.su-game,.su-keyboard,.su-board');
    if (game==='wordle') return document.querySelector('[class*="Board-module_board__"],game-app') || document.querySelector('[class*="Keyboard-module_keyboard__"],game-keyboard,[data-testid="keyboard"]');
    if (game==='crossword') return document.querySelector('.xwd__layout,[data-testid="crossword-board"]') || document.querySelector('svg [data-group="cells"]')?.closest('svg') || document.querySelector('main');
    return null;
  }
  function nativeControl(pattern){
    return [...document.querySelectorAll('button,[role="button"],summary')].find(node=>visible(node)&&!node.closest(owned)&&
      pattern.test([node.getAttribute('aria-label'),node.getAttribute('title'),node.getAttribute('data-testid'),node.textContent.trim()].filter(Boolean).join(' ')));
  }
  function nativeSettingsPanel(){
    const candidates=[...document.querySelectorAll('dialog,[role="dialog"],[aria-modal="true"],[data-native-settings],[class*="Settings-module"],[class*="SettingsModal"]')].filter(node=>visible(node)&&!node.closest(owned));
    const dialog=candidates.find(node=>node.hasAttribute('data-native-settings')||[...node.querySelectorAll('h1,h2,h3,[role="heading"]')].some(heading=>/^(?:puzzle )?settings$/i.test(heading.textContent.trim())));
    if(!dialog)return null;
    return dialog.querySelector('.xwd__modal--content,[data-settings-content],[class*="Settings-module_settings"],[class*="Modal-module_content"]')||dialog;
  }
  function toolbar(name,anchor,position='after'){
    if(!anchor)return null;
    const control=anchor;
    anchor=anchor.closest('li,[class*="Popover-module_popover__trigger"],[class*="Dropdown-module_dropdown__container"]')||anchor;
    const destination=inline(name,anchor,position,{width:'auto',display:'inline-block'});
    const node=destination.getRootNode().host;
    matchNativeStyle(node,control);
    Object.assign(node.style,{width:'auto',maxWidth:'none',margin:'0 4px',flex:'0 0 auto',verticalAlign:'middle'});
    return destination;
  }
  function placeSettings() {
    if (!current?.game || !context) return;
    const nativeButton=nativeControl(/(?:^|\b)(?:puzzle )?settings(?:\b|$)/i);
    const nativePanel=nativeSettingsPanel();
    if(nativePanel){
      embeddedSettings=true;
      if(host.parentNode!==nativePanel)nativePanel.append(host);
      settings.classList.add('native-settings');settings.open=true;settingsTrigger.hidden=true;settingsClose.hidden=true;
      settingsTitle.textContent='NYT Games Swiss Knife';
      Object.assign(host.style,{position:'relative',display:'block',width:'100%',height:'auto',left:'auto',top:'auto',margin:'16px 0 0',zIndex:'auto'});
      settingsContent.removeAttribute('style');theme(host,nativePanel);matchNativeStyle(host,nativeButton||nativePanel,nativePanel);return;
    }
    embeddedSettings=false;settings.classList.remove('native-settings');settingsTrigger.hidden=false;settingsClose.hidden=false;
    settingsTitle.textContent=`${GAMES[current.game].name} tools`;
    if(nativeButton){
      settings.open=false;host.style.display='none';
      if(host.parentNode!==document.documentElement)document.documentElement.append(host);
      return;
    }
    // Games without their own settings button get one inside the native toolbar.
    const control=current.game==='crossword'?nativeControl(/^Rebus(?: |$)/i):
      nativeControl(/^(?:How to Play|Help|Statistics|Stats|Hint)(?: |$)/i);
    const anchor=control?.closest('li,[class*="Popover-module_popover__trigger"],[class*="Dropdown-module_dropdown__container"]')||control;
    if(anchor?.parentElement){
      place(host,anchor,'after');
      matchNativeStyle(host,control);
      Object.assign(host.style,{position:'relative',display:'inline-block',width:'var(--toolbar-width,48px)',height:'var(--toolbar-height,48px)',margin:'0',left:'auto',top:'auto',flex:'0 0 auto',verticalAlign:'middle',zIndex:'2147483001'});
      theme(host,anchor);
    }else{
      // Local demos and unfamiliar layouts use a row above their visible board.
      const board=findAnchor(current.game);
      if(!visible(board)){host.style.display='none';return;}
      if(host.parentNode!==board.parentNode||host.nextSibling!==board)board.before(host);
      Object.assign(host.style,{position:'relative',display:'block',width:'36px',height:'36px',margin:'4px 0',left:'auto',top:'auto',zIndex:'2147483001'});theme(host,board);
    }
    const rect=host.getBoundingClientRect(),width=Math.min(320,innerWidth-24);
    Object.assign(settingsContent.style,{position:'fixed',width:`${width}px`,maxHeight:`${Math.max(120,innerHeight-24)}px`,left:`${Math.max(12,Math.min(rect.left,innerWidth-width-12))}px`,top:`${Math.max(12,Math.min(rect.bottom+4,innerHeight-220))}px`,bottom:'auto'});
    if(settings.open)settingsContent.style.top=`${Math.max(12,Math.min(rect.bottom+4,innerHeight-settingsContent.getBoundingClientRect().height-12))}px`;
  }
  function reveal(element) {
    if (element && element.getRootNode()!==shadow)return;
    settings.open=true;placeSettings();
  }
  function geometry(){if(!geometryFrame)geometryFrame=requestAnimationFrame(()=>{geometryFrame=0;placeSettings();});}
  window.addEventListener('scroll',geometry,{capture:true,passive:true});
  window.addEventListener('resize',geometry);
  function renderFeatures(){
    if(!context)return;
    if(featurePanel.dataset.game!==current.game){
      featurePanel.dataset.game=current.game;
      featurePanel.replaceChildren(el('legend',{textContent:`${GAMES[current.game].name} tools`}));
      const features=FEATURES[current.game];
      for(const [name,label] of features){
        featurePanel.append(el('label',{className:'feature-toggle'},el('input',{type:'checkbox','data-feature':name,checked:context.feature(name),onChange:event=>context.setFeature(name,event.target.checked)}),el('span',{textContent:label})));
      }
    }
    for(const input of featurePanel.querySelectorAll('[data-feature]'))input.checked=context.feature(input.dataset.feature);
    scratchLabel.hidden=true;
    shortcutControls.hidden=current.game!=='crossword';
    candidateShortcutControls.hidden=current.game!=='crossword';
    coloredShortcutControls.hidden=current.game!=='sudoku'||!context.feature('coloredCandidates');
    for(const row of [shortcutControls,candidateShortcutControls,coloredShortcutControls]){
      const mode=row.dataset.shortcutMode,button=row.querySelector('.shortcut-key');
      if(recordingShortcut?.button===button)continue;
      button.textContent=window.Margin.shortcutLabel(shortcutOptions(context,mode&&mode!=='candidates'?'sudoku':'crossword',mode));
      button.setAttribute('aria-pressed','false');
    }
  }
  // Sudoku has one shortcut: Colored candidate. Older Play, Snyder and Center keys are ignored.
  const sudokuShortcut=saved=>typeof saved?.colored?.key==='string'?saved.colored:{key:'B'};
  function shortcutOptions(ctx,game,mode){
    const saved=ctx?.settings.shortcuts?.[game];
    if(game==='sudoku')return sudokuShortcut(saved);
    if(mode==='candidates')return typeof saved?.candidates?.key==='string'?saved.candidates:sameShortcut(saved||{key:'Shift'},{key:'Control'})?{key:''}:{key:'Control'};
    return saved&&typeof saved.key==='string'?saved:{key:'Shift'};
  }
  function sameShortcut(a,b){
    return !!a.key&&a.key.toUpperCase()===b.key.toUpperCase()&&['ctrlKey','altKey','shiftKey','metaKey'].every(key=>!!a[key]===!!b[key]);
  }
  function setShortcut(ctx,game,value,mode){
    if(!ctx||!['sudoku','crossword'].includes(game)||game==='sudoku'&&mode!=='colored')return;
    recordingShortcut=null;
    const update=saved=>{
      if(game==='crossword'){
        const pencil=saved&&typeof saved.key==='string'?saved:{key:'Shift'};
        if(mode==='candidates')return {...pencil,candidates:value,...(sameShortcut(pencil,value)?{key:''}:{})};
        const candidates=typeof saved?.candidates?.key==='string'?saved.candidates:sameShortcut(pencil,{key:'Control'})?{key:''}:{key:'Control'};
        return {...value,candidates:sameShortcut(candidates,value)?{key:''}:candidates};
      }
      return {colored:value};
    };
    ctx.settings={...ctx.settings,shortcuts:{...ctx.settings.shortcuts,[game]:update(ctx.settings.shortcuts?.[game])}};
    if(ctx===context){renderFeatures();adapter?.refresh?.();}
    pendingWrites++;
    preferenceWrites=preferenceWrites.catch(()=>{}).then(async()=>{
      const latest=await storage.get('settings')||{};
      latest.shortcuts={...latest.shortcuts,[game]:update(latest.shortcuts?.[game])};
      await storage.set('settings',latest);
    }).catch(()=>notice('Could not save that shortcut. Please try again.')).finally(()=>{pendingWrites--;});
    return preferenceWrites;
  }
  function setFeature(ctx,game,name,enabled){
    if(![...FEATURES[game].map(item=>item[0]),'scratchpad'].includes(name))return;
    ctx.settings={...ctx.settings,features:{...ctx.settings.features,[game]:{...ctx.settings.features?.[game],[name]:!!enabled}}};
    if(ctx===context){renderFeatures();adapter?.refresh?.();placeSettings();}
    pendingWrites++;
    preferenceWrites=preferenceWrites.catch(()=>{}).then(async()=>{
      const latest=await storage.get('settings')||{};
      latest.features={...latest.features,[game]:{...latest.features?.[game],[name]:!!enabled}};
      await storage.set('settings',latest);
    }).catch(()=>notice('Could not save that preference. Please try again.')).finally(()=>{pendingWrites--;});
    return preferenceWrites;
  }
  function setOption(ctx,game,name,value){
    ctx.settings={...ctx.settings,options:{...ctx.settings.options,[game]:{...ctx.settings.options?.[game],[name]:value}}};
    if(ctx===context){renderFeatures();adapter?.refresh?.();}
    pendingWrites++;
    preferenceWrites=preferenceWrites.catch(()=>{}).then(async()=>{
      const latest=await storage.get('settings')||{};
      latest.options={...latest.options,[game]:{...latest.options?.[game],[name]:value}};
      await storage.set('settings',latest);
    }).catch(()=>notice('Could not save that preference. Please try again.')).finally(()=>{pendingWrites--;});
    return preferenceWrites;
  }
  // Sudoku and crosswords publish the next puzzle the evening before at the same
  // address. File notes under the puzzle that was current when the page opened.
  const keyDates=new Map();
  function keyDate(game){
    if(!['sudoku','crossword'].includes(game))return localDate();
    const page=location.pathname+location.search;
    if(!keyDates.has(page))keyDates.set(page,latestPuzzleDate(game));
    return keyDates.get(page);
  }
  function identify() {
    const requested=new URL(location.href).searchParams.get('game');
    const game=isPreview?(requested==='bonuscrossword'?'crossword':requested||'connections'):gameForPath(location.pathname);
    const visibleId=document.querySelector('[data-puzzle-id]')?.getAttribute('data-puzzle-id')?.slice(0,80);
    const archive=location.pathname.match(/\d{4}[-/]\d{2}[-/]\d{2}/)?.[0];
    const params=new URL(location.href).searchParams;
    const variant=['date','puzzle','puzzleId','difficulty'].map(key=>`${key}=${(params.get(key)||'').slice(0,80)}`).join('&');
    return {game,key:`puzzle:${game}:${archive||keyDate(game)}:${location.pathname.slice(0,256)}:${visibleId||''}:${variant}`};
  }
  async function start() {
    clearTimeout(scratchTimer);
    const id=++initCounter,next=identify();
    const preferences=(await storage.get('settings'))||{};
    if (id!==initCounter||disposed) return;
    if (!next.game||!GAMES[next.game]||preferences.disabled?.includes(next.game)) {
      adapter?.destroy?.();clearSlots();adapter=null;context=null;current=next;host.style.display='none';return;
    }
    const record=await storage.get(next.key);
    if (id!==initCounter||disposed) return;
    adapter?.destroy?.();clearSlots();recordingShortcut=null;current=next;panel.replaceChildren();settings.open=false;
    const wordle=next.game==='wordle';
    const connections=next.game==='connections',compact=true;
    const title=compact?`${GAMES[next.game].name} settings`:'Notes & settings';
    settings.classList.toggle('wordle-settings',wordle);
    settings.classList.toggle('connections-settings',connections);
    settings.classList.toggle('compact-settings',compact);
    Object.assign(host.style,{width:compact?'36px':'154px',height:compact?'36px':'30px'});
    settingsLabel.textContent=title;
    settingsTitle.textContent=title;
    settingsTrigger.setAttribute('aria-label',title);
    settingsTrigger.title=compact?title:'';
    settingsClose.setAttribute('aria-label',compact?`Close ${title}`:'Close notes and settings');
    settings.setAttribute('aria-label',compact?title:`${GAMES[next.game].name} notes and settings`);
    const state=record?.state||{};
    const save=async()=>{
      savedLabel.textContent='Saving…';
      try {await storage.set(next.key,{updatedAt:Date.now(),game:next.game,state:structuredClone(state)});savedLabel.textContent='Saved on this device';}
      catch {savedLabel.textContent='Could not save';notice('Could not save these notes. Refresh the page if the extension was updated.');}
    };
    context={el,panel,state,save,settings:preferences,notice,isPreview,shadowMode,inline,toolbar,nativeControl,reveal};
    const active=context,game=next.game;
    context.feature=(name,fallback)=>{const value=active.settings?.features?.[game]?.[name],definition=FEATURES[game].find(item=>item[0]===name);return typeof value==='boolean'?value:definition?(definition[2]??true):(fallback??true);};
    context.setFeature=(name,enabled)=>setFeature(active,game,name,enabled);
    context.option=(name,fallback)=>active.settings?.options?.[game]?.[name]??fallback;
    context.setOption=(name,value)=>setOption(active,game,name,value);
    const shortcutFeature={candidates:'candidateNotes',colored:'coloredCandidates'};
    context.bindShortcut=(callback,mode)=>window.Margin.bindShortcut(callback,()=>({...shortcutOptions(active,game,mode),enabled:!!shortcutOptions(active,game,mode).key&&(!shortcutFeature[mode]||active.feature(shortcutFeature[mode]))}));
    context.shortcutLabel=mode=>window.Margin.shortcutLabel(shortcutOptions(active,game,mode));
    renderFeatures();
    scratch.value=state.scratch||'';
    adapter=window.MarginGames[next.game].mount(context);
    placeSettings();
  }
  function scheduleRefresh() {
    // Hydration, ads and animations can mutate the page continuously. Keep the
    // first scheduled refresh instead of postponing startup on every mutation.
    if(disposed||refreshTimer)return;
    refreshTimer=setTimeout(()=>{
      refreshTimer=null;
      const next=identify();
      if(next.key!==current?.key) start().catch(()=>notice('Refresh this page to reload the puzzle tools.'));
      else {adapter?.refresh?.();placeSettings();}
    },100);
  }
  const observer=new MutationObserver(records=>{
    if(records.some(record=>{
      const target=record.target.nodeType===1?record.target:record.target.parentElement;
      if(target?.closest(owned))return false;
      const changed=[...record.addedNodes,...record.removedNodes];
      if(record.type==='childList'&&changed.length&&changed.every(n=>n.nodeType===1&&(isOwned(n)||n.hasAttribute('data-margin-overlay'))))return false;
      return true;
    })){placeSettings();scheduleRefresh();}
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','data-state','data-animation','aria-pressed','data-selected','data-puzzle-id','open','hidden','aria-modal']});
  const interval=setInterval(scheduleRefresh,1500);
  if(extension)chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local')return;
    if(changes.settings){
      const next=changes.settings.newValue||{};
      if(!context||!!context.settings.disabled?.includes(current?.game)!==!!next.disabled?.includes(current?.game))start().catch(()=>notice('Refresh this page to reload the puzzle tools.'));
      // While this tab is still saving, its own newer values win over older echoes.
      else if(!pendingWrites){context.settings=next;renderFeatures();adapter?.refresh?.();placeSettings();}
    }else if(current&&changes[current.key]&&!changes[current.key].newValue)start().catch(()=>notice('Refresh this page to reload the puzzle tools.'));
  });
  window.addEventListener('pagehide',event=>{
    if(!event.persisted){disposed=true;clearInterval(interval);observer.disconnect();adapter?.destroy?.();clearSlots();clearTimeout(refreshTimer);clearTimeout(noticeTimer);clearTimeout(scratchTimer);cancelAnimationFrame(geometryFrame);window.removeEventListener('scroll',geometry,true);window.removeEventListener('resize',geometry);window.removeEventListener('pointerdown',outsidePointer,true);window.removeEventListener('keydown',escapeSettings,true);window.removeEventListener('keydown',recordShortcut,true);window.removeEventListener('keyup',recordShortcut,true);host.remove();}
  });
  storage.prune().catch(()=>{});
  start().catch(()=>notice('Refresh this page to load the puzzle tools.'));
})();
