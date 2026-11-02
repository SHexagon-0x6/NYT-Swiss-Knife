/* Shared, deterministic statistics. No page or account data is read here. */
(() => {
  'use strict';
  const GAMES = {'sudoku-hard': 'Sudoku · Hard', 'crossword-daily': 'Daily Crossword'};
  const PREFIX = 'swiss:stats:2:', LEGACY_PREFIX = 'swiss:stats:1:', RESET = PREFIX+'reset', SYNC_BUDGET = 96*1024;
  // Reserved codes allow a conservative six-results-per-day capacity test.
  // Capture and the UI still support only Hard Sudoku and Daily Crossword.
  const CODES = {'sudoku-easy':'e','sudoku-medium':'m','sudoku-hard':'h','crossword-mini':'i','crossword-midi':'d','crossword-daily':'c'};
  const validDate = value => typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  function nytDate(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const part = name => parts.find(p => p.type === name).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  const secondsOf = value => Array.isArray(value) ? value[0] : value;
  function validRecord(key,value) {
    const [game,date] = key.split(':'), seconds = secondsOf(value);
    return Object.hasOwn(CODES,game) && validDate(date) && Number.isInteger(seconds) && seconds > 0 && seconds <= 604800 &&
      (!Array.isArray(value) || value.length === 2 && Number.isSafeInteger(value[1]) && value[1] > 0);
  }
  function normalize(data) {
    const resetAt = Number.isSafeInteger(data?.resetAt) && data.resetAt > 0 ? data.resetAt : 0;
    const records = {}, totals = {}, edits = {};
    for (const [key,value] of Object.entries(data?.records || {})) {
      if (!validRecord(key,value) || Array.isArray(value) && value[1] <= resetAt) continue;
      records[key] = secondsOf(value);
    }
    for (const [key,value] of Object.entries(data?.edits || {})) {
      if (!Array.isArray(value) || value.length !== 2 || !Number.isSafeInteger(value[1]) || value[1] <= resetAt || !Number.isInteger(value[0]) || value[0] < 0 || !validRecord(key,value[0] || 1)) continue;
      edits[key] = [...value];
      if (value[0]) records[key] = value[0]; else delete records[key];
    }
    for (const [key,seconds] of Object.entries(records)) {
      const game = key.split(':')[0];
      const total = totals[game] ||= {sum:0,count:0};total.sum += seconds;total.count++;
    }
    return {version:2,resetAt,records,totals,edits};
  }
  function merge(...sources) {
    const clean = sources.map(normalize), resetAt = Math.max(0,...clean.map(d => d.resetAt)), records = {}, edits = {};
    for (const source of clean) {
      // A clear starts a new generation. An offline copy cannot revive old days.
      if (source.resetAt !== resetAt) continue;
      for (const [key,seconds] of Object.entries(source.records)) {
        // Same-day offline conflicts converge on one faster result, never two days.
        records[key] = records[key] === undefined ? seconds : Math.min(records[key],seconds);
      }
      for (const [key,edit] of Object.entries(source.edits)) {
        const previous = edits[key];
        if (!previous || edit[1] > previous[1] || edit[1] === previous[1] && edit[0] < previous[0]) edits[key] = edit;
      }
    }
    return normalize({resetAt,records,edits});
  }
  function varintSize(value) {let size = 1;while (value >= 128) {value = Math.floor(value/128);size++;}return size;}
  function encodeYear(values) {
    let width = 20, smallest = Infinity;
    for (let bits=1;bits<=20;bits++) {
      const escape = 2**bits-1;
      const size = 1+Math.ceil(values.length*bits/8)+values.reduce((sum,value) => sum+(value >= escape ? varintSize(value) : 0),0);
      if (size < smallest) {width = bits;smallest = size;}
    }
    const escape = 2**width-1, bytes = [width], overflow = [];
    let buffer = 0, available = 0;
    for (const value of values) {
      buffer |= Math.min(value,escape) << available; available += width;
      while (available >= 8) {bytes.push(buffer & 255);buffer >>>= 8;available -= 8;}
      if (value >= escape) {
        let remaining = value;
        do {const part = remaining % 128;remaining = Math.floor(remaining/128);overflow.push(part+(remaining ? 128 : 0));} while (remaining);
      }
    }
    if (available) bytes.push(buffer & 255);
    return btoa(String.fromCharCode(...bytes,...overflow));
  }
  function decodeYear(text,length) {
    if (typeof text !== 'string' || text.length > 8000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw Error('Invalid calendar');
    const bytes = Uint8Array.from(atob(text),c => c.charCodeAt(0)), width = bytes[0];
    if (!(width >= 1 && width <= 20)) throw Error('Invalid bit width');
    let extra = 1+Math.ceil(length*width/8), position = 1, buffer = 0, available = 0;
    if (extra > bytes.length) throw Error('Truncated calendar');
    const escape = 2**width-1, values = [];
    for (let i=0;i<length;i++) {
      while (available < width) {buffer |= bytes[position++] << available;available += 8;}
      let value = buffer & escape;buffer >>>= width;available -= width;
      if (value === escape) {
        let count = 0, part, multiplier = 1;value = 0;
        do {if (extra >= bytes.length || count++ === 3) throw Error('Invalid duration');part = bytes[extra++];value += (part & 127)*multiplier;multiplier *= 128;} while (part & 128);
        if (value < escape) throw Error('Invalid escape');
      }
      if (value > 604800) throw Error('Invalid duration');values.push(value);
    }
    if (extra !== bytes.length) throw Error('Unexpected calendar data');
    return values;
  }
  const yearLength = year => (Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000;
  function pack(input) {
    const data = normalize(input), years = {}, result = {[RESET]:data.resetAt};
    for (const [key,seconds] of Object.entries(data.records)) {
      const [game,date] = key.split(':'), year = Number(date.slice(0,4)), bucket = PREFIX+CODES[game]+':'+year;
      const values = years[bucket] ||= {year,values:Array(yearLength(year)).fill(0)};
      values.values[(Date.parse(date)-Date.UTC(year,0,1))/86400000] = seconds;
    }
    for (const [key,{values}] of Object.entries(years).sort()) result[key] = [data.resetAt,encodeYear(values)];
    // Only manual corrections/deletions need revisions. Ordinary results keep
    // the compact yearly format. Numeric chunks stay below Chrome's item cap.
    const edits = Object.entries(data.edits).sort().map(([key,[seconds,stamp]]) => {
      const [game,date] = key.split(':');
      return [Object.keys(CODES).indexOf(game)*65536+(Date.parse(date)-Date.UTC(2000,0,1))/86400000,seconds,stamp];
    });
    for (let i=0;i<edits.length;i+=180) result[PREFIX+'edits:'+i/180] = [data.resetAt,edits.slice(i,i+180)];
    return result;
  }
  function unpack(items) {
    const sources = [{resetAt:items[RESET]}], legacy = {resetAt:items[LEGACY_PREFIX+'reset'],records:{}};
    for (const [key,bucket] of Object.entries(items)) {
      if (key.startsWith(LEGACY_PREFIX) && /^20\d{2}-\d{2}$/.test(key.slice(LEGACY_PREFIX.length)) && bucket && typeof bucket === 'object') {
        for (const [day,value] of Object.entries(bucket)) if (/^[sc]:\d{2}$/.test(day)) legacy.records[`${day[0] === 's' ? 'sudoku-hard' : 'crossword-daily'}:${key.slice(LEGACY_PREFIX.length)}-${day.slice(2)}`] = value;
      }
      if (!key.startsWith(PREFIX)) continue;
      if (/^edits:\d+$/.test(key.slice(PREFIX.length))) {
        if (!Array.isArray(bucket) || bucket.length !== 2 || !Number.isSafeInteger(bucket[0]) || bucket[0] < 0 || !Array.isArray(bucket[1]) || bucket[1].length > 180) throw Error('Invalid edits bucket');
        const edits = {};
        for (const entry of bucket[1]) {
          if (!Array.isArray(entry) || entry.length !== 3 || !entry.every(Number.isSafeInteger)) throw Error('Invalid edit');
          const [code,seconds,stamp] = entry, game = Object.keys(CODES)[Math.floor(code/65536)];
          if (!game || code < 0 || seconds < 0 || stamp <= 0 || code%65536 > 36524) throw Error('Invalid edit');
          const date = new Date(Date.UTC(2000,0,1)+(code%65536)*86400000).toISOString().slice(0,10), recordKey = `${game}:${date}`;
          if (!validRecord(recordKey,seconds || 1)) throw Error('Invalid edit');
          const previous = edits[recordKey];
          if (!previous || stamp > previous[1] || stamp === previous[1] && seconds < previous[0]) edits[recordKey] = [seconds,stamp];
        }
        sources.push({resetAt:bucket[0],edits});continue;
      }
      const match = key.slice(PREFIX.length).match(/^([emhidc]):(20\d{2})$/);
      if (!match) continue;
      if (!Array.isArray(bucket) || bucket.length !== 2 || !Number.isSafeInteger(bucket[0]) || bucket[0] < 0) throw Error('Invalid stats bucket');
      const year = Number(match[2]), game = Object.keys(CODES).find(game => CODES[game] === match[1]);
      const records = {};
      decodeYear(bucket[1],yearLength(year)).forEach((seconds,index) => {
        if (seconds) records[game+':'+new Date(Date.UTC(year,0,1)+index*86400000).toISOString().slice(0,10)] = seconds;
      });
      sources.push({resetAt:bucket[0],records});
    }
    return merge(legacy,...sources);
  }
  const syncBytes = items => Object.entries(items).reduce((sum,[key,value]) => sum+new TextEncoder().encode(key+JSON.stringify(value)).length,0);
  function parseTime(text) {
    const source = String(text || '').trim();
    const clock = source.match(/(?:^|[^\d:])(\d{1,4}:\d{2}(?::\d{2})?)(?![\d:])/);
    let seconds = null;
    if (clock) {
      const parts = clock[1].split(':').map(Number);
      if (parts.slice(1).some(p => p > 59)) return null;
      seconds = parts.reduce((sum,p) => sum * 60 + p, 0);
    } else {
      const units = [...source.matchAll(/(\d+)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi)];
      if (units.length) seconds = units.reduce((sum,m) => sum + Number(m[1]) * (/^h/i.test(m[2]) ? 3600 : /^m/i.test(m[2]) ? 60 : 1), 0);
    }
    return Number.isInteger(seconds) && seconds > 0 && seconds <= 604800 ? seconds : null;
  }
  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '—';
    const n = Math.round(seconds), s = String(n % 60).padStart(2,'0'), m = Math.floor(n / 60);
    return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2,'0')}:${s}` : `${m}:${s}`;
  }
  function summarize(data, game) {
    const normalized = normalize(data), total = normalized.totals[game];
    const days = Object.entries(normalized.records).filter(([key]) => key.startsWith(game+':'))
      .map(([key,value]) => ({date:key.split(':')[1],seconds:secondsOf(value)})).sort((a,b) => a.date.localeCompare(b.date));
    const times = days.map(d => d.seconds).sort((a,b) => a-b);
    const ranks = new Map();
    times.forEach((time,index) => {const rank = ranks.get(time);if (rank) rank.equal++;else ranks.set(time,{less:index,equal:1});});
    days.forEach(day => {
      const {less,equal} = ranks.get(day.seconds), percentile = (less + equal / 2) / times.length;
      day.color = percentile <= .25 ? 'green' : percentile >= .75 ? 'red' : 'yellow';
    });
    return {days,count:total?.count || 0,average:total?.count ? total.sum/total.count : null,best:times[0] ?? null};
  }
  const api = {GAMES,CODES,PREFIX,LEGACY_PREFIX,RESET,SYNC_BUDGET,syncBytes,validDate,validRecord,nytDate,normalize,merge,pack,unpack,parseTime,formatTime,summarize};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.MarginStats = api;
})();
