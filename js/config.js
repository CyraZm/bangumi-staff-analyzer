/* bangumi-staff-analyzer 配置 */
window.Staff = window.Staff || {};

Staff.config = {
  apiBase: 'https://api.bgm.tv',
  appName: 'bangumi-staff-analyzer',
  version: '1.5.1',
  searchLimit: 50,          // 搜索接口每页条数
  defaultConcurrency: 5,    // 默认并发请求数（1-20）
  defaultInterval: 200,     // 默认请求间隔 ms
  // 缓存有效期（毫秒）
  cacheTtl: {
    search: 24 * 3600 * 1000,        // 搜索结果
    person: 7 * 24 * 3600 * 1000,    // 人物/公司详情
    personSubjects: 7 * 24 * 3600 * 1000, // 人物参与作品列表
    subjectPersons: 24 * 3600 * 1000,     // 作品 staff 列表
    subject: 24 * 3600 * 1000             // 条目详情
  }
};
