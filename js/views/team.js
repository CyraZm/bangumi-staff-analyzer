/* 制片人班底工作区：自动分析、依据查看和本地恢复。 */
(function () {
  const KEY = 'team-workspace-v1';
  const model = Staff.teamModel;
  function defaults() { return { producer: null, works: [], selected: [], report: null, options: { force: false }, rulesVersion: model.VERSION, tier: 'all', keyword: '', sort: 'role', page: 1, scroll: 0 }; }
  let state = defaults(), root = null, job = null, generation = 0, timer = null, epoch = 0, queue = Promise.resolve();
  const html = Staff.ui.escapeHtml;
  function q(selector) { return root && root.querySelector(selector); }
  function pct(value) { return value === null || value === undefined ? '未核实' : Math.round(value * 100) + '%'; }
  function otherProducerWorks(credits) {
    const included = new Set(model.uniqueWorks(credits, true).map(function (w) { return w.id; })), works = new Map();
    credits.forEach(function (w) {
      if (w.type !== 2 || included.has(w.id) || !/制片/.test(w.staff)) return;
      if (!works.has(w.id)) works.set(w.id, { id: w.id, name: w.name_cn || w.name || String(w.id), roles: [] });
      if (!works.get(w.id).roles.includes(w.staff)) works.get(w.id).roles.push(w.staff);
    });
    return Array.from(works.values());
  }
  function labelStatus(text) { const el = q('#team-save'); if (el) el.textContent = text; }
  function flushSave() {
    clearTimeout(timer);
    if (!state.producer) return queue;
    if (root && root.isConnected) state.scroll = scrollY;
    const value = { schema: 1, state: Object.assign({}, state) }, version = epoch;
    queue = queue.catch(function () {}).then(function () { if (version === epoch) return Staff.db.put(Staff.db.STORES.settings, { key: KEY, value: value }); })
      .then(function () { if (version === epoch) labelStatus(job ? '选择已保存，分析仍在进行' : (state.report ? '分析已保存在本机' : '选择已保存在本机')); }).catch(function () { labelStatus('本次打开期间保留分析'); });
    return queue;
  }
  function saveSoon() { clearTimeout(timer); timer = setTimeout(flushSave, 180); }
  async function restoreWorkspace() {
    try {
      const rec = await Staff.db.get(Staff.db.STORES.settings, KEY);
      if (rec && rec.value && rec.value.schema === 1 && rec.value.state && Array.isArray(rec.value.state.works) && Array.isArray(rec.value.state.selected)) {
        state = Object.assign(defaults(), rec.value.state);
        state.rulesVersion = rec.value.state.rulesVersion || 0;
        state.options = { force: !!(state.options && state.options.force) };
        if (state.report && state.report.engineVersion !== model.VERSION) state.report = null;
        if (state.sort === 'span') state.sort = 'role';
      }
    } catch (err) { /* The in-memory workspace remains available. */ }
  }
  async function clearWorkspace() {
    if (job) job.cancelled = true;
    job = null; ++generation; ++epoch; clearTimeout(timer); state = defaults();
    if (root) build();
    await queue;
    await Staff.db.remove(Staff.db.STORES.settings, KEY);
  }
  function afterRender() { requestAnimationFrame(function () { if (root && root.isConnected) scrollTo(0, state.scroll || 0); }); }
  function render(container, params) {
    if (!root) { root = document.createElement('div'); root.className = 'team-workspace'; build(); }
    container.appendChild(root);
    if (params && params.id && (String(params.id) !== String(state.producer && state.producer.id) || state.rulesVersion !== model.VERSION)) loadProducer(params.id);
    else if (state.producer && state.rulesVersion !== model.VERSION) loadProducer(state.producer.id);
  }
  function selectProducer(id) {
    if (String(state.producer && state.producer.id) === String(id)) return;
    const target = '#/team?id=' + encodeURIComponent(id);
    if (location.hash === target) loadProducer(id); else location.hash = target;
  }
  function build() {
    root.innerHTML = '<div class="team-page-head"><div><span class="section-kicker">从制片人出发</span><h2 class="page-title">寻找长期合作的制作班底</h2>' +
      '<p class="page-desc">分析全部制片作品与合作署名，结合总合作数量和近作权重，区分当前搭档、广泛合作与近作减少的历史关系。</p></div><span class="team-mark" aria-hidden="true">TEAM<br>NOTES</span></div>' +
      '<section class="card team-search"><label for="team-search-input">选择动画制片人</label><div class="row"><div class="combo" id="team-combo"></div>' +
      '<button class="btn secondary" id="team-by-id">按 ID 载入</button></div><p class="small muted">搜索姓名，或输入人物链接 / ID。只分析本人明确担任动画制片人／制作制片人的作品。普通制片人、制作进行、企划等其他身份不纳入。</p>' +
      '<div class="row"><button class="example-chip" data-producer="27888">梅原翔太</button><button class="example-chip" data-producer="30844">福士裕一郎</button><button class="example-chip" data-producer="914">丸山正雄</button></div></section><div id="team-profile"></div><div id="team-options"></div>' +
      '<div class="compare-tools"><span id="team-save">分析自动保存在本机</span><div class="row"><button class="btn secondary small" id="team-export-json" disabled>导出分析 JSON</button>' +
      '<button class="btn secondary small" id="team-export-csv" disabled>导出名单 CSV</button></div></div><div id="team-progress" aria-live="polite"></div><div id="team-report"></div>';
    const combo = Staff.ui.combo(q('#team-combo'), { placeholder: '搜索动画制片人，如：梅原翔太',
      onSearch: function (keyword, done) { Staff.api.searchPersons(keyword, '').then(function (list) {
        done(list.filter(function (p) { return p.type === 1 || p.type === 3; }).slice(0, 20).map(function (p) { return { id: p.id, label: p.name, meta: (p.career || []).join(' / ') || '载入后核对作品身份' }; }));
      }).catch(function () { done([]); }); }, onPick: function (p) { selectProducer(p.id); } });
    combo.input.id = 'team-search-input'; combo.setValue(state.producer ? state.producer.name : '');
    q('#team-by-id').addEventListener('click', function () {
      const value = combo.getValue();
      const match = value.match(/^\d+$/) || value.match(/(?:bgm\.tv|bangumi\.tv|chii\.in)\/person\/(\d+)/);
      if (!match) { Staff.ui.toast('请输入人物 ID 或 Bangumi 人物链接'); return; }
      selectProducer(match[1] || match[0]);
    });
    root.querySelectorAll('[data-producer]').forEach(function (button) { button.addEventListener('click', function () { selectProducer(button.dataset.producer); }); });
    q('#team-export-json').addEventListener('click', function () { download(JSON.stringify(state.report, null, 2), 'json', 'application/json'); });
    q('#team-export-csv').addEventListener('click', exportCsv);
    renderProfile(); renderOptions(); renderReport();
  }
  async function loadProducer(id) {
    if (job) job.cancelled = true;
    job = null; const token = ++generation;
    q('#team-profile').innerHTML = Staff.ui.loading('正在核对制片人参与作品…');
    q('#team-options').innerHTML = ''; q('#team-progress').innerHTML = ''; q('#team-report').innerHTML = '';
    q('#team-export-json').disabled = true; q('#team-export-csv').disabled = true;
    try {
      const results = await Promise.all([Staff.api.getPerson(id), Staff.api.getPersonSubjects(id)]);
      if (token !== generation || (Staff.runtime && Staff.runtime.isStopped())) return;
      if (results[0].type === 2) throw new Error('请载入个人制片人，而不是制作公司');
      state = Object.assign(defaults(), { producer: { id: results[0].id, name: results[0].name, type: results[0].type }, works: model.uniqueWorks(results[1], true), otherProducerWorks: otherProducerWorks(results[1]), otherRoles: (results[1] || []).filter(function (w) { return w.type === 2 && !model.isAnchor(w.staff); }).reduce(function (all, w) { all[w.staff] = (all[w.staff] || 0) + 1; return all; }, {}) });
      state.selected = state.works.map(function (w) { return w.id; });
      q('#team-search-input').value = state.producer.name;
      q('#team-progress').innerHTML = '';
      renderProfile(); renderOptions(); renderReport(); saveSoon();
    } catch (err) {
      if (token !== generation) return;
      q('#team-profile').innerHTML = '<p class="compare-error" role="alert">载入失败：' + html(err.message) + '</p>';
    }
  }
  function renderProfile() {
    const el = q('#team-profile'); if (!el) return;
    if (!state.producer) { el.innerHTML = Staff.ui.empty('先选择一位制片人，自动分析其全部制片作品。'); return; }
    const other = Object.keys(state.otherRoles || {}).sort(function (a, b) { return state.otherRoles[b] - state.otherRoles[a]; });
    const reportWorks = state.report ? state.report.projects : [];
    el.innerHTML = '<section class="card"><div class="comparison-heading"><div><h3>' + html(state.producer.name) + ' ' + Staff.ui.typeBadge(state.producer.type) + '</h3>' +
      '<p class="small muted">' + Staff.ui.personLink(state.producer.id, 'Bangumi 资料 ↗') + ' · 全部 ' + state.works.length + ' 部明确动画/制作制片作品</p></div></div>' +
      '<p class="small muted">动画制片人、制作制片人与普通制片人分别处理，仅前两种身份进入本次班底分析。</p>' +
      (!state.works.length ? '<p>没有找到明确动画/制作制片署名的作品，不会用普通制片人或制作进行等身份代替。</p>' :
      '<details class="team-samples"><summary>全部制片样本 · ' + state.works.length + ' 部（自动纳入，无需手动筛选）</summary>' +
      '<ul class="team-evidence-list">' + state.works.map(function (w) { const verified = reportWorks.find(function (r) { return r.id === w.id; }); return '<li>' + Staff.ui.subjectLink(w.id, w.name) + '<span>' + html(w.roles.join('、')) + (verified ? ' · 核实署名：' + html(verified.anchorRoles.join('、')) : '') + '</span></li>'; }).join('') + '</ul></details>') +
      (state.otherProducerWorks && state.otherProducerWorks.length ? '<details class="team-method" style="margin-top:14px"><summary>其他制片称谓 · ' + state.otherProducerWorks.length + ' 部未纳入</summary><p class="small muted">普通制片人等称谓不能自动等同于动画制作班底的负责人，保留原始履历供核对，不参与计算。</p><ul class="team-evidence-list">' + state.otherProducerWorks.map(function (w) { return '<li>' + Staff.ui.subjectLink(w.id, w.name) + '<span>' + html(w.roles.join('、')) + ' · 不参与班底计算</span></li>'; }).join('') + '</ul></details>' : '') +
      (other.length ? '<details class="team-method" style="margin-top:14px"><summary>其他身份不纳入班底样本</summary><p class="small muted">' + other.map(function (role) { return html(role) + ' ' + state.otherRoles[role] + ' 条'; }).join(' · ') + '</p><p class="small muted">逐片核对动画/制作制片岗位，不按首次当制片人的年份把其他岗位作品一并算入。</p></details>' : '') + '</section>';
  }
  function renderOptions() {
    const el = q('#team-options');
    if (!state.producer || !state.works.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<section class="card team-conditions"><div class="comparison-heading"><h3>全部作品，近作权重更高</h3><span class="small muted">不使用年份跨度筛选</span></div>' +
      '<p class="comparison-note">综合总合作数量、已知系列合并后的项目覆盖与近作参与。早期合作多、近作比例明显下降的署名会下调并标注；总集篇保留记录，但不重复抬高近作权重。</p>' +
      '<div class="row"><label class="small"><input type="checkbox" id="team-force" ' + (state.options.force ? 'checked' : '') + '> 重新获取资料</label><button class="btn" id="team-start">' + (state.report ? '重新分析全部制片作品' : '分析全部制片作品') + '</button><span class="small muted">全部 staff 都会展示；跨项目重复合作者全部核查外部履历，可随时取消。</span></div></section>';
    el.querySelectorAll('input,button').forEach(function (input) { input.disabled = !!job; });
    q('#team-force').addEventListener('change', function () { state.options = { force: this.checked }; saveSoon(); });
    q('#team-start').addEventListener('click', startAnalysis);
  }
  async function startAnalysis() {
    if (job) return;
    if (!state.works.length) { Staff.ui.toast('该人物暂无可核实的制片作品'); return; }
    const signal = { cancelled: false }, token = ++generation; job = signal;
    renderProfile(); renderOptions();
    q('#team-progress').innerHTML = '<section class="card"><div class="row" style="justify-content:space-between"><strong id="team-phase">准备核查…</strong><button class="btn small danger" id="team-cancel">取消分析</button></div><div class="progress-bar"><i></i></div><p class="small muted" id="team-count"></p></section>';
    q('#team-cancel').addEventListener('click', function () { signal.cancelled = true; q('#team-phase').textContent = '正在取消…'; });
    try {
      const credits = await Staff.api.getPersonSubjects(state.producer.id, state.options.force);
      if (token !== generation || signal.cancelled || (Staff.runtime && Staff.runtime.isStopped())) return;
      const refs = model.uniqueWorks(credits, true);
      state.works = refs; state.selected = refs.map(function (w) { return w.id; });
      state.otherProducerWorks = otherProducerWorks(credits);
      state.otherRoles = credits.filter(function (w) { return w.type === 2 && !model.isAnchor(w.staff); }).reduce(function (all, w) { all[w.staff] = (all[w.staff] || 0) + 1; return all; }, {});
      const report = await Staff.teamLoader.run(state.producer, refs, Object.assign({}, state.options, { concurrency: Staff.api.defaultLimiter.concurrency, interval: Staff.api.defaultLimiter.interval }), signal,
        function (label, done, total) { if (token !== generation) return; q('#team-phase').textContent = label; q('#team-count').textContent = done + ' / ' + total;
          q('#team-progress .progress-bar i').style.width = (total ? Math.round(done / total * 100) : 100) + '%'; });
      if (token !== generation || signal.cancelled || (Staff.runtime && Staff.runtime.isStopped())) return;
      state.report = report; state.tier = 'all'; state.page = 1; renderReport(); await flushSave();
    } catch (err) { if (token === generation && !err.cancelled) Staff.ui.toast('分析未完成：' + err.message, 'error'); }
    finally { if (token === generation) { job = null; q('#team-progress').innerHTML = ''; renderProfile(); renderOptions(); } }
  }
  function renderReport() {
    const el = q('#team-report'); if (!el) return;
    const r = state.report;
    q('#team-export-json').disabled = !r; q('#team-export-csv').disabled = !r;
    if (!r) { el.innerHTML = ''; return; }
    const counts = {}; Object.keys(model.TIERS).forEach(function (key) { counts[key] = r.candidates.filter(function (c) { return c.tier === key; }).length; });
    el.innerHTML = '<section class="team-report-head"><div class="comparison-heading"><div><span class="section-kicker">合作结构 · ' + html(r.producer.name) + '</span><h3>长期合作的线索</h3></div>' +
      '<span class="small muted">' + html(r.generatedAt.slice(0, 10)) + ' 完成</span></div><div class="team-metrics">' +
      '<div><strong>' + r.projects.length + '</strong><span>纳入作品</span></div><div><strong>' + r.groupCount + '</strong><span>合并已知系列后的项目组</span></div><div><strong>' + counts.core + '</strong><span>核心候选署名</span></div><div><strong>' + counts.stable + '</strong><span>稳定合作署名</span></div></div>' +
      '<p class="comparison-note">判定是公开署名支持的候选关系，不能证明固定雇佣或私下合作。近作窗口为最近 ' + r.recentIds.length + ' 部非总集篇作品；日期只用于辅助排序，不按年份跨度判断。</p>' +
      '<p class="small muted">已核对 ' + r.checks.profilesSucceeded + ' / ' + r.checks.eligiblePeople + ' 位跨项目合作者的全部公开动画制作履历。未完成核查者不会凭合作次数升级为核心候选。</p>' +
      ((!r.quality.staffComplete || !r.quality.relationsComplete || !r.quality.orderComplete) ? '<p class="source-order-note">部分人员表、系列关系或相对顺序未核实。本次不升级核心候选，也不对未知顺序强行标注近作减少。</p>' : '') + '</section>' +
      '<details class="card team-method"><summary>判断规则与全部样本依据</summary><p>所有制片作品都纳入记录。近作权重按作品次序递减：每向前 3 部权重减半，不比较相隔几年。相同发布日期取相同权重，总集篇不抬高近作权重。</p>' +
      '<p>核心候选要求至少 3 组项目、近作加权覆盖至少 55%、最近作品至少参与两部且覆盖近作一半，并核对其全部公开动画制作履历中的合作集中度至少 25%。全部样本均需逐片确认动画/制作制片身份。</p>' +
      '<p>只有原画等参与型署名时门槛提高为至少 4 组、加权覆盖 70%、合作集中度 50%。广泛参与其他作品且只靠累计次数多的署名不直接当作核心。近作参与比例降到早期一半及以下且早期有重复合作时，会标注「近作合作减少」并下调。</p>' +
      '<p>日期仅近似作品公开发布先后，不能代表开工时间和实际合作时长。普通制片人、执行制片人、企划、制作进行等其他身份完全排除。多人共同担任动画制片人的作品也不能证明 staff 独属于某一人。</p>' +
      '<h4>近作窗口</h4>' + sampleList(r.projects.filter(function (p) { return r.recentIds.includes(p.id); })) + '<h4>全部纳入作品</h4>' + sampleList(r.projects) +
      (r.excluded.length ? '<h4>未能核实</h4><ul>' + r.excluded.map(function (w) { return '<li>' + Staff.ui.subjectLink(w.id, w.name) + ' · ' + html(w.reason) + '</li>'; }).join('') + '</ul>' : '') + '</details>' +
      '<section class="card"><div class="team-filter-row" id="team-tiers"></div><div class="row team-table-tools"><input type="search" id="team-filter" aria-label="筛选合作人员或职务" placeholder="筛选姓名或职务" value="' + html(state.keyword) + '">' +
      '<select id="team-sort" aria-label="人员排序"><option value="role">岗位与近作优先：导演→演出→分镜…</option><option value="coverage">近作加权覆盖优先</option><option value="groups">跨项目数量优先</option><option value="count">总合作次数优先</option></select></div>' +
      '<div id="team-table"></div><div id="team-pagination" class="row"></div></section>';
    const tiers = [{ key: 'repeat', label: '重复合作', count: r.candidates.filter(function (c) { return c.count >= 2; }).length }].concat(Object.keys(model.TIERS).map(function (key) { return { key: key, label: model.TIERS[key], count: counts[key] }; }), [{ key: 'all', label: '全部含单次', count: r.candidates.length }]);
    q('#team-tiers').innerHTML = tiers.map(function (tier) { return '<button class="chip' + (state.tier === tier.key ? ' active' : '') + '" data-tier="' + tier.key + '" aria-pressed="' + (state.tier === tier.key) + '">' + tier.label + ' <strong>' + tier.count + '</strong></button>'; }).join('');
    q('#team-tiers').querySelectorAll('[data-tier]').forEach(function (button) { button.addEventListener('click', function () { state.tier = button.dataset.tier; state.page = 1; renderReport(); saveSoon(); }); });
    q('#team-filter').addEventListener('input', function () { state.keyword = this.value; state.page = 1; drawTable(); saveSoon(); });
    q('#team-sort').value = state.sort;
    q('#team-sort').addEventListener('change', function () { state.sort = this.value; state.page = 1; drawTable(); saveSoon(); });
    drawTable();
  }
  function sampleList(works) {
    return '<ul class="team-evidence-list">' + works.map(function (w) { return '<li>' + Staff.ui.subjectLink(w.id, w.name) + '<span>' + html(w.date || '日期未知') + ' · 项目组 ' + w.group + ' · 制片署名：' + html(w.anchorRoles.join('、')) + (w.studio ? ' · ' + html(w.studio) : '') + '</span></li>'; }).join('') + '</ul>';
  }
  function visibleCandidates() {
    const keyword = state.keyword.trim().toLowerCase();
    const tierOrder = { core: 0, stable: 1, external: 2, series: 3, observe: 4, history: 5 };
    return state.report.candidates.filter(function (c) {
      return (state.tier === 'all' || (state.tier === 'repeat' ? c.count >= 2 : c.tier === state.tier)) && (!keyword || (c.name + ' ' + c.roles.join(' ')).toLowerCase().includes(keyword));
    }).sort(function (a, b) {
      if (state.sort === 'coverage') return b.weightedCoverage - a.weightedCoverage || Staff.compareData.comparePriority(a, b);
      if (state.sort === 'groups') return b.groupCount - a.groupCount || Staff.compareData.comparePriority(a, b);
      if (state.sort === 'count') return b.count - a.count || Staff.compareData.comparePriority(a, b);
      return Number(a.trend === 'down') - Number(b.trend === 'down') || Staff.compareData.rankEntry(a) - Staff.compareData.rankEntry(b) || tierOrder[a.tier] - tierOrder[b.tier] || b.weightedCoverage - a.weightedCoverage || b.count - a.count;
    });
  }
  function drawTable() {
    const list = visibleCandidates(), size = 40, pages = Math.max(1, Math.ceil(list.length / size));
    state.page = Math.min(Math.max(1, state.page), pages);
    const shown = list.slice((state.page - 1) * size, state.page * size);
    q('#team-table').innerHTML = !shown.length ? Staff.ui.empty('当前筛选下没有合作署名。可切换范围或查看单次参与。') :
      '<div class="table-wrap team-table-wrap" tabindex="0" role="region" aria-label="制片人合作结构，可横向滚动"><table class="data team-table"><thead><tr><th>制作人员 / 组合</th><th>主要制作职务</th><th>合作</th><th>项目组</th><th>总项目覆盖</th><th>近作参与</th><th>近作加权覆盖</th><th>全履历集中度</th><th>判断</th><th>依据</th></tr></thead><tbody>' + shown.map(function (c) {
        const a = c.activity;
        return '<tr data-team-person="' + c.id + '"><td>' + Staff.ui.personLink(c.id, c.name) + (c.type === 3 ? ' ' + Staff.ui.typeBadge(3) : '') + '</td><td>' + c.roles.slice(0, 4).map(Staff.ui.roleBadge).join(' ') + '</td>' +
          '<td>' + c.count + ' 部</td><td>' + c.groupCount + ' 组</td><td>' + pct(c.coverage) + '</td><td>' + c.recent + ' / ' + c.recentTotal + (c.trend === 'down' ? '<br><strong class="trend-down">近作减少</strong>' : (c.trend === 'new' ? '<br>近作加入' : '')) + '</td><td>' + pct(c.weightedCoverage) + '</td><td>' + (a.checked ? pct(a.share) : '未核实') + '</td>' +
          '<td><span class="team-tier tier-' + c.tier + '">' + model.TIERS[c.tier] + '</span></td><td><button class="btn secondary small" data-evidence="' + c.id + '" aria-expanded="false">查看依据</button></td></tr>' +
          '<tr class="team-evidence" id="team-evidence-' + c.id + '" hidden><td colspan="10"><div class="team-evidence-grid"><div><h4>判定依据</h4><ul>' + c.reasons.map(function (reason) { return '<li>' + html(reason) + '</li>'; }).join('') + '</ul>' +
          '<p>早期作品 ' + c.earlier + ' / ' + c.earlierTotal + ' 部，近作 ' + c.recent + ' / ' + c.recentTotal + ' 部。' + (a.checked ? '全部公开动画制作履历 ' + a.total + ' 部，与本制片人合作 ' + c.count + ' 部。' : '尚未完成外部履历核查。') + '</p>' +
          '<a href="#/analysis?id=' + c.id + '">查看此人的全部参与作品 →</a></div><div><h4>合作作品与职务</h4><ul class="team-evidence-list">' + c.evidence.map(function (w) { return '<li>' + Staff.ui.subjectLink(w.id, w.name) + '<span>' + html(w.date || '日期未知') + ' · 项目组 ' + w.group + ' · 合作职务：' + html(w.roles.join('、')) + '<br>制片署名：' + html(w.anchorRoles.join('、')) + '</span></li>'; }).join('') + '</ul>' +
          (a.outside && a.outside.length ? '<details><summary>其他公开动画制作作品（' + a.outside.length + ' 部）</summary><ul class="team-evidence-list">' + a.outside.map(function (w) { return '<li>' + Staff.ui.subjectLink(w.id, w.name) + '</li>'; }).join('') + '</ul></details>' : '') + '</div></div></td></tr>';
      }).join('') + '</tbody></table></div>';
    q('#team-table').querySelectorAll('[data-evidence]').forEach(function (button) { button.addEventListener('click', function () {
      const target = q('#team-evidence-' + button.dataset.evidence); target.hidden = !target.hidden; button.setAttribute('aria-expanded', String(!target.hidden)); button.textContent = target.hidden ? '查看依据' : '收起依据';
    }); });
    const pagination = q('#team-pagination');
    pagination.innerHTML = '<span class="small muted">' + list.length + ' 项署名 · 第 ' + state.page + ' / ' + pages + ' 页</span><button class="btn secondary small" id="team-prev" ' + (state.page === 1 ? 'disabled' : '') + '>上一页</button><button class="btn secondary small" id="team-next" ' + (state.page === pages ? 'disabled' : '') + '>下一页</button>';
    q('#team-prev').addEventListener('click', function () { state.page--; drawTable(); saveSoon(); });
    q('#team-next').addEventListener('click', function () { state.page++; drawTable(); saveSoon(); });
  }
  function download(data, extension, mime) {
    if (!state.report) return;
    const url = URL.createObjectURL(new Blob([data], { type: mime + ';charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = '制作班底-' + state.producer.name.replace(/[\\/:*?"<>|]/g, '_') + '.' + extension; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function exportCsv() {
    function cell(value) { let s = String(value === null || value === undefined ? '' : value); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
    const rows = [['名称', 'Bangumi ID', '类型', '制作职务', '判定', '合作作品数', '合并系列项目组', '总项目覆盖率', '近作参与', '近作加权覆盖', '全履历合作集中度', '理由']].concat(state.report.candidates.map(function (c) {
      return [c.name, c.id, c.type === 3 ? '组合' : '个人', c.roles.join('、'), model.TIERS[c.tier], c.count, c.groupCount, pct(c.coverage), c.recent + '/' + c.recentTotal, pct(c.weightedCoverage), pct(c.activity.share), c.reasons.join('；')];
    }));
    download('\ufeff' + rows.map(function (row) { return row.map(cell).join(','); }).join('\r\n'), 'csv', 'text/csv');
  }
  window.addEventListener('scroll', function () { if (root && root.isConnected) saveSoon(); }, { passive: true });
  window.addEventListener('pagehide', flushSave);
  Staff.views = Staff.views || {};
  Staff.views.team = { render: render, restoreWorkspace: restoreWorkspace, clearWorkspace: clearWorkspace, flushSave: flushSave, leave: flushSave, afterRender: afterRender };
})();
