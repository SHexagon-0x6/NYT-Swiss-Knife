(function (global) {
  'use strict';
  const ORIGIN = 'https://www.nytimes.com';
  const MAX_BYTES = 1024 * 1024;
  const TIMEOUT_MS = 8000;
  const MAX_DEPTH = 128;
  const MAX_TOKENS = 20000;
  const MAX_TAG_LENGTH = 8192;
  const KEPT_TAGS = new Set(['article', 'main', 'section', 'div', 'h1', 'h2', 'h3', 'p', 'span', 'strong', 'b', 'em', 'i', 'br']);
  const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const RAW_TAGS = new Set(['script', 'style', 'iframe', 'textarea', 'title']);
  const BLOCKED_TAGS = new Set(['head', 'template', 'noscript', 'svg', 'object', 'canvas', 'math']);
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function localDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  function previousDate(value) { return new Date(new Date(`${value}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10); }
  function validateCompanionURL(value, date, puzzleNumber = null) {
    if (!validDate(date)) return null;
    let url;
    try { url = new URL(value, ORIGIN); } catch { return null; }
    if (url.origin !== ORIGIN || url.username || url.password || url.search || url.hash) return null;
    const match = url.pathname.match(/^\/(\d{4})\/(\d{2})\/(\d{2})\/crosswords\/connections-companion-([1-9]\d{0,5})\.html$/);
    if (!match) return null;
    const articleDate = match.slice(1, 4).join('-');
    // The Companion is published for the following day's puzzle in some time zones.
    if (!validDate(articleDate) || ![date, previousDate(date)].includes(articleDate)) return null;
    const number = Number(match[4]);
    if (puzzleNumber !== null && number !== puzzleNumber) return null;
    return { url: url.href, articleDate, puzzleNumber: number };
  }
  function parseRatingText(value) {
    const text = clean(value).replace(/[\u2018\u2019]/g, "'");
    const match = text.match(/^(?:Today's difficulty is(?: rated)?\s+)?(\d(?:\.\d{1,2})?)\s+out of\s+5\s*[.!]?$/i);
    if (!match) return null;
    const number = Number(match[1]);
    return Number.isFinite(number) && number >= 0 && number <= 5 ? number : null;
  }
  function articleTokens(html) {
    if (typeof html !== 'string' || html.length > MAX_BYTES) return null;
    const lower = html.toLowerCase(), output = [], stack = [];
    let offset = 0, count = 0, hiddenDepth = 0, blockedDepth = 0;
    function tagEnd(start) {
      let quote = '';
      const limit = Math.min(html.length, start + MAX_TAG_LENGTH);
      for (let index = start + 1; index < limit; index++) {
        const char = html[index];
        if (quote) { if (char === quote) quote = ''; }
        else if (char === '"' || char === "'") quote = char;
        else if (char === '>') return index + 1;
        else if (char === '<') return -1;
      }
      return -1;
    }
    function pop() {
      const node = stack.pop();
      if (node.hidden) hiddenDepth--;
      if (node.blocked) blockedDepth--;
      if (node.kept) output.push(`</${node.tag}>`);
    }
    // Each scan advances its cursor. Tag size, nesting, and token counts are
    // bounded before processing; malformed '<' runs cannot trigger backtracking.
    while (offset < html.length) {
      if (++count > MAX_TOKENS) return null;
      if (html[offset] !== '<') {
        const next = html.indexOf('<', offset);
        const end = next < 0 ? html.length : next;
        if (!hiddenDepth && !blockedDepth) output.push(html.slice(offset, end));
        offset = end; continue;
      }
      if (html.startsWith('<!--', offset)) {
        const end = html.indexOf('-->', offset + 4);
        if (end < 0) return null;
        offset = end + 3; continue;
      }
      const end = tagEnd(offset);
      if (end < 0) return null;
      const raw = html.slice(offset, end);
      offset = end;
      if (/^<!|^<\?/.test(raw)) continue;
      const match = raw.match(/^<\s*(\/?)\s*([a-z][a-z0-9:-]*)(?=\s|\/?>)/i);
      if (!match) return null;
      const closing = !!match[1], tag = match[2].toLowerCase();
      if (closing) {
        let index = stack.length - 1;
        while (index >= 0 && stack[index].tag !== tag) index--;
        if (index >= 0) while (stack.length > index) pop();
        continue;
      }
      if (RAW_TAGS.has(tag)) {
        // Raw text may contain '<' or '>' as data, so skip it without tokenizing
        // scripts, styles, embedded documents, or text-control contents.
        const needle = `</${tag}`;
        let close = lower.indexOf(needle, offset);
        while (close >= 0 && !/[\s>]/.test(lower[close + needle.length] || '')) close = lower.indexOf(needle, close + needle.length);
        if (close < 0) return null;
        const closeEnd = tagEnd(close);
        if (closeEnd < 0) return null;
        offset = closeEnd; continue;
      }
      const hidden = /\shidden(?:\s|=|>)/i.test(raw) || /\baria-hidden\s*=\s*["']?true/i.test(raw) || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(raw);
      const blocked = BLOCKED_TAGS.has(tag);
      const kept = KEPT_TAGS.has(tag) && !blockedDepth && !blocked;
      const isVoid = VOID_TAGS.has(tag) || /\/\s*>$/.test(raw);
      if (!isVoid && stack.length >= MAX_DEPTH) return null;
      if (kept && !(tag === 'br' && (hidden || hiddenDepth))) output.push(`<${tag}${hidden || hiddenDepth ? ' hidden' : ''}>`);
      if (isVoid && kept && tag !== 'br') output.push(`</${tag}>`);
      if (!isVoid) {
        stack.push({ tag, hidden, blocked, kept });
        if (hidden) hiddenDepth++;
        if (blocked) blockedDepth++;
      }
    }
    while (stack.length) pop();
    return output;
  }
  function safeArticleMarkup(html) {
    // Only inert structure and visible text survive. Nothing is inserted into
    // the DOM, and source attributes or resources are never retained.
    return articleTokens(html)?.join('') || '';
  }
  function parseArticle(html, expectedNumber) {
    const tokens = articleTokens(html);
    if (!tokens) return null;
    const decode = value => value.replace(/&(?:#(\d+)|#x([\da-f]+)|(rsquo|lsquo|apos|nbsp|amp|quot));/gi, (all, decimal, hex, name) => {
      if (name) return { rsquo: "'", lsquo: "'", apos: "'", nbsp: ' ', amp: '&', quot: '"' }[name.toLowerCase()];
      const number = parseInt(decimal || hex, decimal ? 10 : 16);
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '';
    });
    const blocks = [];
    let current = null, articleDepth = 0;
    // Pure text tokenization: no DOM construction, insertion, or resource loading.
    for (const token of tokens) {
      if (!token.startsWith('<')) { if (current) current.parts.push(token); continue; }
      const match = token.match(/^<(\/)?([a-z0-9]+)(?: hidden)?>$/);
      if (!match) continue;
      const [, closing, tag] = match;
      if (tag === 'br') { if (current) current.parts.push(' '); continue; }
      if (closing) {
        if (current?.tag === tag) { current.text = current.parts.join(''); delete current.parts; blocks.push(current); current = null; }
        if (tag === 'article') articleDepth--;
      } else {
        if (tag === 'article') articleDepth++;
        if (/^(h1|h2|h3|p)$/.test(tag)) current = { tag, parts: [], hidden: token.includes(' hidden'), article: articleDepth > 0 };
      }
    }
    const title = clean(decode(blocks.find(block => block.tag === 'h1' && !block.hidden)?.text || ''));
    const number = title.match(/^Connections Companion\s+(?:No\.?|#)\s*([\d,]+)\s*$/i);
    if (number ? Number(number[1].replace(/,/g, '')) !== expectedNumber : !/^(?:NYT )?Connections Answers for\b/i.test(title)) return null;
    let inDifficulty = false, paragraphs = 0;
    const ratings = [];
    for (const block of blocks) {
      if (!block.article || block.hidden) continue;
      const text = clean(decode(block.text)).replace(/[\u2018\u2019]/g, "'");
      if (/^h[23]$/.test(block.tag)) { inDifficulty = /^Today's Difficulty$/i.test(text); paragraphs = 0; }
      else if (inDifficulty && block.tag === 'p' && ++paragraphs <= 4) {
        const rating = parseRatingText(text);
        if (rating !== null) ratings.push(rating);
      }
    }
    return ratings.length && ratings.every(value => value === ratings[0]) ? ratings[0] : null;
  }
  function createReader(env = {}) {
    const document = env.document || global.document;
    const location = env.location || global.location;
    const fetch = env.fetch || global.fetch?.bind(global);
    const parse = env.parseArticle || parseArticle;
    const startTimer = env.setTimeout || global.setTimeout.bind(global);
    const stopTimer = env.clearTimeout || global.clearTimeout.bind(global);
    const cache = new Map();
    const result = (status, rating = null, link = null) => Object.freeze({ status, rating, url: link?.url || null, articleDate: link?.articleDate || null });
    function visible(node) {
      if (!node?.getClientRects().length || node.closest?.('[hidden],#margin-host,[data-margin-inline],[data-margin-overlay]')) return false;
      return !global.getComputedStyle || global.getComputedStyle(node).visibility !== 'hidden';
    }
    function discover(date, archive) {
      const numbers = new Set();
      for (const node of document.querySelectorAll('h1,h2,h3,[data-testid*="puzzle"],[data-testid*="Puzzle"]')) {
        if (!visible(node)) continue;
        const text = clean(node.innerText);
        const match = text.length < 100 && text.match(/^(?:Connections\s+)?(?:Puzzle\s*#?|No\.?\s*|#)\s*([\d,]+)$/i);
        if (match) numbers.add(Number(match[1].replace(/,/g, '')));
      }
      if (numbers.size > 1 || (archive && numbers.size !== 1)) return null;
      const puzzleNumber = numbers.size ? [...numbers][0] : null;
      const links = new Map();
      for (const node of document.querySelectorAll('a[href*="connections-companion-"]')) {
        if (!visible(node)) continue;
        const link = validateCompanionURL(node.href, date, puzzleNumber);
        if (link) links.set(link.url, link);
      }
      return links.size === 1 ? [...links.values()][0] : null;
    }
    async function request(link) {
      const controller = new AbortController();
      const timer = startTimer(() => controller.abort(), TIMEOUT_MS);
      let reader;
      try {
        const response = await fetch(link.url, { credentials: 'omit', redirect: 'error', mode: 'same-origin', referrerPolicy: 'no-referrer', signal: controller.signal });
        if (!response.ok || response.redirected || response.url !== link.url || !/^text\/html(?:;|$)/i.test(response.headers.get('content-type') || '')) return result('unavailable', null, link);
        const length = Number(response.headers.get('content-length'));
        if (length > MAX_BYTES || !response.body?.getReader) return result('unavailable', null, link);
        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let bytes = 0, html = '';
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > MAX_BYTES) { controller.abort(); return result('unavailable', null, link); }
          html += decoder.decode(chunk.value, { stream: true });
        }
        html += decoder.decode();
        const rating = parse(html, link.puzzleNumber);
        html = '';
        return rating === null ? result('unavailable', null, link) : result('ok', rating, link);
      } catch { return result('unavailable', null, link); }
      finally { stopTimer(timer); controller.abort(); if (reader) await reader.cancel().catch(() => {}); }
    }
    async function read(options = {}) {
      if (options.enabled !== true) return result('disabled');
      if (!document || !fetch || location?.origin !== ORIGIN || !/^\/games\/connections(?:\/|$)/.test(location.pathname)) return result('no-link');
      const archive = location.pathname.match(/\/(\d{4})[-/](\d{2})[-/](\d{2})(?:\/|$)/);
      const date = options.date || (archive ? archive.slice(1, 4).join('-') : localDate());
      if (!validDate(date)) return result('no-link');
      const link = discover(date, !!archive);
      if (!link) return result('no-link');
      const key = `${date}:${link.url}`;
      if (!cache.has(key)) {
        if (cache.size >= 64) cache.delete(cache.keys().next().value);
        cache.set(key, request(link));
      }
      return cache.get(key);
    }
    return Object.freeze({ read });
  }
  if (typeof module === 'object' && module.exports) module.exports = { validateCompanionURL, parseRatingText, safeArticleMarkup, parseArticle, createReader, MAX_BYTES, TIMEOUT_MS };
  else global.MarginConnectionsRating = createReader();
})(typeof window === 'object' ? window : globalThis);
