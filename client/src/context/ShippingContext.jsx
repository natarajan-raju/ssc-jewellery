import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { shippingService } from '../services/shippingService';
import { useSocket } from './SocketContext';

const ShippingContext = createContext(null);
const CACHE_TTL = 5 * 60 * 1000;
const STORAGE_KEY = 'shipping_zones_cache_v1';

export const ShippingProvider = ({ children }) => {
    const { socket } = useSocket();
    const [zones, setZones] = useState([]);
    const [lastFetchedAt, setLastFetchedAt] = useState(0);
    const [loading, setLoading] = useState(false);

    const refreshZones = useCallback(async (force = false) => {
        if (!force && Date.now() - lastFetchedAt < CACHE_TTL && zones.length > 0) return;
        setLoading(true);
        try {
            const data = await shippingService.getZones();
            const next = data.zones || [];
            setZones(next);
            const ts = Date.now();
            setLastFetchedAt(ts);
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ zones: next, ts }));
            } catch {}
        } finally {
            setLoading(false);
        }
    }, [lastFetchedAt, zones.length]);

    useEffect(() => {
        try {
            const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (cached && Array.isArray(cached.zones)) {
                setZones(cached.zones);
                setLastFetchedAt(cached.ts || 0);
            }
        } catch {}
        refreshZones(false);
    }, [refreshZones]);

    useEffect(() => {
        if (!socket) return;
        const handleUpdate = ({ zones: updatedZones }) => {
            if (!Array.isArray(updatedZones)) return;
            setZones(updatedZones);
            const ts = Date.now();
            setLastFetchedAt(ts);
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ zones: updatedZones, ts }));
            } catch {}
        };
        socket.on('shipping:update', handleUpdate);
        return () => socket.off('shipping:update', handleUpdate);
    }, [socket]);

    const value = useMemo(() => ({
        zones,
        loading,
        refreshZones
    }), [zones, loading, refreshZones]);

    return (
        <ShippingContext.Provider value={value}>
            {children}
        </ShippingContext.Provider>
    );
};

export const useShipping = () => useContext(ShippingContext);
