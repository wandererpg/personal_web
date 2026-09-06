(function exposeAdminApi(root, factory) {
  const api = factory(root.fetch?.bind(root));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AdminApi = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createAdminApi(fetchImpl) {
  let csrfToken = '';

  async function parseResponse(response) {
    const type = response.headers.get('content-type') || '';
    const body = type.includes('application/json') ? await response.json() : null;
    if (!response.ok) {
      const error = new Error(body?.error || `REQUEST_FAILED_${response.status}`);
      error.code = body?.error || 'REQUEST_FAILED';
      error.status = response.status;
      throw error;
    }
    return body;
  }

  async function session() {
    const body = await parseResponse(await fetchImpl('/api/admin/session', {
      credentials: 'same-origin', headers: { Accept: 'application/json' }
    }));
    csrfToken = body.csrfToken;
    return body;
  }

  async function request(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    if (!csrfToken) await session();
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('x-csrf-token', csrfToken);
    const body = await parseResponse(await fetchImpl(path, {
      ...options, method, headers, credentials: 'same-origin'
    }));
    if (body?.csrfToken) csrfToken = body.csrfToken;
    return body;
  }

  return { request, session };
}));
