import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { adminService } from '../services/adminService';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';

const CustomerContext = createContext(null);
const CACHE_TTL = 5 * 60 * 1000;
const STORAGE_KEY = 'admin_users_cache_v1';

export const CustomerProvider = ({ children }) => {
    const { user } = useAuth();
    const { socket } = useSocket();
    const [users, setUsers] = useState([]);
    const [lastFetchedAt, setLastFetchedAt] = useState(0);
    const [loading, setLoading] = useState(false);

    const refreshUsers = useCallback(async (force = false) => {
        if (!user || (user.role !== 'admin' && user.role !== 'staff')) return;
        if (!force && Date.now() - lastFetchedAt < CACHE_TTL && users.length > 0) return;

        setLoading(true);
        try {
            const all = await adminService.getUsersAll('all');
            setUsers(all);
            const ts = Date.now();
            setLastFetchedAt(ts);
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ users: all, ts }));
            } catch {}
        } finally {
            setLoading(false);
        }
    }, [user, lastFetchedAt, users.length]);

    useEffect(() => {
        try {
            const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (cached && Array.isArray(cached.users)) {
                setUsers(cached.users);
                setLastFetchedAt(cached.ts || 0);
            }
        } catch {}
        refreshUsers(false);
    }, [refreshUsers]);

    useEffect(() => {
        if (!socket || !user || (user.role !== 'admin' && user.role !== 'staff')) return;

        const persist = (updater) => {
            setUsers((prev) => {
                const nextUsers = typeof updater === 'function' ? updater(prev) : updater;
                const ts = Date.now();
                setLastFetchedAt(ts);
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify({ users: nextUsers, ts }));
                } catch {}
                return nextUsers;
            });
        };

        const handleCreate = (newUser) => {
            if (!newUser?.id) return;
            adminService.clearCache();
            persist((prev) => {
                const exists = prev.find((u) => u.id === newUser.id);
                if (exists) return prev.map((u) => (u.id === newUser.id ? { ...u, ...newUser } : u));
                return [newUser, ...prev];
            });
        };

        const handleUpdate = (updatedUser) => {
            if (!updatedUser?.id) return;
            adminService.clearCache();
            persist((prev) => {
                const exists = prev.find((u) => u.id === updatedUser.id);
                if (!exists) return prev;
                return prev.map((u) => (u.id === updatedUser.id ? { ...u, ...updatedUser } : u));
            });
        };

        const handleDelete = ({ id }) => {
            if (!id) return;
            adminService.clearCache();
            persist((prev) => prev.filter((u) => u.id !== id));
        };

        socket.on('user:create', handleCreate);
        socket.on('user:update', handleUpdate);
        socket.on('user:delete', handleDelete);

        return () => {
            socket.off('user:create', handleCreate);
            socket.off('user:update', handleUpdate);
            socket.off('user:delete', handleDelete);
        };
    }, [socket, user]);

    const value = useMemo(() => ({
        users,
        loading,
        refreshUsers
    }), [users, loading, refreshUsers]);

    return (
        <CustomerContext.Provider value={value}>
            {children}
        </CustomerContext.Provider>
    );
};

export const useCustomers = () => useContext(CustomerContext);
