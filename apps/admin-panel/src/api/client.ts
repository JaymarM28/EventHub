import axios from 'axios';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:3010';

/**
 * Sin refresh automático (a diferencia de la app Flutter) — el panel es
 * una herramienta interna de sesión corta; si el access token expira
 * (15 min), se manda al organizador de vuelta a /login en vez de rotar
 * tokens en silencio. Menos código, y el organizador rara vez deja el
 * panel abierto sin usarlo por más de 15 minutos.
 */
export const apiClient = axios.create({ baseURL: GATEWAY_URL });

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);

export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err) && err.response?.data && typeof err.response.data === 'object') {
    const data = err.response.data as { message?: string };
    if (data.message) return data.message;
  }
  return 'No se pudo conectar con el servidor';
}
