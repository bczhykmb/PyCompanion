import { handleApi } from './api.mjs';
import { openRemoteDatabase } from './remote-db.mjs';

const unavailable = (error, configurationRequired = false) => Response.json({ error, configurationRequired }, {
  status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});

export function createVercelHandler({ env = process.env, openDatabase = openRemoteDatabase } = {}) {
  let database;
  return async request => {
    const url = new URL(request.url);
    if (url.pathname === '/api/classroom') {
      const route = url.searchParams.get('route') || '';
      if (!/^[a-z/]*$/.test(route)) return Response.json({ error: '无效路径。' }, { status: 404 });
      url.pathname = '/api/classroom/' + route; url.searchParams.delete('route');
      request = new Request(url, request);
    }
    if (request.method === 'POST' && request.headers.get('origin') !== url.origin) return Response.json({ error: '请求来源不匹配。' }, { status: 403 });
    if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN || !env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 16) {
      return unavailable('网站页面已就绪，但线上服务尚未完成配置。请教师在 Vercel 设置 TURSO_DATABASE_URL、TURSO_AUTH_TOKEN 和至少16位的 ADMIN_PASSWORD，然后重新部署。', true);
    }
    try {
      database ??= openDatabase(env).catch(error => { database = undefined; throw error; });
      const DB = await database;
      return await handleApi(request, { ...env, DB });
    } catch (error) {
      console.error('vercel_database_unavailable', error.name);
      return unavailable('云端数据库暂时无法连接或初始化。请教师核对数据库地址、访问令牌及 Vercel 运行日志。本次不会改用临时数据库。');
    }
  };
}
