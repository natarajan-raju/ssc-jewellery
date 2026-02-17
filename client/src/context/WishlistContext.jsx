import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useSocket } from './SocketContext';
import { wishlistService } from '../services/wishlistService';

const WishlistContext = createContext({
    wishlist: [],
    wishlistCount: 0,
    loading: false,
    isWishlisted: () => false,
    addToWishlist: () => {},
    removeFromWishlist: () => {},
    toggleWishlist: () => false
});

export const WishlistProvider = ({ children }) => {
    const { user } = useAuth();
    const toast = useToast();
    const { socket } = useSocket();
    const [wishlist, setWishlist] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (!user?.id) {
                setLoading(false);
                setWishlist((prev) => (prev.length ? [] : prev));
                return;
            }
            setLoading(true);
            try {
                const data = await wishlistService.getWishlist();
                if (!cancelled) {
                    const ids = Array.isArray(data?.productIds) ? data.productIds.map((id) => String(id)) : [];
                    setWishlist((prev) => {
                        if (prev.length === ids.length && prev.every((entry, idx) => entry === ids[idx])) {
                            return prev;
                        }
                        return ids;
                    });
                }
            } catch (error) {
                if (!cancelled) {
                    setWishlist((prev) => (prev.length ? [] : prev));
                    toast.error(error?.message || 'Failed to load wishlist');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [user?.id]);

    useEffect(() => {
        if (!socket || !user?.id) return;
        const handleWishlistUpdate = (payload = {}) => {
            const ids = Array.isArray(payload?.productIds) ? payload.productIds : [];
            setWishlist(ids.map((id) => String(id)));
        };
        socket.on('wishlist:update', handleWishlistUpdate);
        return () => {
            socket.off('wishlist:update', handleWishlistUpdate);
        };
    }, [socket, user?.id]);

    const isWishlisted = useCallback((productId) => (
        wishlist.includes(String(productId || ''))
    ), [wishlist]);

    const addToWishlist = useCallback(async (productId) => {
        if (!user?.id) {
            toast.info('Please login to save products in wishlist');
            return false;
        }
        const id = String(productId || '');
        if (!id) return false;
        if (wishlist.includes(id)) return false;
        try {
            const data = await wishlistService.addItem(id);
            const ids = Array.isArray(data?.productIds) ? data.productIds : [];
            setWishlist(ids.map((entry) => String(entry)));
            toast.success('Added to wishlist');
            return true;
        } catch (error) {
            toast.error(error?.message || 'Failed to update wishlist');
            return false;
        }
    }, [toast, user?.id, wishlist]);

    const removeFromWishlist = useCallback(async (productId) => {
        if (!user?.id) {
            toast.info('Please login to manage wishlist');
            return false;
        }
        const id = String(productId || '');
        if (!id) return false;
        if (!wishlist.includes(id)) return false;
        try {
            const data = await wishlistService.removeItem(id);
            const ids = Array.isArray(data?.productIds) ? data.productIds : [];
            setWishlist(ids.map((entry) => String(entry)));
            toast.info('Removed from wishlist');
            return true;
        } catch (error) {
            toast.error(error?.message || 'Failed to update wishlist');
            return false;
        }
    }, [toast, user?.id, wishlist]);

    const toggleWishlist = useCallback(async (productId) => {
        const id = String(productId || '');
        if (!id) return false;
        if (wishlist.includes(id)) {
            await removeFromWishlist(id);
            return false;
        }
        await addToWishlist(id);
        return true;
    }, [addToWishlist, removeFromWishlist, wishlist]);

    const value = useMemo(() => ({
        wishlist,
        wishlistCount: wishlist.length,
        loading,
        isWishlisted,
        addToWishlist,
        removeFromWishlist,
        toggleWishlist
    }), [wishlist, loading, isWishlisted, addToWishlist, removeFromWishlist, toggleWishlist]);

    return (
        <WishlistContext.Provider value={value}>
            {children}
        </WishlistContext.Provider>
    );
};

export const useWishlist = () => useContext(WishlistContext);
