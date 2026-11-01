#!/usr/bin/env node
'use strict';

// Small release guardrails, not a substitute for running the extension on NYT.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(read('package.json'));
const games = ['connections', 'sudoku', 'strands', 'wordle', 'crossword'];
const runtime = ['manifest.json', 'shared.js', 'content.js', 'ui.css', 'popup.html', 'popup.css', 'popup.js',
  'icons/LICENSE-lucide.txt', 'help.html', 'help.css', 'games/connections-rating.js', ...games.map(game => `games/${game}.js`), ...['connections.svg','sudoku.svg','strands.png','wordle.png','crossword.svg'].map(name => `icons/games/${name}`), ...[16, 32, 48, 128].map(size => `icons/${size}.png`)];
let checks = 0;
function check(label, fn) {
  try { fn(); checks++; }
  catch (error) { console.error(`FAIL ${label}: ${error.message}`); process.exit(1); }
}

check('Manifest V3 and consistent version', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:\.\d+)?$/);
  assert(manifest.version.split('.').every(part => Number(part) <= 65535));
  assert.equal(manifest.version, pkg.version);
  assert(manifest.name.length <= 75);
  assert(manifest.description.length <= 132);
});
check('Storage is the only API permission', () => {
  assert.deepEqual(manifest.permissions, ['storage']);
  for (const key of ['host_permissions', 'optional_host_permissions', 'optional_permissions', 'externally_connectable', 'background', 'update_url']) assert(!manifest[key], `Unexpected ${key}`);
});
check('Content scripts are restricted to supported NYT games', () => {
  assert.equal(manifest.content_scripts.length, 1);
  const script = manifest.content_scripts[0];
  assert.deepEqual(new Set(script.matches), new Set([
    'https://www.nytimes.com/games/connections*', 'https://www.nytimes.com/games/wordle/*',
    'https://www.nytimes.com/games/strands*', 'https://www.nytimes.com/games/sudoku*', 'https://www.nytimes.com/puzzles/sudoku/*',
    'https://www.nytimes.com/games/crosswords/*', 'https://www.nytimes.com/crosswords/game/*', 'https://www.nytimes.com/games/bonus/crossword/*'
  ]));
  assert(['document_start', 'document_idle'].includes(script.run_at));
  assert(!script.all_frames);
  assert(!script.world || script.world === 'ISOLATED');
  assert.deepEqual(script.js, ['shared.js', 'games/connections-rating.js', ...games.map(game => `games/${game}.js`), 'content.js']);
});
check('Only notebook CSS is exposed to NYT pages', () => {
  assert.deepEqual(manifest.web_accessible_resources, [{ resources: ['ui.css'], matches: ['https://www.nytimes.com/*'] }]);
  assert.equal(manifest.content_security_policy.extension_pages, "script-src 'self'; object-src 'none'");
});
check('All runtime files exist inside the project', () => {
  for (const file of runtime) {
    const absolute = path.join(root, file);
    assert(fs.statSync(absolute).isFile(), `Missing ${file}`);
    assert(fs.realpathSync(absolute).startsWith(root + path.sep), `File escapes project: ${file}`);
  }
  assert.equal(manifest.action.default_popup, 'popup.html');
});
check('Manifest icons are valid PNGs with the declared dimensions', () => {
  for (const size of [16, 32, 48, 128]) {
    const file = `icons/${size}.png`;
    assert.equal(manifest.icons[size], file);
    const png = fs.readFileSync(path.join(root, file));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});
check('Every JavaScript source parses', () => {
  const sources = runtime.filter(file => file.endsWith('.js'));
  for (const dir of ['scripts', 'tests']) for (const file of fs.readdirSync(path.join(root, dir))) {
    if (/\.(?:c?js)$/.test(file)) sources.push(`${dir}/${file}`);
  }
  for (const file of sources) execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
});
check('No executable HTML or external script/style dependencies', () => {
  for (const file of runtime.filter(file => file.endsWith('.html'))) {
    const html = read(file);
    assert(!/\son[a-z]+\s*=/i.test(html), `Inline event handler in ${file}`);
    assert(!/javascript\s*:/i.test(html), `Script URL in ${file}`);
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const src = match[1].match(/\bsrc=["']([^"']+)["']/i)?.[1];
      assert(src && !match[2].trim(), `Inline script in ${file}`);
      assert(!/^(?:\w+:|\/\/)/.test(src), `External script in ${file}`);
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), src));
      assert(runtime.includes(resolved), `Unpackaged script ${resolved}`);
    }
    for (const match of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
      assert(!/^(?:\w+:|\/\/)/.test(match[1]), `External stylesheet in ${file}`);
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
      assert(runtime.includes(resolved), `Unpackaged stylesheet ${resolved}`);
    }
  }
});
check('Runtime limits networking to the public rating reader and has no unsafe execution', () => {
  const prohibited = [
    /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bEventSource\b/, /\bsendBeacon\s*\(/,
    /\beval\s*\(/, /\bnew\s+Function\s*\(/, /\bimportScripts\s*\(/,
    /\.(?:innerHTML|outerHTML)\s*=/, /\binsertAdjacentHTML\s*\(/,
    /chrome\s*\.\s*storage\s*\.\s*sync\b/, /document\s*\.\s*cookie\b/
  ];
  for (const file of runtime.filter(file => file.endsWith('.js'))) {
    const source = read(file);
    if(file!=='games/connections-rating.js')assert(!/\bfetch\s*\(/.test(source), `Unexpected network request in ${file}`);
    for (const pattern of prohibited) assert(!pattern.test(source), `${pattern} in ${file}`);
  }
  for (const file of runtime.filter(file => file.endsWith('.css'))) assert(!/@import|url\(\s*["']?(?:https?:|\/\/)/i.test(read(file)), `Remote CSS dependency in ${file}`);
});
check('No hidden solution state or answer APIs in game adapters', () => {
  for (const game of games) {
    const source = read(`games/${game}.js`);
    assert(!/window\.__|__NEXT_DATA__|__PRELOADED_STATE__|localStorage|sessionStorage|dictionaryapi|api\.nytimes/i.test(source), `Hidden game state or answer API in ${game}`);
  }
});
console.log(`PASS ${checks} static release checks; ${runtime.length} allowlisted runtime files.`);
console.log('Live NYT compatibility and Chrome Web Store review remain separate checks.');
