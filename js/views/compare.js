/* bangumi-staff-analyzer 对比视图
 * 作品对比：独立署名与实际制作职务分层，单一人员矩阵支持 2–8 部作品
 * 公司对比：支持 N 家公司（默认 2），聚合各公司「动画制作」作品的 staff 重叠（观察人员流动）
 */
(function () {
  const TYPE_OPTIONS = [
    { code: 2, label: '动画' },
    { code: 3, label: '音乐' },
    { code: 4, label: '游戏' },
    { code: 6, label: '三次元' },
    { code: 1, label: '书籍' }
  ];
  const MAX_PANELS = 8;

  function newSession(mode) {
    return { mode: mode, panels: [], overlapScope: 'shared', ui: null, run: null, concurrency: 5, interval: 200 };
  }
  const sessions = { work: newSession('work'), company: newSession('company') };
  let state = sessions.work;
  let nextKey = 1;
  let workspaceRoot = null;
  let captureTimer = null;
  let suppressCaptures = false;

  function query(selector) { return workspaceRoot && workspaceRoot.querySelector(selector); }

  function captureUi() {
    if (!workspaceRoot || !workspaceRoot.isConnected) return;
    state.ui = {
      scrollTop: workspaceRoot.isConnected ? window.scrollY : (state.ui ? state.ui.scrollTop : 0),
      details: Array.from(workspaceRoot.querySelectorAll('details'), function (el) { return el.open; }),
      scrolls: Array.from(workspaceRoot.querySelectorAll('.table-wrap'), function (el) { return el.scrollLeft; })
    };
    const conc = query('#cmp-conc'), interval = query('#cmp-int');
    if (conc) state.concurrency = parseInt(conc.value, 10) || 5;
    if (interval) state.interval = Math.max(0, parseInt(interval.value, 10) || 0);
  }

  function applyUi() {
    if (!state.ui || !workspaceRoot) return;
    suppressCaptures = true;
    workspaceRoot.querySelectorAll('details').forEach(function (el, i) { el.open = !!state.ui.details[i]; });
    workspaceRoot.querySelectorAll('.table-wrap').forEach(function (el, i) { el.scrollLeft = state.ui.scrolls[i] || 0; });
    suppressCaptures = false;
  }

  function afterRender() {
    const session = state;
    requestAnimationFrame(function () {
      if (state !== session || !workspaceRoot || !workspaceRoot.isConnected) return;
      applyUi();
      window.scrollTo(0, session.ui ? session.ui.scrollTop : 0);
    });
  }

  function rememberUi() {
    clearTimeout(captureTimer);
    if (!suppressCaptures) captureUi();
  }

  function scheduleCapture() {
    if (suppressCaptures) return;
    clearTimeout(captureTimer);
    captureTimer = setTimeout(rememberUi, 180);
  }

  function leave() { rememberUi(); }

  function cancelRun(session) {
    if (session.run) session.run.signal.cancelled = true;
    session.run = null;
  }

  function clearWorkspace() {
    clearTimeout(captureTimer);
    cancelRun(sessions.work);
    cancelRun(sessions.company);
    sessions.work = newSession('work');
    sessions.company = newSession('company');
    state = sessions.work;
    suppressCaptures = true;
    if (workspaceRoot) { updateModeButtons(); resetPanels(); }
    suppressCaptures = false;
  }

  window.addEventListener('scroll', function () {
    if (workspaceRoot && workspaceRoot.isConnected) scheduleCapture();
  }, { passive: true });

  /* ============ 渲染入口 ============ */
  function render(container) {
    if (workspaceRoot) { container.appendChild(workspaceRoot); return; }
    workspaceRoot = document.createElement('div');
    workspaceRoot.className = 'compare-workspace';
    container.appendChild(workspaceRoot);
    workspaceRoot.innerHTML =
      '<h2 class="page-title">发现制作人员的交集</h2>' +
      '<p class="page-desc">选择 2–8 部作品或公司，把制作人员的交集与企划、出品等署名分开阅读。合作记录提供线索，不直接代表固定班底。</p>' +
      '<div class="compare-tabs" role="group" aria-label="对比类型">' +
      '  <button type="button" class="chip" id="mode-work">作品对比</button> ' +
      '  <button type="button" class="chip" id="mode-company">公司对比</button>' +
      '</div>' +
      '<div class="compare-tools"><span id="cmp-save-status">仅本次打开期间保留，切页不丢失；刷新或关闭后清空</span><button class="btn secondary small" id="cmp-reset">清空本次对比</button></div>' +
      '<div id="cmp-panels"></div>' +
      '<div id="cmp-action" style="margin-bottom:16px"></div>' +
      '<div id="cmp-result"></div>';

    query('#mode-work').addEventListener('click', function () { switchMode('work'); });
    query('#mode-company').addEventListener('click', function () { switchMode('company'); });

    query('#cmp-reset').addEventListener('click', function () {
      cancelRun(state);
      state.ui = null;
      resetPanels();
      rememberUi();
    });
    workspaceRoot.addEventListener('input', scheduleCapture);
    workspaceRoot.addEventListener('change', scheduleCapture);
    workspaceRoot.addEventListener('toggle', scheduleCapture, true);
    workspaceRoot.addEventListener('scroll', scheduleCapture, true);
    updateModeButtons();
    if (state.panels.length) { renderPanels(); renderResult(); applyUi(); }
    else resetPanels();
  }

  function switchMode(mode) {
    if (state.mode === mode) return;
    captureUi();
    rememberUi();
    state = sessions[mode];
    updateModeButtons();
    if (state.panels.length) { renderPanels(); renderResult(); applyUi(); }
    else resetPanels();
    afterRender();
    scheduleCapture();
  }

  function updateModeButtons() {
    ['work', 'company'].forEach(function (mode) {
      const button = query('#mode-' + mode);
      button.classList.toggle('active', state.mode === mode);
      button.setAttribute('aria-pressed', state.mode === mode ? 'true' : 'false');
    });
  }

  function resetPanels() {
    cancelRun(state);
    state.panels = [];
    state.overlapScope = 'shared';
    addPanel();
    addPanel();
    renderPanels();
    renderResult();
  }

  function addPanel() {
    if (state.panels.length >= MAX_PANELS) return;
    state.panels.push({ key: nextKey++, index: 0, workType: 2, subject: null, company: null, staff: null, request: 0 });
    reindex();
  }

  function removePanel(key) {
    cancelRun(state);
    if (state.panels.length <= 1) return;
    state.panels = state.panels.filter(function (p) { return p.key !== key; });
    reindex();
  }

  function reindex() {
    state.panels.forEach(function (p, i) { p.index = i + 1; });
  }

  /* ============ 面板渲染 ============ */
  function renderPanels() {
    const wrap = query('#cmp-panels');
    if (!wrap) return;
    wrap.innerHTML = '';
    state.panels.forEach(function (p) {
      wrap.appendChild(buildPanelEl(p));
    });
    const addBox = document.createElement('div');
    addBox.style.marginBottom = '16px';
    const btn = document.createElement('button');
    btn.className = 'btn secondary small';
    const atMax = state.panels.length >= MAX_PANELS;
    btn.textContent = atMax ? '最多 ' + MAX_PANELS + ' 个' : (state.mode === 'work' ? '+ 添加作品' : '+ 添加公司');
    btn.disabled = atMax;
    btn.addEventListener('click', function () {
      addPanel();
      renderPanels();
      renderResult();
    });
    addBox.appendChild(btn);
    wrap.appendChild(addBox);
  }

  function buildPanelEl(p) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.panel = p.key;
    const isCompanyMode = state.mode === 'company';
    card.innerHTML =
      '<div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">' +
      '  <h3 style="margin:0">' + (isCompanyMode ? '公司 ' : '作品 ') + p.index + '</h3>' +
      '  <button class="btn small secondary" data-rm ' + (state.panels.length <= 1 ? 'disabled' : '') + '>移除</button>' +
      '</div>' +
      (isCompanyMode ? '' :
        '<div class="row" style="margin-bottom:8px"><select data-type>' +
        TYPE_OPTIONS.map(function (t) { return '<option value="' + t.code + '">' + t.label + '</option>'; }).join('') +
        '</select><button class="btn secondary small" data-load-id>按 ID 载入</button></div>') +
      '<div class="small muted" style="margin-bottom:6px">' + (isCompanyMode ? '搜索公司名称，或粘贴公司主页链接 / ID' : '搜索条目，或粘贴条目链接 / ID') + '</div>' +
      '<div class="combo" data-combo></div>' +
      '<div data-loadbox style="margin-top:10px"></div>';

    if (isCompanyMode) {
      card.querySelector('[data-rm]').addEventListener('click', function () {
        removePanel(p.key);
        renderPanels();
        renderResult();
      });
    } else {
      const sel = card.querySelector('[data-type]');
      sel.value = p.workType;
      sel.addEventListener('change', function () { p.workType = parseInt(sel.value, 10); scheduleCapture(); });
      card.querySelector('[data-rm]').addEventListener('click', function () {
        removePanel(p.key);
        renderPanels();
        renderResult();
      });
    }

    const combo = Staff.ui.combo(card.querySelector('[data-combo]'), {
      placeholder: isCompanyMode ? '输入公司名搜索，如：京都动画' : '输入作品名搜索，如：孤独摇滚',
      onSearch: function (kw, done) {
        if (isCompanyMode) {
          Staff.api.searchPersons(kw, '').then(function (list) {
            done(list.slice(0, 20).map(function (s) {
              return {
                id: s.id,
                label: s.name,
                meta: (s.type === 2 ? '公司 · ' : '个人 · ') + ((s.career || []).join('/') || '未填职业'),
                value: s.id
              };
            }));
          }).catch(function () { done([]); });
        } else {
          Staff.api.searchSubjects(kw, [p.workType]).then(function (list) {
            done(list.slice(0, 20).map(function (s) {
              return { id: s.id, label: (s.name_cn || s.name), meta: (s.date || '') + ' · ' + s.name, value: s.id };
            }));
          }).catch(function () { done([]); });
        }
      },
      onPick: function (item) {
        p.query = item.label;
        if (isCompanyMode) loadCompany(p, item.id);
        else loadWork(p, item.id);
      }
    });

    combo.setValue(p.query || '');
    combo.input.addEventListener('input', function () { p.query = combo.input.value; scheduleCapture(); });

    if (!isCompanyMode) {
      card.querySelector('[data-load-id]').addEventListener('click', function () {
        const id = Staff.api.parseSubjectId(combo.getValue());
        if (!id) { Staff.ui.toast('请输入有效的条目链接或 ID'); return; }
        loadWork(p, id);
      });
    }

    renderPanelLoadbox(p, card.querySelector('[data-loadbox]'));
    return card;
  }

  function renderPanelLoadbox(p, box) {
    if (p.loading) {
      box.innerHTML = Staff.ui.loading(state.mode === 'work' ? '正在加载作品…' : '正在加载公司…');
    } else if (p.error) {
      box.innerHTML = '<p class="compare-error" role="alert">' + Staff.ui.escapeHtml(p.error) + '</p>';
    } else if (state.mode === 'work' && p.subject) {
      const credits = p.credits || Staff.compareData.splitCredits(p.subject.persons, p.subject.infobox);
      box.innerHTML =
        '<div class="selected-work"><strong>' + Staff.ui.escapeHtml(p.subject.name) + '</strong> ' + Staff.ui.subjectLink(p.subject.id, 'Bangumi ↗') + '</div>' +
        '<p class="work-credit-count"><strong>' + credits.creative.size + '</strong> 项制作署名纳入交集</p>' +
        '<div class="work-context">' +
        separateGroup('动画制作公司', credits.studio, p.separateCounts) +
        separateGroup('动画制片人', credits.producer, p.separateCounts) +
        '<p class="context-footnote">以上独立展示，不计入人员交集。</p></div>';
    } else if (state.mode === 'company' && p.company) {
      const c = p.company;
      box.innerHTML =
        '<div class="row" style="justify-content:space-between">' +
        '  <div><strong>' + Staff.ui.escapeHtml(c.name) + '</strong> ' + Staff.ui.typeBadge(c.type) +
        '    <span class="muted small">动画制作作品 ' + c.works.length + ' 部' +
        (c.works.length !== c.worksAll.length ? ' / 全部参与 ' + c.worksAll.length + ' 部' : '') +
        (c.staff ? ' · staff ' + c.staff.length + ' 人' : '') + '</span></div>' +
        '  <button class="btn small secondary" data-clear>移除</button>' +
        '</div>';
      box.querySelector('[data-clear]').addEventListener('click', function () {
        ++p.request;
        cancelRun(state);
        p.company = null;
        p.staff = null;
        renderPanels();
        renderResult();
      });
    } else {
      box.innerHTML = '';
    }
  }

  /* ============ 加载 ============ */
  function loadWork(p, id) {
    const session = state;
    if (state.panels.some(function (other) { return other !== p && ((other.subject && String(other.subject.id) === String(id)) || String(other.loadingId) === String(id)); })) {
      Staff.ui.toast('这部作品已在对比中，请选择另一部作品');
      return;
    }
    const request = ++p.request;
    p.subject = null;
    p.credits = null;
    p.loading = true;
    p.loadingId = id;
    p.error = null;
    renderResult();
    Promise.all([Staff.api.getSubject(id), Staff.api.getSubjectPersons(id)]).then(function (res) {
      if (!isCurrent()) return;
      p.subject = { id: id, name: res[0].name_cn || res[0].name, type: res[0].type, infobox: res[0].infobox || [], persons: res[1] || [] };
      p.loading = false;
      p.loadingId = null;
      if (state === session) renderResult();
      else scheduleCapture();
    }).catch(function (err) {
      if (!isCurrent()) return;
      p.loading = false;
      p.loadingId = null;
      p.error = '加载失败：' + err.message;
      if (state === session) renderResult();
      else scheduleCapture();
    });
    function isCurrent() {
      return sessions[session.mode] === session && session.panels.includes(p) && p.request === request && !(Staff.runtime && Staff.runtime.isStopped());
    }
  }

  function loadCompany(p, id) {
    const session = state;
    cancelRun(session);
    const request = ++p.request;
    p.company = null;
    p.loading = true;
    p.error = null;
    renderPanels();
    renderResult();
    Promise.all([Staff.api.getPerson(id), Staff.api.getPersonSubjects(id)]).then(function (res) {
      if (!isCurrent()) return;
      const person = res[0], worksAll = res[1] || [];
      p.company = { id: id, name: person.name, type: person.type, worksAll: worksAll,
        works: worksAll.filter(function (w) { return w.staff === '动画制作'; }), staff: null };
      p.loading = false;
      if (state === session) { renderPanels(); renderResult(); }
      else scheduleCapture();
    }).catch(function (err) {
      if (!isCurrent()) return;
      p.loading = false;
      p.error = '加载失败：' + err.message;
      if (state === session) { renderPanels(); renderResult(); }
      else scheduleCapture();
    });
    function isCurrent() {
      return sessions[session.mode] === session && session.panels.includes(p) && p.request === request && !(Staff.runtime && Staff.runtime.isStopped());
    }
  }

  /* ============ 结果分发 ============ */
  function renderResult() {
    const root = query('#cmp-result');
    const action = query('#cmp-action');
    if (!root || !action) return;
    if (state.mode === 'work') renderWorkResult(root, action);
    else renderCompanyResult(root, action);
    scheduleCapture();
  }

  /* ============ 作品对比结果 ============ */
  function creditList(entries, counts) {
    if (!entries.length) return '<p class="credit-missing">Bangumi 暂无此项署名</p>';
    return '<ol class="credit-list">' + entries.map(function (entry) {
      const count = counts ? counts.get(entry.id) || 0 : 0;
      return '<li class="credit-entry' + (count >= 2 ? ' is-shared' : '') + '" data-credit-id="' + entry.id + '">' +
        '<span class="credit-name">' + Staff.ui.personLink(entry.id, entry.name) + '</span>' +
        (count >= 2 ? '<span class="shared-mark">重合 · ' + count + ' 部</span>' : '') + '</li>';
    }).join('') + '</ol>' + creditSource(entries);
  }

  function creditSource(entries) {
    const first = entries[0];
    if (!first) return '';
    const label = first.orderSource === 'infobox' ? '顺序：条目信息框署名' : '顺序未核实 · 关联接口顺序';
    if (!first.sourceText) return '<p class="credit-order-note">' + label + '</p>';
    return '<details class="credit-source"><summary>' + label + ' · 查看原文</summary><p>' + Staff.ui.escapeHtml(first.sourceText) + '</p></details>';
  }

  function separateGroup(label, entries, counts) {
    return '<section class="credit-group"><h4>' + Staff.ui.escapeHtml(label) + '</h4>' + creditList(entries, counts) + '</section>';
  }

  function extraTable(loaded, counts) {
    const roles = new Set();
    const groups = loaded.map(function (p) {
      const byRole = new Map();
      p.credits.extra.forEach(function (entry) {
        const role = entry.relation || '未标注职务';
        roles.add(role);
        if (!byRole.has(role)) byRole.set(role, []);
        byRole.get(role).push(entry);
      });
      return byRole;
    });
    if (!roles.size) return Staff.ui.empty('没有其他署名');
    // 只安排职务区块的阅读顺序；绝不改变同一职务内的原名单顺序。
    const priority = ['企画', '企划', '企画协力', '企划协力', '製作', '制作', '出品', '总制片人', '执行制片人', '制片人', '副制片人', '助理制片人', '制作统括', '制作管理', '制作进行'];
    const sorted = Array.from(roles).sort(function (a, b) {
      const ai = priority.indexOf(a), bi = priority.indexOf(b);
      return (ai < 0 ? priority.length : ai) - (bi < 0 ? priority.length : bi);
    });
    return '<div class="table-wrap extra-table-wrap" tabindex="0" role="region" aria-label="独立署名对照表，可横向滚动"><table class="extra-table"><thead><tr><th scope="col">署名职务</th>' + loaded.map(function (p) {
      return '<th scope="col">作品 ' + p.index + ' · ' + Staff.ui.escapeHtml(p.subject.name) + '</th>';
    }).join('') + '</tr></thead><tbody>' + sorted.map(function (role) {
      return '<tr><th scope="row">' + Staff.ui.escapeHtml(role) + '</th>' + loaded.map(function (p, index) {
        return '<td data-extra-panel="' + p.key + '" data-extra-role="' + Staff.ui.escapeHtml(role) + '">' + creditList(groups[index].get(role) || [], counts) + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>';
  }

  function renderWorkResult(root, action) {
    action.innerHTML = '';
    const loaded = state.panels.filter(function (p) { return p.subject; });
    loaded.forEach(function (p) { p.credits = Staff.compareData.splitCredits(p.subject.persons, p.subject.infobox); });
    const counts = Staff.compareData.separatePresence(loaded);
    state.panels.forEach(function (p) {
      p.separateCounts = counts;
      const box = query('[data-panel="' + p.key + '"] [data-loadbox]');
      if (box) renderPanelLoadbox(p, box);
    });
    if (!loaded.length) {
      root.innerHTML = Staff.ui.empty('在上方选择要对比的作品。可搜索名称，或粘贴条目链接 / ID。');
      return;
    }
    const n = loaded.length;
    const records = Staff.compareData.overlap(loaded);
    const shared = records.filter(function (r) { return r.count >= 2; });
    const all = records.filter(function (r) { return r.count === n; });
    const shown = n === 1 ? records : (state.overlapScope === 'all' ? all : shared);
    const exclusive = records.filter(function (r) { return r.count === 1; });
    root.innerHTML =
      '<section class="card production-overlap" aria-labelledby="overlap-heading">' +
      '<div class="comparison-heading"><div><span class="section-kicker">制作人员</span>' +
      '<h3 id="overlap-heading">' + (n === 1 ? '制作人员名单' : '制作人员交集') + '</h3></div>' +
      '<span class="overlap-count">' + shown.length + '<small> 项署名</small></span></div>' +
      '<p class="comparison-note">统计导演、分镜、演出、作画、声音，以及制作进行、制作管理、设定制作、制作制片人等现场岗位的个人与创作组合。组合按一个署名计数；兼任企划等职务时，只计其制作职务。</p>' +
      (n > 2 ? '<div class="overlap-scopes" role="group" aria-label="人员交集范围">' +
        '<button class="chip' + (state.overlapScope === 'shared' ? ' active' : '') + '" data-scope="shared" aria-pressed="' + (state.overlapScope === 'shared') + '">至少两部共同 <strong>' + shared.length + '</strong></button>' +
        '<button class="chip' + (state.overlapScope === 'all' ? ' active' : '') + '" data-scope="all" aria-pressed="' + (state.overlapScope === 'all') + '">全部共同 <strong>' + all.length + '</strong></button></div>' : '') +
      (n >= 2 ? '<p class="comparison-summary">' + n + ' 部作品 · 合计 ' + records.length + ' 项制作署名 · 共同参与 ' + shared.length + ' 项 · 仅单部参与 ' + exclusive.length + ' 项</p>' : '<p class="comparison-summary">再选择一部作品，即可查看制作署名交集。</p>') +
      '<div id="cmp-work-matrix"></div></section>' +
      (n >= 2 ? '<section class="exclusive-section" aria-label="各作品独有制作人员"><h3 class="comparison-subheading">仅参与其中一部的制作人员</h3><div class="compare-grid">' + loaded.map(function (p) {
        const persons = exclusive.filter(function (r) { return r.presences[0].key === p.key; }).map(function (r) { return p.credits.creative.get(r.id); });
        return '<details class="card exclusive-card"><summary><span>作品 ' + p.index + ' · ' + Staff.ui.escapeHtml(p.subject.name) + '</span><strong>' + persons.length + ' 项署名</strong></summary>' + productionList(persons) + '</details>';
      }).join('') + '</div></section>' : '') +
      '<section class="separate-credits" aria-labelledby="extra-heading"><div class="comparison-heading"><div><span class="section-kicker">独立署名 · 不计入交集</span><h3 id="extra-heading">企划、出品与其他署名</h3></div></div>' +
      '<p class="comparison-note">企划、製作、出品及一般制片等在此列出，公司与未纳入制作范围的其他署名也保留在这里。重合项在各作品中同步标记。</p>' +
      '<p class="source-order-note">优先按条目信息框署名排列，编号不因重合改变；无法对应时标注「顺序未核实」，沿用关联接口顺序。不按姓名或重合人数重排，也不据此推断投资比例。</p>' +
      extraTable(loaded, counts) + '</section>';

    root.querySelectorAll('[data-scope]').forEach(function (button) {
      button.addEventListener('click', function () { state.overlapScope = button.dataset.scope; renderResult(); });
    });
    const matrix = root.querySelector('#cmp-work-matrix');
    if (!shown.length) {
      matrix.innerHTML = Staff.ui.empty(n === 1 ? '这部作品暂无符合制作职务范围的个人或创作组合署名；其他署名仍保留在上下方。' : (state.overlapScope === 'all' && n > 2 ? '没有同时参与全部作品的制作署名，可切换「至少两部共同」查看。' : '暂无符合制作职务范围的共同署名；独立署名仍可在上下方比较。'));
      return;
    }
    const headers = [{ key: 'name', label: '制作人员', sortable: false }];
    if (n > 2) headers.push({ key: 'count', label: '参与作品', sortable: false, num: true });
    loaded.forEach(function (p) { headers.push({ key: 'p' + p.key, label: '作品 ' + p.index + ' · ' + Staff.ui.escapeHtml(p.subject.name), sortable: false }); });
    headers.push({ key: 'op', label: '履历', sortable: false });
    const rows = shown.map(function (record) {
      const cells = { name: productionName(record), count: record.count + ' / ' + n, op: historyLink(record) };
      loaded.forEach(function (p) {
        const presence = record.presences.find(function (pr) { return pr.key === p.key; });
        cells['p' + p.key] = presence ? relBadges(presence.relations) : '<span class="credit-absent">—</span>';
      });
      return { cells: cells, _person: record };
    });
    renderTable(matrix, headers, rows);
    const scrollArea = matrix.querySelector('.table-wrap');
    scrollArea.tabIndex = 0;
    scrollArea.setAttribute('role', 'region');
    scrollArea.setAttribute('aria-label', '制作人员职务对照表，可横向滚动');
  }

  function productionList(persons) {
    if (!persons.length) return '<p class="credit-missing">没有独有制作人员</p>';
    return '<ul class="production-list">' + persons.map(function (person) {
      return '<li><span>' + productionName(person) + '</span><div>' + relBadges(person.relations) + '</div></li>';
    }).join('') + '</ul>';
  }

  function productionName(person) {
    return Staff.ui.personLink(person.id, person.name) + (person.type === 3 ? ' ' + Staff.ui.typeBadge(3) : '');
  }

  /* ============ 公司对比结果 ============ */
  function renderCompanyProgress(action, session) {
    const task = session.run;
    action.innerHTML = '<div class="card"><div class="row" style="justify-content:space-between;align-items:center">' +
      '<span class="progress-text" id="cmp-prog">聚合 staff：' + task.done + ' / ' + task.total + '</span>' +
      '<button class="btn small danger" id="cmp-cancel">取消</button></div>' +
      '<div class="progress-bar" style="margin-top:8px"><i style="width:' + (task.total ? Math.round(task.done / task.total * 100) : 0) + '%"></i></div></div>';
    action.querySelector('#cmp-cancel').addEventListener('click', function () {
      cancelRun(session);
      if (state === session) renderResult();
    });
  }

  function runCompanyAggregation() {
    const session = state;
    const companies = session.panels.filter(function (p) { return p.company; });
    if (companies.length < 2) { Staff.ui.toast('至少选择两家公司'); return; }
    session.concurrency = Math.min(20, Math.max(1, parseInt(query('#cmp-conc').value, 10) || 5));
    session.interval = Math.max(0, parseInt(query('#cmp-int').value, 10) || 0);
    const items = [];
    const owners = companies.map(function (p) { return p.company; });
    companies.forEach(function (p) {
      p.company.works.forEach(function (w) {
        items.push({ path: '/v0/subjects/' + w.id + '/persons', key: 'subject-persons|' + w.id,
          ttl: Staff.config.cacheTtl.subjectPersons, force: false, _panel: p.key, _work: w });
      });
    });
    const task = { signal: { cancelled: false }, done: 0, total: items.length };
    session.run = task;
    renderResult();
    Staff.api.runBatch(items, {
      concurrency: session.concurrency, interval: session.interval, signal: task.signal,
      onProgress: function (done, total) {
        if (session.run !== task || task.signal.cancelled) return;
        task.done = done;
        task.total = total;
        if (state === session) {
          const progress = query('#cmp-prog'), bar = query('#cmp-action .progress-bar i');
          if (progress) progress.textContent = '聚合 staff：' + done + ' / ' + total;
          if (bar) bar.style.width = (total ? Math.round(done / total * 100) : 0) + '%';
        }
      }
    }).then(function (results) {
      if (sessions.company !== session || session.run !== task || task.signal.cancelled || (Staff.runtime && Staff.runtime.isStopped())) return;
      session.run = null;
      companies.forEach(function (p, index) {
        if (!session.panels.includes(p) || p.company !== owners[index]) return;
        const resFor = [], worksFor = [];
        items.forEach(function (it, i) {
          if (it._panel === p.key) { resFor.push(results[i]); worksFor.push(it._work); }
        });
        p.company.staff = Staff.api.aggregateStaff(resFor, worksFor, null).filter(function (entry) { return entry.type !== 2; });
      });
      if (state === session) renderResult();
      else scheduleCapture();
    }).catch(function () {
      if (session.run !== task) return;
      session.run = null;
      if (state === session) { renderResult(); Staff.ui.toast('对比未完成，可重新开始'); }
    });
  }

  function buildCompanyOverlap(companies) {
    const byId = new Map();
    companies.forEach(function (p) {
      (p.company.staff || []).forEach(function (e) {
        if (!byId.has(e.id)) byId.set(e.id, { id: e.id, name: e.name, type: e.type, presences: [] });
        byId.get(e.id).presences.push({ key: p.key, label: p.company.name, entry: e });
      });
    });
    const records = Array.from(byId.values());
    records.forEach(function (r) {
      r.count = r.presences.length;
      r.total = r.presences.reduce(function (s, pr) { return s + pr.entry.count; }, 0);
    });
    return records.sort(function (a, b) {
      return Staff.compareData.comparePriority({ name: a.name, count: a.total, relations: a.presences.flatMap(function (p) { return Array.from(p.entry.relations); }) }, { name: b.name, count: b.total, relations: b.presences.flatMap(function (p) { return Array.from(p.entry.relations); }) });
    });
  }

  function renderCompanyResult(root, action) {
    const loaded = state.panels.filter(function (p) { return p.company; });
    if (!loaded.length) {
      action.innerHTML = '';
      root.innerHTML = Staff.ui.empty('在上方选择要对比的公司（搜索或粘贴公司链接 / ID）。');
      return;
    }
    const cards = loaded.map(function (p) {
      const c = p.company;
      return '<div class="card"><h3>' + Staff.ui.escapeHtml(c.name) + ' ' + Staff.ui.typeBadge(c.type) + '</h3>' +
        '<div class="small muted">动画制作作品 ' + c.works.length + ' 部' +
        (c.works.length !== c.worksAll.length ? ' / 全部参与 ' + c.worksAll.length + ' 部' : '') +
        (c.staff ? ' · staff ' + c.staff.length + ' 人' : '') +
        (!c.works.length ? ' <span class="badge-role">无动画制作作品</span>' : '') +
        '</div></div>';
    }).join('');
    root.innerHTML = '<div class="compare-grid" style="margin-bottom:16px">' + cards + '</div><div id="cmp-company-result"></div>';
    const cr = root.querySelector('#cmp-company-result');

    if (loaded.length < 2) {
      action.innerHTML = '';
      cr.innerHTML = Staff.ui.empty('至少选择两家公司才能对比。');
      return;
    }

    if (state.run) {
      renderCompanyProgress(action, state);
      cr.innerHTML = '';
      return;
    }

    if (loaded.some(function (p) { return !p.company.staff; })) {
      action.innerHTML =
        '<div class="card">' +
        '  <div class="row" style="gap:12px;flex-wrap:wrap">' +
        '    <label class="small muted">并发 <input type="number" id="cmp-conc" value="' + state.concurrency + '" min="1" max="20" style="width:64px;padding:4px 8px"></label>' +
        '    <label class="small muted">间隔ms <input type="number" id="cmp-int" value="' + state.interval + '" min="0" style="width:80px;padding:4px 8px"></label>' +
        '    <button class="btn" id="cmp-run">开始对比（聚合各公司 staff）</button>' +
        '  </div>' +
        '  <div class="small muted" style="margin-top:8px">对两家公司全部「动画制作」作品逐个抓取 staff。首次较慢；本次已查询过的作品会复用临时缓存。</div>' +
        '</div>';
      action.querySelector('#cmp-run').addEventListener('click', runCompanyAggregation);
      cr.innerHTML = '';
      return;
    }

    action.innerHTML = '';
    const records = buildCompanyOverlap(loaded);
    const n = loaded.length;
    const allOverlap = records.filter(function (r) { return r.count === n; });
    const atLeast2 = records.filter(function (r) { return r.count >= 2; });

    cr.innerHTML =
      '<div class="card">' +
      '<div class="row" style="justify-content:space-between;align-items:center">' +
      '<h3 style="margin:0">' + (n === 2 ? '重叠 staff' : '全部重叠') +
      ' <span class="muted small" style="font-weight:400">' + (n === 2 ? '同时在两家公司作品中出现的 staff' : '同时在全部 ' + n + ' 家公司作品中出现的 staff') + '</span></h3>' +
      '<span class="overlap-count">' + allOverlap.length + ' 人</span></div>' +
      '<div id="cmp-c-all"></div></div>' +
      (n > 2 ? '<div class="card">' +
      '<div class="row" style="justify-content:space-between;align-items:center">' +
      '<h3 style="margin:0">至少 2 家 <span class="muted small" style="font-weight:400">出现在 2 家及以上公司的 staff（可观察人员流动）</span></h3>' +
      '<span class="overlap-count">' + atLeast2.length + ' 人</span></div>' +
      '<div id="cmp-c-some"></div></div>' : '');

    // 全部重叠表：每家公司一列（次数 + 职务）
    const headers = [
      { key: 'name', label: 'Staff', sortable: false },
      { key: 'type', label: '类型', sortable: false }
    ];
    loaded.forEach(function (p) { headers.push({ key: 'p' + p.key, label: Staff.ui.escapeHtml(p.company.name), sortable: false }); });
    headers.push({ key: 'op', label: '履历', sortable: false });
    if (allOverlap.length) {
      const rows = allOverlap.map(function (r) {
        const cells = { name: Staff.ui.personLink(r.id, r.name), type: Staff.ui.typeBadge(r.type), op: historyLink(r) };
        loaded.forEach(function (p) {
          const presence = r.presences.find(function (pr) { return pr.key === p.key; });
          cells['p' + p.key] = presence ? presenceCell(presence) : '<span class="muted small">—</span>';
        });
        return { cells: cells, _person: r };
      });
      renderTable(cr.querySelector('#cmp-c-all'), headers, rows);
    } else {
      cr.querySelector('#cmp-c-all').innerHTML = Staff.ui.empty('没有同时在所有公司作品中出现的 staff');
    }

    // 至少 2 家表
    const headers2 = [
      { key: 'name', label: 'Staff', sortable: false },
      { key: 'type', label: '类型', sortable: false },
      { key: 'cnt', label: '出现于 X/' + n + ' 家', sortable: false, num: true },
      { key: 'sum', label: '合计次数', sortable: false, num: true },
      { key: 'wn', label: '职务（合并）', sortable: false },
      { key: 'op', label: '履历', sortable: false }
    ];
    const rows2 = atLeast2.sort(function (a, b) { return Staff.compareData.comparePriority({ name: a.name, count: a.total, relations: a.presences.flatMap(function (p) { return Array.from(p.entry.relations); }) }, { name: b.name, count: b.total, relations: b.presences.flatMap(function (p) { return Array.from(p.entry.relations); }) }); }).map(function (r) {
      const allRels = new Set();
      r.presences.forEach(function (pr) { pr.entry.relations.forEach(function (x) { allRels.add(x); }); });
      return {
        cells: {
          name: Staff.ui.personLink(r.id, r.name),
          type: Staff.ui.typeBadge(r.type),
          cnt: r.count + ' / ' + n,
          sum: r.total,
          wn: Array.from(allRels).slice(0, 6).map(function (x) { return Staff.ui.roleBadge(x); }).join(' '),
          op: historyLink(r)
        },
        _person: r
      };
    });
    if (n > 2) renderTable(cr.querySelector('#cmp-c-some'), headers2, rows2);
  }

  /* ============ 共享工具 ============ */
  function relBadges(relations) {
    const rels = Array.from(relations || []).sort(function (a, b) { return Staff.compareData.roleRank(a) - Staff.compareData.roleRank(b); });
    if (!rels.length) return '<span class="muted small">—</span>';
    return rels.map(function (r) { return Staff.ui.roleBadge(r); }).join(' ');
  }

  // 公司维度的单元格：次数 + 职务
  function presenceCell(presence) {
    const rels = Array.from(presence.entry.relations || []).slice(0, 4);
    return '<div><strong>' + presence.entry.count + '</strong> 部</div>' +
      (rels.length ? rels.map(function (x) { return Staff.ui.roleBadge(x); }).join(' ') : '<span class="muted small">—</span>');
  }

  function historyLink(r) {
    return '<a class="btn secondary small" href="#/analysis?id=' + r.id + '">参与作品</a>';
  }

  function renderTable(container, headers, rows) {
    const table = Staff.ui.sortableTable(headers, rows);
    container.innerHTML = '';
    container.appendChild(table.el);
    table.render({});

  }

  Staff.views = Staff.views || {};
  Staff.views.compare = { render: render, leave: leave, afterRender: afterRender, clearWorkspace: clearWorkspace };
})();
