'use strict';

// RFC 9309 matching vectors for parseRobots/isBlocked.
// https://www.rfc-editor.org/rfc/rfc9309

const { test } = require('node:test');
const assert = require('node:assert');
const { parseRobots, isBlocked, patternMatches, canonicalPath, aiVerdicts } = require('../index.js');

function blocksOf(text) {
  return parseRobots(text).blocks;
}

test('the audit-flagged false-ALLOWED case: Disallow: /* is a full block', () => {
  // The old matcher only recognized the literal "Disallow: /" as blocking,
  // so "Disallow: /*" (equivalent coverage) showed ALLOWED.
  const blocks = blocksOf('User-agent: GPTBot\nDisallow: /*\n');
  assert.strictEqual(isBlocked('GPTBot', blocks, '/').blocked, true);
  assert.strictEqual(isBlocked('GPTBot', blocks, '/any/page').blocked, true);
});

test('heavy partial disallows block the covered path, not the whole site', () => {
  const blocks = blocksOf('User-agent: GPTBot\nDisallow: /private/\nDisallow: /tmp/\n');
  assert.strictEqual(isBlocked('GPTBot', blocks, '/private/doc.html').blocked, true);
  assert.strictEqual(isBlocked('GPTBot', blocks, '/').blocked, false);
});

test('longest match wins: Disallow: / with Allow: /public', () => {
  const blocks = blocksOf('User-agent: *\nDisallow: /\nAllow: /public\n');
  assert.strictEqual(isBlocked('GPTBot', blocks, '/').blocked, true);
  assert.strictEqual(isBlocked('GPTBot', blocks, '/public/index.html').blocked, false);
});

test('tie between allow and disallow: allow wins (RFC 9309 2.2.2)', () => {
  const blocks = blocksOf('User-agent: *\nAllow: /folder\nDisallow: /folder\n');
  assert.strictEqual(isBlocked('CCBot', blocks, '/folder/page').blocked, false);
});

test('end anchor $: /*.gif$ blocks .gif exactly, not .gifx', () => {
  const blocks = blocksOf('User-agent: *\nDisallow: /*.gif$\n');
  assert.strictEqual(isBlocked('GPTBot', blocks, '/img/photo.gif').blocked, true);
  assert.strictEqual(isBlocked('GPTBot', blocks, '/img/photo.gifx').blocked, false);
});

test('end anchor without wildcard: Disallow: /exact$ matches only /exact', () => {
  const blocks = blocksOf('User-agent: *\nDisallow: /exact$\n');
  assert.strictEqual(isBlocked('GPTBot', blocks, '/exact').blocked, true);
  assert.strictEqual(isBlocked('GPTBot', blocks, '/exact/sub').blocked, false);
});

test('mid-pattern wildcard: Disallow: /private*/data', () => {
  const blocks = blocksOf('User-agent: *\nDisallow: /private*/data\n');
  assert.strictEqual(isBlocked('GPTBot', blocks, '/private1/data').blocked, true);
  assert.strictEqual(isBlocked('GPTBot', blocks, '/private1/other').blocked, false);
});

test('empty Disallow value is not a rule: everything allowed', () => {
  const blocks = blocksOf('User-agent: GPTBot\nDisallow:\n');
  assert.strictEqual(isBlocked('GPTBot', blocks, '/').blocked, false);
  assert.strictEqual(isBlocked('GPTBot', blocks, '/deep/page').blocked, false);
});

test('duplicate user-agent groups are merged (RFC 9309 2.2.1)', () => {
  const text = [
    'User-agent: GPTBot',
    'Disallow: /a',
    '',
    'User-agent: GPTBot',
    'Disallow: /',
  ].join('\n');
  const blocks = blocksOf(text);
  assert.strictEqual(isBlocked('GPTBot', blocks, '/').blocked, true);
  assert.strictEqual(isBlocked('GPTBot', blocks, '/a/x').blocked, true);
});

test('specific group overrides wildcard group entirely', () => {
  const text = [
    'User-agent: *',
    'Disallow: /',
    '',
    'User-agent: GPTBot',
    'Disallow:',
  ].join('\n');
  const blocks = blocksOf(text);
  assert.strictEqual(isBlocked('GPTBot', blocks, '/').blocked, false);
  assert.strictEqual(isBlocked('ClaudeBot', blocks, '/').blocked, true);
});

test('user-agent matching is case-insensitive', () => {
  const blocks = blocksOf('User-agent: gptbot\nDisallow: /\n');
  assert.strictEqual(isBlocked('GPTBot', blocks, '/').blocked, true);
});

test('shared group: several user-agent lines before one rule set', () => {
  const text = [
    'User-agent: GPTBot',
    'User-agent: ClaudeBot',
    'Disallow: /',
  ].join('\n');
  const blocks = blocksOf(text);
  assert.strictEqual(isBlocked('GPTBot', blocks, '/').blocked, true);
  assert.strictEqual(isBlocked('ClaudeBot', blocks, '/').blocked, true);
  assert.strictEqual(isBlocked('CCBot', blocks, '/').blocked, false);
});

test('percent-encoding: pattern /caf%C3%A9 matches literal /café', () => {
  const blocks = blocksOf('User-agent: *\nDisallow: /caf%C3%A9\n');
  assert.strictEqual(isBlocked('GPTBot', blocks, '/café').blocked, true);
  assert.strictEqual(isBlocked('GPTBot', blocks, '/cafe').blocked, false);
});

test('percent-encoded slash %2F stays distinct from a literal slash', () => {
  assert.strictEqual(canonicalPath('/a%2Fb'), '/a%2Fb');
  assert.notStrictEqual(canonicalPath('/a%2Fb'), canonicalPath('/a/b'));
  const blocks = blocksOf('User-agent: *\nDisallow: /a%2Fb\n');
  assert.strictEqual(isBlocked('GPTBot', blocks, '/a%2Fb').blocked, true);
  assert.strictEqual(isBlocked('GPTBot', blocks, '/a/b').blocked, false);
});

test('no groups at all: default allow', () => {
  const blocks = blocksOf('# empty file\n');
  assert.strictEqual(isBlocked('GPTBot', blocks, '/').blocked, false);
});

test('patternMatches primitives', () => {
  assert.strictEqual(patternMatches('/', '/anything'), true);
  assert.strictEqual(patternMatches('/fish', '/fishing'), true);
  assert.strictEqual(patternMatches('/fish*', '/fish/salmon'), true);
  assert.strictEqual(patternMatches('/fish', '/catfish'), false);
  assert.strictEqual(patternMatches('/*.php', '/index.php'), true);
  assert.strictEqual(patternMatches('/*.php$', '/index.php?x=1'), false);
});

test('aiVerdicts covers the required bot tokens with per-bot verdicts', () => {
  const required = [
    'GPTBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-Web', 'anthropic-ai',
    'PerplexityBot', 'Google-Extended', 'CCBot', 'Bytespider', 'Amazonbot',
  ];
  const text = [
    'User-agent: GPTBot',
    'Disallow: /',
    '',
    'User-agent: *',
    'Disallow:',
  ].join('\n');
  const rows = aiVerdicts(blocksOf(text), '/');
  const byToken = Object.fromEntries(rows.map(r => [r.token, r.verdict]));
  for (const token of required) {
    assert.ok(byToken[token], `missing verdict row for ${token}`);
  }
  assert.strictEqual(byToken['GPTBot'], 'BLOCKED');
  assert.strictEqual(byToken['ClaudeBot'], 'ALLOWED');
});
