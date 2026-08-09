/* bangumi-staff-analyzer 人物/公司分析视图
 * - 公司（type=2）：统计该公司作品中出现的 staff 频率
 * - 个人（type=1）：统计与 TA 共事过的 staff 频率（共事作品数）
 * 支持作品角色筛选、结果类型筛选、缓存与强制刷新、进度与取消
 */
(function () {
  const SUBJECT_TYPES = [
    { code: '', label: '全部类型' },
    { code: 2, label: '动画' },
    { code: 4, label: '游戏' },
    { code: 6, label: '三次元' },
    { code: 1, label: '书籍' }
  ];

  function displayName(item) { return item.name_cn || item.name || ('ID ' + item.id); }

  function render(container, params) {
    const id = params.id;
    container.innerHTML = '<div id="analysis-root">' + Staff.ui.loading('正在加载…') + '</div>';
    const root = container.querySelector('#analysis-root');

    load();

    async function load() {
      try {
        const person = await Staff.api.getPerson(id);
        renderHeader(person);
        renderWorks(person);
      } catch (err) {
        root.innerHTML = Staff.ui.empty('加载失败：' + err.message + '。请检查 ID 是否正确。');
      }
    }

    /* ---------- 头部 ---------- */
    function renderHeader(person) {
      const isCompany = person.type === 2;
      const head = document.createElement('div');
      head.className = 'card';
      head.innerHTML =
        '<div class="row" style="justify-content:space-between;align-items:flex-start">' +
        '  <div>' +
        '    <h2 style="margin:0 0 6px">' + Staff.ui.escapeHtml(person.name) + ' ' + Staff.ui.typeBadge(person.type) +
        '      <span class="muted small" style="font-weight:400">' + Staff.ui.escapeHtml((person.career || []).join(' / ')) + '</span></h2>' +
        '    <div class="muted small">' + (isCompany ? '制作公司' : '个人') + ' · Bangumi ID ' + person.id +
        ' · ' + Staff.ui.personLink(person.id, '查看 bgm 主页') + '</div>' +
        '  </div>' +
        '  <button class="btn small" id="ana-collect">加入收集</button>' +
        '</div>' +
        (person.summary ? '<div class="small muted" style="margin-top:10px;max-height:120px;overflow-y:auto">' + Staff.ui.escapeHtml(person.summary) + '</div>' : '');
      head.querySelector('#ana-collect').addEventListener('click', function () {
        Staff.ui.openTagModal(person);
      });
      root.appendChild(head);
    }

    /* ---------- 作品区 ---------- */
    async function renderWorks(person) {
      const isCompany = person.type === 2;
      const worksCard = document.createElement('div');
      worksCard.className = 'card';
      worksCard.innerHTML = '<h3>参与作品</h3>' + Staff.ui.loading('正在获取作品列表…');
      root.appendChild(worksCard);

      let works;
      try {
        works = await Staff.api.getPersonSubjects(person.id);
      } catch (err) {
        worksCard.innerHTML = '<h3>参与作品</h3>' + Staff.ui.empty('获取作品失败：' + err.message);
        return;
      }
      if (!works || !works.length) {
        worksCard.innerHTML = '<h3>参与作品</h3>' + Staff.ui.empty('没有找到参与作品');
        return;
      }

      // 作品角色分布（staff 字段）
      const roleCount = {};
      const typeCount = {};
      works.forEach(function (w) {
        const role = w.staff || '未知';
        roleCount[role] = (roleCount[role] || 0) + 1;
        typeCount[w.type] = (typeCount[w.type] || 0) + 1;
      });
      const roles = Object.keys(roleCount).sort(function (a, b) { return roleCount[b] - roleCount[a]; });

      // 选中状态：公司默认只选中「动画制作」，个人默认全部选中
      const state = {
        roles: {},   // role -> bool
        types: {}    // subjectType -> bool
      };
      roles.forEach(function (r) {
        if (isCompany) state.roles[r] = (r === '动画制作');
        else state.roles[r] = true;
      });
      [2, 4, 6, 1].forEach(function (t) { state.types[t] = true; });
      state.types[''] = true; // 未知类型

      worksCard.innerHTML =
        '<h3>参与作品 <span class="muted small" style="font-weight:400">共 ' + works.length + ' 部</span></h3>' +
        '<div class="small muted" style="margin-bottom:8px">' + (isCompany
          ? '默认只统计参与身份为「动画制作」的作品；点击标签可切换其他身份（可多选）：'
          : '筛选参与身份与条目类型（点击切换，可多选）：') + '</div>' +
        '<div class="row" style="margin-bottom:6px" id="ana-role-chips"></div>' +
        '<div class="row" style="margin-bottom:12px" id="ana-type-chips"></div>' +
        '<div class="table-wrap" style="max-height:260px;overflow-y:auto">' +
        '  <table class="data"><thead><tr><th>作品</th><th>类型</th><th>参与身份</th></tr></thead><tbody id="ana-works-tbody"></tbody></table>' +
        '</div>';

      const roleRow = worksCard.querySelector('#ana-role-chips');
      roles.forEach(function (r) {
        roleRow.appendChild(chip(r + ' (' + roleCount[r] + ')', function (active) { state.roles[r] = active; renderWorksTable(); }, state.roles[r]));
      });
      const typeRow = worksCard.querySelector('#ana-type-chips');
      SUBJECT_TYPES.forEach(function (t) {
        typeRow.appendChild(chip(t.label + ' (' + (typeCount[t.code] || 0) + ')', function (active) { state.types[t.code] = active; renderWorksTable(); }, state.types[t.code]));
      });

      function filteredWorks() {
        return works.filter(function (w) {
          return state.roles[w.staff || '未知'] && state.types[w.type] !== false && (state.types[w.type] || state.types['']);
        });
      }
      function renderWorksTable() {
        const list = filteredWorks();
        const tbody = worksCard.querySelector('#ana-works-tbody');
        if (!list.length) {
          tbody.innerHTML = '<tr><td colspan="3" class="muted small">当前筛选下没有作品' +
            (isCompany ? '（该公司可能没有「动画制作」身份的作品，可点击上方标签选择其他身份）' : '（可调整上方标签）') + '</td></tr>';
          return;
        }
        tbody.innerHTML = list.map(function (w) {
          const t = SUBJECT_TYPES.find(function (x) { return x.code === w.type; });
          return '<tr><td>' + Staff.ui.subjectLink(w.id, displayName(w)) +
            (w.eps ? ' <span class="muted small">' + Staff.ui.escapeHtml(String(w.eps)) + '</span>' : '') +
            '</td><td>' + Staff.ui.escapeHtml(t ? t.label : '未知') + '</td><td>' + Staff.ui.escapeHtml(w.staff || '') + '</td></tr>';
        }).join('');
      }
      renderWorksTable();

      // 统计区
      worksCard.appendChild(buildStats(person, isCompany, filteredWorks, works));
    }

    function chip(label, onChange, active) {
      const c = document.createElement('span');
      c.className = 'chip' + (active ? ' active' : '');
      c.textContent = label;
      c.addEventListener('click', function () {
        const on = c.classList.toggle('active');
        onChange(on);
      });
      return c;
    }

    /* ---------- 统计区 ---------- */
    function buildStats(person, isCompany, getFilteredWorks, allWorks) {
      const box = document.createElement('div');
      box.innerHTML =
        '<hr style="border:none;border-top:1px solid var(--border);margin:16px 0">' +
        '<h3>' + (isCompany ? '公司作品中的 staff 频率统计' : '与 TA 共事过的 staff 统计') + '</h3>' +
        '<div class="small muted" style="margin-bottom:12px">' +
        (isCompany
          ? '默认只统计参与身份为「动画制作」的作品（可用上方标签调整）。对每部作品抓取全部制作人员，统计每个人在多少部作品中出现。'
          : '对 TA 参与的作品抓取全部制作人员，统计与 TA 共事过多少部作品。' +
            '同一作品内按人合并；默认不统计 TA 本人。') +
        '</div>' +
        '<div class="row" style="margin-bottom:12px">' +
        '  <label class="small muted">并发 <input type="number" id="ana-conc" value="5" min="1" max="20" style="width:64px;padding:4px 8px"></label>' +
        '  <label class="small muted">间隔ms <input type="number" id="ana-int" value="200" min="0" style="width:80px;padding:4px 8px"></label>' +
        '  <label class="small muted"><input type="checkbox" id="ana-force"> 强制刷新缓存</label>' +
        '  <label class="small muted"><input type="checkbox" id="ana-self" checked> 不统计 TA 本人/公司</label>' +
        '  <button class="btn" id="ana-start">开始统计</button>' +
        '</div>' +
        '<div id="ana-progress" style="display:none"></div>' +
        '<div id="ana-result"></div>';

      const startBtn = box.querySelector('#ana-start');
      let signal = null;

      startBtn.addEventListener('click', function () {
        if (signal) { return; }
        const works = getFilteredWorks();
        if (!works.length) { Staff.ui.toast('当前筛选下没有作品，请调整筛选'); return; }
        const concurrency = parseInt(box.querySelector('#ana-conc').value, 10) || 5;
        const interval = parseInt(box.querySelector('#ana-int').value, 10) || 200;
        const force = box.querySelector('#ana-force').checked;
        const skipSelf = box.querySelector('#ana-self').checked;

        const progressBox = box.querySelector('#ana-progress');
        progressBox.style.display = 'block';
        progressBox.innerHTML =
          '<div class="progress-bar"><i style="width:0"></i></div>' +
          '<div class="row" style="justify-content:space-between;margin-top:6px">' +
          '  <span class="progress-text" id="ana-prog-text">0 / ' + works.length + '</span>' +
          '  <button class="btn small danger" id="ana-cancel">取消</button>' +
          '</div>';
        const bar = progressBox.querySelector('.progress-bar i');
        const text = progressBox.querySelector('#ana-prog-text');

        startBtn.disabled = true;
        signal = { cancelled: false };
        progressBox.querySelector('#ana-cancel').addEventListener('click', function () {
          if (signal) signal.cancelled = true;
        });

        const items = works.map(function (w) {
          return {
            path: '/v0/subjects/' + w.id + '/persons',
            key: 'subject-persons|' + w.id,
            ttl: Staff.config.cacheTtl.subjectPersons,
            force: force
          };
        });

        Staff.api.runBatch(items, {
          concurrency: concurrency,
          interval: interval,
          signal: signal,
          onProgress: function (done, total) {
            bar.style.width = (total ? Math.round(done / total * 100) : 0) + '%';
            text.textContent = done + ' / ' + total;
          }
        }).then(function (results) {
          signal = null;
          startBtn.disabled = false;
          progressBox.style.display = 'none';
          const failed = results.filter(function (r) { return !r.ok; }).length;
          if (failed) Staff.ui.toast(failed + ' 部作品获取失败（已跳过）', 'error');
          const agg = aggregate(results, works, skipSelf ? person.id : null);
          renderStats(box.querySelector('#ana-result'), agg, works);
        });
      });
      return box;
    }

    /* 聚合：按 personId 合并 */
    function aggregate(results, works, excludeId) {
      const map = new Map();
      results.forEach(function (r, i) {
        if (!r.ok) return;
        const work = works[i];
        const staffList = r.data || [];
        const perWork = new Map(); // personId -> Set(relations)
        staffList.forEach(function (s) {
          if (excludeId && String(s.id) === String(excludeId)) return;
          if (!perWork.has(s.id)) perWork.set(s.id, new Set());
          if (s.relation) perWork.get(s.id).add(s.relation);
        });
        perWork.forEach(function (relations, pid) {
          const s = staffList.find(function (x) { return x.id === pid; });
          let entry = map.get(pid);
          if (!entry) {
            entry = {
              id: pid, name: s.name, type: s.type, career: s.career || [],
              count: 0, relations: new Set(), works: []
            };
            map.set(pid, entry);
          }
          entry.count++;
          relations.forEach(function (rel) { entry.relations.add(rel); });
          entry.works.push({ subjectId: work.id, subjectName: displayName(work), relation: Array.from(relations).join('、') });
        });
      });
      return Array.from(map.values());
    }

    /* 渲染统计结果 */
    function renderStats(container, agg, works) {
      if (!agg.length) {
        container.innerHTML = Staff.ui.empty('没有统计到 staff（可能作品 staff 数据为空）');
        return;
      }
      const totalWorks = works.length;
      const maxCount = agg.reduce(function (m, a) { return Math.max(m, a.count); }, 1);
      let typeFilter = 'all'; // all / person / company
      let sortKey = 'count';
      let sortDesc = true;

      // 职务集合与选中状态（默认全选）
      const relCount = {};
      agg.forEach(function (a) {
        a.relations.forEach(function (r) { relCount[r] = (relCount[r] || 0) + 1; });
      });
      const relList = Object.keys(relCount).sort(function (x, y) { return relCount[y] - relCount[x]; });
      const relState = {};
      relList.forEach(function (r) { relState[r] = true; });
      const REL_COLLAPSED = 10;
      let relExpanded = false;

      const wrap = document.createElement('div');
      wrap.innerHTML =
        '<div class="small muted" style="margin-bottom:8px">统计了 ' + totalWorks + ' 部作品，共出现 ' + agg.length + ' 名 staff' +
        '<span id="ana-type-filter" style="margin-left:10px"></span></div>' +
        '<div class="row" style="margin-bottom:10px" id="ana-result-chips"></div>' +
        (relList.length ? '<div class="small muted" style="margin-bottom:4px">职务筛选（staff 只要担任过任一选中职务就会显示）：</div>' +
          '<div class="row" style="margin-bottom:6px;flex-wrap:wrap" id="ana-rel-chips"></div>' +
          '<div class="row" style="margin-bottom:10px" id="ana-rel-actions"></div>' : '') +
        '<div id="ana-table"></div>';

      const chipsRow = wrap.querySelector('#ana-result-chips');
      [
        { code: 'all', label: '全部' },
        { code: 'person', label: '只看个人' },
        { code: 'company', label: '只看公司' }
      ].forEach(function (c) {
        const ch = document.createElement('span');
        ch.className = 'chip' + (c.code === 'all' ? ' active' : '');
        ch.textContent = c.label;
        ch.addEventListener('click', function () {
          chipsRow.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('active'); });
          ch.classList.add('active');
          typeFilter = c.code;
          draw();
        });
        chipsRow.appendChild(ch);
      });

      // 职务筛选 chips
      const relRow = wrap.querySelector('#ana-rel-chips');
      const relActions = wrap.querySelector('#ana-rel-actions');
      function renderRelChips() {
        if (!relRow) return;
        relRow.innerHTML = '';
        relList.forEach(function (r, i) {
          if (!relExpanded && i >= REL_COLLAPSED) return;
          const ch = document.createElement('span');
          ch.className = 'chip' + (relState[r] ? ' active' : '');
          ch.textContent = r + ' (' + relCount[r] + ')';
          ch.addEventListener('click', function () {
            relState[r] = !relState[r];
            ch.classList.toggle('active', relState[r]);
            draw();
          });
          relRow.appendChild(ch);
        });
      }
      function renderRelActions() {
        if (!relActions) return;
        relActions.innerHTML = '';
        if (relList.length > REL_COLLAPSED) {
          const more = document.createElement('button');
          more.className = 'btn small secondary';
          more.textContent = relExpanded ? '收起职务' : '展开全部 ' + relList.length + ' 个职务';
          more.addEventListener('click', function () {
            relExpanded = !relExpanded;
            renderRelChips();
            renderRelActions();
          });
          relActions.appendChild(more);
        }
        const clear = document.createElement('button');
        clear.className = 'btn small secondary';
        clear.textContent = '清空';
        clear.addEventListener('click', function () {
          relList.forEach(function (r) { relState[r] = false; });
          renderRelChips();
          draw();
        });
        relActions.appendChild(clear);
        const all = document.createElement('button');
        all.className = 'btn small secondary';
        all.textContent = '全选';
        all.addEventListener('click', function () {
          relList.forEach(function (r) { relState[r] = true; });
          renderRelChips();
          draw();
        });
        relActions.appendChild(all);
      }
      renderRelChips();
      renderRelActions();

      function filtered() {
        let list = agg.slice();
        if (typeFilter === 'person') list = list.filter(function (a) { return a.type !== 2; });
        if (typeFilter === 'company') list = list.filter(function (a) { return a.type === 2; });
        if (!relList.length) return list;
        if (relList.every(function (r) { return relState[r]; })) return list;
        if (!relList.some(function (r) { return relState[r]; })) return [];
        return list.filter(function (a) {
          return Array.from(a.relations).some(function (r) { return relState[r]; });
        });
      }
      function draw() {
        let list = filtered();
        list.sort(function (a, b) {
          let r = 0;
          if (sortKey === 'count') r = a.count - b.count;
          else if (sortKey === 'name') r = (a.name || '').localeCompare(b.name || '', 'zh');
          if (r === 0) r = (a.name || '').localeCompare(b.name || '', 'zh');
          return sortDesc ? -r : r;
        });
        const target = wrap.querySelector('#ana-table');
        if (!list.length) {
          target.innerHTML = '<div class="empty-box">当前筛选下没有匹配的 staff，试试调整上面的类型或职务筛选</div>';
          return;
        }
        const headers = [
          { key: 'rank', label: '#', sortable: false, num: true },
          { key: 'name', label: 'Staff', sortable: true },
          { key: 'type', label: '类型', sortable: false },
          { key: 'count', label: '出现次数', sortable: true, num: true },
          { key: 'wn', label: '职务', sortable: false },
          { key: 'op', label: '操作', sortable: false }
        ];
        const rows = list.map(function (a) {
          const pct = Math.round(a.count / maxCount * 100);
          return {
            cells: {
              rank: list.indexOf(a) + 1,
              name: '<div class="row" style="gap:8px;flex-wrap:nowrap"><a href="https://bgm.tv/person/' + a.id + '" target="_blank" rel="noopener">' + Staff.ui.escapeHtml(a.name) + '</a>' +
                '  <div class="bar-cell" style="flex:1;min-width:80px"><div class="bar-bg"><div class="bar-fill" style="width:' + pct + '%"></div></div></div></div>',
              type: Staff.ui.typeBadge(a.type),
              count: '<strong>' + a.count + '</strong> 部',
              wn: Array.from(a.relations).slice(0, 4).map(function (r) { return Staff.ui.roleBadge(r); }).join(' '),
              op: '<button class="btn small" data-collect="' + a.id + '">收集</button>'
            },
            _a: a
          };
        });
        const table = Staff.ui.sortableTable(headers, rows, function (key) {
          if (sortKey === key) { sortDesc = !sortDesc; } else { sortKey = key; sortDesc = (key === 'name') ? false : true; }
          draw();
        });
        target.innerHTML = '';
        target.appendChild(table.el);
        table.render({ key: sortKey, desc: sortDesc });
        target.querySelectorAll('[data-collect]').forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const a = agg.find(function (x) { return String(x.id) === btn.dataset.collect; });
            if (a) Staff.ui.openTagModal({ id: a.id, name: a.name, type: a.type, career: Array.from(a.relations) });
          });
        });
      }
      draw();
      container.innerHTML = '';
      container.appendChild(wrap);
    }
  }

  Staff.views = Staff.views || {};
  Staff.views.analysis = { render: render };
})();
