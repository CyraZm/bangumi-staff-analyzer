/* 首页：从人物或公司进入分析。 */
(function () {
  let root = null, scroll = 0, generation = 0;
  function render(container) {
    if (root) { container.appendChild(root); return; }
    root = document.createElement('div');
    root.className = 'home-workspace';
    container.appendChild(root);
    container = root;
    const token = generation;
    const icon = Staff.ui.icon;
    container.innerHTML =
      '<section class="home-intro">' +
      '  <div><div class="eyebrow">BEHIND THE CREDITS</div>' +
      '    <h2 class="home-title">每部作品背后，<br>都有值得认识的<em>创作者。</em></h2>' +
      '    <p>从一个名字开始，探索作品、合作轨迹与长期制作搭档。</p></div>' +
      '  <svg class="credit-art" viewBox="0 0 250 180" aria-hidden="true">' +
      '    <path d="M45 116H15V42h58M197 59h35v83h-56" fill="none" stroke="#ccd5c8" stroke-width="1.5" stroke-dasharray="4 4"/>' +
      '    <rect x="80" y="25" width="120" height="137" rx="9" fill="#e8e9e0" transform="rotate(10 140 90)"/>' +
      '    <rect x="56" y="15" width="122" height="144" rx="8" fill="#fff" stroke="#d6ddd1" transform="rotate(-8 117 87)"/>' +
      '    <g transform="rotate(-8 117 87)"><rect x="70" y="31" width="25" height="26" rx="4" fill="#e7eee3"/>' +
      '    <path d="M104 38h56m-56 9h33M71 73h88M71 82h57" stroke="#c5cfbf" stroke-width="3" stroke-linecap="round"/>' +
      '    <path d="M71 103h60m-60 11h74m-74 11h44" stroke="#dfe4da" stroke-width="3" stroke-linecap="round"/>' +
      '    <circle cx="155" cy="135" r="9" fill="#ebc6cd"/><path d="m151 135 3 3 5-6" stroke="#a67680" stroke-width="1.5" fill="none"/></g>' +
      '    <circle cx="17" cy="42" r="6" fill="#9fb29c"/><circle cx="232" cy="142" r="7" fill="#deb4bd"/>' +
      '    <path d="M207 24v14m-7-7h14" stroke="#b1bea8" stroke-width="1.5"/>' +
      '  </svg>' +
      '</section>' +
      '<section class="search-card" aria-labelledby="search-title">' +
      '  <div class="search-heading"><h3 id="search-title">想了解谁的作品？</h3><span>人物 · 制作公司</span></div>' +
      '  <form id="home-search-form" class="search-field">' + icon('search') +
      '    <input type="search" id="home-search" aria-label="搜索制作人员或公司" placeholder="输入制作人员或公司名称…" autocomplete="off">' +
      '    <button class="btn" id="home-search-btn" type="submit">搜索 ' + icon('arrow') + '</button>' +
      '  </form>' +
      '  <div class="search-examples"><span>试试这些</span>' +
      ['京都动画', '山田尚子', '石原立也'].map(function (name) {
        return '<button class="example-chip" type="button" data-search="' + name + '">' + name + '</button>';
      }).join('') + '</div>' +
      '</section>' +
      '<div id="home-result" aria-live="polite"></div>' +
      '<section id="home-guide">' +
      '  <div class="section-heading"><h3>换个角度，看作品</h3><span>三种探索方式</span></div>' +
      '  <div class="feature-grid">' +
      '    <button class="feature-card" id="explore-company" type="button"><div class="feature-top">' + icon('building') + '<span>01 / STUDIO</span></div>' +
      '      <h4>制作公司</h4><p>梳理公司的参与作品，<br>了解每位 staff 的职务与参与频率。</p><span class="feature-link">从公司开始 ' + icon('arrow') + '</span></button>' +
      '    <a class="feature-card" href="#/team"><div class="feature-top">' + icon('person') + '<span>02 / TEAM</span></div>' +
      '      <h4>制片人班底</h4><p>结合岗位与长期合作证据，<br>区分稳定搭档和高频外部合作。</p><span class="feature-link">分析制作班底 ' + icon('arrow') + '</span></a>' +
      '    <a class="feature-card" href="#/compare"><div class="feature-top">' + icon('compare') + '<span>03 / COMPARE</span></div>' +
      '      <h4>作品与公司对比</h4><p>并排比较多部作品或公司，<br>找到共同参与的制作人员。</p><span class="feature-link">开始对比 ' + icon('arrow') + '</span></a>' +
      '  </div>' +
      '  <div class="reading-note">' + icon('info') + '<p><strong>把重合当作线索。</strong>共同参与作品不等于固定班底；人员流动、职务和制作时期，都值得一起考虑。</p></div>' +
      '</section>';

    const input = container.querySelector('#home-search');
    const btn = container.querySelector('#home-search-btn');
    const result = container.querySelector('#home-result');
    let requestId = 0;
    container.querySelector('#home-search-form').addEventListener('submit', function (e) { e.preventDefault(); doSearch(); });
    container.querySelectorAll('[data-search]').forEach(function (button) {
      button.addEventListener('click', function () { input.value = button.dataset.search; doSearch(); });
    });
    container.querySelector('#explore-company').addEventListener('click', function () { input.placeholder = '搜索公司，如：京都动画、骨头社'; input.focus(); });

    async function doSearch() {
      const keyword = input.value.trim();
      if (!keyword) { input.focus(); Staff.ui.toast('请输入制作人员或公司名称'); return; }
      const current = ++requestId;
      btn.disabled = true;
      result.innerHTML = Staff.ui.loading('正在搜索「' + Staff.ui.escapeHtml(keyword) + '」…');
      try {
        const persons = await Staff.api.searchPersons(keyword, '');
        if (token !== generation || current !== requestId || !container.contains(result)) return;
        renderResults(persons, keyword);
      } catch (err) {
        if (token !== generation || current !== requestId || !container.contains(result) || err.cancelled) return;
        result.innerHTML = Staff.ui.empty('搜索失败：' + Staff.ui.escapeHtml(err.message));
      } finally {
        if (current === requestId) btn.disabled = false;
      }
    }

    function renderResults(persons, keyword) {
      if (!persons.length) {
        result.innerHTML = Staff.ui.empty('没有找到「' + Staff.ui.escapeHtml(keyword) + '」，试试其他名称或日文原名。');
        return;
      }
      result.innerHTML = '<div class="result-heading"><h3>搜索结果 <span class="muted small">/ ' + persons.length + '</span></h3><span class="muted small">选择一个名字，进入分析</span></div>' +
        persons.map(function (person) {
          const summary = (person.summary || '').replace(/\s+/g, ' ').trim();
          return '<a class="search-result" href="#/analysis?id=' + encodeURIComponent(person.id) + '">' +
            '<span class="person-monogram" aria-hidden="true">' + Staff.ui.escapeHtml(Array.from(person.name || '?')[0]) + '</span>' +
            '<div class="result-copy"><strong>' + Staff.ui.escapeHtml(person.name) + '</strong>' + Staff.ui.typeBadge(person.type) +
            '<div class="result-meta">' + Staff.ui.escapeHtml((person.career || []).join(' / ') || '职业未填写') + ' · ID ' + Staff.ui.escapeHtml(person.id) + '</div>' +
            (summary ? '<p>' + Staff.ui.escapeHtml(summary) + '</p>' : '') + '</div>' + icon('arrow') + '</a>';
        }).join('');
    }
  }
  Staff.views = Staff.views || {};
  Staff.views.home = {
    render: render,
    leave: function () { if (root && root.isConnected) scroll = scrollY; },
    afterRender: function () { requestAnimationFrame(function () { if (root && root.isConnected) scrollTo(0, scroll); }); },
    clearWorkspace: function () { root = null; scroll = 0; generation++; }
  };
})();
