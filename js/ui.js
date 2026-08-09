/* bangumi-staff-analyzer 通用 UI 工具
 * toast / modal / 徽章 / 链接 / 表格排序 / 收藏弹窗
 */
(function () {
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- toast ---------- */
  function toast(msg, type) {
    type = type || 'info';
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(function () { el.remove(); }, 320);
    }, 3000);
  }

  /* ---------- modal ---------- */
  function modal(opts) {
    const root = document.getElementById('modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal">' + (opts.title ? '<h3>' + escapeHtml(opts.title) + '</h3>' : '') +
      '<div class="m-body"></div>' +
      '<div class="m-foot">' +
      (opts.okText ? '<button class="btn" data-role="ok">' + escapeHtml(opts.okText) + '</button>' : '') +
      '<button class="btn secondary" data-role="cancel">' + escapeHtml(opts.cancelText || '取消') + '</button>' +
      '</div></div>';
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    root.appendChild(overlay);

    const body = overlay.querySelector('.m-body');
    if (opts.content) {
      if (typeof opts.content === 'string') body.innerHTML = opts.content;
      else body.appendChild(opts.content);
    }

    function close(result) {
      overlay.remove();
      if (opts.onClose) opts.onClose(result);
    }
    overlay.querySelector('[data-role="cancel"]').addEventListener('click', function () { close('cancel'); });
    const okBtn = overlay.querySelector('[data-role="ok"]');
    if (okBtn) okBtn.addEventListener('click', function () {
      const val = opts.onOk ? opts.onOk() : true;
      if (val !== false) close('ok');
    });
    return { close: close, body: body };
  }

  /* ---------- 徽章 / 链接 ---------- */
  function typeBadge(type) {
    if (type === 2) return '<span class="badge badge-co">公司</span>';
    return '<span class="badge badge-person">个人</span>';
  }
  function personLink(id, name) {
    return '<a href="https://bgm.tv/person/' + id + '" target="_blank" rel="noopener">' + escapeHtml(name) + '</a>';
  }
  function subjectLink(id, name) {
    return '<a href="https://bgm.tv/subject/' + id + '" target="_blank" rel="noopener">' + escapeHtml(name) + '</a>';
  }
  function roleBadge(role) {
    return role ? '<span class="badge-role">' + escapeHtml(role) + '</span>' : '';
  }

  /* ---------- 收藏（标记）数据 ---------- */
  async function getTag(personId) {
    try { return await Staff.db.get(Staff.db.STORES.tags, personId) || null; } catch (e) { return null; }
  }
  async function saveTag(record) {
    await Staff.db.put(Staff.db.STORES.tags, record);
  }
  async function removeTag(personId) {
    await Staff.db.remove(Staff.db.STORES.tags, personId);
  }

  // 弹出"加入收集"弹窗：设置标签 + 备注
  function openTagModal(person, opts) {
    opts = opts || {};
    const holder = document.createElement('div');
    holder.innerHTML =
      '<div class="m-field"><label>名称</label><div style="font-weight:600">' + escapeHtml(person.name) +
      typeBadge(person.type) + '</div></div>' +
      '<div class="m-field"><label>标签（逗号分隔）</label>' +
      '<input type="text" id="tag-input-tags" placeholder="如：京阿尼御用, 监督" style="width:100%"></div>' +
      '<div class="m-field"><label>备注</label>' +
      '<textarea id="tag-input-note" rows="3" style="width:100%" placeholder="可写备注，如：山田尚子的御用演出家"></textarea></div>';
    const dlg = modal({
      title: '加入我的分类收集',
      okText: '保存',
      content: holder,
      onOk: function () {
        const tags = holder.querySelector('#tag-input-tags').value
          .split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
        const note = holder.querySelector('#tag-input-note').value.trim();
        return saveTag({
          personId: person.id,
          name: person.name,
          type: person.type,
          career: person.career || [],
          tags: tags,
          note: note,
          updatedAt: Date.now()
        }).then(function () { toast('已加入收集', 'success'); });
      }
    });
    return dlg;
  }

  /* ---------- 可排序表格 ---------- */
  function sortableTable(headers, rows, onSort) {
    // headers: [{key, label, num}], rows: [{key: value}], onSort(col) -> 由调用方返回排序后行并重绘
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.className = 'data';
    let thead = document.createElement('thead');
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    wrap.appendChild(table);

    function render(current) {
      thead.innerHTML = '';
      const tr = document.createElement('tr');
      headers.forEach(function (h) {
        const th = document.createElement('th');
        th.textContent = h.label;
        if (h.key === current.key) th.className = current.desc ? 'sorted-desc' : 'sorted-asc';
        if (h.sortable !== false) {
          th.addEventListener('click', function () {
            if (onSort) onSort(h.key);
          });
        }
        tr.appendChild(th);
      });
      thead.appendChild(tr);
      tbody.innerHTML = '';
      rows.forEach(function (r) {
        const tr2 = document.createElement('tr');
        headers.forEach(function (h) {
          const td = document.createElement('td');
          if (h.num) td.className = 'num';
          td.innerHTML = r.cells[h.key] || '';
          tr2.appendChild(td);
        });
        tbody.appendChild(tr2);
      });
    }
    return { el: wrap, render: render };
  }

  /* ---------- 搜索建议下拉 ---------- */
  function combo(container, opts) {
    // opts: {placeholder, onSearch(keyword, done), onPick(item)}
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = opts.placeholder || '';
    input.autocomplete = 'off';
    const drop = document.createElement('div');
    drop.className = 'combo-drop';
    drop.style.display = 'none';
    container.appendChild(input);
    container.appendChild(drop);

    let timer = null;
    let picked = false;

    input.addEventListener('input', function () {
      clearTimeout(timer);
      picked = false;
      const kw = input.value.trim();
      if (!kw) { drop.style.display = 'none'; return; }
      timer = setTimeout(function () {
        opts.onSearch(kw, function (items) {
          if (picked) return;
          drop.innerHTML = '';
          if (!items.length) {
            drop.innerHTML = '<div class="combo-item muted">无结果</div>';
          } else {
            items.forEach(function (it) {
              const div = document.createElement('div');
              div.className = 'combo-item';
              div.innerHTML = '<div>' + escapeHtml(it.label) + '</div>' +
                (it.meta ? '<div class="meta">' + escapeHtml(it.meta) + '</div>' : '');
              div.addEventListener('mousedown', function (e) {
                e.preventDefault();
                picked = true;
                drop.style.display = 'none';
                input.value = it.label || '';
                opts.onPick(it);
              });
              drop.appendChild(div);
            });
          }
          drop.style.display = 'block';
        });
      }, 300);
    });
    input.addEventListener('blur', function () {
      setTimeout(function () { drop.style.display = 'none'; }, 150);
    });
    document.addEventListener('click', function (e) {
      if (!container.contains(e.target)) drop.style.display = 'none';
    });
    return {
      input: input,
      setValue: function (v) { input.value = v; },
      getValue: function () { return input.value.trim(); },
      clear: function () { input.value = ''; drop.style.display = 'none'; }
    };
  }

  Staff.ui = {
    escapeHtml: escapeHtml,
    toast: toast,
    modal: modal,
    typeBadge: typeBadge,
    personLink: personLink,
    subjectLink: subjectLink,
    roleBadge: roleBadge,
    getTag: getTag,
    saveTag: saveTag,
    removeTag: removeTag,
    openTagModal: openTagModal,
    sortableTable: sortableTable,
    combo: combo,
    loading: function (text) {
      return '<div class="loading-box">' + text + ' <span class="spinner"></span></div>';
    },
    empty: function (text) {
      return '<div class="empty-box">' + text + '</div>';
    }
  };
})();
