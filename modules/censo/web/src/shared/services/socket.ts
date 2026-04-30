import { io, Socket } from 'socket.io-client';

const URL = import.meta.env.VITE_API_URL || '';

export const socket: Socket = io(URL, {
  autoConnect: true,
  reconnection: true,
});

socket.on('connect', () => {
  console.log('[Socket] Connected to Backend');
});

socket.on('disconnect', () => {
  console.log('[Socket] Disconnected from Backend');
});
