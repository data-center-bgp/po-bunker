export const API_URL = import.meta.env.DEV 
  ? '' // Empty string in development to avoid doubling /api
  : import.meta.env.VITE_API_URL || 'https://order.barokahperkasagroup.com';

export const getAuthHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`,
});

export const getHeaders = () => ({
  'Content-Type': 'application/json',
});