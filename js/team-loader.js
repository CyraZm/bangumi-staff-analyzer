/* 全部制片作品与全部合作署名；所有跨项目重复合作者都核对公开制作履历，无人数抽样。 */
(function () {
  async function run(producer, refs, options, signal, progress, producerCredits) {
    const o = Object.assign({}, Staff.teamModel.DEFAULTS, options), profiles = new Map();
    function check() { if (signal.cancelled || (Staff.runtime && Staff.runtime.isStopped())) { const e = new Error('已取消'); e.cancelled = true; throw e; } }
    function item(path, key, ttl) { return { path: path, key: key, ttl: ttl, force: !!o.force }; }
    async function batch(items, label) {
      check(); progress(label, 0, items.length);
      const result = await Staff.api.runBatch(items, { concurrency: o.concurrency || 5, interval: o.interval === undefined ? 200 : o.interval, signal: signal,
        onProgress: function (done, total) { if (!signal.cancelled) progress(label, done, total); } });
      check(); return result;
    }
    const meta = await batch(refs.map(function (w) { return item('/v0/subjects/' + w.id, 'subject|' + w.id, Staff.config.cacheTtl.subject); }), '核对作品资料与相对先后');
    const projects = refs.map(function (w, i) { const data = meta[i].ok ? meta[i].data : null; return Object.assign({}, w, { name: data ? data.name_cn || data.name || w.name : w.name, date: data && data.date, platform: data && data.platform, infobox: data && data.infobox, metaFailed: !data }); });
    const items = [];
    projects.forEach(function (p) {
      items.push(item('/v0/subjects/' + p.id + '/persons', 'subject-persons|' + p.id, Staff.config.cacheTtl.subjectPersons));
      items.push(item('/v0/subjects/' + p.id + '/subjects', 'subject-relations|' + p.id, Staff.config.cacheTtl.subjectRelations));
    });
    const credits = await batch(items, '核实逐片制片身份、制作人员与系列');
    projects.forEach(function (p, i) { p.staffFailed = !credits[i * 2].ok; p.persons = credits[i * 2].ok ? credits[i * 2].data : []; p.relationsFailed = !credits[i * 2 + 1].ok; p.relations = credits[i * 2 + 1].ok ? credits[i * 2 + 1].data : []; });
    const base = Staff.teamModel.prepare(producer.id, projects, o);
    const repeated = base.candidates.filter(function (p) { return p.groupCount >= 2; });
    const checks = await batch(repeated.map(function (p) { return item('/v0/persons/' + p.id + '/subjects', 'person-subjects|' + p.id, Staff.config.cacheTtl.personSubjects); }), '核对全部跨项目合作者的合作广度');
    repeated.forEach(function (p, i) { profiles.set(p.id, checks[i]); });
    const roleRefs = Staff.teamModel.roleReviewWorks(base, profiles);
    const roleMeta = await batch(roleRefs.map(function (w) { return item('/v0/subjects/' + w.id, 'subject|' + w.id, Staff.config.cacheTtl.subject); }), '核对主要岗位履历与合作延续');
    const metadata = new Map();
    roleRefs.forEach(function (w, i) { if (roleMeta[i].ok) metadata.set(w.id, roleMeta[i].data); });
    const auxiliaryRefs = Staff.teamModel.auxiliaryWorks(producerCredits, new Set(refs.map(function (w) { return w.id; })));
    const auxiliaryItems = [];
    auxiliaryRefs.forEach(function (w) {
      auxiliaryItems.push(item('/v0/subjects/' + w.id, 'subject|' + w.id, Staff.config.cacheTtl.subject));
      auxiliaryItems.push(item('/v0/subjects/' + w.id + '/persons', 'subject-persons|' + w.id, Staff.config.cacheTtl.subjectPersons));
    });
    const auxiliaryData = await batch(auxiliaryItems, '核对其他制作岗位共事（仅作辅助）');
    const auxiliaryProjects = auxiliaryRefs.map(function (w, i) {
      const detail = auxiliaryData[i * 2].ok ? auxiliaryData[i * 2].data : {};
      return Object.assign({}, w, { name: detail.name_cn || detail.name || w.name, date: detail.date, infobox: detail.infobox,
        persons: auxiliaryData[i * 2 + 1].ok ? auxiliaryData[i * 2 + 1].data : [], staffFailed: !auxiliaryData[i * 2 + 1].ok });
    });
    const report = Staff.teamModel.finish(base, profiles, { producerId: producer.id, metadata: metadata, auxiliaryProjects: auxiliaryProjects });
    report.producer = { id: producer.id, name: producer.name, type: producer.type };
    report.checks = { eligiblePeople: repeated.length, profilesRequested: repeated.length, profilesSucceeded: checks.filter(function (r) { return r.ok; }).length,
      roleWorksRequested: roleRefs.length, roleWorksSucceeded: roleMeta.filter(function (r) { return r.ok; }).length,
      auxiliaryAvailable: Array.isArray(producerCredits), auxiliaryWorks: auxiliaryRefs.length, auxiliaryFailed: auxiliaryProjects.filter(function (p) { return p.staffFailed; }).length };
    return report;
  }
  Staff.teamLoader = { run: run };
})();
