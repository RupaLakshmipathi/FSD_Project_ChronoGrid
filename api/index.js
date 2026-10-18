import app from '../server/index.js';

export default function handler(req, res) {
  const requestUrl = new URL(req.url || '/', 'http://vercel.local');
  const apiPath = requestUrl.searchParams.get('__cg_path');

  if (apiPath !== null) {
    requestUrl.searchParams.delete('__cg_path');
    const query = requestUrl.searchParams.toString();
    req.url = `/api/${apiPath}${query ? `?${query}` : ''}`;
  }

  return app(req, res);
}
