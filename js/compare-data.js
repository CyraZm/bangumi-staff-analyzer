/* 作品对比的数据规则。职位名称参照 bangumi/common 的 subject_staffs.yml。
 * 按署名逐项分类，不能由人物的 career 推断他在某部作品中的实际工作。
 */
(function () {
  const roleGroups = [
    ['总导演', '导演', '联合导演', '副导演', '动画导演', '系列监督', '技术导演', '特技导演', '动作导演', '视觉导演', '创意总监'],
    ['系列构成', '副系列构成', '构成协力', '脚本', '脚本协力', '故事概念', '分镜', '分镜协力', '分镜抄写', 'OP・ED 分镜'],
    ['主演出', '演出', '演出助理', 'OP・ED 演出', 'Bank 分镜演出', 'Live 分镜演出', '剧中剧分镜演出', '构图', '构图监修'],
    ['总作画监督', '总作画监督助理', '作画监督', '作画监督助理', '构图作画监督', '机械作画监督', '动作作画监督', '道具作画监督', '特效作画监督', '角色作画监督', '作画监修', '主动画师', '原画', '第二原画', '补间动画', '动画检查', '转场绘'],
    ['人物设定', '副人物设定', '客座人物设定', '剧中剧人设', '人物原案', '机械设定', '机设原案', '道具设计', '概念设计', '服装设计', '标题设计', '设定', '设定协力', '背景设定', '2D 设计', '3D 设计', '怪物设计', '画面设计', '概念艺术', '视觉概念', '插画'],
    ['美术监督', '美术监督助理', '美术设计', '美术板', '美术', '印象板', '背景美术', '色彩设计', '色彩设计助理', '色彩指定', '色彩检查', '色彩脚本', '上色', '上色检查', '数码绘图'],
    ['摄影监督', '摄影监督助理', '摄影', 'CG 导演', 'CG 导演助理', '3DCG 导演', '3DCG 导演助理', '3DCG', '3D 动画师', '建模/模型', '视觉开发/外观开发', '特效', '视觉效果', '特摄效果', '剪辑', '剪辑助理', '在线剪辑', '离线剪辑'],
    ['音响监督', '配音监督', '音响', '音效', '录音', '录音助理', '整音', '音乐', '音乐监督', '音乐助理', '选曲', '主题歌作曲', '主题歌作词', '主题歌编曲', '主题歌演出', '插入歌作曲', '插入歌作词', '插入歌编曲', '插入歌演出'],
    // 制作现场的调度、发注和交付也是制作工作。注意「制作」与「製作」的区别。
    ['制作进行', '制作进行协力', '制作管理', '制作管理助理', '设定制作', '设定制作助理', '制作统括', '制作事务', '制作协力', 'CG 制作进行', '美术制作进行', '音响制作担当', '剧本协调']
  ];
  const creativeRoles = new Map();
  function normalize(role) { return String(role || '').replace(/\s+/g, '').toLowerCase(); }
  roleGroups.forEach(function (roles, index) {
    roles.forEach(function (role) { creativeRoles.set(normalize(role), index); });
  });
  // 「制作助理」在官方定义中是 Associate Producer / 製作補佐，不能凭“助理”二字归为制作进行。
  const businessCredits = /企[画划劃]|製作|^制作$|制片|制作人|制作助理|宣传|宣傳|出品|发行|發行/;

  function classify(entry) {
    const role = normalize(entry.relation);
    if (role === '动画制作' || role === '動畫製作') return 'studio';
    if (role === '动画制片人' || role === '動畫製片人') return 'producer';
    if (entry.type === 1 && creativeRoles.has(role)) return 'creative';
    if (businessCredits.test(role)) return 'management';
    if (entry.type === 2 || entry.type === 3) return 'organization';
    return 'other';
  }

  function sourceKey(role) { return normalize(role).replace(/企[画劃]/g, '企划'); }

  function sourceValues(value) {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(function (item) { return sourceValues(item); });
    if (value && typeof value === 'object') return sourceValues(value.v);
    return [];
  }

  function splitCredits(list, infobox) {
    const result = { creative: new Map(), studio: [], producer: [], extra: [], sourceCount: 0, sources: new Map() };
    (infobox || []).forEach(function (field) {
      const key = sourceKey(field.key);
      const text = sourceValues(field.value).join('、');
      if (!text) return;
      result.sources.set(key, (result.sources.has(key) ? result.sources.get(key) + '、' : '') + text);
    });
    const seen = new Set();
    (list || []).forEach(function (entry, order) {
      const identity = String(entry.id) + '|' + normalize(entry.relation);
      if (seen.has(identity)) return;
      seen.add(identity);
      result.sourceCount++;
      const category = classify(entry);
      const credit = Object.assign({}, entry, { order: order, category: category });
      if (category !== 'creative') {
        result[category === 'studio' || category === 'producer' ? category : 'extra'].push(credit);
        return;
      }
      let person = result.creative.get(entry.id);
      if (!person) {
        person = { id: entry.id, name: entry.name, type: entry.type, relations: new Set(), rank: Infinity, order: order };
        result.creative.set(entry.id, person);
      }
      person.relations.add(entry.relation);
      person.rank = Math.min(person.rank, creativeRoles.get(normalize(entry.relation)));
    });
    ['studio', 'producer', 'extra'].forEach(function (category) {
      const groups = new Map();
      result[category].forEach(function (entry) {
        const key = sourceKey(entry.relation);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(entry);
      });
      result[category] = Array.from(groups.entries()).flatMap(function (pair) {
        const text = result.sources.get(pair[0]) || '';
        const normalized = normalize(text).normalize('NFKC');
        const entries = pair[1];
        const positions = entries.map(function (entry) {
          const name = normalize(entry.name).normalize('NFKC');
          const index = name ? normalized.indexOf(name) : -1;
          // Repeated or indistinguishable names cannot establish an unambiguous sequence.
          return index >= 0 && normalized.indexOf(name, index + 1) < 0 ? index : -1;
        });
        const verified = positions.every(function (position, index) {
          if (position < 0) return false;
          const end = position + normalize(entries[index].name).normalize('NFKC').length;
          return positions.every(function (other, otherIndex) {
            if (index === otherIndex || other < 0) return true;
            const otherEnd = other + normalize(entries[otherIndex].name).normalize('NFKC').length;
            return end <= other || otherEnd <= position;
          });
        });
        entries.forEach(function (entry, index) {
          entry.orderSource = verified ? 'infobox' : 'api';
          entry.sourceText = text;
          entry.sourcePosition = positions[index];
        });
        if (verified) entries.sort(function (a, b) { return a.sourcePosition - b.sourcePosition; });
        return entries;
      });
    });
    return result;
  }

  function overlap(panels) {
    const byId = new Map();
    panels.forEach(function (panel) {
      panel.credits.creative.forEach(function (person, id) {
        if (!byId.has(id)) byId.set(id, { id: id, name: person.name, type: 1, rank: person.rank, presences: [] });
        const record = byId.get(id);
        record.rank = Math.min(record.rank, person.rank);
        record.presences.push({ key: panel.key, relations: person.relations });
      });
    });
    const records = Array.from(byId.values());
    records.forEach(function (record) { record.count = record.presences.length; });
    return records.sort(function (a, b) { return b.count - a.count || a.rank - b.rank; });
  }

  // 同一实体在同一作品有多项独立署名，也只算出现于一部作品。
  function separatePresence(panels) {
    const counts = new Map();
    panels.forEach(function (panel) {
      const ids = new Set(panel.credits.studio.concat(panel.credits.producer, panel.credits.extra).map(function (entry) { return entry.id; }));
      ids.forEach(function (id) { counts.set(id, (counts.get(id) || 0) + 1); });
    });
    return counts;
  }

  window.Staff = window.Staff || {};
  window.Staff.compareData = { splitCredits: splitCredits, overlap: overlap, separatePresence: separatePresence };
})();
