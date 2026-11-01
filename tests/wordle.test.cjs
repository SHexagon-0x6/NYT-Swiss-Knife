const test = require('node:test');
const assert = require('node:assert/strict');
const { constraints, validateGuess } = require('../games/wordle.js');
const row = (word, states) => ({ word, states: states.split(' ').map(s => ({ g: 'correct', y: 'present', x: 'absent' }[s])) });

test('gray letter is eliminated when no duplicate is colored', () => {
  const result = validateGuess('BRAIN', [row('CRANE', 'x x y x x')]);
  assert.ok(result.some(x => x.code === 'eliminated' && x.letter === 'R'));
  assert.ok(result.some(x => x.code === 'misplaced' && x.letter === 'A' && x.position === 3));
});

test('green cannot be moved; known yellow cannot be omitted', () => {
  const result = validateGuess('STONE', [row('CRANE', 'g x y x x')]);
  assert.ok(result.some(x => x.code === 'fixed' && x.letter === 'C' && x.position === 1));
  assert.ok(result.some(x => x.code === 'missing' && x.letter === 'A'));
});

test('gray duplicate imposes an upper bound instead of eliminating the letter', () => {
  const rows = [row('EERIE', 'y x x x g')];
  const rules = constraints(rows);
  assert.equal(rules.minimum.E, 2);
  assert.equal(rules.maximum.E, 2);
  assert.ok(!validateGuess('SUEDE', rows).some(x => x.code === 'eliminated' && x.letter === 'E'));
  assert.ok(validateGuess('EEEEE', rows).some(x => x.code === 'excess' && x.letter === 'E'));
});

test('multiple colored duplicates preserve the minimum count across rows', () => {
  const rows = [row('ALLEY', 'x y y x x'), row('LIGHT', 'g x x x x')];
  assert.equal(constraints(rows).minimum.L, 2);
  assert.ok(validateGuess('LUMPS', rows).some(x => x.code === 'missing' && x.letter === 'L'));
});

test('fully gray repeated letter is eliminated', () => {
  const result = validateGuess('APPLE', [row('PUPPY', 'x x x x x')]);
  assert.equal(result.filter(x => x.code === 'eliminated' && x.letter === 'P').length, 1);
});

test('a compatible guess produces no warning and does not imply dictionary validity', () => {
  assert.deepEqual(validateGuess('COAST', [row('CRANE', 'g x g x x')]), []);
  assert.deepEqual(validateGuess('QQQQQ', []), []);
});

test('incomplete evaluations never contribute constraints', () => {
  assert.deepEqual(validateGuess('CRANE', [{ word: 'CRANE', states: ['absent', 'tbd', 'absent', 'absent', 'absent'] }]), []);
});

test('nonletter and partial drafts require five letters', () => {
  assert.equal(validateGuess('A??LE', [])[0].code, 'length');
  assert.equal(validateGuess('four', [])[0].code, 'length');
});
