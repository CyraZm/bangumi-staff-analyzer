/* bangumi-staff-analyzer 对比视图
 * 作品对比：支持 N 部作品（默认 2，可增删），展示「全部重叠」与「至少 2 部」两类重叠
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

  const state = {
    mode: 'work',   // work | company
    panels: []      // {key, index, workType, subject, company, map, staff}
  };
  let nextKey = 1;

  /* ============ 渲染入口 ============ */
  function render(container) {
    container.innerHTML =
      '<h2 class="page-title">对比</h2>' +
      '<p class="page-desc">' +
      '  <span class="chip active" id="mode-work">作品对比</span> ' +
      '  <span class="chip" id="mode-company">公司对比</span>' +
      '</p>' +
      '<div id="cmp-panels"></div>' +
      '<div id="cmp-action" style="margin-bottom:16px"></div>' +
      '<div id="cmp-result"></div>';

    container.querySelector('#mode-work').addEventListener('click', function () { switchMode('work'); });
    container.querySelector('#mode-company').addEventListener('click', function () { switchMode('company'); });

    resetPanels();
  }

  function switchMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    document.querySelector('#mode-work').classList.toggle('active', mode === 'work');
    document.querySelector('#mode-company').classList.toggle('active', mode === 'company');
    resetPanels();
  }

  function resetPanels() {
    state.panels = [];
    addPanel();
    addPanel();
    renderPanels();
    renderResult();
  }

  function addPanel() {
    if (state.panels.length >= MAX_PANELS) return;
    state.panels.push({ key: nextKey++, index: 0, workType: 2, subject: null, company: null, map: null, staff: null });
    reindex();
  }

  function removePanel(key) {
    if (state.panels.length <= 1) return;
    state.panels = state.panels.filter(function (p) { return p.key !== key; });
    reindex();
  }

  function reindex() {
    state.panels.forEach(function (p, i) { p.index = i + 1; });
  }

  /* ============ 面板渲染 ============ */
  function renderPanels() {
    const wrap = document.querySelector('#cmp-panels');
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
      sel.addEventListener('change', function () { p.workType = parseInt(sel.value, 10); });
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
        if (isCompanyMode) loadCompany(p, item.id);
        else loadWork(p, item.id);
      }
    });

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
    if (state.mode === 'work' && p.subject) {
      box.innerHTML =
        '<div class="row" style="justify-content:space-between">' +
        '  <div><strong>' + Staff.ui.escapeHtml(p.subject.name) + '</strong> ' + Staff.ui.subjectLink(p.subject.id, '(bgm)') +
        '    <span class="muted small">' + groupPersons(p.subject.persons).size + ' 名 staff（去重）</span></div>' +
        '  <button class="btn small secondary" data-clear>移除</button>' +
        '</div>';
      box.querySelector('[data-clear]').addEventListener('click', function () {
        p.subject = null;
        p.map = null;
        renderPanels();
        renderResult();
      });
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
    const box = document.querySelector('[data-panel="' + p.key + '"] [data-loadbox]');
    box.innerHTML = Staff.ui.loading('正在加载作品 ' + id + '…');
    Promise.all([Staff.api.getSubject(id), Staff.api.getSubjectPersons(id)]).then(function (res) {
      const subj = res[0], persons = res[1] || [];
      p.subject = { id: id, name: subj.name_cn || subj.name, persons: persons };
      p.map = null;
      renderPanelLoadbox(p, box);
      renderResult();
    }).catch(function (err) {
      box.innerHTML = Staff.ui.empty('加载失败：' + err.message);
    });
  }

  function loadCompany(p, id) {
    const box = document.querySelector('[data-panel="' + p.key + '"] [data-loadbox]');
    box.innerHTML = Staff.ui.loading('正在加载公司 ' + id + '…');
    Promise.all([Staff.api.getPerson(id), Staff.api.getPersonSubjects(id)]).then(function (res) {
      const person = res[0];
      const worksAll = res[1] || [];
      const works = worksAll.filter(function (w) { return w.staff === '动画制作'; });
      p.company = { id: id, name: person.name, type: person.type, worksAll: worksAll, works: works, staff: null };
      p.staff = null;
      renderPanelLoadbox(p, box);
      renderResult();
    }).catch(function (err) {
      box.innerHTML = Staff.ui.empty('加载失败：' + err.message);
    });
  }

  /* ============ 结果分发 ============ */
  function renderResult() {
    const root = document.querySelector('#cmp-result');
    const action = document.querySelector('#cmp-action');
    if (!root || !action) return;
    if (state.mode === 'work') renderWorkResult(root, action);
    else renderCompanyResult(root, action);
  }

  /* ============ 作品对比结果 ============ */
  function buildWorkOverlap(loaded) {
    const byId = new Map();
    loaded.forEach(function (p) {
      p.map = groupPersons(p.subject.persons);
      p.map.forEach(function (g, id) {
        if (!byId.has(id)) byId.set(id, { id: id, name: g.name, type: g.type, presences: [] });
        byId.get(id).presences.push({ key: p.key, label: p.subject.name, relations: g.relations });
      });
    });
    const records = Array.from(byId.values());
    records.forEach(function (r) { r.count = r.presences.length; });
    return records;
  }

  function renderWorkResult(root, action) {
    action.innerHTML = '';
    const loaded = state.panels.filter(function (p) { return p.subject; });
    if (!loaded.length) {
      root.innerHTML = Staff.ui.empty('在上方选择要对比的作品（搜索或粘贴条目链接 / ID）。');
      return;
    }
    const cards = loaded.map(function (p) {
      const uniq = groupPersons(p.subject.persons).size;
      return '<div class="card"><h3>' + Staff.ui.escapeHtml(p.subject.name) + ' ' + Staff.ui.subjectLink(p.subject.id, '(bgm)') + '</h3>' +
        '<div class="small muted">' + uniq + ' 名 staff（去重）</div></div>';
    }).join('');
    root.innerHTML = '<div class="compare-grid" style="margin-bottom:16px">' + cards + '</div><div id="cmp-work-result"></div>';
    const wr = root.querySelector('#cmp-work-result');

    if (loaded.length === 1) {
      const uniq = Array.from(groupPersons(loaded[0].subject.persons).values());
      wr.innerHTML = '<div class="card"><h3>' + Staff.ui.escapeHtml(loaded[0].subject.name) + ' · 制作人员</h3>' + personList(uniq, 15) + '</div>';
      return;
    }

    const records = buildWorkOverlap(loaded);
    const n = loaded.length;
    const allOverlap = records.filter(function (r) { return r.count === n; });
    const atLeast2 = records.filter(function (r) { return r.count >= 2; });

    const parts = [];
    parts.push('<div class="card"><h3>' + (n === 2 ? '重叠 staff' : '全部重叠') +
      ' <span class="muted small" style="font-weight:400">' + (n === 2 ? '同时出现在两部作品中' : '同时出现在全部 ' + n + ' 部作品中') + '</span></h3>' +
      '<div id="cmp-w-all"></div></div>');
    parts.push('<div class="card"><h3>至少 2 部 <span class="muted small" style="font-weight:400">出现在 2 部及以上作品</span></h3>' +
      '<div id="cmp-w-some"></div></div>');

    const exclusive = loaded.map(function (p) {
      const ids = new Set(records.filter(function (r) { return r.count === 1 && r.presences[0].key === p.key; }).map(function (r) { return r.id; }));
      const persons = Array.from(p.map.values()).filter(function (g) { return ids.has(g.id); });
      return '<div class="card"><h3>仅作品「' + Staff.ui.escapeHtml(p.subject.name) + '」 <span class="muted small" style="font-weight:400">' + persons.length + ' 人</span></h3>' +
        '<details><summary class="small muted" style="cursor:pointer">展开列表</summary>' + personList(persons, 60) + '</details></div>';
    }).join('');
    parts.push('<div class="grid-2">' + exclusive + '</div>');
    wr.innerHTML = parts.join('');

    // 全部重叠表
    const headers = [
      { key: 'name', label: 'Staff', sortable: false },
      { key: 'type', label: '类型', sortable: false }
    ];
    loaded.forEach(function (p) { headers.push({ key: 'p' + p.key, label: Staff.ui.escapeHtml(p.subject.name), sortable: false }); });
    headers.push({ key: 'op', label: '操作', sortable: false });
    if (allOverlap.length) {
      const rows = allOverlap.map(function (r) {
        const cells = { name: Staff.ui.personLink(r.id, r.name), type: Staff.ui.typeBadge(r.type), op: collectButton(r) };
        loaded.forEach(function (p) {
          const presence = r.presences.find(function (pr) { return pr.key === p.key; });
          cells['p' + p.key] = presence ? relBadges(presence.relations) : '<span class="muted small">—</span>';
        });
        return { cells: cells, _person: r };
      });
      renderTable(wr.querySelector('#cmp-w-all'), headers, rows);
    } else {
      wr.querySelector('#cmp-w-all').innerHTML = Staff.ui.empty('没有同时出现在全部作品中的 staff');
    }

    // 至少 2 部表
    const headers2 = [
      { key: 'name', label: 'Staff', sortable: false },
      { key: 'type', label: '类型', sortable: false },
      { key: 'cnt', label: '出现于 X/' + n + ' 部', sortable: false, num: true },
      { key: 'wn', label: '职务（合并）', sortable: false },
      { key: 'op', label: '操作', sortable: false }
    ];
    const rows2 = atLeast2.sort(function (a, b) { return b.count - a.count; }).map(function (r) {
      const allRels = new Set();
      r.presences.forEach(function (pr) { pr.relations.forEach(function (x) { allRels.add(x); }); });
      return {
        cells: {
          name: Staff.ui.personLink(r.id, r.name),
          type: Staff.ui.typeBadge(r.type),
          cnt: r.count + ' / ' + n,
          wn: Array.from(allRels).slice(0, 6).map(function (x) { return Staff.ui.roleBadge(x); }).join(' '),
          op: collectButton(r)
        },
        _person: r
      };
    });
    renderTable(wr.querySelector('#cmp-w-some'), headers2, rows2);
  }

  /* ============ 公司对比结果 ============ */
  function runCompanyAggregation() {
    const companies = state.panels.filter(function (p) { return p.company; });
    if (companies.length < 2) { Staff.ui.toast('至少选择两家公司'); return; }
    const concurrency = parseInt(document.querySelector('#cmp-conc').value, 10) || 5;
    const interval = parseInt(document.querySelector('#cmp-int').value, 10) || 200;
    const signal = { cancelled: false };
    const items = [];
    companies.forEach(function (p) {
      p.company.works.forEach(function (w) {
        items.push({
          path: '/v0/subjects/' + w.id + '/persons',
          key: 'subject-persons|' + w.id,
          ttl: Staff.config.cacheTtl.subjectPersons,
          force: false,
          _panel: p.key,
          _work: w
        });
      });
    });

    const action = document.querySelector('#cmp-action');
    action.innerHTML =
      '<div class="card">' +
      '  <div class="row" style="justify-content:space-between;align-items:center">' +
      '    <span class="progress-text" id="cmp-prog">聚合 staff：0 / ' + items.length + '</span>' +
      '    <button class="btn small danger" id="cmp-cancel">取消</button>' +
      '  </div>' +
      '  <div class="progress-bar" style="margin-top:8px"><i style="width:0"></i></div>' +
      '</div>';
    const bar = action.querySelector('.progress-bar i');
    document.querySelector('#cmp-cancel').addEventListener('click', function () { signal.cancelled = true; });

    Staff.api.runBatch(items, {
      concurrency: concurrency,
      interval: interval,
      signal: signal,
      onProgress: function (done, total) {
        bar.style.width = (total ? Math.round(done / total * 100) : 0) + '%';
        document.querySelector('#cmp-prog').textContent = '聚合 staff：' + done + ' / ' + total;
      }
    }).then(function (results) {
      companies.forEach(function (p) {
        const resFor = [], worksFor = [];
        items.forEach(function (it, i) {
          if (it._panel === p.key) { resFor.push(results[i]); worksFor.push(it._work); }
        });
        p.company.staff = Staff.api.aggregateStaff(resFor, worksFor, null);
      });
      renderResult();
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
    return records;
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

    if (loaded.some(function (p) { return !p.company.staff; })) {
      action.innerHTML =
        '<div class="card">' +
        '  <div class="row" style="gap:12px;flex-wrap:wrap">' +
        '    <label class="small muted">并发 <input type="number" id="cmp-conc" value="5" min="1" max="20" style="width:64px;padding:4px 8px"></label>' +
        '    <label class="small muted">间隔ms <input type="number" id="cmp-int" value="200" min="0" style="width:80px;padding:4px 8px"></label>' +
        '    <button class="btn" id="cmp-run">开始对比（聚合各公司 staff）</button>' +
        '  </div>' +
        '  <div class="small muted" style="margin-top:8px">对两家公司全部「动画制作」作品逐个抓取 staff。首次较慢；已统计过的作品会命中本地缓存。</div>' +
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
      '<div class="card"><h3>' + (n === 2 ? '重叠 staff' : '全部重叠') +
      ' <span class="muted small" style="font-weight:400">' + (n === 2 ? '同时在两家公司作品中出现的 staff' : '同时在全部 ' + n + ' 家公司作品中出现的 staff') + '</span></h3>' +
      '<div id="cmp-c-all"></div></div>' +
      '<div class="card"><h3>至少 2 家 <span class="muted small" style="font-weight:400">出现在 2 家及以上公司的 staff（可观察人员流动）</span></h3>' +
      '<div id="cmp-c-some"></div></div>';

    // 全部重叠表：每家公司一列（次数 + 职务）
    const headers = [
      { key: 'name', label: 'Staff', sortable: false },
      { key: 'type', label: '类型', sortable: false }
    ];
    loaded.forEach(function (p) { headers.push({ key: 'p' + p.key, label: Staff.ui.escapeHtml(p.company.name), sortable: false }); });
    headers.push({ key: 'op', label: '操作', sortable: false });
    if (allOverlap.length) {
      const rows = allOverlap.map(function (r) {
        const cells = { name: Staff.ui.personLink(r.id, r.name), type: Staff.ui.typeBadge(r.type), op: collectButton(r) };
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
      { key: 'op', label: '操作', sortable: false }
    ];
    const rows2 = atLeast2.sort(function (a, b) { return b.total - a.total || b.count - a.count; }).map(function (r) {
      const allRels = new Set();
      r.presences.forEach(function (pr) { pr.entry.relations.forEach(function (x) { allRels.add(x); }); });
      return {
        cells: {
          name: Staff.ui.personLink(r.id, r.name),
          type: Staff.ui.typeBadge(r.type),
          cnt: r.count + ' / ' + n,
          sum: r.total,
          wn: Array.from(allRels).slice(0, 6).map(function (x) { return Staff.ui.roleBadge(x); }).join(' '),
          op: collectButton(r)
        },
        _person: r
      };
    });
    renderTable(cr.querySelector('#cmp-c-some'), headers2, rows2);
  }

  /* ============ 共享工具 ============ */
  // 按人聚合：同一作品内一个人的多个职务合并为 relations 集合（避免重复计数）
  function groupPersons(list) {
    const map = new Map();
    (list || []).forEach(function (p) {
      let g = map.get(p.id);
      if (!g) {
        g = { id: p.id, name: p.name, type: p.type, relations: new Set() };
        map.set(p.id, g);
      }
      if (p.relation) g.relations.add(p.relation);
    });
    return map;
  }

  function relBadges(relations) {
    const rels = Array.from(relations || []);
    if (!rels.length) return '<span class="muted small">—</span>';
    return rels.map(function (r) { return Staff.ui.roleBadge(r); }).join(' ');
  }

  // 公司维度的单元格：次数 + 职务
  function presenceCell(presence) {
    const rels = Array.from(presence.entry.relations || []).slice(0, 4);
    return '<div><strong>' + presence.entry.count + '</strong> 部</div>' +
      (rels.length ? rels.map(function (x) { return Staff.ui.roleBadge(x); }).join(' ') : '<span class="muted small">—</span>');
  }

  function collectButton(r) {
    return '<button class="btn small" data-collect="' + r.id + '">收集</button>';
  }

  function renderTable(container, headers, rows) {
    const table = Staff.ui.sortableTable(headers, rows);
    container.innerHTML = '';
    container.appendChild(table.el);
    table.render({});
    container.querySelectorAll('[data-collect]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const rec = rows.find(function (r) { return String(r._person.id) === btn.dataset.collect; });
        if (rec) Staff.ui.openTagModal({ id: rec._person.id, name: rec._person.name, type: rec._person.type });
      });
    });
  }

  function personList(list, max) {
    if (!list || !list.length) return '<div class="empty-box">（空）</div>';
    const shown = list.slice(0, max);
    const more = list.length > max;
    const html = '<div class="work-list" style="margin-top:8px">' + shown.map(function (p) {
      const rels = Array.from((p.relations || (p.relation ? [p.relation] : [])));
      return '<div class="wl-row">' + Staff.ui.personLink(p.id, p.name) + ' ' +
        Staff.ui.typeBadge(p.type) + ' ' +
        (rels.length ? rels.map(function (r) { return Staff.ui.roleBadge(r); }).join(' ') : '') + '</div>';
    }).join('') +
      (more ? '<div class="small muted" style="padding-top:4px">… 共 ' + list.length + ' 人</div>' : '') +
      '</div>';
    return html;
  }

  Staff.views = Staff.views || {};
  Staff.views.compare = { render: render };
})();
