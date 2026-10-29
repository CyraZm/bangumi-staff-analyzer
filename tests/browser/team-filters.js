/* Run through playwright-cli run-code --filename tests/browser/team-filters.js.
 * Uses a small, in-memory report to exercise the real page without external API requests.
 */
async (page) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('/?v=filter-regression#/team', page.url()).href);
  const expected = await page.evaluate(() => {
    const tiers = ['core', 'stable', 'external', 'series', 'history', 'observe'];
    const candidates = Array.from({ length: 87 }, (_, i) => ({
      id: 1000 + i, name: '回归人员 ' + i, type: 1, roles: [i % 2 ? '原画' : '导演'], count: i % 5 === 0 ? 1 : 3,
      groupCount: 2, coverage: .5, weightedCoverage: .6, rankingSupport: .61, recent: 2, recentTotal: 3,
      earlier: 1, earlierTotal: 2, trend: 'steady', tier: tiers[i % tiers.length], reasons: ['测试显示'], mainRole: null,
      activity: { checked: true, share: .5, total: 6, outside: [] }, evidence: [], auxiliaryBonus: i % 3 === 0 ? 1 : 0,
      auxiliary: i % 3 === 0 ? [{ id: 300, name: '片头共事', date: '2025-01-01', roles: ['分镜'], producerRoles: ['制作进行'], producerScopes: [{ role: '制作进行', eps: 'OP' }] }] : []
    }));
    const producer = { id: 30844, name: '回归制片人', type: 1 };
    const report = {
      producer, candidates, projects: [], groupCount: 2, recentIds: [], excluded: [], generatedAt: '2026-10-29T00:00:00Z',
      quality: { staffComplete: true, relationsComplete: true, orderComplete: true },
      checks: { profilesSucceeded: 87, eligiblePeople: 87, roleWorksSucceeded: 0, roleWorksRequested: 0, auxiliaryWorks: 1, auxiliaryFailed: 0 }
    };
    Staff.api.getPerson = async () => producer;
    Staff.api.getPersonSubjects = async () => [{ id: 200, type: 2, name: '主作品', staff: '动画制片人' }];
    Staff.teamLoader.run = async () => report;
    return ['all', 'repeat', ...tiers].map(key => ({ key, total: candidates.filter(c => key === 'all' || (key === 'repeat' ? c.count >= 2 : c.tier === key)).length }));
  });
  await page.locator('[data-producer="30844"]').click();
  await page.locator('#team-start').click();
  await page.locator('#team-start:not([disabled])').waitFor();
  if (await page.locator('tr[data-team-person]').count() !== 40) throw new Error('Initial report did not render');
  for (const tier of expected) {
    await page.locator('[data-tier="' + tier.key + '"]').click();
    const count = await page.locator('tr[data-team-person]').count();
    if (count !== Math.min(40, tier.total)) throw new Error(tier.key + ': expected rows ' + Math.min(40, tier.total) + ', got ' + count);
    if (!await page.locator('#team-pagination').innerText().then(text => text.startsWith(tier.total + ' 项署名'))) throw new Error('Incorrect total for ' + tier.key);
    for (const sort of ['coverage', 'groups', 'count', 'role']) {
      await page.locator('#team-sort').selectOption(sort);
      if (await page.locator('tr[data-team-person]').count() !== count) throw new Error('Sort erased ' + tier.key + '/' + sort);
    }
  }
  await page.locator('[data-tier="all"]').click();
  await page.locator('#team-filter').fill('回归人员 0');
  await page.locator('tr[data-team-person="1000"] [data-evidence]').click();
  const auxiliary = page.locator('#team-evidence-1000 details').filter({ hasText: '其他制作岗位共事' });
  await auxiliary.locator('summary').click();
  if (!await auxiliary.innerText().then(text => text.includes('回归制片人：制作进行（OP）') && text.includes('回归人员 0：分镜'))) throw new Error('Auxiliary names or scope missing');
  await page.locator('#team-filter').fill('完全不匹配');
  if (!await page.locator('#team-table').innerText().then(text => text.includes('当前筛选下没有合作署名'))) throw new Error('Missing empty-result explanation');
  await page.locator('#team-filter').fill('导演');
  if (await page.locator('tr[data-team-person]').count() !== 40) throw new Error('Role search lost rows');
  await page.locator('#team-filter').fill('');
  for (const [button, count] of [['#team-next', 40], ['#team-next', 7], ['#team-prev', 40]]) {
    await page.locator(button).click();
    if (await page.locator('tr[data-team-person]').count() !== count) throw new Error('Pagination lost rows');
  }
  await page.getByRole('link', { name: '探索与分析 01', exact: true }).click();
  await page.locator('#home-search').waitFor();
  await page.getByRole('link', { name: '制片人班底 03', exact: true }).click();
  await page.locator('#team-pagination').waitFor();
  if (!await page.locator('#team-pagination').innerText().then(text => text.includes('第 2 / 3 页'))) throw new Error('Route switch lost current page');
  if (errors.length) throw new Error(errors.join('; '));
  if (await page.locator('#toast-root').innerText().then(text => text.includes('分析未完成'))) throw new Error('Renderer error was swallowed as an analysis failure');
  return { categories: expected.length, sortChecks: expected.length * 4, pagination: true, auxiliaryNamesAndScope: true, searchAndEmptyState: true, routeRetained: true, pageErrors: errors };
}
