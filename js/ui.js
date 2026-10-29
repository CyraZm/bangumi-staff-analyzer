/* bangumi-staff-analyzer 通用 UI 工具
 * toast / modal / 徽章 / 链接 / 表格排序
 */
(function () {
  const ICONS = {
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    compare: '<rect x="3" y="5" width="7" height="14" rx="1.5"/><rect x="14" y="5" width="7" height="14" rx="1.5"/><path d="M7 9h0m10 6h0"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="var(--bg-soft)"/><circle cx="15" cy="17" r="2" fill="var(--bg-soft)"/>',
    power: '<path d="M12 3v8m5-6a8 8 0 1 1-10 0"/>',
    layers: '<path d="m12 3 10 5-10 5L2 8Zm-9 10 9 5 9-5M3 18l9 5 9-5"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    building: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h1m4 0h1m-6 4h1m4 0h1m-5 10v-5h4v5"/>',
    person: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>'
  };
  function icon(name) {
    return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || ICONS.layers) + '</svg>';
  }
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
    const previousFocus = document.activeElement;
    const root = document.getElementById('modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="' + escapeHtml(opts.title || '对话框') + '" tabindex="-1">' + (opts.title ? '<h3>' + escapeHtml(opts.title) + '</h3>' : '') +
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

    let busy = false;
    function close(result) {
      if (busy) return;
      overlay.remove();
      if (previousFocus && previousFocus.isConnected) previousFocus.focus();
      if (opts.onClose) opts.onClose(result);
    }
    overlay.querySelector('[data-role="cancel"]').addEventListener('click', function () { close('cancel'); });
    const okBtn = overlay.querySelector('[data-role="ok"]');
    if (okBtn) okBtn.addEventListener('click', async function () {
      if (busy) return;
      busy = true;
      okBtn.disabled = true;
      try {
        const val = opts.onOk ? await opts.onOk() : true;
        busy = false;
        if (val !== false) close('ok');
      } catch (err) {
        busy = false;
        toast('保存失败：' + err.message, 'error');
      } finally { okBtn.disabled = false; }
    });
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close('cancel'); }
      if (e.key !== 'Tab') return;
      const items = Array.from(overlay.querySelectorAll('button, input, textarea, select, a[href]')).filter(function (el) { return !el.disabled; });
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement.classList.contains('modal'))) { e.preventDefault(); if (last) last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); if (first) first.focus(); }
    });
    (body.querySelector('input, textarea, select') || overlay.querySelector('.modal')).focus();
    return { close: close, body: body };
  }

  /* ---------- 徽章 / 链接 ---------- */
  function typeBadge(type) {
    if (type === 2) return '<span class="badge badge-co">公司</span>';
    if (type === 3) return '<span class="badge badge-co">组合</span>';
    if (type !== 1) return '<span class="badge badge-role">类型未标注</span>';
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
          th.tabIndex = 0;
          th.setAttribute('aria-sort', h.key === current.key ? (current.desc ? 'descending' : 'ascending') : 'none');
          th.addEventListener('click', function () {
            if (onSort) onSort(h.key);
          });
          th.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (onSort) onSort(h.key); }
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
  let comboId = 0;
  function combo(container, opts) {
    // opts: {placeholder, onSearch(keyword, done), onPick(item)}
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = opts.placeholder || '';
    input.setAttribute('aria-label', opts.placeholder || '搜索');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.autocomplete = 'off';
    const drop = document.createElement('div');
    drop.className = 'combo-drop';
    drop.id = 'staff-combo-' + (++comboId);
    drop.setAttribute('role', 'listbox');
    input.setAttribute('aria-controls', drop.id);
    drop.style.display = 'none';
    container.appendChild(input);
    container.appendChild(drop);

    let timer = null;
    let picked = false;
    let searchVersion = 0;
    let choices = [];
    let selected = -1;
    function hide() {
      drop.style.display = 'none';
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
    function pick(item) {
      picked = true;
      hide();
      input.value = item.label || '';
      opts.onPick(item);
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { hide(); return; }
      if (drop.style.display === 'none' || !choices.length) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        pick(choices[Math.max(0, selected)]);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        selected = selected < 0
          ? (e.key === 'ArrowDown' ? 0 : choices.length - 1)
          : (selected + (e.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
        Array.from(drop.children).forEach(function (el, i) { el.setAttribute('aria-selected', i === selected ? 'true' : 'false'); });
        const option = drop.children[selected];
        input.setAttribute('aria-activedescendant', option.id);
        option.scrollIntoView({ block: 'nearest' });
      }
    });

    input.addEventListener('input', function () {
      clearTimeout(timer);
      const version = ++searchVersion;
      picked = false;
      const kw = input.value.trim();
      hide();
      if (!kw) return;
      timer = setTimeout(function () {
        opts.onSearch(kw, function (items) {
          if (picked || version !== searchVersion || !container.isConnected || document.activeElement !== input) return;
          choices = items;
          selected = -1;
          drop.innerHTML = '';
          if (!items.length) {
            drop.innerHTML = '<div class="combo-item muted">无结果</div>';
          } else {
            items.forEach(function (it, i) {
              const div = document.createElement('div');
              div.className = 'combo-item';
              div.id = drop.id + '-' + i;
              div.setAttribute('role', 'option');
              div.setAttribute('aria-selected', 'false');
              div.innerHTML = '<div>' + escapeHtml(it.label) + '</div>' +
                (it.meta ? '<div class="meta">' + escapeHtml(it.meta) + '</div>' : '');
              div.addEventListener('mousedown', function (e) {
                e.preventDefault();
                pick(it);
              });
              drop.appendChild(div);
            });
          }
          drop.style.display = 'block';
          input.setAttribute('aria-expanded', 'true');
        });
      }, 300);
    });
    input.addEventListener('blur', function () {
      hide();
    });
    return {
      input: input,
      setValue: function (v) { input.value = v; },
      getValue: function () { return input.value.trim(); },
      clear: function () { input.value = ''; ++searchVersion; clearTimeout(timer); hide(); }
    };
  }

  Staff.ui = {
    icon: icon,
    escapeHtml: escapeHtml,
    toast: toast,
    modal: modal,
    typeBadge: typeBadge,
    personLink: personLink,
    subjectLink: subjectLink,
    roleBadge: roleBadge,
    sortableTable: sortableTable,
    combo: combo,
    loading: function (text) {
      return '<div class="loading-box">' + text + ' <span class="spinner"></span></div>';
    },
    empty: function (text) {
      return '<div class="empty-box">' + icon('layers') + text + '</div>';
    }
  };
})();
