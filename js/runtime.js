/* 本地应用生命周期。网页数据仍保留在原来的 localhost:8000。 */
(function () {
  const button = document.getElementById('btn-shutdown');
  const status = document.getElementById('runtime-status');
  const isLocal = location.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(location.hostname);
  let session = null;
  let stopped = false;
  let closing = false;
  let timer = null;
  let failures = 0;
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('staff-analyzer-lifecycle') : null;

  async function request(path, options) {
    const controller = new AbortController();
    const timeout = setTimeout(function () { controller.abort(); }, 2500);
    try {
      const response = await fetch('/__app/' + path, Object.assign({ cache: 'no-store', signal: controller.signal }, options));
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } finally { clearTimeout(timeout); }
  }

  function showStopped(confirmed) {
    if (stopped) return;
    if (Staff.views.compare) Staff.views.compare.flushSave();
    stopped = true;
    clearTimeout(timer);
    Staff.api.stopAll();
    if (channel) channel.close();
    button.disabled = true;
    status.textContent = confirmed ? '应用已关闭' : '服务连接已断开';
    status.classList.add('offline');
    document.getElementById('app').inert = true;
    document.getElementById('modal-root').replaceChildren();
    const screen = document.createElement('div');
    screen.className = 'closed-screen';
    // Reuse the loaded logo; the server has already stopped at this point.
    const content = document.createElement('div');
    content.className = 'closed-content';
    content.appendChild(document.querySelector('.brand .logo'));
    const heading = document.createElement('h1');
    heading.textContent = confirmed ? '已结束本次探索。' : '与本地服务的连接已断开。';
    const message = document.createElement('p');
    message.textContent = confirmed
      ? '后台服务与数据请求已停止，你的收集和备注仍保留在本机。可以关闭这个标签页，下次双击 Staff Analyzer 即可继续。'
      : '当前页面的数据请求已暂停。请重新打开 Staff Analyzer，再刷新此页面继续使用。';
    const reload = document.createElement('button');
    reload.className = 'btn secondary';
    reload.textContent = '重新打开应用后，刷新页面';
    reload.addEventListener('click', function () { location.reload(); });
    content.append(heading, message, reload);
    screen.appendChild(content);
    document.body.appendChild(screen);
    heading.tabIndex = -1;
    heading.focus();
  }

  async function poll() {
    if (stopped || closing) return;
    try {
      const health = await request('status');
      if (health.app !== Staff.config.appName || !health.token) throw new Error('非托管服务');
      if (session && session.instance !== health.instance) { showStopped(false); return; }
      session = health;
      failures = 0;
      status.textContent = '本地应用已连接';
      button.disabled = false;
    } catch (err) {
      if (session && ++failures >= 2) { showStopped(false); return; }
      if (!session) {
        status.textContent = '浏览器模式';
        button.disabled = false;
        button.title = '停止当前页面任务；完整关闭请通过 Staff Analyzer.app 启动';
        return;
      }
    }
    if (!stopped) timer = setTimeout(poll, 2500);
  }

  async function shutdown() {
    if (stopped || closing) return;
    if (!session) {
      Staff.ui.modal({
        title: '当前以浏览器模式打开',
        content: '<p>此页面没有连接应用启动器，无法关闭手动启动的服务。以后请双击 <strong>Staff Analyzer.app</strong>，即可直接启动并在这里完整关闭。</p><p>现在可以停止本页面的数据请求，再关闭标签页。</p>',
        okText: '停止页面任务',
        onOk: async function () { await Staff.views.compare.flushSave(); showStopped(false); }
      });
      return;
    }
    closing = true;
    button.disabled = true;
    status.textContent = '正在关闭…';
    try {
      await Staff.views.compare.flushSave();
      const result = await request('shutdown', {
        method: 'POST',
        headers: { 'X-Staff-Token': session.token, 'Content-Type': 'application/json' },
        body: '{}'
      });
      if (!result.stopping) throw new Error('未收到关闭确认');
      // Wait for the listening socket to disappear before claiming it has stopped.
      let exited = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise(function (resolve) { setTimeout(resolve, 150); });
        try { await request('status'); } catch (err) { exited = true; break; }
      }
      if (!exited) throw new Error('服务还在结束任务，请稍后重试');
      if (channel) channel.postMessage({ type: 'shutdown', instance: session.instance });
      showStopped(true);
    } catch (err) {
      Staff.ui.toast('关闭尚未确认：' + err.message, 'error');
      status.textContent = '关闭未确认，请重试';
      button.disabled = false;
    } finally {
      closing = false;
      if (!stopped) { clearTimeout(timer); timer = setTimeout(poll, 2500); }
    }
  }

  if (channel) channel.onmessage = function (event) {
    if (session && event.data.type === 'shutdown' && event.data.instance === session.instance) showStopped(true);
  };
  button.addEventListener('click', shutdown);
  if (isLocal) poll();
  else { status.textContent = '浏览器模式'; button.disabled = false; }
  Staff.runtime = { isStopped: function () { return stopped; } };
})();
