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
test('off, non-NYT, non-Connections, missing daily links and invalid archive dates never fetch', async () => {
  let calls = 0; const fetch = async () => { calls++; return response(); };
  assert.equal((await createReader(env({ fetch })).read({ enabled: false, date: DATE })).status, 'disabled');
  for (const context of [env({ fetch, location: { origin: 'https://evil.test', pathname: '/games/connections' } }), env({ fetch, location: { origin: 'https://www.nytimes.com', pathname: '/games/wordle/index.html' } }), env({ fetch, document: { querySelectorAll: () => [] } }), ...['2026-02-30', '2023-06-11'].map(date => env({ fetch, location: { origin: 'https://www.nytimes.com', pathname: `/games/connections/${date}` }, document: { querySelectorAll: () => [] } }))]) assert.equal((await createReader(context).read({ enabled: true, date: DATE })).status, 'no-link');
  assert.equal(calls, 0);
});
const ARCHIVE_LINK = 'https://www.nytimes.com/2026/10/05/crosswords/connections-companion-1213.html';
const archiveEnv = overrides => env({ location: { origin: 'https://www.nytimes.com', pathname: '/games/connections/2026-10-06' }, ...overrides });
const archiveArticle = article().replace('1,238', '1,213');
test('October 6 archive uses its own date and number when the footer links to today', async () => {
  for (const headings of [[], [node(null, 'No. 1213')]]) {
    const calls = [];
    const reader = createReader(archiveEnv({
      document: { querySelectorAll: selector => selector.startsWith('a[') ? [node(LINK)] : headings },
      fetch: async (url, options) => { calls.push(url); assert.equal(options.credentials, 'omit'); return response(archiveArticle, { url }); }
    }));
    const result = await reader.read({ enabled: true, date: DATE });
    assert.deepEqual(result, { status: 'ok', rating: 2.3, url: ARCHIVE_LINK, articleDate: '2026-10-05' });
    await reader.read({ enabled: true });
    assert.deepEqual(calls, [ARCHIVE_LINK]);
  }
});
test('an archive without a visible Companion link tries at most the two publication dates', async () => {
  for (const available of [true, false]) {
    const calls = [], sameDay = ARCHIVE_LINK.replace('/10/05/', '/10/06/');
    const reader = createReader(archiveEnv({ document: { querySelectorAll: () => [] }, fetch: async url => {
      calls.push(url); return response(archiveArticle, { url, status: available && url === sameDay ? 200 : 404 });
    } }));
    const results = await Promise.all([reader.read({ enabled: true }), reader.read({ enabled: true })]);
    assert.equal(results[0].status, available ? 'ok' : 'unavailable');
    assert.equal(results[0].rating, available ? 2.3 : null);
    await reader.read({ enabled: true });
    assert.deepEqual(calls, [ARCHIVE_LINK, sameDay]);
  }
});
test('an archive prefers its visible matching Companion link', async () => {
  const sameDay = ARCHIVE_LINK.replace('/10/05/', '/10/06/'), calls = [];
  const reader = createReader(archiveEnv({
    document: { querySelectorAll: selector => selector.startsWith('a[') ? [node(sameDay), node(LINK)] : [] },
    fetch: async url => { calls.push(url); return response(archiveArticle, { url }); }
  }));
  assert.equal((await reader.read({ enabled: true })).rating, 2.3);
  assert.deepEqual(calls, [sameDay]);
});
test('archive numbers stay correct across leap days and daylight-saving changes', async () => {
  for (const [date, number] of [['2023-06-12', 1], ['2024-02-29', 263], ['2024-03-01', 264], ['2026-03-08', 1001], ['2026-03-09', 1002], ['2026-11-01', 1239]]) {
    const reader = createReader(archiveEnv({ location: { origin: 'https://www.nytimes.com', pathname: `/games/connections/${date}` }, document: { querySelectorAll: () => [] }, fetch: async url => {
      assert(url.endsWith(`connections-companion-${number}.html`));
      return response(article().replace('1,238', String(number)), { url });
    } }));
    assert.equal((await reader.read({ enabled: true })).rating, 2.3);
  }
});
test('conflicting visible puzzle numbers and ambiguous matching links never fetch', async () => {
  let calls = 0;
  const fetch = async () => { calls++; return response(); };
  for (const nodes of [[node(null, 'No. 1214')], [node(null, 'No. 1213'), node(null, 'No. 1214')]]) {
    const reader = createReader(archiveEnv({ fetch, document: { querySelectorAll: selector => selector.startsWith('a[') ? [node(ARCHIVE_LINK)] : nodes } }));
    assert.equal((await reader.read({ enabled: true })).status, 'no-link');
  }
  const reader = createReader(archiveEnv({ fetch, document: { querySelectorAll: selector => selector.startsWith('a[') ? [node(ARCHIVE_LINK), node(ARCHIVE_LINK.replace('/10/05/', '/10/06/'))] : [] } }));
  assert.equal((await reader.read({ enabled: true })).status, 'no-link');
  assert.equal(calls, 0);
});
test('archive fallback rejects an article with another puzzle number', async () => {
  const reader = createReader(archiveEnv({ document: { querySelectorAll: () => [] }, fetch: async url => response(article(), { url }) }));
  const result = await reader.read({ enabled: true });
  assert.equal(result.status, 'unavailable'); assert.equal(result.rating, null);
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
