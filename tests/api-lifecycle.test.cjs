const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/api.js'), 'utf8');

function makeApi(fetch) {
  const Staff = {
    config: { apiBase: 'https://example.test', defaultConcurrency: 2, defaultInterval: 20,
      searchLimit: 50, cacheTtl: { person: 100, search: 100 } },
    db: { STORES: { cache: 'cache' }, get: async () => null, put: async () => {} }
  };
  vm.runInNewContext(source, { window: { Staff }, Staff, fetch, AbortController, setTimeout, clearTimeout, structuredClone });
  return Staff.api;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function within(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('shutdown left work pending')), 700);
    })]);
  } finally { clearTimeout(timer); }
}

test('closing cancels active requests and queued work without new requests or progress', async () => {
  let started = 0, aborted = 0, progress = 0;
  const api = makeApi((url, init) => new Promise((_, reject) => {
    started++;
    init.signal.addEventListener('abort', () => { aborted++; reject(new Error('aborted')); }, { once: true });
  }));
  const pending = api.runBatch(Array.from({ length: 14 }, (_, i) => ({ path: '/' + i })), {
    concurrency: 2, interval: 20, onProgress: () => progress++
  });
  await delay(55);
  assert.equal(started, 2);
  api.stopAll();
  const results = await within(pending);
  assert.equal(results.length, 14);
  assert.ok(results.every(item => item.error === 'cancelled'));
  assert.equal(aborted, 2);
  assert.equal(progress, 0);
  await delay(60);
  assert.equal(started, 2);
  await assert.rejects(api.getPerson(1), error => error.cancelled === true);
});

test('closing interrupts retry backoff immediately', async () => {
  let count = 0;
  const api = makeApi(async () => { count++; return { status: 429 }; });
  const pending = api.getPerson(1);
  // Attach rejection handler before abort to avoid an unhandled rejection.
  const rejected = assert.rejects(pending, error => error.cancelled === true);
  await delay(30);
  api.stopAll();
  await within(rejected);
  assert.equal(count, 1);
});

test('rate-limited starts remain spaced while results still aggregate correctly', async () => {
  const times = [];
  const api = makeApi(async () => { times.push(Date.now()); return { status: 200, json: async () => [] }; });
  const result = await api.runBatch(Array.from({ length: 5 }, (_, i) => ({ path: '/' + i })), {
    concurrency: 3, interval: 40
  });
  assert.ok(result.every(item => item.ok));
  assert.equal(times.length, 5);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 25);
});

test('responses are reused only in the current API instance without reading or writing persistent storage', async () => {
  let requests = 0;
  const fetch = async (url, init) => {
    requests++;
    assert.equal(init.cache, 'no-store');
    return { status: 200, json: async () => ({ id: 1, name: 'original' }) };
  };
  const api = makeApi(fetch);
  const first = await api.getPerson(1);
  first.name = 'changed outside the cache';
  assert.equal((await api.getPerson(1)).name, 'original');
  assert.equal(requests, 1);
  const anotherPage = makeApi(fetch);
  await anotherPage.getPerson(1);
  assert.equal(requests, 2);
  api.clearCache();
  await api.getPerson(1);
  assert.equal(requests, 3);
});

test('a request started before clearing the cache cannot repopulate it afterward', async () => {
  let requests = 0, release, markStarted;
  const started = new Promise(resolve => markStarted = resolve);
  const api = makeApi(async () => {
    requests++;
    if (requests === 1) await new Promise(resolve => { release = resolve; markStarted(); });
    return { status: 200, json: async () => ({ id: 1 }) };
  });
  const pending = api.getPerson(1);
  await started;
  api.clearCache(); release();
  await pending;
  await api.getPerson(1);
  assert.equal(requests, 2);
  await api.getPerson(1);
  assert.equal(requests, 2);
});
