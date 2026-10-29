/* 制片人合作结构 v2：全部制片作品，按作品相对顺序加权，不用年份跨度判断班底。 */
(function () {
  const VERSION = 3;
  const ANCHOR_ROLES = ['动画制片人', '制作制片人'];
  const TIERS = { core: '核心候选', stable: '稳定合作', external: '高频外部合作', series: '系列内合作', history: '近作合作减少', observe: '待观察' };
  const DEFAULTS = { minGroups: 3, coverage: 0.55, affinity: 0.25, halfLife: 3 };
  const bulkRoles = new Set(['原画', '第二原画', '补间动画', '转场绘', '插画', '上色', '摄影', '3DCG', '3D 动画师', '数码绘图', '制作协力']);
  const seriesRelations = new Set(['前传', '续集', '番外篇', '总集篇', '主线故事', '剧场版', 'TV版', '不同演绎', '前日谈', '续作']);
  function isAnchor(role) { return ANCHOR_ROLES.includes(role); }
  function uniqueWorks(list, anchorsOnly) {
    const map = new Map();
    (list || []).forEach(function (work) {
      if (work.type !== 2 || (anchorsOnly && !isAnchor(work.staff))) return;
      if (!anchorsOnly && !isAnchor(work.staff) && !Staff.compareData.isProductionRole(work.staff)) return;
      if (!map.has(work.id)) map.set(work.id, { id: work.id, name: work.name_cn || work.name || String(work.id), roles: [] });
      const rec = map.get(work.id); if (!rec.roles.includes(work.staff)) rec.roles.push(work.staff);
    });
    return Array.from(map.values());
  }
  function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) ? value : null; }
  function clusterProjects(projects) {
    const parent = new Map();
    function find(id) { if (!parent.has(id)) parent.set(id, id); if (parent.get(id) !== id) parent.set(id, find(parent.get(id))); return parent.get(id); }
    function join(a, b) { parent.set(find(a), find(b)); }
    projects.forEach(function (p) { find(p.id); p.relations.forEach(function (r) { if (r.type === 2 && seriesRelations.has(r.relation)) join(p.id, r.id); }); });
    const labels = new Map();
    projects.forEach(function (p) { const group = find(p.id); if (!labels.has(group)) labels.set(group, labels.size + 1); p.group = labels.get(group); });
    return labels.size;
  }
  function prepare(producerId, projects, options) {
    const opts = Object.assign({}, DEFAULTS, options), excluded = [], usable = [], seen = new Set();
    const recaps = new Set();
    projects.forEach(function (p) { (p.relations || []).forEach(function (r) { if (r.type === 2 && r.relation === '总集篇') recaps.add(r.id); }); });
    projects.forEach(function (raw) {
      if (seen.has(raw.id)) return; seen.add(raw.id);
      const own = (raw.persons || []).filter(function (p) { return String(p.id) === String(producerId) && isAnchor(p.relation); });
      const reason = raw.staffFailed ? '人员表获取失败' : (!own.length ? '人员表未核实动画/制作制片身份' : '');
      if (reason) { excluded.push({ id: raw.id, name: raw.name, reason: reason }); return; }
      const split = Staff.compareData.splitCredits(raw.persons, raw.infobox);
      const members = Array.from(split.creative.values()).filter(function (p) { return String(p.id) !== String(producerId); });
      usable.push({ id: raw.id, name: raw.name, date: validDate(raw.date), persons: raw.persons,
        anchorRoles: Array.from(new Set(own.map(function (p) { return p.relation; }))),
        relations: (raw.relations || []).map(function (r) { return { id: r.id, type: r.type, relation: r.relation }; }), relationsFailed: !!raw.relationsFailed,
        compilation: recaps.has(raw.id) || /总集编|総集編|总集篇/.test(raw.name || ''), memberCount: members.length,
        studio: split.studio.map(function (s) { return s.name; }).join('、'), split: split });
    });
    const groupCount = clusterProjects(usable);
    // A recap can document credits, but must not make an old crew appear newly recruited.
    const ordered = usable.filter(function (p) { return p.date && !p.compilation && p.memberCount; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    const weights = new Map();
    // Same publication date receives the same weight; numeric IDs never decide recency.
    for (let i = 0; i < ordered.length;) {
      let end = i + 1; while (end < ordered.length && ordered[end].date === ordered[i].date) end++;
      const rank = (i + end - 1) / 2;
      const weight = Math.pow(.5, (ordered.length - 1 - rank) / opts.halfLife);
      for (let j = i; j < end; j++) weights.set(ordered[j].id, weight);
      i = end;
    }
    const totalWeight = Array.from(weights.values()).reduce(function (s, w) { return s + w; }, 0);
    const recentSize = Math.min(5, Math.max(2, Math.ceil(ordered.length / 3)));
    let recentStart = Math.max(0, ordered.length - recentSize);
    while (recentStart > 0 && ordered[recentStart - 1].date === ordered[recentStart].date) recentStart--;
    const recentIds = new Set(ordered.slice(recentStart).map(function (p) { return p.id; }));
    const earlierIds = new Set(ordered.slice(0, recentStart).map(function (p) { return p.id; }));
    const map = new Map();
    usable.forEach(function (p) {
      p.split.creative.forEach(function (person) {
        if (String(person.id) === String(producerId)) return;
        let r = map.get(person.id);
        if (!r) { r = { id: person.id, name: person.name, type: person.type, roles: [], roleCounts: {}, evidence: [] }; map.set(person.id, r); }
        const roles = Array.from(person.relations).sort(function (a, b) { return Staff.compareData.roleRank(a) - Staff.compareData.roleRank(b); });
        roles.forEach(function (role) { if (!r.roles.includes(role)) r.roles.push(role); r.roleCounts[role] = (r.roleCounts[role] || 0) + 1; });
        r.evidence.push({ id: p.id, name: p.name, date: p.date, studio: p.studio, group: p.group, roles: roles, anchorRoles: p.anchorRoles, compilation: p.compilation });
      });
    });
    const orderComplete = usable.filter(function (p) { return !p.compilation && p.memberCount; }).every(function (p) { return p.date; });
    const candidates = Array.from(map.values());
    candidates.forEach(function (r) {
      r.roles.sort(function (a, b) { return Staff.compareData.roleRank(a) - Staff.compareData.roleRank(b); });
      r.count = r.evidence.length; r.groups = Array.from(new Set(r.evidence.map(function (p) { return p.group; }))); r.groupCount = r.groups.length;
      r.coverage = groupCount ? r.groupCount / groupCount : 0;
      r.weightedCoverage = totalWeight ? r.evidence.reduce(function (s, p) { return s + (weights.get(p.id) || 0); }, 0) / totalWeight : 0;
      r.recent = r.evidence.filter(function (p) { return recentIds.has(p.id); }).length; r.recentTotal = recentIds.size;
      r.earlier = r.evidence.filter(function (p) { return earlierIds.has(p.id); }).length; r.earlierTotal = earlierIds.size;
      r.recentRate = r.recentTotal ? r.recent / r.recentTotal : 0; r.earlierRate = r.earlierTotal ? r.earlier / r.earlierTotal : 0;
      r.trend = orderComplete && !excluded.length && usable.every(function (p) { return !p.relationsFailed; }) && r.earlier >= 2 && r.earlierRate >= .4 && r.recentRate <= r.earlierRate * .5 ? 'down' : (orderComplete && r.earlier === 0 && r.recent > 0 ? 'new' : 'steady');
      r.bulkOnly = r.roles.every(function (role) { return bulkRoles.has(role); });
      r.evidence.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    });
    candidates.sort(Staff.compareData.comparePriority);
    return { candidates: candidates, projects: usable.map(function (p) { const copy = Object.assign({}, p); delete copy.split; delete copy.persons; return copy; }),
      excluded: excluded, groupCount: groupCount, options: opts, recentIds: Array.from(recentIds), orderCount: ordered.length,
      quality: { staffComplete: !projects.some(function (p) { return p.staffFailed; }) && !excluded.length,
        relationsComplete: usable.every(function (p) { return !p.relationsFailed; }), orderComplete: orderComplete } };
  }
  function activity(candidate, profile) {
    if (!profile || !profile.ok) return { checked: false, share: null, total: null, outside: [] };
    const refs = uniqueWorks(profile.data, false), shared = new Set(candidate.evidence.map(function (p) { return p.id; }));
    candidate.evidence.forEach(function (p) { if (!refs.some(function (w) { return w.id === p.id; })) refs.push(p); });
    return { checked: true, share: refs.length ? shared.size / refs.length : 0, total: refs.length, outside: refs.filter(function (p) { return !shared.has(p.id); }) };
  }
  function classify(record, sample, profileActivity) {
    const o = sample.options, reasons = [];
    const result = Object.assign({}, record, { activity: profileActivity, tier: 'observe', reasons: reasons });
    const reliable = sample.quality.staffComplete && sample.quality.relationsComplete && sample.quality.orderComplete;
    if (record.count >= 3 && record.groupCount === 1) { result.tier = 'series'; reasons.push('合作次数集中在一个已知系列，不作为跨项目班底证据'); }
    else if (record.bulkOnly && record.count >= 3 && profileActivity.checked && profileActivity.share < .25 && profileActivity.outside.length >= 8 && record.recentRate < .75) {
      result.tier = 'external'; reasons.push('公开动画制作履历分布广，与本制片人的合作占比低于 25%'); reasons.push('仅凭高合作次数和参与型署名，不判为核心');
    } else {
      const groups = record.bulkOnly ? 4 : o.minGroups, weighted = record.bulkOnly ? .7 : o.coverage, affinity = record.bulkOnly ? .5 : o.affinity;
      if (reliable && record.groupCount >= groups && record.weightedCoverage >= weighted && record.recent >= Math.min(2, record.recentTotal) && record.recentRate >= .5 && profileActivity.checked && profileActivity.share >= affinity) {
        result.tier = 'core'; reasons.push('跨项目重复合作，且近期作品的加权参与达到门槛'); reasons.push('逐片核实动画/制作制片身份，外部合作集中度已核查'); if (record.bulkOnly) reasons.push('原画等参与型署名已按更严格门槛筛选');
      } else if (record.groupCount >= 2 && (record.count >= 3 || record.recent >= 2)) {
        result.tier = 'stable'; reasons.push('在多个项目重复合作，保留为稳定搭档线索');
        if (!profileActivity.checked) reasons.push('外部履历未核实，不升级核心候选');
        else if (profileActivity.share < affinity) reasons.push('公开动画制作履历中的合作分布较广，暂不作为核心候选');
        if (record.weightedCoverage < weighted) reasons.push('近期作品中的加权覆盖未达到核心门槛');
      } else reasons.push(record.count === 1 ? '仅一次合作，证据不足' : '跨项目或近期重复证据不足');
    }
    if (record.trend === 'down') { result.baseTier = result.tier; result.tier = 'history'; reasons.unshift('早期 ' + record.earlier + '/' + record.earlierTotal + ' 部，近作 ' + record.recent + '/' + record.recentTotal + ' 部，合作比例明显下降，已下调'); }
    if (record.trend === 'new') reasons.push('主要出现在近期作品，按近期加入的合作署名观察');
    if (!reliable) reasons.push('样本人员表、系列或相对顺序不完整，不作核心判断');
    return result;
  }
  function finish(sample, profiles) {
    return { engineVersion: VERSION, generatedAt: new Date().toISOString(), options: sample.options, projects: sample.projects, excluded: sample.excluded,
      groupCount: sample.groupCount, recentIds: sample.recentIds, orderCount: sample.orderCount, quality: sample.quality,
      candidates: sample.candidates.map(function (r) { return classify(r, sample, activity(r, profiles.get(r.id))); }) };
  }
  Staff.teamModel = { VERSION: VERSION, DEFAULTS: DEFAULTS, TIERS: TIERS, ANCHOR_ROLES: ANCHOR_ROLES, isAnchor: isAnchor,
    uniqueWorks: uniqueWorks, validDate: validDate, prepare: prepare, activity: activity, classify: classify, finish: finish };
})();
