/* bangumi-staff-analyzer 首页：搜索人物 / 公司 */
(function () {
  const CAREERS = [
    { code: '', label: '全部' },
    { code: 'producer', label: '制作人' },
    { code: 'artist', label: '画师/动画师' },
    { code: 'actor', label: '声优' },
    { code: 'mangaka', label: '漫画家' },
    { code: 'writer', label: '作家/脚本' },
    { code: 'illustrator', label: '绘师' }
  ];

  function render(container) {
    container.innerHTML =
      '<h2 class="page-title">搜索制作人员 / 制作公司</h2>' +
      '<p class="page-desc">搜索 Bangumi 上的人物或公司。公司（如「京都动画」）可统计其作品中的 staff 频率；个人（如某位制片人）可统计与 TA 共事过的人。</p>' +
      '<div class="card">' +
      '  <div class="row">' +
      '    <input type="text" id="home-search" placeholder="输入名称，如：京都动画、山田尚子、石原立也" style="flex:1;min-width:240px">' +
      '    <button class="btn" id="home-search-btn">搜索</button>' +
      '  </div>' +
      '  <div class="row" style="margin-top:12px" id="home-careers"></div>' +
      '</div>' +
      '<div id="home-result"></div>';

    const careerRow = container.querySelector('#home-careers');
    CAREERS.forEach(function (c, i) {
      const chip = document.createElement('span');
      chip.className = 'chip' + (i === 0 ? ' active' : '');
      chip.textContent = c.label;
      chip.dataset.career = c.code;
      chip.addEventListener('click', function () {
        careerRow.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('active'); });
        chip.classList.add('active');
      });
      careerRow.appendChild(chip);
    });

    let lastKw = '';
    const input = container.querySelector('#home-search');
    const btn = container.querySelector('#home-search-btn');
    const result = container.querySelector('#home-result');

    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });
    btn.addEventListener('click', doSearch);

    async function doSearch() {
      const kw = input.value.trim();
      if (!kw) { Staff.ui.toast('请输入搜索关键词'); return; }
      const career = careerRow.querySelector('.chip.active').dataset.career;
      result.innerHTML = Staff.ui.loading('正在搜索「' + kw + '」…');
      try {
        const persons = await Staff.api.searchPersons(kw, career);
        lastKw = kw;
        renderResults(persons);
      } catch (err) {
        result.innerHTML = Staff.ui.empty('搜索失败：' + err.message);
      }
    }

    function renderResults(persons) {
      if (!persons.length) {
        result.innerHTML = Staff.ui.empty('没有找到「' + lastKw + '」，试试其他关键词或放宽职业筛选');
        return;
      }
      const rows = persons.map(function (p) {
        const career = (p.career || []).join(' / ') || '未填写';
        const summary = (p.summary || '').replace(/\s+/g, ' ').trim();
        return '<div class="card" style="cursor:pointer;margin-bottom:10px" data-id="' + p.id + '" data-type="' + p.type + '">' +
          '  <div class="row" style="justify-content:space-between">' +
          '    <div><strong>' + Staff.ui.escapeHtml(p.name) + '</strong> ' + Staff.ui.typeBadge(p.type) +
          '      <span class="muted small" style="margin-left:8px">' + Staff.ui.escapeHtml(career) + '</span></div>' +
          '    <div class="muted small">ID ' + p.id + ' · 收藏 ' + (p.stat ? p.stat.collects : '-') + '</div>' +
          '  </div>' +
          (summary ? '<div class="small muted" style="margin-top:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + Staff.ui.escapeHtml(summary) + '</div>' : '') +
          '</div>';
      }).join('');
      result.innerHTML = '<div class="muted small" style="margin-bottom:10px">找到 ' + persons.length + ' 个结果，点击进入分析</div>' + rows;

      result.querySelectorAll('.card[data-id]').forEach(function (card) {
        card.addEventListener('click', function () {
          location.hash = '#/analysis?id=' + card.dataset.id;
        });
      });
    }
  }

  Staff.views = Staff.views || {};
  Staff.views.home = { render: render };
})();
