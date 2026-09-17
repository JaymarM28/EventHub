import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../auth/AuthContext';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:3010';

/**
 * Se une a la sala del evento en api-gateway (DashboardGateway) y llama a
 * `onUpdate` cada vez que llega un cambio — el consumidor decide qué
 * hacer (típicamente: volver a pedir el dashboard por REST). Guarda
 * `onUpdate` en un ref para no tener que exigirle al llamador que lo
 * memorice con useCallback — sin esto, pasar una arrow function inline
 * reconectaría el socket en cada render.
 */
export function useDashboardSocket(eventId: string, onUpdate: () => void) {
  const { token } = useAuth();
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!token) return;

    const socket = io(`${GATEWAY_URL}/dashboard`, {
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('join', { eventId });
    });

    socket.on('update', () => onUpdateRef.current());

    return () => {
      socket.disconnect();
    };
  }, [eventId, token]);
}
