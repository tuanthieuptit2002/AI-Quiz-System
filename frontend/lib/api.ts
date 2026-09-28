import type { AuthResult } from './types';

let token: string | null = null;
let refreshPromise: Promise<AuthResult> | null = null;
export const setAccessToken = (value: string | null) => {
  token = value;
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function send(path: string, options: RequestInit = {}) {
  return fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'QuizSpace',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}
async function read<T>(response: Response): Promise<T> {
  const result = await response
    .json()
    .catch(() => ({ message: 'Không thể kết nối máy chủ. Vui lòng thử lại.' }));
  if (!response.ok) throw new ApiError(response.status, result.message || 'Có lỗi xảy ra.');
  return result as T;
}
export function refreshSession(): Promise<AuthResult> {
  if (!refreshPromise)
    refreshPromise = send('/auth/refresh', { method: 'POST', signal: AbortSignal.timeout(12000) })
      .then(read<AuthResult>)
      .then((result) => {
        token = result.accessToken;
        return result;
      })
      .finally(() => {
        refreshPromise = null;
      });
  return refreshPromise;
}
async function authenticatedResponse(path: string, options: RequestInit = {}) {
  let response = await send(path, options);
  if (response.status === 401 && !path.startsWith('/auth/')) {
    try {
      await refreshSession();
      response = await send(path, options);
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        token = null;
        window.dispatchEvent(new Event('session-expired'));
        throw new ApiError(401, 'Phiên đăng nhập đã kết thúc.');
      }
      throw error;
    }
  }
  return response;
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  return read<T>(await authenticatedResponse(path, options));
}
export async function downloadFile(path: string, filename: string) {
  const response = await authenticatedResponse(path);
  if (!response.ok) await read(response);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const jsonBody = (body: unknown) => JSON.stringify(body);
