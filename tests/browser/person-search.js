/* Run in an independent app tab with playwright-cli run-code --filename tests/browser/person-search.js. */
async (page) => {
  const errors = [], requests = [];
  let releaseFirst, first = true;
  const firstResponse = new Promise(resolve => releaseFirst = resolve);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('/?v=person-search-regression#/team', page.url()).href);
  await page.route('https://api.bgm.tv/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/v0/search/persons') {
      const keyword = route.request().postDataJSON().keyword;
      requests.push({ keyword, offset: url.searchParams.get('offset') });
      if (url.searchParams.get('offset') !== '0') throw new Error('Name suggestions paginated into fuzzy matches');
      if (first) { first = false; await firstResponse; }
      if (keyword === '搜索失败案例') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ description: '请稍后重试' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(keyword === '不存在的名字' ? { total: 0, data: [] } : { total: 705, data: [{ id: 209, name: '松岡裕紀', type: 1, career: [] }, { id: 37507, name: '松永康佑', type: 1, career: ['producer'] }] }) });
    }
    if (url.pathname.endsWith('/subjects')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 37507, name: '松永康佑', type: 1, career: ['producer'] }) });
  });
  await page.locator('#team-search-input').fill('松永康佑');
  try { await page.locator('#team-combo [role="status"]').filter({ hasText: '正在搜索' }).waitFor(); } finally { releaseFirst(); }
  const suggestion = page.locator('#team-combo [role="option"]').first();
  await suggestion.waitFor();
  if (!await suggestion.innerText().then(s => s.includes('松永康佑'))) throw new Error('Exact name is not first');
  await page.locator('#team-search-input').press('ArrowDown');
  await page.locator('#team-search-input').press('Enter');
  await page.locator('#team-profile h3').filter({ hasText: '松永康佑' }).waitFor();
  const nav = async name => { await page.getByRole('link', { name, exact: true }).click(); await page.waitForFunction(label => document.querySelector('#route-label').textContent === label, name.replace(/ \d{2}$/, '')); };
  await nav('探索与分析 01');
  await page.locator('#home-search').fill('松永康佑');await page.locator('#home-search-btn').click();
  await page.locator('.search-result').first().waitFor();
  if (!await page.locator('.search-result').first().getAttribute('href').then(h => h.endsWith('37507'))) throw new Error('Home search lost exact name');
  await nav('作品 / 公司对比 02');await page.locator('#mode-company').click();
  await page.locator('[data-panel] input').first().fill('松永康佑');
  await page.locator('[data-panel]').first().getByRole('option').first().waitFor();
  if (!await page.locator('[data-panel]').first().getByRole('option').first().innerText().then(s => s.includes('松永康佑'))) throw new Error('Compare suggestion lost name');
  if (requests.filter(r => r.keyword === '松永康佑').length !== 1) throw new Error('Same-session name cache was not reused');
  await nav('制片人班底 03');
  await page.locator('#team-search-input').fill('搜索失败案例');
  await page.locator('#team-combo [role="alert"]').waitFor();
  if (!await page.locator('#team-combo').innerText().then(s => s.includes('搜索失败'))) throw new Error('Network error presented as no results');
  await page.locator('#team-search-input').fill('不存在的名字');
  await page.locator('#team-combo .combo-drop').filter({ hasText: '无结果' }).waitFor();
  await page.locator('#team-search-input').fill('松永康佑');
  await page.locator('#team-combo [role="option"]').first().waitFor();
  await page.locator('#team-search-input').press('Tab');
  if (await page.locator('#team-combo .combo-drop').isVisible()) throw new Error('Suggestions remained after blur');
  if (errors.length) throw new Error(errors.join('; '));
  return { exactNameFirst: true, keyboardSelection: true, homeAndCompare: true, firstPageOnly: true, loadingAndErrorStates: true, emptyResults: true, sameSessionCache: true, blurHidesSuggestions: true, requests, pageErrors: errors };
}
