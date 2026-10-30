const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim();

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const cleanPath = path.startsWith('/') ? path : '/' + path;
  return API_BASE ? `${API_BASE.replace(/\/+$/, '')}${cleanPath}` : cleanPath;
}

// Global API fetch wrapper: sends server-issued session credentials only; mobile numbers are not authentication.
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  // If fetching a local data URL or blob URL, do not add custom headers or prefix API_BASE
  if (input.startsWith('data:') || input.startsWith('blob:')) {
    return fetch(input, init);
  }

  // 1. Retrieve token, mobile, and a persistent browser-installation token.
  // This is an app-generated identifier, not a hardware serial number.
  let deviceFingerprint = '';
  try {
    deviceFingerprint = localStorage.getItem('cotrix_device_fingerprint') || '';
    if (!deviceFingerprint) {
      deviceFingerprint = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('cotrix_device_fingerprint', deviceFingerprint);
    }
  } catch {
    deviceFingerprint = '';
  }

  const cashierContext = (() => {
    try { return location.pathname.startsWith('/cashier') || (localStorage.getItem('cotrix_cashier_session_mode') || sessionStorage.getItem('cotrix_cashier_session_mode')) === 'CASHIER_RESTRICTED'; } catch { return location.pathname.startsWith('/cashier'); }
  })();

  let token = '';
  try {
    token = cashierContext ? '' : (localStorage.getItem('token') || localStorage.getItem('auth_token') || localStorage.getItem('jwt') || '');
    if (!token) {
      if (!cashierContext) {
        const cotrixUser = JSON.parse(localStorage.getItem('cotrix_user') || '{}');
        token = cotrixUser?.token || cotrixUser?.accessToken || '';
      }
    }
  } catch {
    // Private browsing/storage restrictions must not crash API calls; the HttpOnly cookie may still authenticate.
    token = '';
  }

  // 2. Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };
  // Legacy components may still pass this header. Strip it centrally so it can neither
  // trigger cross-origin preflights nor be mistaken for authentication by future routes.
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === 'x-user-mobile') delete headers[key];
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  // Do not send x-user-mobile: the server must derive tenant identity from a verified session.
  if (deviceFingerprint) {
    headers['x-device-fingerprint'] = deviceFingerprint;
  }

  // Never attach a cashier device credential to a normal/admin request, even if a stale
  // cashier token remains in browser storage. Server-side revocation remains authoritative.
  if (cashierContext) {
    try {
      const cashierToken = localStorage.getItem('cotrix_cashier_device_token') || sessionStorage.getItem('cotrix_cashier_device_token');
      if (cashierToken) headers['x-cashier-device'] = cashierToken;
    } catch {
      // Cashier device access is optional when session storage is unavailable.
    }
  }

  const finalUrl = apiUrl(input);
  
  return fetch(finalUrl, {
    ...init,
    // Cashier requests must not carry the main tab's HttpOnly admin/customer cookies.
    credentials: cashierContext ? 'omit' : (init?.credentials || 'include'),
    headers,
  });
}
