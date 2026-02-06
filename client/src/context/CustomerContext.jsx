import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { adminService } from '../services/adminService';
import { useAuth } from './AuthContext';

const CustomerContext = createContext(null);
const CACHE_TTL = 5 * 60 * 1000;
const STORAGE_KEY = 'admin_users_cache_v1';

export const CustomerProvider = ({ children }) => {
    const { user } = useAuth();
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
