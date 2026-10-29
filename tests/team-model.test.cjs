const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const path = require('node:path');
function environment() {
  const Staff = { config: { cacheTtl: { subject: 100, subjectPersons: 100, subjectRelations: 100, personSubjects: 100 } } };
  const context = vm.createContext({ Staff, window: { Staff } });
  for (const name of ['compare-data', 'team-model', 'team-loader']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/' + name + '.js'), 'utf8'), context);
  return Staff;
}
const person = (id, role, type = 1) => ({ id, name: 'person-' + id, relation: role, type });
function fixture(Staff) {
  const shared = [2, 4, 7, 8];
  const projects = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: 'work-' + (i + 1), date: '2020-' + String(i + 1).padStart(2, '0') + '-01', relations: [], persons: [person(999, '动画制片人'), person(4, '制作管理'), ...(shared.includes(i + 1) ? [person(1, '导演'), person(2, '原画')] : [])] }));
  const core = shared.map(id => ({ id, type: 2, staff: '导演' }));
  const bulk = shared.map(id => ({ id, type: 2, staff: '原画' })).concat(Array.from({ length: 20 }, (_, i) => ({ id: 100 + i, name: 'other-' + i, type: 2, staff: '原画' })));
  return { projects, profiles: new Map([[1, { ok: true, data: core }], [2, { ok: true, data: bulk }]]), sample: Staff.teamModel.prepare(999, projects, {}) };
}
test('same cooperation count but different public work breadth separates core candidate from broad external animator', () => {
  const Staff = environment(), f = fixture(Staff), report = Staff.teamModel.finish(f.sample, f.profiles);
  assert.equal(report.candidates.find(c => c.id === 1).tier, 'core');
  assert.equal(report.candidates.find(c => c.id === 2).tier, 'external');
});
test('an illustration credit does not bypass the stricter rules for participation-only artists', () => {
  const Staff = environment(), f = fixture(Staff);
  f.projects[1].persons.push(person(2, '插画'));
  const report = Staff.teamModel.finish(Staff.teamModel.prepare(999, f.projects, {}), f.profiles);
  const artist = report.candidates.find(c => c.id === 2);
  assert.equal(artist.bulkOnly, true); assert.equal(artist.tier, 'external');
});
test('calendar gaps do not affect classification or recency weights when relative order stays the same', () => {
  const Staff = environment(), f = fixture(Staff);
  const first = Staff.teamModel.finish(f.sample, f.profiles).candidates.find(c => c.id === 1);
  f.projects.forEach((p, i) => p.date = (1980 + i * 5) + '-01-01');
  const second = Staff.teamModel.finish(Staff.teamModel.prepare(999, f.projects, {}), f.profiles).candidates.find(c => c.id === 1);
  assert.equal(first.weightedCoverage, second.weightedCoverage); assert.equal(first.tier, second.tier);
});
test('older frequent collaborator is marked down while a newer repeat collaborator can become a current candidate', () => {
  const Staff = environment();
  const projects = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: String(i + 1), date: '2020-' + String(i + 1).padStart(2, '0') + '-01', relations: [], persons: [person(999, '动画制片人'), person(4, '制作管理'), person(i < 4 ? 1 : 2, '导演')] }));
  const profiles = new Map([1, 2].map(id => [id, { ok: true, data: projects.filter(p => p.persons.some(s => s.id === id)).map(p => ({ id: p.id, type: 2, staff: '导演' })) }]));
  const report = Staff.teamModel.finish(Staff.teamModel.prepare(999, projects, {}), profiles);
  const old = report.candidates.find(c => c.id === 1), newer = report.candidates.find(c => c.id === 2);
  assert.equal(old.tier, 'history'); assert.equal(old.recent, 0);
  assert.equal(newer.tier, 'core'); assert.ok(newer.weightedCoverage > old.weightedCoverage);
});
test('recaps and same-series counts do not inflate recent or cross-project evidence', () => {
  const Staff = environment(), f = fixture(Staff);
  f.projects[0].relations = f.projects.slice(1).map(p => ({ id: p.id, type: 2, relation: '续集' }));
  const sample = Staff.teamModel.prepare(999, f.projects, {});
  assert.equal(sample.groupCount, 1);
  assert.equal(Staff.teamModel.finish(sample, f.profiles).candidates.find(c => c.id === 1).tier, 'series');
  const original = fixture(Staff);
  original.projects[0].relations = [{ id: 90, type: 2, relation: '总集篇' }];
  original.projects.push({ id: 90, name: 'recap', date: '2026-01-01', relations: [], persons: [person(999, '动画制片人'), person(1, '导演')] });
  const recap = Staff.teamModel.prepare(999, original.projects, {});
  assert.equal(recap.orderCount, 8); assert.equal(recap.recentIds.includes(90), false);
});
test('all explicit producer works are included, other jobs are excluded even after first producer credit', () => {
  const Staff = environment();
  const refs = Staff.teamModel.uniqueWorks([{ id: 1, type: 2, staff: '动画制片人' }, { id: 1, type: 2, staff: '制作制片人' }, { id: 2, type: 2, staff: '制片人' }, { id: 3, type: 2, staff: '制作进行' }, { id: 4, type: 2, staff: '企画' }, { id: 5, type: 4, staff: '动画制片人' }], true);
  assert.deepEqual(Array.from(refs, r => r.id), [1]); assert.equal(refs[0].roles.length, 2);
  const f = fixture(Staff); f.projects.push({ id: 99, name: 'ongoing', date: '2030-01-01', persons: [person(999, '动画制片人'), person(1, '导演')], relations: [] });
  assert.equal(Staff.teamModel.prepare(999, f.projects, {}).projects.length, 9);
});
test('generic producer titles never count as animation production team samples', () => {
  const Staff = environment(), f = fixture(Staff);
  f.projects.forEach(p => p.persons[0].relation = '制片人');
  const report = Staff.teamModel.finish(Staff.teamModel.prepare(999, f.projects, {}), f.profiles);
  assert.equal(report.projects.length, 0); assert.equal(report.excluded.length, 8);
  assert.equal(report.candidates.some(c => c.tier === 'core'), false);
});
test('unknown profiles or incomplete order do not become false core or false recent decline', () => {
  const Staff = environment(), f = fixture(Staff);
  f.projects[0].date = null;
  const report = Staff.teamModel.finish(Staff.teamModel.prepare(999, f.projects, {}), new Map());
  assert.equal(report.candidates.some(c => c.tier === 'core' || c.tier === 'history'), false);
  assert.equal(report.candidates.find(c => c.id === 1).activity.checked, false);
});
test('missing producer identity and failed staff tables cannot silently count other-job contacts', () => {
  const Staff = environment(), f = fixture(Staff);
  f.projects[0].persons[0].relation = '制作进行'; f.projects[1].staffFailed = true;
  const sample = Staff.teamModel.prepare(999, f.projects, {});
  assert.equal(sample.excluded.length, 2); assert.equal(sample.quality.staffComplete, false);
  assert.equal(Staff.teamModel.finish(sample, f.profiles).candidates.some(c => c.tier === 'core' || c.tier === 'history'), false);
});
test('shared sorting prioritizes director, episode direction and storyboard over large animation counts', () => {
  const Staff = environment();
  const records = [{ name: 'animator', count: 99, roles: ['原画'] }, { name: 'storyboard', count: 4, roles: ['分镜'] }, { name: 'director', count: 1, roles: ['导演'] }, { name: 'episode', count: 2, roles: ['演出'] }];
  records.sort(Staff.compareData.comparePriority); assert.deepEqual(records.map(r => r.name), ['director', 'episode', 'storyboard', 'animator']);
});
test('loader checks every cross-project repeat collaborator without a year or person cap and cancels safely', async () => {
  const Staff = environment(); let requests = [];
  Staff.runtime = { isStopped: () => false };
  Staff.api = { runBatch: async (items, options) => {
    requests.push(...items.map(it => it.path));
    const results = items.map(it => {
      if (it.path.startsWith('/v0/persons/')) return { ok: true, data: [{ id: Number(it.path.split('/')[3]) + 1000, type: 2, staff: '原画' }] };
      if (it.path.endsWith('/persons')) return { ok: true, data: [person(999, '动画制片人'), ...[10,11,12].map(id => person(id, '导演')), ...[20,21,22].map(id => person(id, '原画'))] };
      if (it.path.endsWith('/subjects')) return { ok: true, data: [] };
      return { ok: true, data: { date: it.path.endsWith('/1') ? '2018-01-01' : '2023-01-01', name: it.path } };
    }); options.onProgress(items.length, items.length); return results;
  } };
  const report = await Staff.teamLoader.run({ id: 999, name: 'producer' }, [{ id: 1, name: 'one' }, { id: 2, name: 'two' }], { profileLimit: 1, fromYear: 2020 }, { cancelled: false }, () => {});
  assert.equal(requests.filter(p => p.startsWith('/v0/persons/')).length, 6); assert.equal(report.projects.length, 2);
  requests = []; await assert.rejects(Staff.teamLoader.run({ id: 999 }, [], {}, { cancelled: true }, () => {}), e => e.cancelled); assert.equal(requests.length, 0);
});
