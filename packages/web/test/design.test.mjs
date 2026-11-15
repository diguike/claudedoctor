/**
 * Design and brand guardrails for the public site. These encode decisions the
 * maintainer made on purpose (see CLAUDE.md §8). If one fails, change the page
 * back — do not loosen the test without the maintainer asking for it.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');
const html = await read('index.html');
const og = await read('og.svg');

test('brand is the English name only', () => {
  for (const [name, text] of [['index.html', html], ['og.svg', og]]) {
    assert.ok(!text.includes('克劳德医生'), `${name} must not use a Chinese brand name`);
    assert.ok(text.includes('Claude Doctor'), `${name} must carry the Claude Doctor name`);
  }
  assert.match(html, /<html lang="en">/, 'static markup defaults to English');
  assert.match(html, /<title>Claude Doctor — /);
});

test('no emoji or pictograph decoration', () => {
  for (const [name, text] of [['index.html', html], ['og.svg', og]]) {
    const hit = text.match(/\p{Extended_Pictographic}/u);
    assert.equal(hit, null, `${name} contains pictograph ${hit?.[0]}`);
  }
});

test('no score gauge, gradients, glow, or decorative terminal chrome', () => {
  for (const banned of ['gauge', 'linear-gradient', 'radial-gradient', 'drop-shadow', 'class="traffic"', 'shimmer', '/100']) {
    assert.ok(!html.includes(banned), `index.html must not reintroduce "${banned}"`);
  }
});

test('no third-party assets', () => {
  assert.ok(!/<link[^>]+stylesheet/i.test(html), 'no external stylesheets');
  assert.ok(!/<script[^>]+src=/i.test(html), 'no external scripts');
  assert.ok(!/fonts\.googleapis|@font-face/.test(html), 'system font stacks only');
});

test('referral link comes from core', async () => {
  assert.ok(!/iproyal/i.test(html), 'the referral URL is generated from @claudedoctor/core, not hardcoded');
  assert.ok(html.includes('sponsored'), 'referral links are marked rel="sponsored"');
  const { ISP_PROXY_REFERRAL } = await import('@claudedoctor/core');
  assert.match(ISP_PROXY_REFERRAL.url, /^https:\/\//);
});
