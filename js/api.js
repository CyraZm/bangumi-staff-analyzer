/* bangumi-staff-analyzer API 层
 * - 限流队列：并发数 + 请求间隔可调
 * - 缓存：所有响应写入 IndexedDB，命中且未过期则直接返回
 * - 重试：429 / 5xx / 网络错误自动退避重试
 * - runBatch：批量请求，带进度回调与取消信号
 */
(function () {
  const C = window.Staff.config;
  const DAY = 24 * 3600 * 1000;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  /* ---------------- 限流器 ---------------- */
  class Limiter {
    constructor(concurrency, interval) {
      this.setRate(concurrency, interval);
      this.queue = [];
      this.active = 0;
      this.last = 0;
      this.signal = null;
    }
    setRate(concurrency, interval) {
      this.concurrency = clamp(Math.round(concurrency) || 5, 1, 20);
      this.interval = Math.max(0, Math.round(interval) || 0);
    }
    push(path, options) {
      options = options || {};
      return new Promise(function (resolve, reject) {
        this.queue.push({ path: path, options: options, resolve: resolve, reject: reject });
        this.pump();
      }.bind(this));
    }
    async pump() {
      while (this.active < this.concurrency && this.queue.length) {
        if (this.signal && this.signal.cancelled) {
          const item = this.queue.shift();
          item.reject({ cancelled: true });
          continue;
        }
        const item = this.queue.shift();
        this.active++;
        const wait = Math.max(0, this.last + this.interval - Date.now());
        if (wait) await sleep(wait);
        this.last = Date.now();
        doFetch(item).then(item.resolve, item.reject)
          .finally(function () { this.active--; this.pump(); }.bind(this));
      }
    }
  }

  /* ---------------- 单次请求（带重试） ---------------- */
  async function doFetch(item) {
    const url = C.apiBase + item.path;
    const init = {
      method: item.options.method || 'GET',
      headers: { 'Accept': 'application/json' }
    };
    if (item.options.body) {
      init.headers['Content-Type'] = 'application/json';
      init.body = item.options.body;
    }
    let res;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        res = await fetch(url, init);
      } catch (err) {
        if (attempt < 4) { await sleep(600 * attempt); continue; }
        throw new Error('网络错误，请检查网络连接后重试');
      }
      if (res.status === 200 || res.status === 201) {
        try { return await res.json(); } catch (e) { return null; }
      }
      if (res.status === 204) return null;
      if (res.status === 429) { await sleep(2000 * attempt); continue; }
      if (res.status >= 500) { await sleep(1200 * attempt); continue; }
      const data = await res.json().catch(function () { return null; });
      const msg = (data && (data.description || data.message)) || ('请求失败（HTTP ' + res.status + '）');
      throw new Error(msg);
    }
    throw new Error('请求多次失败，请降低并发数 / 加大请求间隔后重试');
  }

  /* ---------------- 缓存 ---------------- */
  async function readCache(key) {
    try { return await Staff.db.get(Staff.db.STORES.cache, key); } catch (e) { return null; }
  }
  async function writeCache(key, data) {
    try {
      await Staff.db.put(Staff.db.STORES.cache, { key: key, data: data, ts: Date.now() });
    } catch (e) { /* 缓存失败不影响主流程 */ }
  }
  async function cachedRequest(key, path, options, ttl, force) {
    if (!force) {
      const hit = await readCache(key);
      if (hit && hit.data !== undefined && hit.ts + ttl > Date.now()) return hit.data;
    }
    const data = await defaultLimiter.push(path, options || {});
    if (data !== undefined && data !== null) await writeCache(key, data);
    return data;
  }

  /* ---------------- 分页循环 ---------------- */
  async function searchLoop(apiPath, buildBody, key, ttl, force) {
    if (!force) {
      const hit = await readCache(key);
      if (hit && hit.data !== undefined && hit.ts + ttl > Date.now()) return hit.data;
    }
    const results = [];
    let offset = 0;
    for (let page = 0; page < 100; page++) {
      const body = buildBody();
      const data = await defaultLimiter.push(apiPath + '?limit=' + C.searchLimit + '&offset=' + offset, {
        method: 'POST', body: JSON.stringify(body)
      });
      const list = (data && data.data) || [];
      results.push.apply(results, list);
      if (!data || !list.length || results.length >= data.total) break;
      offset += list.length;
    }
    await writeCache(key, results);
    return results;
  }

  /* ---------------- 对外接口 ---------------- */
  const defaultLimiter = new Limiter(C.defaultConcurrency, C.defaultInterval);

  function setRate(concurrency, interval) {
    defaultLimiter.setRate(concurrency, interval);
  }

  // 搜索人物/公司，career 可选（producer/artist/actor/...）
  function searchPersons(keyword, career, force) {
    const key = 'search-persons|' + keyword + '|' + (career || '');
    return searchLoop('/v0/search/persons', function () {
      const body = { keyword: keyword };
      if (career) body.filter = { career: [career] };
      return body;
    }, key, C.cacheTtl.search, force);
  }

  // 搜索条目，types 如 [2]（动画）
  function searchSubjects(keyword, types, force) {
    const key = 'search-subjects|' + keyword + '|' + (types ? types.join(',') : '');
    return searchLoop('/v0/search/subjects', function () {
      const body = { keyword: keyword };
      if (types && types.length) body.filter = { type: types };
      return body;
    }, key, C.cacheTtl.search, force);
  }

  function getPerson(id, force) {
    return cachedRequest('person|' + id, '/v0/persons/' + id, null, C.cacheTtl.person, force);
  }

  function getPersonSubjects(id, force) {
    return cachedRequest('person-subjects|' + id, '/v0/persons/' + id + '/subjects', null, C.cacheTtl.personSubjects, force);
  }

  function getSubjectPersons(id, force) {
    return cachedRequest('subject-persons|' + id, '/v0/subjects/' + id + '/persons', null, C.cacheTtl.subjectPersons, force);
  }

  function getSubject(id, force) {
    return cachedRequest('subject|' + id, '/v0/subjects/' + id, null, C.cacheTtl.subject, force);
  }

  /* 批量请求：items = [{path, options, key?, ttl?, force?}]
   * - 带 key/ttl 时自动读写缓存（force 强制刷新）
   * - 带进度回调与取消信号
   */
  function runBatch(items, options) {
    options = options || {};
    const limiter = new Limiter(options.concurrency || C.defaultConcurrency, options.interval !== undefined ? options.interval : C.defaultInterval);
    limiter.signal = options.signal || null;
    const total = items.length;
    const results = new Array(total);
    let done = 0;
    return new Promise(function (resolve) {
      if (!total) {
        if (options.onProgress) options.onProgress(0, 0);
        resolve(results);
        return;
      }
      const proms = items.map(function (item, i) {
        return Promise.resolve().then(async function () {
          if (item.key && !item.force) {
            const hit = await readCache(item.key);
            if (hit && hit.data !== undefined && hit.ts + (item.ttl || DAY) > Date.now()) {
              return { cached: true, data: hit.data };
            }
          }
          const data = await limiter.push(item.path, item.options || {});
          if (item.key && data !== undefined && data !== null) await writeCache(item.key, data);
          return { cached: false, data: data };
        }).then(function (res) {
          results[i] = { ok: true, cached: res.cached, data: res.data };
        }, function (err) {
          results[i] = { ok: false, error: (err && err.cancelled) ? 'cancelled' : err };
        }).then(function () {
          done++;
          if (options.onProgress) options.onProgress(done, total);
        });
      });
      Promise.all(proms).then(function () { resolve(results); });
    });
  }

  // 从输入中提取条目 ID：支持纯数字、bgm.tv / bangumi.tv / chii.in 的 subject 链接
  function parseSubjectId(input) {
    const m = String(input).match(/(\d{1,10})/);
    return m ? m[1] : null;
  }

  /* 按 personId 聚合 staff（分析与公司对比共用）
   * results: runBatch 返回的 [{ok, data}]，与 works 一一对应
   * entry: {id,name,type,career,count,relWork,relations,works}
   *  - count：出现在多少部作品（去重）
   *  - relWork：{职务 -> 担任该职务的作品数}
   */
  function aggregateStaff(results, works, excludeId) {
    const map = new Map();
    results.forEach(function (r, i) {
      if (!r || !r.ok) return;
      const work = works[i];
      const staffList = r.data || [];
      const perWork = new Map(); // personId -> Set(relations)（同一作品内按人合并职务）
      staffList.forEach(function (s) {
        if (excludeId && String(s.id) === String(excludeId)) return;
        if (!perWork.has(s.id)) perWork.set(s.id, new Set());
        if (s.relation) perWork.get(s.id).add(s.relation);
      });
      perWork.forEach(function (relations, pid) {
        const s = staffList.find(function (x) { return x.id === pid; });
        let entry = map.get(pid);
        if (!entry) {
          entry = {
            id: pid, name: s.name, type: s.type, career: s.career || [],
            count: 0, relWork: {}, relations: new Set(), works: []
          };
          map.set(pid, entry);
        }
        entry.count++;
        relations.forEach(function (rel) {
          entry.relations.add(rel);
          entry.relWork[rel] = (entry.relWork[rel] || 0) + 1;
        });
        entry.works.push({
          subjectId: work.id,
          subjectName: work.name_cn || work.name || ('ID ' + work.id),
          relation: Array.from(relations).join('、')
        });
      });
    });
    return Array.from(map.values());
  }

  Staff.api = {
    setRate: setRate,
    searchPersons: searchPersons,
    searchSubjects: searchSubjects,
    getPerson: getPerson,
    getPersonSubjects: getPersonSubjects,
    getSubjectPersons: getSubjectPersons,
    getSubject: getSubject,
    runBatch: runBatch,
    parseSubjectId: parseSubjectId,
    aggregateStaff: aggregateStaff,
    defaultLimiter: defaultLimiter
  };
})();
