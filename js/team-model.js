/* 制片人合作结构 v4：主要岗位合作、延续证据与其他制作岗位辅助共事。 */
(function () {
  const VERSION = 4;
  const ANCHOR_ROLES = ['动画制片人', '制作制片人'];
  const TIERS = { core: '核心候选', stable: '稳定合作', external: '高频外部合作', series: '系列内合作', history: '近作合作减少', observe: '待观察' };
  const DEFAULTS = { minGroups: 3, coverage: 0.55, affinity: 0.25, halfLife: 3 };
  const bulkRoles = new Set(['原画', '第二原画', '补间动画', '转场绘', '插画', '上色', '摄影', '3DCG', '3D 动画师', '数码绘图', '制作协力']);
  const seriesRelations = new Set(['前传', '续集', '番外篇', '总集篇', '主线故事', '剧场版', 'TV版', '不同演绎', '前日谈', '续作']);
  const roleFamilies = [
    { key: 'director', label: '导演', roles: ['总导演', '导演', '联合导演', '副导演', '动画导演', '系列监督'] },
    { key: 'direction', label: '演出', roles: ['主演出', '演出', 'OP・ED 演出', 'Bank 分镜演出', 'Live 分镜演出', '剧中剧分镜演出'] },
    { key: 'storyboard', label: '分镜', roles: ['分镜', 'OP・ED 分镜', 'Bank 分镜演出', 'Live 分镜演出', '剧中剧分镜演出'] },
    { key: 'writing', label: '系列构成/脚本', roles: ['系列构成', '副系列构成', '脚本'] },
    { key: 'animation', label: '作画监督', roles: ['总作画监督', '作画监督', '作画监修', '构图作画监督', '机械作画监督', '动作作画监督', '道具作画监督', '特效作画监督', '角色作画监督', '主动画师'] },
    { key: 'design', label: '主要设计', roles: ['人物设定', '副人物设定', '机械设定', '道具设计', '概念设计', '画面设计'] },
    { key: 'production', label: '现场制作管理', roles: ['制作制片人', '制作统括', '制作管理', '设定制作'] },
    { key: 'art', label: '美术/色彩设计', roles: ['美术监督', '美术设计', '色彩设计'] },
    { key: 'visual', label: '摄影/CG/剪辑', roles: ['摄影监督', 'CG 导演', '3DCG 导演', '剪辑'] },
    { key: 'sound', label: '声音主要岗位', roles: ['音响监督', '配音监督', '音乐', '音乐监督'] }
  ];
  function inFamily(role, family) { return family.roles.some(function (r) { return r.replace(/\s/g, '') === String(role).replace(/\s/g, ''); }); }
  function isAnchor(role) { return ANCHOR_ROLES.includes(role); }
  function uniqueWorks(list, anchorsOnly) {
    const map = new Map();
    (list || []).forEach(function (work) {
      if (work.type !== 2 || (anchorsOnly && !isAnchor(work.staff))) return;
      if (!anchorsOnly && !isAnchor(work.staff) && !Staff.compareData.isProductionRole(work.staff)) return;
      if (!map.has(work.id)) map.set(work.id, { id: work.id, name: work.name_cn || work.name || String(work.id), roles: [], scopes: [] });
      const rec = map.get(work.id); if (!rec.roles.includes(work.staff)) rec.roles.push(work.staff);
      if (!rec.scopes.some(function (r) { return r.role === work.staff && r.eps === (work.eps || ''); })) rec.scopes.push({ role: work.staff, eps: work.eps || '' });
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
    const opts = Object.assign({ asOf: new Date().toISOString().slice(0, 10) }, DEFAULTS, options), excluded = [], usable = [], seen = new Set();
    const recaps = new Set();
    projects.forEach(function (p) { (p.relations || []).forEach(function (r) { if (r.type === 2 && r.relation === '总集篇') recaps.add(r.id); }); });
    projects.forEach(function (raw) {
      if (seen.has(raw.id)) return; seen.add(raw.id);
      const own = (raw.persons || []).filter(function (p) { return String(p.id) === String(producerId) && isAnchor(p.relation); });
      const reason = raw.staffFailed ? '人员表获取失败' : (!own.length ? '人员表未核实动画/制作制片身份' : '');
      if (reason) { excluded.push({ id: raw.id, name: raw.name, reason: reason }); return; }
      const split = Staff.compareData.splitCredits(raw.persons, raw.infobox);
      const members = Array.from(split.creative.values()).filter(function (p) { return String(p.id) !== String(producerId); });
      usable.push({ id: raw.id, name: raw.name, date: validDate(raw.date), platform: raw.platform || null, persons: raw.persons,
        availableRoleFamilies: roleFamilies.filter(function (family) { return members.some(function (p) { return Array.from(p.relations).some(function (role) { return inFamily(role, family); }); }); }).map(function (f) { return f.key; }),
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
    if (!profile || !profile.ok) return { checked: false, share: null, total: null, outside: [], roles: [] };
    const refs = uniqueWorks(profile.data, false), shared = new Set(candidate.evidence.map(function (p) { return p.id; }));
    candidate.evidence.forEach(function (p) { if (!refs.some(function (w) { return w.id === p.id; })) refs.push(p); });
    const roles = roleFamilies.map(function (family) {
      const evidence = candidate.evidence.filter(function (p) { return !p.compilation && p.roles.some(function (r) { return inFamily(r, family); }); });
      if (!evidence.length) return null;
      const works = uniqueWorks(profile.data.filter(function (w) { return inFamily(w.staff, family); }), false);
      const missing = evidence.filter(function (p) { return !works.some(function (w) { return w.id === p.id; }); });
      missing.forEach(function (p) { works.push({ id: p.id, name: p.name, roles: p.roles.filter(function (r) { return inFamily(r, family); }) }); });
      return { key: family.key, label: family.label, shared: evidence.length, groups: new Set(evidence.map(function (p) { return p.group; })).size,
        total: works.length, share: works.length ? evidence.length / works.length : 0, sharedIds: evidence.map(function (p) { return p.id; }), works: works, profileComplete: !missing.length };
    }).filter(Boolean);
    return { checked: true, share: refs.length ? shared.size / refs.length : 0, total: refs.length, outside: refs.filter(function (p) { return !shared.has(p.id); }), roles: roles };
  }
  function strongRole(r) {
    if (!r.profileComplete) return false;
    return r.key === 'director' ? ((r.shared >= 3 && r.groups >= 2 && r.share >= .5) || (r.shared >= 5 && r.groups >= 3 && r.share >= .3)) :
      ((r.shared >= 4 && r.groups >= 3 && r.share >= .5) || (r.shared >= 6 && r.groups >= 4 && r.share >= .3));
  }
  function roleReviewWorks(sample, profiles) {
    const known = new Set(sample.projects.map(function (p) { return p.id; })), refs = new Map();
    sample.candidates.forEach(function (c) { activity(c, profiles.get(c.id)).roles.filter(strongRole).forEach(function (r) {
      r.works.forEach(function (w) { if (!known.has(w.id)) refs.set(w.id, w); });
    }); });
    return Array.from(refs.values());
  }
  function continueRoles(record, sample, a, metadata) {
    a.roles.forEach(function (r) {
      const works = r.works.map(function (w) { const meta = metadata.get(w.id) || {}; return Object.assign({}, w, { date: validDate(meta.date), compilation: !!meta.compilation || /总集编|総集編|总集篇/.test(meta.name || w.name || '') }); });
      const comparable = works.filter(function (w) { return !w.compilation; });
      const ordered = comparable.filter(function (w) { return w.date; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
      r.orderComplete = !!ordered.length && ordered.length === comparable.length;
      let start = Math.max(0, ordered.length - 2);
      while (start > 0 && ordered[start - 1].date === ordered[start].date) start--;
      r.recentIds = r.orderComplete ? ordered.slice(start).map(function (w) { return w.id; }) : [];
      r.recentShared = r.recentIds.filter(function (id) { return r.sharedIds.includes(id); }).length;
      r.upcomingIds = works.filter(function (w) { return !w.compilation && w.date && w.date > sample.options.asOf && r.sharedIds.includes(w.id); }).map(function (w) { return w.id; });
      const formats = new Set(sample.projects.filter(function (p) { return r.sharedIds.includes(p.id) && p.platform; }).map(function (p) { return p.platform; }));
      const opportunities = sample.projects.filter(function (p) { return !p.compilation && p.date && p.availableRoleFamilies.includes(r.key) && (!formats.size || !p.platform || formats.has(p.platform)); }).sort(function (a, b) { return a.date.localeCompare(b.date); });
      let cutoff = Math.max(0, opportunities.length - 3);
      while (cutoff > 0 && opportunities[cutoff - 1].date === opportunities[cutoff].date) cutoff--;
      r.opportunityIds = opportunities.slice(cutoff).map(function (p) { return p.id; });
      r.producerRecent = r.sharedIds.filter(function (id) { return r.opportunityIds.includes(id); }).length;
      r.continuing = !!(r.upcomingIds.length || (r.producerRecent && (!r.orderComplete || r.recentShared)));
      r.strong = strongRole(r);
      r.works = works;
    });
    return a.roles.find(function (r) { return r.strong && r.continuing; }) || null;
  }
  function auxiliaryWorks(credits, mainIds) {
    const refs = uniqueWorks(credits || [], false).filter(function (w) { return !mainIds.has(w.id) && w.roles.some(Staff.compareData.isProductionRole); });
    refs.forEach(function (w) { w.producerScopes = (credits || []).filter(function (r) { return r.id === w.id && Staff.compareData.isProductionRole(r.staff); }).map(function (r) { return { role: r.staff, eps: r.eps || '' }; }); });
    return refs;
  }
  function auxiliaryEvidence(producerId, projects) {
    const byPerson = new Map(), seen = new Set();
    (projects || []).forEach(function (p) {
      if (seen.has(p.id)) return;
      seen.add(p.id);
      if (p.staffFailed) return;
      const own = (p.persons || []).filter(function (r) { return String(r.id) === String(producerId) && !isAnchor(r.relation) && Staff.compareData.isProductionRole(r.relation); });
      if (!own.length) return;
      const roles = Array.from(new Set(own.map(function (r) { return r.relation; })));
      Staff.compareData.splitCredits(p.persons, p.infobox).creative.forEach(function (person) {
        if (String(person.id) === String(producerId)) return;
        if (!byPerson.has(person.id)) byPerson.set(person.id, []);
        byPerson.get(person.id).push({ id: p.id, name: p.name, date: validDate(p.date), roles: Array.from(person.relations), producerRoles: roles,
          producerScopes: own.map(function (r) { const ref = (p.producerScopes || []).find(function (s) { return s.role === r.relation; }); return { role: r.relation, eps: r.eps || (ref && ref.eps) || '' }; }) });
      });
    });
    return byPerson;
  }
  function classify(record, sample, profileActivity, context) {
    const o = sample.options, reasons = [], metadata = context.metadata;
    const major = continueRoles(record, sample, profileActivity, metadata);
    const auxiliary = context.auxiliary.get(record.id) || [], bonus = Math.min(5, auxiliary.length);
    const result = Object.assign({}, record, { activity: profileActivity, tier: 'observe', reasons: reasons, coreRoute: null,
      mainRole: major || profileActivity.roles[0] || null, auxiliary: auxiliary, auxiliaryBonus: bonus, rankingSupport: record.weightedCoverage + bonus * .01, volumeTrend: record.trend });
    const reliable = sample.quality.staffComplete && sample.quality.relationsComplete && sample.quality.orderComplete;
    const upcoming = record.evidence.filter(function (p) { return !p.compilation && p.date && p.date > o.asOf; });
    const continuingRole = profileActivity.roles.find(function (r) { return r.shared >= 2 && r.groups >= 2 && r.continuing; });
    if (reliable && major) {
      result.tier = 'core'; result.coreRoute = 'major-role';
      reasons.push(major.label + '岗位合作 ' + major.shared + '/' + major.total + ' 部，跨 ' + major.groups + ' 组项目，达到主要岗位重复合作门槛');
      if (major.upcomingIds.length) reasons.push('已有明确署名的待播主要岗位合作，不判为合作中断或单纯近作减少');
      if (major.recentShared) reasons.push('此人最近两部同类岗位作品中仍有 ' + major.recentShared + ' 部合作，不要求他参加制片人的每部 PV 或短片');
      if (!major.upcomingIds.length && !major.recentShared) reasons.push('制片人的近作中仍有该主要岗位合作');
    } else if (record.count >= 3 && record.groupCount === 1) { result.tier = 'series'; reasons.push('合作次数集中在一个已知系列，不作为跨项目班底证据'); }
    else if (record.bulkOnly && record.count >= 3 && profileActivity.checked && profileActivity.share < .25 && profileActivity.outside.length >= 8 && record.recentRate < .75) {
      result.tier = 'external'; reasons.push('公开动画制作履历分布广，与本制片人的合作占比低于 25%'); reasons.push('仅凭高合作次数和参与型署名，不判为核心');
    } else {
      const groups = record.bulkOnly ? 4 : o.minGroups, weighted = record.bulkOnly ? .7 : o.coverage, affinity = record.bulkOnly ? .5 : o.affinity;
      if (reliable && record.groupCount >= groups && record.weightedCoverage >= weighted && record.recent >= Math.min(2, record.recentTotal) && record.recentRate >= .5 && profileActivity.checked && profileActivity.share >= affinity) {
        result.tier = 'core'; result.coreRoute = 'coverage'; reasons.push('跨项目重复合作，且近期作品的加权参与达到门槛'); reasons.push('逐片核实动画/制作制片身份，外部合作集中度已核查'); if (record.bulkOnly) reasons.push('原画等参与型署名已按更严格门槛筛选');
      } else if (record.groupCount >= 2 && (record.count >= 3 || record.recent >= 2)) {
        result.tier = 'stable'; reasons.push('在多个项目重复合作，保留为稳定搭档线索');
        if (!profileActivity.checked) reasons.push('外部履历未核实，不升级核心候选');
        else if (profileActivity.share < affinity) reasons.push('全履历合作占比较低；主要岗位单独核对，不直接由此排除核心');
        if (record.weightedCoverage < weighted) reasons.push('整体加权覆盖未达门槛，另看主要岗位的重复与延续证据');
      } else reasons.push(record.count === 1 ? '仅一次合作，证据不足' : '跨项目或近期重复证据不足');
    }
    if (record.trend === 'down') {
      if (result.tier === 'core' || continuingRole || upcoming.length) {
        result.trend = 'continued'; reasons.push('总体近作参与比例下降，但主要岗位或已公布合作仍在延续，不按总体比例降级');
      } else { result.baseTier = result.tier; result.tier = 'history'; reasons.unshift('早期 ' + record.earlier + '/' + record.earlierTotal + ' 部，近作 ' + record.recent + '/' + record.recentTotal + ' 部，合作比例下降；暂无已核实的主要岗位延续证据'); }
    }
    if (record.trend === 'new') reasons.push('主要出现在近期作品，按近期加入的合作署名观察');
    if (auxiliary.length) reasons.push('另有 ' + auxiliary.length + ' 部其他制作岗位共事，辅助 +' + bonus + ' 分（上限 5），只用于同岗位同类别内排序，不改变核心门槛');
    if (!reliable) reasons.push('样本人员表、系列或相对顺序不完整，不作核心判断');
    return result;
  }
  function finish(sample, profiles, options) {
    const extra = options || {}, metadata = new Map(sample.projects.map(function (p) { return [p.id, p]; }));
    if (extra.metadata) extra.metadata.forEach(function (value, key) { if (!metadata.has(key)) metadata.set(key, value); });
    const mainIds = new Set(sample.projects.map(function (p) { return p.id; }));
    const auxiliary = auxiliaryEvidence(extra.producerId, (extra.auxiliaryProjects || []).filter(function (p) { return !mainIds.has(p.id); }));
    return { engineVersion: VERSION, generatedAt: new Date().toISOString(), options: sample.options, projects: sample.projects, excluded: sample.excluded,
      groupCount: sample.groupCount, recentIds: sample.recentIds, orderCount: sample.orderCount, quality: sample.quality,
      candidates: sample.candidates.map(function (r) { return classify(r, sample, activity(r, profiles.get(r.id)), { metadata: metadata, auxiliary: auxiliary }); }) };
  }
  Staff.teamModel = { VERSION: VERSION, DEFAULTS: DEFAULTS, TIERS: TIERS, ANCHOR_ROLES: ANCHOR_ROLES, isAnchor: isAnchor,
    uniqueWorks: uniqueWorks, validDate: validDate, prepare: prepare, activity: activity, finish: finish, roleReviewWorks: roleReviewWorks, auxiliaryWorks: auxiliaryWorks };
})();
