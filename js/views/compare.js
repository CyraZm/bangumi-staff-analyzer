/* bangumi-staff-analyzer 作品重叠度对比视图
 * 选择两部作品，对比双方 staff 的重叠情况与各自职务
 */
(function () {
  const TYPE_OPTIONS = [
    { code: 2, label: '动画' },
    { code: 4, label: '游戏' },
    { code: 6, label: '三次元' },
    { code: 1, label: '书籍' }
  ];

  const state = {
    a: null, b: null
  };

  function render(container) {
    container.innerHTML =
      '<h2 class="page-title">作品 staff 重叠度对比</h2>' +
      '<p class="page-desc">选择两部作品，查看有哪些制作人员同时出现在两者中，以及他们在两部作品里各自担任的职务。</p>' +
      '<div class="compare-grid" id="cmp-panels">' +
      panel('a', '作品 A') + panel('b', '作品 B') +
      '</div>' +
      '<div id="cmp-result"></div>';

    initPanel('a');
    initPanel('b');
  }

  function panel(key, title) {
    return '<div class="card" data-panel="' + key + '">' +
      '  <h3>' + title + '</h3>' +
      '  <div class="small muted" style="margin-bottom:8px">搜索条目，或直接粘贴条目链接 / ID</div>' +
      '  <div class="row" style="margin-bottom:8px">' +
      '    <select id="cmp-type-' + key + '">' +
      TYPE_OPTIONS.map(function (t) { return '<option value="' + t.code + '">' + t.label + '</option>'; }).join('') +
      '    </select>' +
      '    <button class="btn secondary small" data-load="' + key + '">按 ID 载入</button>' +
      '  </div>' +
      '  <div class="combo" id="cmp-combo-' + key + '"></div>' +
      '  <div id="cmp-load-' + key + '" style="margin-top:10px"></div>' +
      '</div>';
  }

  function initPanel(key) {
    const panelEl = document.querySelector('[data-panel="' + key + '"]');
    const loadBox = document.querySelector('#cmp-load-' + key);
    const comboBox = document.querySelector('#cmp-combo-' + key);
    const typeSel = document.querySelector('#cmp-type-' + key);

    const combo = Staff.ui.combo(comboBox, {
      placeholder: '输入作品名搜索，如：孤独摇滚',
      onSearch: function (kw, done) {
        Staff.api.searchSubjects(kw, [parseInt(typeSel.value, 10)]).then(function (list) {
          done(list.map(function (s) {
            const label = s.name_cn || s.name;
            return { id: s.id, label: label, meta: (s.date || '') + ' · ' + s.name, value: s.id };
          }));
        }).catch(function () { done([]); });
      },
      onPick: function (item) { loadSubject(key, item.id); }
    });

    panelEl.querySelector('[data-load="' + key + '"]').addEventListener('click', function () {
      const id = Staff.api.parseSubjectId(combo.getValue());
      if (!id) { Staff.ui.toast('请输入有效的条目链接或 ID'); return; }
      loadSubject(key, id);
    });

    function loadSubject(key2, id) {
      loadBox.innerHTML = Staff.ui.loading('正在加载作品 ' + id + '…');
      Promise.all([Staff.api.getSubject(id), Staff.api.getSubjectPersons(id)]).then(function (res) {
        const subj = res[0], persons = res[1] || [];
        state[key2] = { id: id, name: subj.name_cn || subj.name, persons: persons };
        loadBox.innerHTML =
          '<div class="row" style="justify-content:space-between">' +
          '  <div><strong>' + Staff.ui.escapeHtml(state[key2].name) + '</strong> ' + Staff.ui.subjectLink(id, '(bgm)') +
          '    <span class="muted small">' + persons.length + ' 名 staff</span></div>' +
          '  <button class="btn small secondary" data-clear="' + key2 + '">移除</button>' +
          '</div>';
        loadBox.querySelector('[data-clear="' + key2 + '"]').addEventListener('click', function () {
          state[key2] = null;
          loadBox.innerHTML = '';
          combo.clear();
          renderResult();
        });
        renderResult();
      }).catch(function (err) {
        loadBox.innerHTML = Staff.ui.empty('加载失败：' + err.message);
      });
    }
  }

  // 按人聚合：同一部作品内一个人的多个职务合并为 relations 集合（避免重复计数）
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

  function personCount(list) {
    const persons = list.filter(function (p) { return p.type !== 2; }).length;
    return { total: list.length, persons: persons, companies: list.length - persons };
  }

  // 职务徽章（多个职务合并显示）
  function relBadges(g) {
    if (!g) return '<span class="muted small">—</span>';
    const rels = Array.from(g.relations || []);
    if (!rels.length) return '<span class="muted small">—</span>';
    return rels.map(function (r) { return Staff.ui.roleBadge(r); }).join(' ');
  }

  function renderResult() {
    const root = document.querySelector('#cmp-result');
    const a = state.a, b = state.b;
    if (!a && !b) { root.innerHTML = ''; return; }

    if (!a || !b) {
      const one = a || b;
      const uniq = Array.from(groupPersons(one.persons).values());
      const c = personCount(uniq);
      root.innerHTML =
        '<div class="card"><h3>' + Staff.ui.escapeHtml(one.name) + ' · 制作人员</h3>' +
        '<div class="small muted">共 ' + c.total + ' 名（个人 ' + c.persons + '，公司 ' + c.companies + '）</div>' +
        personList(uniq, 15) +
        '</div>';
      return;
    }

    const mapA = groupPersons(a.persons);
    const mapB = groupPersons(b.persons);
    const uniqA = Array.from(mapA.values());
    const uniqB = Array.from(mapB.values());
    const ca = personCount(uniqA), cb = personCount(uniqB);
    const overlap = uniqA.filter(function (p) { return mapB.has(p.id); });
    const onlyA = uniqA.filter(function (p) { return !mapB.has(p.id); });
    const onlyB = uniqB.filter(function (p) { return !mapA.has(p.id); });

    const cards =
      '<div class="card"><h3>' + Staff.ui.escapeHtml(a.name) + ' <span class="muted small" style="font-weight:400">作品 A</span></h3>' +
      '<div class="small muted">共 ' + ca.total + ' 名（个人 ' + ca.persons + '，公司 ' + ca.companies + '）</div>' +
      personList(uniqA, 8) + '</div>' +
      '<div class="card"><h3>' + Staff.ui.escapeHtml(b.name) + ' <span class="muted small" style="font-weight:400">作品 B</span></h3>' +
      '<div class="small muted">共 ' + cb.total + ' 名（个人 ' + cb.persons + '，公司 ' + cb.companies + '）</div>' +
      personList(uniqB, 8) + '</div>';

    root.innerHTML =
      '<div class="compare-grid" style="margin-bottom:16px">' + cards + '</div>' +
      '<div class="card">' +
      '  <div class="row" style="justify-content:space-between">' +
      '    <h3 style="margin:0">重叠 staff</h3>' +
      '    <span class="overlap-count">' + overlap.length + '</span>' +
      '  </div>' +
      '  <div class="small muted" style="margin:6px 0 10px">同时出现在两部作品中的制作人员；可筛选只看个人或公司</div>' +
      '  <div class="row" style="margin-bottom:10px" id="cmp-filter"></div>' +
      '  <div id="cmp-table"></div>' +
      '</div>' +
      '<div class="grid-2">' +
      '  <div class="card"><h3>仅作品 A <span class="muted small" style="font-weight:400">' + onlyA.length + ' 人</span></h3>' +
      '    <details><summary class="small muted" style="cursor:pointer">展开列表</summary>' + personList(onlyA, 60) + '</details></div>' +
      '  <div class="card"><h3>仅作品 B <span class="muted small" style="font-weight:400">' + onlyB.length + ' 人</span></h3>' +
      '    <details><summary class="small muted" style="cursor:pointer">展开列表</summary>' + personList(onlyB, 60) + '</details></div>' +
      '</div>';

    let typeFilter = 'all';
    const filterRow = root.querySelector('#cmp-filter');
    [
      { code: 'all', label: '全部' },
      { code: 'person', label: '只看个人' },
      { code: 'company', label: '只看公司' }
    ].forEach(function (f) {
      const ch = document.createElement('span');
      ch.className = 'chip' + (f.code === 'all' ? ' active' : '');
      ch.textContent = f.label;
      ch.addEventListener('click', function () {
        filterRow.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('active'); });
        ch.classList.add('active');
        typeFilter = f.code;
        drawTable();
      });
      filterRow.appendChild(ch);
    });

    function drawTable() {
      let list = overlap;
      if (typeFilter === 'person') list = list.filter(function (p) { return p.type !== 2; });
      if (typeFilter === 'company') list = list.filter(function (p) { return p.type === 2; });
      const headers = [
        { key: 'name', label: 'Staff', sortable: false },
        { key: 'type', label: '类型', sortable: false },
        { key: 'ra', label: '作品 A 职务', sortable: false },
        { key: 'rb', label: '作品 B 职务', sortable: false },
        { key: 'op', label: '操作', sortable: false }
      ];
      const rows = list.map(function (p) {
        return {
          cells: {
            name: Staff.ui.personLink(p.id, p.name),
            type: Staff.ui.typeBadge(p.type),
            ra: relBadges(mapA.get(p.id)),
            rb: relBadges(mapB.get(p.id)),
            op: '<button class="btn small" data-c="' + p.id + '">收集</button>'
          },
          _p: p
        };
      });
      const table = Staff.ui.sortableTable(headers, rows);
      const target = root.querySelector('#cmp-table');
      target.innerHTML = '';
      target.appendChild(table.el);
      table.render({});
      target.querySelectorAll('[data-c]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const p = overlap.find(function (x) { return String(x.id) === btn.dataset.c; });
          if (p) Staff.ui.openTagModal(p);
        });
      });
    }
    drawTable();
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
