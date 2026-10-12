export function createAdminApi(fetchImpl = globalThis.fetch?.bind(globalThis)) {
  let csrfToken = '';

  const isMutation = method => !['GET', 'HEAD', 'OPTIONS'].includes(method);

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

  async function send(path, options, method) {
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (isMutation(method)) headers.set('x-csrf-token', csrfToken);
    return parseResponse(await fetchImpl(path, {
      ...options, method, headers, credentials: 'same-origin'
    }));
  }

  function remember(body) {
    if (body?.csrfToken) csrfToken = body.csrfToken;
    return body;
  }

  async function request(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    if (!csrfToken) await session();
    try {
      return remember(await send(path, options, method));
    } catch (error) {
      if (!isMutation(method) || error.code !== 'CSRF_TOKEN_INVALID') throw error;
      await session();
      return remember(await send(path, options, method));
    }
  }

  return { request, session };
}

export const adminApi = createAdminApi();
