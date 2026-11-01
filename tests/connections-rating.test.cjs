'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCompanionURL, parseRatingText, parseArticle, safeArticleMarkup, createReader, MAX_BYTES, TIMEOUT_MS } = require('../games/connections-rating.js');
const DATE = '2026-10-31';
const LINK = 'https://www.nytimes.com/2026/10/30/crosswords/connections-companion-1238.html';
const article = (content = '<p>2.3 out of 5</p>') => `<article><h1>Connections Companion No. 1,238</h1><h2>Today’s Difficulty</h2><p>Our testers rate each puzzle out of 5 according to its difficulty.</p>${content}<h2>Other section</h2><p>4.9 out of 5</p></article>`;
const node = (href, innerText = '') => ({ href, innerText, getClientRects: () => [{}], closest: () => null });
function env(overrides = {}) {
  return { location: { origin: 'https://www.nytimes.com', pathname: '/games/connections' }, document: { querySelectorAll: selector => selector.startsWith('a[') ? [node(LINK)] : [node(null, 'Puzzle #1238')] }, ...overrides };
}
function response(html = article(), options = {}) {
  const value = new Response(html, { status: options.status || 200, headers: { 'content-type': 'text/html; charset=utf-8', ...(options.headers || {}) } });
  Object.defineProperty(value, 'url', { value: options.url || LINK });
  if (options.redirected) Object.defineProperty(value, 'redirected', { value: true });
  return value;
}
test('only exact NYT Companion URLs for the current puzzle date/number are accepted', () => {
  assert.equal(validateCompanionURL(LINK, DATE, 1238).url, LINK);
  for (const value of [LINK.replace('nytimes.com', 'nytimes.com.evil.test'), LINK.replace('https:', 'http:'), LINK + '?url=https://evil.test', LINK + '#secret', LINK.replace('/2026/10/30/', '/2026/09/30/'), LINK.replace('1238', '1239'), 'https://name:secret@www.nytimes.com/2026/10/30/crosswords/connections-companion-1238.html', LINK.replace('connections-companion-1238.html', 'other-article.html')]) assert.equal(validateCompanionURL(value, DATE, 1238), null);
  assert.equal(validateCompanionURL(LINK, '2026-02-30'), null);
});
test('parser returns only numeric difficulty from the bounded published section', () => {
  assert.equal(parseArticle(article(), 1238), 2.3);
  assert.equal(parseArticle(article('<p><strong>Today&#8217;s difficulty is 3.2 out of 5.</strong></p>'), 1238), 3.2);
  assert.equal(parseRatingText('Our testers rate each puzzle out of 5 according to its difficulty.'), null);
  assert.equal(parseRatingText('6 out of 5'), null);
  assert.equal(parseRatingText('2.3 out of 5 and answer information'), null);
  assert.equal(parseArticle(article().replace('1,238', '1,237'), 1238), null);
});
test('scripts, hidden text, comments, other sections and conflicting numbers fail closed', () => {
  assert.equal(parseArticle(article('<script><p>4.8 out of 5</p></script><p hidden>4.9 out of 5</p><p style="display:none">3.9 out of 5</p><!-- <p>4.1 out of 5</p> -->'), 1238), null);
  assert.equal(parseArticle(article('<p>2.3 out of 5</p><p>3.4 out of 5</p>'), 1238), null);
  assert.equal(parseArticle(article().replace('Today’s Difficulty', 'Comments'), 1238), null);
  assert.equal(parseArticle(article('<p>One</p><p>Two</p><p>Three</p><p>2.3 out of 5</p>'), 1238), null);
  const safe = safeArticleMarkup('<img src="https://evil.test/pixel"><iframe src="https://evil.test"></iframe><p onclick="bad()" style="background:url(https://evil.test)">2.3 out of 5</p>');
  assert.equal(safe, '<p>2.3 out of 5</p>');
});
test('malformed markup, excessive depth and excessive tokens are bounded and rejected', () => {
  assert.equal(parseArticle('<'.repeat(MAX_BYTES), 1238), null);
  assert.equal(parseArticle(`<article>${'<div>'.repeat(130)}${article()}${'</div>'.repeat(130)}</article>`, 1238), null);
  assert.equal(parseArticle(`<article>${'<span></span>'.repeat(20001)}${article()}</article>`, 1238), null);
  assert.equal(parseArticle(article('<p><span hidden>2.3 out of 5</span></p>'), 1238), null);
  assert.equal(parseArticle(article('<p><span style="visibility:hidden">2.3 out of 5</span></p>'), 1238), null);
});
test('off, non-NYT, non-Connections, ambiguous links and unknown archives never fetch', async () => {
  let calls = 0; const fetch = async () => { calls++; return response(); };
  assert.equal((await createReader(env({ fetch })).read({ enabled: false, date: DATE })).status, 'disabled');
  for (const context of [env({ fetch, location: { origin: 'https://evil.test', pathname: '/games/connections' } }), env({ fetch, location: { origin: 'https://www.nytimes.com', pathname: '/games/wordle/index.html' } }), env({ fetch, document: { querySelectorAll: () => [] } }), env({ fetch, location: { origin: 'https://www.nytimes.com', pathname: '/games/connections/2026-10-31' }, document: { querySelectorAll: selector => selector.startsWith('a[') ? [node(LINK)] : [] } })]) assert.equal((await createReader(context).read({ enabled: true, date: DATE })).status, 'no-link');
  assert.equal(calls, 0);
});
test('request omits credentials, refuses redirects, stays same-origin and caches concurrent results', async () => {
  let calls = 0;
  const reader = createReader(env({ fetch: async (url, options) => { calls++; assert.equal(url, LINK); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.equal(options.mode, 'same-origin'); assert.equal(options.referrerPolicy, 'no-referrer'); assert(options.signal instanceof AbortSignal); return response(); } }));
  const values = await Promise.all([reader.read({ enabled: true, date: DATE }), reader.read({ enabled: true, date: DATE })]);
  assert.equal(calls, 1); assert.equal(values[0].rating, 2.3); assert.deepEqual(Object.keys(values[0]).sort(), ['articleDate', 'rating', 'status', 'url']);
  assert.equal(JSON.stringify(values[0]).includes('Other section'), false);
  await reader.read({ enabled: true, date: DATE }); assert.equal(calls, 1);
});
test('HTTP failure, unexpected URLs/types and oversized bodies are cached without parsing', async () => {
  for (const make of [() => response('', { status: 403 }), () => response('', { url: 'https://evil.test' }), () => response('', { redirected: true }), () => response('', { headers: { 'content-type': 'application/json' } }), () => response('', { headers: { 'content-length': String(MAX_BYTES + 1) } }), () => response('x'.repeat(MAX_BYTES + 1))]) {
    let calls = 0, parsed = false;
    const reader = createReader(env({ fetch: async () => { calls++; return make(); }, parseArticle: () => { parsed = true; return 2.3; } }));
    assert.equal((await reader.read({ enabled: true, date: DATE })).status, 'unavailable');
    await reader.read({ enabled: true, date: DATE }); assert.equal(calls, 1); assert.equal(parsed, false);
  }
});
test('eight-second timeout aborts and the failure is cached', async () => {
  let expire, requestedDelay, calls = 0;
  const reader = createReader(env({ setTimeout: (fn, delay) => { expire = fn; requestedDelay = delay; return 1; }, clearTimeout: () => {}, fetch: (url, options) => { calls++; return new Promise((resolve, reject) => { options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); }); } }));
  const pending = reader.read({ enabled: true, date: DATE }); expire();
  assert.equal(requestedDelay, TIMEOUT_MS); assert.equal(TIMEOUT_MS, 8000);
  assert.equal((await pending).status, 'unavailable');
  await reader.read({ enabled: true, date: DATE }); assert.equal(calls, 1);
});
