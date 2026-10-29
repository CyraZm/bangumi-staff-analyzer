const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const path = require('node:path');
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/compare-data.js'), 'utf8'), { window });
const data = window.Staff.compareData;
const credit = (id, relation, type = 1) => ({ id, relation, type, name: 'staff-' + id });
const panel = (key, list) => ({ key, credits: data.splitCredits(list) });
const ids = records => Array.from(records, record => record.id);

test('creative analysis excludes funding, coordination, studios, groups and unknown roles', () => {
  const source = [credit(1, '导演'), credit(2, '原画'), credit(3, '音响监督'),
    credit(4, '企画'), credit(5, '製作'), credit(6, '制作'), credit(7, '制作进行'),
    credit(8, '制片人'), credit(9, '设定制作'), credit(10, '原作'), credit(11, '未知职务'),
    credit(12, '音响', 2), credit(13, '音乐', 3), credit(14, '导演', 0),
    credit(15, '动画制作', 2), credit(16, '动画制片人')];
  const split = data.splitCredits(source);
  assert.deepEqual(ids(split.creative.values()), [1, 2, 3]);
  assert.deepEqual(ids(split.studio), [15]);
  assert.deepEqual(ids(split.producer), [16]);
  assert.equal(split.extra.length, 11);
  assert.equal(split.sourceCount, source.length);
});

test('a person with creative and administrative credits retains only creative roles in overlap', () => {
  const a = panel('a', [credit(1, '企画'), credit(1, '导演'), credit(1, '分镜'), credit(1, '导演')]);
  const b = panel('b', [credit(1, '原画'), credit(1, '製作')]);
  const overlap = data.overlap([a, b]);
  assert.equal(overlap.length, 1);
  assert.equal(overlap[0].count, 2);
  assert.deepEqual(Array.from(overlap[0].presences[0].relations), ['导演', '分镜']);
  assert.deepEqual(ids(a.credits.extra), [1]);
});

test('administrative presence in another work is not creative overlap', () => {
  const records = data.overlap([panel(1, [credit(1, '导演')]), panel(2, [credit(1, '企画')])]);
  assert.equal(records[0].count, 1);
});

test('multi-work analysis counts each person once per work and keeps partial overlap', () => {
  const a = panel('a', [credit(1, '导演'), credit(1, '原画'), credit(2, '原画')]);
  const b = panel('b', [credit(1, '分镜'), credit(2, '音响监督')]);
  const c = panel('c', [credit(1, '摄影'), credit(3, '导演')]);
  const records = data.overlap([a, b, c]);
  assert.deepEqual(Array.from(records, r => [r.id, r.count]), [[1, 3], [2, 2], [3, 1]]);
  assert.equal(records.filter(r => r.count === 3).length, 1);
  assert.equal(records.filter(r => r.count >= 2).length, 2);
});

test('separate credit highlighting counts works, not duplicate roles inside one work', () => {
  const a = panel('a', [credit(1, '动画制作', 2), credit(1, '製作', 2), credit(2, '企画')]);
  const b = panel('b', [credit(1, '动画制作', 2), credit(3, '企画')]);
  assert.equal(data.separatePresence([a]).get(1), 1);
  const counts = data.separatePresence([a, b]);
  assert.equal(counts.get(1), 2);
  assert.equal(counts.get(2), 1);
});

test('source order is retained even when a later planning credit overlaps and lists exceed old cutoffs', () => {
  const source = Array.from({ length: 70 }, (_, i) => credit(70 - i, '企画'));
  const before = JSON.stringify(source);
  const a = panel('a', source);
  const b = panel('b', [credit(1, '企画')]);
  data.overlap([a, b]);
  data.separatePresence([a, b]);
  assert.deepEqual(ids(a.credits.extra), source.map(r => r.id));
  assert.equal(JSON.stringify(source), before);
});

test('planning uses infobox credit order instead of unordered person relation order', () => {
  const source = [{ ...credit(1, '企画'), name: '孝壽尚志' }, { ...credit(2, '企画'), name: '岩上敦宏' }];
  const split = data.splitCredits(source, [{ key: '企划', value: [{ v: '岩上敦宏' }, { v: '孝壽尚志' }] }]);
  assert.deepEqual(ids(split.extra), [2, 1]);
  assert.ok(split.extra.every(entry => entry.orderSource === 'infobox'));
  assert.equal(source[0].id, 1);
});

test('missing or ambiguous infobox names retain API order and are marked unverified', () => {
  const source = [{ ...credit(1, '企画'), name: '甲' }, { ...credit(2, '企画'), name: '乙' }];
  for (const text of ['乙、未关联的人', '乙、甲；备注：甲']) {
    const split = data.splitCredits(source, [{ key: '企画', value: text }]);
    assert.deepEqual(ids(split.extra), [1, 2]);
    assert.ok(split.extra.every(entry => entry.orderSource === 'api'));
    assert.equal(split.extra[0].sourceText, text);
  }
});
