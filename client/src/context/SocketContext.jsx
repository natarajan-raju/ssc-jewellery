import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { orderService } from '../services/orderService';

const SocketContext = createContext(null);

// Detect URL environment
const SOCKET_URL = import.meta.env.PROD ? '/' : 'http://localhost:5000';

// [FIX] Create the socket instance ONCE outside the component lifecycle.
// This prevents it from being destroyed/recreated during React Strict Mode checks.
const globalSocket = io(SOCKET_URL, {
    transports: ['websocket'],
    reconnectionAttempts: 5,
    autoConnect: false // We will connect manually when the app mounts
});

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(globalSocket);
    const { user } = useAuth();

    useEffect(() => {
        // Connect when the app loads
        if (!globalSocket.connected) {
            globalSocket.connect();
        }

        // Cleanup: We deliberately do NOT disconnect here.
        // The socket will automatically close when the browser tab closes.
        // This prevents the "WebSocket is closed before connection established" error 
        // caused by React unmounting the component too quickly in Dev mode.
        return () => {
             // globalSocket.disconnect(); // Keep this commented out
        };
    }, []);

    useEffect(() => {
        if (!socket || !socket.connected) return;
        if (user?.id) {
            socket.emit('auth', { userId: user.id, role: user.role });
        }
    }, [socket, user]);

    useEffect(() => {
        if (!socket) return;

        const notifyApp = (payload) => {
            if (typeof window === 'undefined') return;
            window.dispatchEvent(new CustomEvent('orders:cache-updated', { detail: payload }));
        };

        const handleOrderUpdate = (payload = {}) => {
            if (payload?.order) {
                orderService.patchMyOrdersCache(payload.order);
            }
            orderService.clearAdminCache();
            notifyApp(payload);
        };

        const handleOrderCreate = (payload = {}) => {
            if (payload?.order) {
                orderService.patchMyOrdersCache(payload.order);
            }
            orderService.clearAdminCache();
            notifyApp(payload);
        };

        socket.on('order:update', handleOrderUpdate);
        socket.on('order:create', handleOrderCreate);
        return () => {
            socket.off('order:update', handleOrderUpdate);
            socket.off('order:create', handleOrderCreate);
        };
    }, [socket]);

    return (
        <SocketContext.Provider value={{ socket }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => useContext(SocketContext);
