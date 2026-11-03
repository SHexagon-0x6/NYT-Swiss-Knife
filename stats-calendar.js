/* The same compact calendar is used in the game popover and extension popup. */
(() => {
  'use strict';
  const S = globalThis.MarginStats;
  const colors = {green:'Fastest 25%',yellow:'Middle 50%',red:'Slowest 25%'};
  function node(tag,text,className) {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function mount(root, options = {}) {
    let puzzleDates = options.puzzleDates || {}, browsed = !!options.month;
    let data = S.normalize(options.data), game = options.game || 'sudoku-hard', month = options.month || (puzzleDates[game] || S.nytDate()).slice(0,7), selected = null, editingKey = '', busy = false;
    const card = node('div',null,'stats-calendar');
    const gameLabel = node('p',null,'stats-game');
    const heading = node('div',null,'calendar-heading'), title = node('h2'); title.id = 'month-title';
    const previous = node('button','‹','month-arrow'), next = node('button','›','month-arrow');
    previous.type = next.type = 'button'; previous.id = 'previous'; next.id = 'next';
    previous.setAttribute('aria-label','Previous month'); next.setAttribute('aria-label','Next month');
    heading.append(previous,title,next);
    function move(amount) {
      if (busy) return;
      browsed = true;
      const date = new Date(month+'-01T12:00:00'); date.setMonth(date.getMonth()+amount);
      month = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; selected = null; render();
    }
    previous.addEventListener('click',() => move(-1)); next.addEventListener('click',() => move(1));
    const weekdays = node('div',null,'weekdays'); weekdays.setAttribute('aria-hidden','true');
    for (const day of ['S','M','T','W','T','F','S']) weekdays.append(node('span',day));
    const grid = node('div',null,'calendar'); grid.id = 'calendar'; grid.setAttribute('aria-label','Puzzle dates');
    const detail = node('div',null,'day-detail'); detail.id = 'day-detail'; detail.hidden = true;
    const detailHeading = node('div',null,'day-detail-heading'), form = node('form',null,'day-editor');
    const timeLabel = node('label','Time (m:ss or h:mm:ss)'), input = node('input');
    input.type = 'text';input.placeholder = '12:16';input.maxLength = 12;input.setAttribute('aria-label','Recorded time');
    timeLabel.append(input);
    const actions = node('div',null,'day-editor-actions'), save = node('button','Save'), remove = node('button','Delete'), cancel = node('button','Cancel');
    save.type = 'submit';remove.type = cancel.type = 'button';remove.className = 'delete-day';
    const status = node('p',null,'day-editor-status');status.setAttribute('role','status');
    actions.append(save,remove,cancel);form.append(timeLabel,actions,status);detail.append(detailHeading,form);
    form.hidden = !options.onEdit;
    async function edit(seconds) {
      if (busy || !selected || !options.onEdit) return;
      busy = true;status.textContent = 'Saving…';input.disabled = save.disabled = remove.disabled = cancel.disabled = true;
      try {data = S.normalize(await options.onEdit({game,date:selected,seconds}));editingKey = '';status.textContent = seconds === null ? 'Time deleted' : 'Time saved';}
      catch (error) {status.textContent = error.message || 'Could not save. Try again.';}
      finally {busy = false;input.disabled = save.disabled = remove.disabled = cancel.disabled = false;render();}
    }
    form.addEventListener('submit',event => {
      event.preventDefault();const text = input.value.trim(), seconds = /^\d{1,4}:\d{2}(?::\d{2})?$/.test(text) && S.parseTime(text);
      if (!seconds) {status.textContent = 'Enter a time such as 12:16 or 1:02:03.';input.focus();return;}
      edit(seconds);
    });
    remove.addEventListener('click',() => edit(null));
    cancel.addEventListener('click',() => {selected = null;render();});
    const average = node('div',null,'average-row'), value = node('strong','—'); value.id = 'average';
    average.append(node('span','Overall average'),value);
    const legend = node('ul',null,'legend'); legend.setAttribute('aria-label','Speed colors');
    for (const [color,label] of [['green','Fast'],['yellow','Normal'],['red','Slow']]) {
      const item = node('li'); item.title = colors[color]; item.setAttribute('aria-label',colors[color]);item.append(node('i',null,color),node('span',label));legend.append(item);
    }
    card.append(gameLabel,heading,weekdays,grid,detail,average,legend); root.append(card);
    function renderDetail() {
      detail.hidden = !selected;
      if (!selected) {editingKey = '';return;}
      const record = data.records[game+':'+selected];
      const date = new Date(selected+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'});
      detailHeading.replaceChildren(node('span',date),node('strong',record ? S.formatTime(record) : 'No recorded time'));
      const key = game+':'+selected;
      if (key !== editingKey) {input.value = record ? S.formatTime(record) : '';editingKey = key;status.textContent = '';}
      save.textContent = record ? 'Save' : 'Add time';remove.hidden = !record;
    }
    function render() {
      const currentDate = options.markPuzzleDate ? puzzleDates[game] : null;
      const summary = S.summarize(data,game), byDay = new Map(summary.days.map(day => [day.date,day]));
      value.textContent = S.formatTime(summary.average);
      gameLabel.textContent = S.GAMES[game] || '';
      const start = new Date(month+'-01T12:00:00');
      title.textContent = start.toLocaleDateString(undefined,{month:'long',year:'numeric'});
      grid.replaceChildren();
      for (let i=0;i<start.getDay();i++) grid.append(node('span',null,'spacer'));
      const length = new Date(start.getFullYear(),start.getMonth()+1,0).getDate();
      for (let i=1;i<=length;i++) {
        const date = month+'-'+String(i).padStart(2,'0'), record = byDay.get(date);
        const button = node('button',i,`day ${record?.color || 'empty'}${date === currentDate ? ' today' : ''}`);
        button.type = 'button'; button.dataset.date = date;
        button.setAttribute('aria-label',`${new Date(date+'T12:00:00').toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'})} · ${record ? colors[record.color]+'. Click for time.' : 'No recorded time'}`);
        button.setAttribute('aria-pressed',String(date === selected));
        if (date === currentDate) button.setAttribute('aria-current','date');
        button.addEventListener('click',() => {
          if (busy) return;
          selected = date;
          grid.querySelectorAll('button').forEach(day => day.setAttribute('aria-pressed',String(day.dataset.date === date)));
          renderDetail();
        });
        grid.append(button);
      }
      renderDetail();
    }
    render();
    function alignMonth() {if (!browsed && S.validDate(puzzleDates[game])) month = puzzleDates[game].slice(0,7);}
    return {
      setData(next) {data = S.normalize(next);render();},
      setGame(next) {game = next;selected = null;alignMonth();render();},
      setPuzzleDates(next) {
        const valid = Object.fromEntries(Object.entries(next || {}).filter(([id,date]) => Object.hasOwn(S.GAMES,id) && S.validDate(date)));
        if (Object.keys(S.GAMES).every(id => valid[id] === puzzleDates[id])) return;
        puzzleDates = valid;alignMonth();render();
      },
      destroy() {card.remove();}
    };
  }
  globalThis.MarginStatsCalendar = {mount};
})();
