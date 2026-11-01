type ApiInit = RequestInit & { json?: unknown };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`api ${status}`);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  requireApiPath(path);

  const { json, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  let body = requestInit.body;

  if (json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(json);
  }

  const response = await fetch(`/api/v1${path}`, {
    ...requestInit,
    body,
    credentials: 'include',
    headers,
  });

  const responseBody = await readBody(response);
  if (!response.ok) {
    throw new ApiError(response.status, responseBody);
  }

  return responseBody as T;
}

export function sse(path: string): EventSource {
  requireApiPath(path);
  return new EventSource(`/api/v1${path}`);
}

function requireApiPath(path: string): void {
  if (!path.startsWith('/')) {
    throw new TypeError('API paths must start with /');
  }
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  const text = await response.text();
  if (text === '') return undefined;

  const contentType = response.headers.get('content-type') ?? '';
  return contentType.includes('application/json') ? JSON.parse(text) : text;
}
