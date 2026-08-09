/* bangumi-staff-analyzer 我的分类收集视图
 * - 我的标记：对 staff 打标签、写备注（本地 IndexedDB）
 * - 分组：自定义分组（如「某制片人的班底」），成员可搜索添加
 * - 导出：JSON / CSV 备份
 */
(function () {
  function render(container) {
    container.innerHTML =
      '<div class="row" style="justify-content:space-between;align-items:flex-start">' +
      '  <div><h2 class="page-title">我的分类收集</h2>' +
      '  <p class="page-desc">给感兴趣的 staff 打标签、写备注，或建分组整理（如「某制片人的班底」）。数据仅保存在本地浏览器。</p></div>' +
      '  <div class="row">' +
      '    <button class="btn secondary small" id="col-export-json">导出 JSON</button>' +
      '    <button class="btn secondary small" id="col-export-csv">导出 CSV</button>' +
      '  </div>' +
      '</div>' +
      '<div class="card">' +
      '  <h3>我的标记</h3>' +
      '  <div class="row" style="margin-bottom:10px">' +
      '    <input type="text" id="col-search" placeholder="按名称搜索已标记的 staff" style="flex:1;min-width:200px">' +
      '  </div>' +
      '  <div class="row" style="margin-bottom:12px" id="col-tag-filter"></div>' +
      '  <div id="col-tags"></div>' +
      '</div>' +
      '<div class="card">' +
      '  <h3>分组</h3>' +
      '  <div class="row" style="margin-bottom:12px">' +
      '    <input type="text" id="col-group-name" placeholder="分组名称，如：山田尚子班底" style="flex:1;min-width:200px">' +
      '    <button class="btn" id="col-group-add">新建分组</button>' +
      '  </div>' +
      '  <div id="col-groups"></div>' +
      '</div>';

    let allTags = [];
    let groups = [];
    let tagFilter = '';
    let keyword = '';

    document.querySelector('#col-search').addEventListener('input', function () {
      keyword = this.value.trim();
      drawTags();
    });
    document.querySelector('#col-group-add').addEventListener('click', async function () {
      const name = document.querySelector('#col-group-name').value.trim();
      if (!name) { Staff.ui.toast('请输入分组名称'); return; }
      await Staff.db.put(Staff.db.STORES.groups, { name: name, note: '', members: [], createdAt: Date.now(), updatedAt: Date.now() });
      document.querySelector('#col-group-name').value = '';
      Staff.ui.toast('已新建分组「' + name + '」', 'success');
      await load();
    });
    document.querySelector('#col-export-json').addEventListener('click', function () { exportJson(); });
    document.querySelector('#col-export-csv').addEventListener('click', function () { exportCsv(); });

    load();

    async function load() {
      try {
        const [t, g] = await Promise.all([Staff.db.getAll(Staff.db.STORES.tags), Staff.db.getAll(Staff.db.STORES.groups)]);
        allTags = (t || []).sort(function (a, b) { return b.updatedAt - a.updatedAt; });
        groups = g || [];
        drawTagFilter();
        drawTags();
        drawGroups();
      } catch (err) {
        document.querySelector('#col-tags').innerHTML = Staff.ui.empty('读取失败：' + err.message);
      }
    }

    function allTagsSet() {
      const s = new Set();
      allTags.forEach(function (x) { (x.tags || []).forEach(function (t) { s.add(t); }); });
      return Array.from(s);
    }
    function drawTagFilter() {
      const row = document.querySelector('#col-tag-filter');
      row.innerHTML = '';
      const chips = ['', ...allTagsSet()];
      chips.forEach(function (t) {
        const c = document.createElement('span');
        c.className = 'chip' + (t === tagFilter ? ' active' : '');
        c.textContent = t || '全部标签';
        c.addEventListener('click', function () {
          tagFilter = t;
          drawTagFilter();
          drawTags();
        });
        row.appendChild(c);
      });
    }

    function drawTags() {
      const box = document.querySelector('#col-tags');
      let list = allTags;
      if (tagFilter) list = list.filter(function (x) { return (x.tags || []).indexOf(tagFilter) >= 0; });
      if (keyword) list = list.filter(function (x) { return (x.name || '').indexOf(keyword) >= 0; });
      if (!list.length) {
        box.innerHTML = Staff.ui.empty('还没有标记任何 staff。在分析页或对比页点击「收集」即可加入。');
        return;
      }
      box.innerHTML = list.map(function (rec) {
        return '<div class="card" style="margin-bottom:10px;padding:12px 16px" data-pid="' + rec.personId + '">' +
          '  <div class="row" style="justify-content:space-between;align-items:flex-start">' +
          '    <div style="flex:1;min-width:0">' +
          '      <div>' + Staff.ui.personLink(rec.personId, rec.name) + ' ' + Staff.ui.typeBadge(rec.type) +
          '        <span class="muted small">' + Staff.ui.escapeHtml((rec.career || []).join(' / ')) + '</span></div>' +
          '      <div class="tags-wrap" style="margin-top:6px">' + renderTags(rec) + '</div>' +
          '      <div style="margin-top:6px"><input type="text" class="tag-input" style="width:100%" value="' +
          Staff.ui.escapeHtml(rec.note || '') + '" data-note="' + rec.personId + '" placeholder="备注…"></div>' +
          '    </div>' +
          '    <button class="btn small danger" data-del="' + rec.personId + '">删除</button>' +
          '  </div>' +
          '</div>';
      }).join('');

      box.querySelectorAll('[data-del]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          await Staff.db.remove(Staff.db.STORES.tags, parseInt(btn.dataset.del, 10));
          allTags = allTags.filter(function (x) { return String(x.personId) !== btn.dataset.del; });
          Staff.ui.toast('已删除标记', 'success');
          drawTagFilter();
          drawTags();
        });
      });
      box.querySelectorAll('input[data-note]').forEach(function (input) {
        input.addEventListener('change', async function () {
          const rec = allTags.find(function (x) { return String(x.personId) === input.dataset.note; });
          if (!rec) return;
          rec.note = input.value.trim();
          rec.updatedAt = Date.now();
          await Staff.db.put(Staff.db.STORES.tags, rec);
          Staff.ui.toast('备注已保存', 'success');
        });
      });
    }

    function renderTags(rec) {
      const wrap = document.createElement('span');
      wrap.className = 'tags-wrap';
      (rec.tags || []).forEach(function (t) {
        const span = document.createElement('span');
        span.className = 'tag';
        span.innerHTML = Staff.ui.escapeHtml(t) + '<button data-rm="' + Staff.ui.escapeHtml(t) + '">×</button>';
        span.querySelector('button').addEventListener('click', async function () {
          rec.tags = (rec.tags || []).filter(function (x) { return x !== t; });
          rec.updatedAt = Date.now();
          await Staff.db.put(Staff.db.STORES.tags, rec);
          drawTags();
          drawTagFilter();
        });
        wrap.appendChild(span);
      });
      const input = document.createElement('input');
      input.className = 'tag-input';
      input.placeholder = '+ 标签';
      input.addEventListener('keydown', async function (e) {
        if (e.key !== 'Enter') return;
        const v = input.value.trim();
        if (!v) return;
        rec.tags = rec.tags || [];
        if (rec.tags.indexOf(v) < 0) rec.tags.push(v);
        rec.updatedAt = Date.now();
        input.value = '';
        await Staff.db.put(Staff.db.STORES.tags, rec);
        drawTags();
        drawTagFilter();
      });
      wrap.appendChild(input);
      return wrap.outerHTML;
    }

    /* ---------- 分组 ---------- */
    function drawGroups() {
      const box = document.querySelector('#col-groups');
      if (!groups.length) { box.innerHTML = Staff.ui.empty('还没有分组。'); return; }
      box.innerHTML = '';
      groups.forEach(function (g) {
        const card = document.createElement('div');
        card.className = 'card group-card';
        const members = g.members || [];
        card.innerHTML =
          '<div class="row" style="justify-content:space-between;align-items:flex-start">' +
          '  <div style="flex:1;min-width:0">' +
          '    <strong>' + Staff.ui.escapeHtml(g.name) + '</strong> ' +
          '    <span class="muted small">' + members.length + ' 人</span>' +
          (g.note ? ' <div class="small muted">' + Staff.ui.escapeHtml(g.note) + '</div>' : '') +
          '  </div>' +
          '  <div class="row" style="gap:6px">' +
          '    <button class="btn small secondary" data-gr="' + g.id + '" data-act="rename">重命名</button>' +
          '    <button class="btn small danger" data-gr="' + g.id + '" data-act="del">删除</button>' +
          '  </div>' +
          '</div>' +
          '<div class="group-members" id="gr-members-' + g.id + '"></div>' +
          '<div class="combo" style="margin-top:10px;max-width:320px" id="gr-combo-' + g.id + '"></div>';

        const membersBox = card.querySelector('#gr-members-' + g.id);
        function drawMembers() {
          membersBox.innerHTML = '';
          if (!members.length) {
            membersBox.innerHTML = '<span class="muted small">暂无成员</span>';
            return;
          }
          members.forEach(function (m) {
            const pill = document.createElement('span');
            pill.className = 'member-pill';
            pill.innerHTML = '<a href="https://bgm.tv/person/' + m.id + '" target="_blank" rel="noopener">' +
              Staff.ui.escapeHtml(m.name) + '</a> ' + Staff.ui.typeBadge(m.type) +
              ' <button data-rmm="' + m.id + '">×</button>';
            pill.querySelector('button').addEventListener('click', async function () {
              g.members = members.filter(function (x) { return x.id !== m.id; });
              g.updatedAt = Date.now();
              await Staff.db.put(Staff.db.STORES.groups, g);
              drawMembers();
            });
            membersBox.appendChild(pill);
          });
        }
        drawMembers();

        const combo = Staff.ui.combo(card.querySelector('#gr-combo-' + g.id), {
          placeholder: '搜索人物并添加到该分组…',
          onSearch: function (kw, done) {
            Staff.api.searchPersons(kw, '').then(function (list) {
              done(list.slice(0, 20).map(function (p) {
                return { id: p.id, label: p.name, meta: Staff.ui.escapeHtml((p.career || []).join('/') || '未填职业'), value: p.id };
              }));
            }).catch(function () { done([]); });
          },
          onPick: async function (item) {
            if (members.some(function (m) { return String(m.id) === String(item.id); })) {
              Staff.ui.toast('该成员已在分组中');
              return;
            }
            const p = await Staff.api.getPerson(item.id).catch(function () { return null; });
            g.members.push({ id: item.id, name: p ? p.name : item.label, type: p ? p.type : 1 });
            g.updatedAt = Date.now();
            await Staff.db.put(Staff.db.STORES.groups, g);
            combo.clear();
            drawMembers();
          }
        });

        card.querySelector('[data-act="rename"]').addEventListener('click', function () {
          const holder = document.createElement('div');
          holder.innerHTML = '<div class="m-field"><label>分组名称</label><input type="text" id="gr-new-name" value="' + Staff.ui.escapeHtml(g.name) + '" style="width:100%"></div>';
          Staff.ui.modal({
            title: '重命名分组',
            okText: '保存',
            content: holder,
            onOk: async function () {
              const v = holder.querySelector('#gr-new-name').value.trim();
              if (!v) { Staff.ui.toast('名称不能为空'); return false; }
              g.name = v;
              g.updatedAt = Date.now();
              await Staff.db.put(Staff.db.STORES.groups, g);
              drawGroups();
              Staff.ui.toast('已重命名', 'success');
            }
          });
        });
        card.querySelector('[data-act="del"]').addEventListener('click', async function () {
          await Staff.db.remove(Staff.db.STORES.groups, g.id);
          groups = groups.filter(function (x) { return x.id !== g.id; });
          drawGroups();
          Staff.ui.toast('已删除分组', 'success');
        });
        box.appendChild(card);
      });
    }

    /* ---------- 导出 ---------- */
    function download(filename, content, mime) {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
    function exportJson() {
      const data = { exportedAt: new Date().toISOString(), app: 'bangumi-staff-analyzer', version: Staff.config.version, tags: allTags, groups: groups };
      download('bangumi-staff-collections-' + Date.now() + '.json', JSON.stringify(data, null, 2), 'application/json');
      Staff.ui.toast('已导出 JSON', 'success');
    }
    function exportCsv() {
      const header = ['personId', 'name', 'type', 'tags', 'note'];
      const lines = [header.join(',')].concat(allTags.map(function (r) {
        return [r.personId, '"' + (r.name || '').replace(/"/g, '""') + '"', r.type, '"' + (r.tags || []).join('|').replace(/"/g, '""') + '"', '"' + (r.note || '').replace(/"/g, '""') + '"'].join(',');
      }));
      download('bangumi-staff-tags-' + Date.now() + '.csv', '\ufeff' + lines.join('\n'), 'text/csv;charset=utf-8');
      Staff.ui.toast('已导出 CSV', 'success');
    }
  }

  Staff.views = Staff.views || {};
  Staff.views.collections = { render: render };
})();
