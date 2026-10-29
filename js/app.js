/* bangumi-staff-analyzer 应用入口：路由、导航、设置、启动 */
(function () {
  const views = Staff.views;
  let activeView = null;

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '') || 'home';
    const parts = raw.split('?');
    const name = parts[0] || 'home';
    const params = {};
    if (parts[1]) {
      new URLSearchParams(parts[1]).forEach(function (v, k) { params[k] = v; });
    }
    return { name: name, params: params };
  }

  function navigate() {
    if (Staff.runtime && Staff.runtime.isStopped()) return;
    const route = parseHash();
    const view = views[route.name];
    const main = document.getElementById('view');
    if (activeView && activeView.leave) activeView.leave();
    activeView = null;
    document.querySelectorAll('#nav a').forEach(function (a) {
      const active = a.dataset.route === (route.name === 'analysis' ? 'home' : route.name);
      a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.getElementById('route-label').textContent = { home: '探索与分析', analysis: '人物与公司分析', compare: '作品 / 公司对比', collections: '我的收集' }[route.name] || '页面不存在';
    if (!view) {
      main.innerHTML = Staff.ui.empty('页面不存在，<a href="#/home">返回首页</a>');
      return;
    }
    main.innerHTML = '';
    try {
      view.render(main, route.params);
      activeView = view;
    } catch (err) {
      main.innerHTML = Staff.ui.empty('页面渲染出错：' + err.message);
      console.error(err);
    }
    window.scrollTo(0, 0);
    if (view.afterRender) view.afterRender();
  }

  window.addEventListener('hashchange', navigate);

  /* ---------- 设置 ---------- */
  const SETTING_KEYS = { concurrency: 'concurrency', interval: 'interval' };

  async function loadSettings() {
    let conc = Staff.config.defaultConcurrency, int = Staff.config.defaultInterval;
    try {
      const c = await Staff.db.get(Staff.db.STORES.settings, SETTING_KEYS.concurrency);
      const i = await Staff.db.get(Staff.db.STORES.settings, SETTING_KEYS.interval);
      if (c && c.value) conc = c.value;
      if (i && i.value !== undefined) int = i.value;
    } catch (e) { /* 使用默认值 */ }
    Staff.api.setRate(conc, int);
    return { concurrency: conc, interval: int };
  }

  function openSettings() {
    loadSettings().then(function (cur) {
      const holder = document.createElement('div');
      holder.innerHTML =
        '<div class="m-field"><label>并发请求数（1-20，越大越快，越容易被限流）</label>' +
        '<input type="number" id="set-conc" min="1" max="20" value="' + cur.concurrency + '" style="width:100%"></div>' +
        '<div class="m-field"><label>请求间隔（毫秒，建议 150-500）</label>' +
        '<input type="number" id="set-int" min="0" value="' + cur.interval + '" style="width:100%"></div>' +
        '<hr style="border:none;border-top:1px solid var(--border);margin:10px 0">' +
        '<div class="row" style="justify-content:space-between">' +
        '  <button class="btn secondary small" id="set-clear-cache">清空 API 缓存</button>' +
        '  <button class="btn danger small" id="set-clear-all">清空全部本地数据</button>' +
        '</div>' +
        '<div class="small muted" style="margin-top:10px">清空 API 缓存后，下次统计会重新从 Bangumi 拉取数据。</div>';
      const dlg = Staff.ui.modal({
        title: '设置',
        okText: '保存',
        content: holder,
        onOk: function () {
          const conc = parseInt(holder.querySelector('#set-conc').value, 10);
          const int = parseInt(holder.querySelector('#set-int').value, 10);
          if (!Number.isFinite(conc) || conc < 1 || conc > 20) { Staff.ui.toast('并发数需在 1-20 之间'); return false; }
          if (!Number.isFinite(int) || int < 0) { Staff.ui.toast('请求间隔需为不小于 0 的数字'); return false; }
          Staff.api.setRate(conc, int);
          return Promise.all([
            Staff.db.put(Staff.db.STORES.settings, { key: SETTING_KEYS.concurrency, value: conc }),
            Staff.db.put(Staff.db.STORES.settings, { key: SETTING_KEYS.interval, value: int })
          ]).then(function () {
            Staff.ui.toast('设置已保存', 'success');
          });
        }
      });
      holder.querySelector('#set-clear-cache').addEventListener('click', async function () {
        await Staff.db.clear(Staff.db.STORES.cache);
        Staff.ui.toast('已清空 API 缓存', 'success');
      });
      holder.querySelector('#set-clear-all').addEventListener('click', async function () {
        await views.compare.clearWorkspace();
        await Promise.all([
          Staff.db.clear(Staff.db.STORES.cache),
          Staff.db.clear(Staff.db.STORES.tags),
          Staff.db.clear(Staff.db.STORES.groups),
          Staff.db.clear(Staff.db.STORES.settings)
        ]);
        Staff.ui.toast('已清空全部本地数据', 'success');
        dlg.close();
      });
    });
  }

  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.querySelector('.skip-link').addEventListener('click', function (e) {
    e.preventDefault();
    document.getElementById('view').focus();
  });
  document.querySelectorAll('[data-icon]').forEach(function (el) { el.innerHTML = Staff.ui.icon(el.dataset.icon); });

  Staff.app = { navigate: navigate, parseHash: parseHash, openSettings: openSettings };

  // 启动
  Promise.all([loadSettings(), views.compare.restoreWorkspace()]).finally(function () {
    navigate();
  });
})();
