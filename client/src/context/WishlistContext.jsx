import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useSocket } from './SocketContext';
import { wishlistService } from '../services/wishlistService';

const WishlistContext = createContext({
    wishlist: [],
    wishlistItems: [],
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
    const [wishlistItems, setWishlistItems] = useState([]);
    const [loading, setLoading] = useState(false);

    const normalizeWishlistItems = useCallback((payload = {}) => {
        const rawItems = Array.isArray(payload?.items) ? payload.items : [];
        if (rawItems.length > 0) {
            return rawItems
                .map((entry) => ({
                    productId: String(entry?.productId || entry?.product_id || '').trim(),
                    variantId: String(entry?.variantId || entry?.variant_id || '').trim()
                }))
                .filter((entry) => entry.productId);
        }
        const legacyIds = Array.isArray(payload?.productIds) ? payload.productIds : [];
        return legacyIds
            .map((id) => ({ productId: String(id || '').trim(), variantId: '' }))
            .filter((entry) => entry.productId);
    }, []);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (!user?.id) {
                setLoading(false);
                setWishlistItems((prev) => (prev.length ? [] : prev));
                return;
            }
            setLoading(true);
            try {
                const data = await wishlistService.getWishlist();
                if (!cancelled) {
                    const nextItems = normalizeWishlistItems(data);
                    setWishlistItems((prev) => {
                        if (
                            prev.length === nextItems.length
                            && prev.every((entry, idx) => entry.productId === nextItems[idx]?.productId && entry.variantId === nextItems[idx]?.variantId)
                        ) {
                            return prev;
                        }
                        return nextItems;
                    });
                }
            } catch (error) {
                if (!cancelled) {
                    setWishlistItems((prev) => (prev.length ? [] : prev));
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
    }, [user?.id, normalizeWishlistItems]);

    useEffect(() => {
        if (!socket || !user?.id) return;
        const handleWishlistUpdate = (payload = {}) => {
            setWishlistItems(normalizeWishlistItems(payload));
        };
        socket.on('wishlist:update', handleWishlistUpdate);
        return () => {
            socket.off('wishlist:update', handleWishlistUpdate);
        };
    }, [socket, user?.id, normalizeWishlistItems]);

    const toPayload = useCallback((productOrObject, variantArg = '') => {
        if (productOrObject && typeof productOrObject === 'object') {
            return {
                productId: String(productOrObject.productId || '').trim(),
                variantId: String(productOrObject.variantId || '').trim()
            };
        }
        return {
            productId: String(productOrObject || '').trim(),
            variantId: String(variantArg || '').trim()
        };
    }, []);

    const isWishlisted = useCallback((productOrObject, variantArg = '') => {
        const { productId, variantId } = toPayload(productOrObject, variantArg);
        if (!productId) return false;
        if (!variantId) {
            return wishlistItems.some((entry) => entry.productId === productId);
        }
        return wishlistItems.some((entry) => (
            entry.productId === productId
            && (entry.variantId === variantId || entry.variantId === '')
        ));
    }, [wishlistItems, toPayload]);

    const addToWishlist = useCallback(async (productOrObject, variantArg = '') => {
        if (!user?.id) {
            toast.info('Please login to save products in wishlist');
            return false;
        }
        const { productId, variantId } = toPayload(productOrObject, variantArg);
        if (!productId) return false;
        if (isWishlisted(productId, variantId)) return false;
        try {
            const data = await wishlistService.addItem(productId, variantId);
            const nextItems = normalizeWishlistItems(data);
            setWishlistItems(nextItems);
            toast.success('Added to wishlist');
            return true;
        } catch (error) {
            toast.error(error?.message || 'Failed to update wishlist');
            return false;
        }
    }, [toast, user?.id, isWishlisted, normalizeWishlistItems, toPayload]);

    const removeFromWishlist = useCallback(async (productOrObject, variantArg = '', options = {}) => {
        if (!user?.id) {
            toast.info('Please login to manage wishlist');
            return false;
        }
        const { silent = false, removeAllVariants = false } = options || {};
        const { productId, variantId } = toPayload(productOrObject, variantArg);
        if (!productId) return false;
        if (!isWishlisted(productId, variantId)) return false;
        try {
            const data = await wishlistService.removeItem(productId, variantId, removeAllVariants);
            const nextItems = normalizeWishlistItems(data);
            setWishlistItems(nextItems);
            if (!silent) toast.info('Removed from wishlist');
            return true;
        } catch (error) {
            toast.error(error?.message || 'Failed to update wishlist');
            return false;
        }
    }, [toast, user?.id, isWishlisted, normalizeWishlistItems, toPayload]);

    const toggleWishlist = useCallback(async (productOrObject, variantArg = '') => {
        const { productId, variantId } = toPayload(productOrObject, variantArg);
        if (!productId) return false;
        if (isWishlisted(productId, variantId)) {
            await removeFromWishlist(productId, variantId);
            return false;
        }
        await addToWishlist(productId, variantId);
        return true;
    }, [addToWishlist, removeFromWishlist, isWishlisted, toPayload]);

    const wishlist = useMemo(() => (
        Array.from(new Set(wishlistItems.map((entry) => entry.productId)))
    ), [wishlistItems]);

    const value = useMemo(() => ({
        wishlist,
        wishlistItems,
        wishlistCount: wishlistItems.length,
        loading,
        isWishlisted,
        addToWishlist,
        removeFromWishlist,
        toggleWishlist
    }), [wishlist, wishlistItems, loading, isWishlisted, addToWishlist, removeFromWishlist, toggleWishlist]);

    return (
        <WishlistContext.Provider value={value}>
            {children}
        </WishlistContext.Provider>
    );
};

export const useWishlist = () => useContext(WishlistContext);
