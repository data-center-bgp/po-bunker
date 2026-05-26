// Always use same-origin requests. In dev, Vite's proxy forwards /api to the
// backend (see vite.config.ts). In prod, Nginx must reverse-proxy /api to
// https://order.barokahperkasagroup.com to avoid CORS.
export const API_URL = '';

export const getAuthHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`,
});

export const getHeaders = () => ({
  'Content-Type': 'application/json',
});