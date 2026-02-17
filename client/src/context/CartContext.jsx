import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { cartService } from '../services/cartService';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import CartDrawer from '../components/CartDrawer';
import QuickAddModal from '../components/QuickAddModal';
import { useToast } from './ToastContext';

const defaultCartContext = {
    items: [],
    itemCount: 0,
    subtotal: 0,
    isOpen: false,
    isSyncing: false,
    openCart: () => {},
    closeCart: () => {},
    addItem: async () => {},
    updateQuantity: async () => {},
    removeItem: async () => {},
    clearCart: async () => {},
    openQuickAdd: () => {}
};

const CartContext = createContext(defaultCartContext);
const STORAGE_KEY = 'guest_cart_v1';

const buildKey = (productId, variantId) => `${productId}__${variantId || ''}`;
const toBool = (value) => value === 1 || value === true || value === '1' || value === 'true';
const toNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const parseMedia = (media) => {
    try {
        const raw = typeof media === 'string' ? JSON.parse(media) : media;
        if (!Array.isArray(raw)) return [];
        return raw.map(m => (m && typeof m === 'object' && m.url) ? m.url : m).filter(Boolean);
    } catch {
        return [];
    }
};

const buildItemFromProduct = (product, variant, quantity = 1) => {
    const media = parseMedia(product.media);
    const imageUrl = variant?.image_url || media[0] || null;
    const price = Number(variant?.discount_price || variant?.price || product.discount_price || product.mrp || 0);
    const compareAt = Number(variant?.price || product.mrp || 0);
    const weightKg = Number(variant?.weight_kg || product.weight_kg || 0);
    const trackQuantity = variant ? toBool(variant.track_quantity) : toBool(product.track_quantity);
    const availableQuantity = variant ? toNumber(variant.quantity, 0) : toNumber(product.quantity, 0);
    const isOutOfStock = Boolean(trackQuantity && availableQuantity <= 0);

    return {
        key: buildKey(product.id, variant?.id || ''),
        productId: product.id,
        variantId: variant?.id || '',
        quantity,
        title: product.title,
        status: product.status || 'active',
        categories: Array.isArray(product.categories) ? product.categories : [],
        imageUrl,
        price,
        compareAt,
        variantTitle: variant?.variant_title || null,
        weightKg,
        trackQuantity,
        availableQuantity,
        isOutOfStock
    };
};

const loadGuestCart = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        return parsed.map((item) => {
            const trackQuantity = toBool(item?.trackQuantity);
            const availableQuantity = toNumber(item?.availableQuantity, 0);
            const isOutOfStock = item?.isOutOfStock !== undefined
                ? Boolean(item.isOutOfStock)
                : Boolean(trackQuantity && availableQuantity <= 0);
            return {
                ...item,
                status: item?.status || 'active',
                trackQuantity,
                availableQuantity,
                isOutOfStock
            };
        });
    } catch {
        return [];
    }
};

const saveGuestCart = (items) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
        // ignore
    }
};

const notifyCartItemAdded = (productId) => {
    if (typeof window === 'undefined' || !productId) return;
    window.dispatchEvent(new CustomEvent('cart:item-added', { detail: { productId } }));
};

export const CartProvider = ({ children }) => {
    const { user } = useAuth();
    const { socket } = useSocket();
    const toast = useToast();
    const location = useLocation();
    const [items, setItems] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [quickAddProduct, setQuickAddProduct] = useState(null);

    const hydrateFromServer = useCallback(async (mergeGuest = false) => {
        if (!user) return;
        setIsSyncing(true);
        try {
            const guestItems = loadGuestCart();
            if (mergeGuest && guestItems.length > 0) {
                await cartService.bulkAdd(guestItems.map(i => ({
                    productId: i.productId,
                    variantId: i.variantId,
                    quantity: i.quantity
                })));
                localStorage.removeItem(STORAGE_KEY);
            }
            const data = await cartService.getCart();
            setItems((data.items || []).map(i => ({ ...i, key: buildKey(i.productId, i.variantId) })));
        } finally {
            setIsSyncing(false);
        }
    }, [user]);

    useEffect(() => {
        if (user) {
            hydrateFromServer(true);
        } else {
            setItems(loadGuestCart());
        }
    }, [user, hydrateFromServer]);

    useEffect(() => {
        if (!user) {
            saveGuestCart(items);
        }
    }, [items, user]);

    const addItem = async ({ product, variant, quantity = 1 }) => {
        if (!product) return;
        const snapshot = buildItemFromProduct(product, variant, quantity);
        if (String(snapshot.status || '').toLowerCase() !== 'active') {
            toast.error('This product is inactive and cannot be added to cart.');
            return;
        }
        if (snapshot.isOutOfStock) {
            toast.warning('This product is currently out of stock.');
            return;
        }
        if (user) {
            const data = await cartService.addItem({ productId: product.id, variantId: variant?.id || '', quantity });
            setItems((data.items || []).map(i => ({ ...i, key: buildKey(i.productId, i.variantId) })));
            notifyCartItemAdded(product.id);
        } else {
            setItems(prev => {
                const key = buildKey(product.id, variant?.id || '');
                const existing = prev.find(p => p.key === key);
                if (existing) {
                    return prev.map(p => p.key === key ? { ...p, quantity: p.quantity + quantity } : p);
                }
                return [...prev, snapshot];
            });
            notifyCartItemAdded(product.id);
        }
    };

    const updateQuantity = async ({ productId, variantId = '', quantity }) => {
        if (user) {
            const data = await cartService.updateItem({ productId, variantId, quantity });
            setItems((data.items || []).map(i => ({ ...i, key: buildKey(i.productId, i.variantId) })));
        } else {
            setItems(prev => {
                if (quantity <= 0) return prev.filter(p => !(p.productId === productId && p.variantId === variantId));
                return prev.map(p => (p.productId === productId && p.variantId === variantId) ? { ...p, quantity } : p);
            });
        }
    };

    const removeItem = async ({ productId, variantId = '' }) => {
        if (user) {
            const data = await cartService.removeItem({ productId, variantId });
            setItems((data.items || []).map(i => ({ ...i, key: buildKey(i.productId, i.variantId) })));
        } else {
            setItems(prev => prev.filter(p => !(p.productId === productId && p.variantId === variantId)));
        }
    };

    const clearCart = async () => {
        if (user) {
            const data = await cartService.clearCart();
            setItems((data.items || []).map(i => ({ ...i, key: buildKey(i.productId, i.variantId) })));
        } else {
            setItems([]);
        }
    };

    const openCart = () => setIsOpen(true);
    const closeCart = () => setIsOpen(false);
    const openQuickAdd = (product) => setQuickAddProduct(product);
    const closeQuickAdd = () => setQuickAddProduct(null);
    const handleQuickAddConfirm = async (variant) => {
        await addItem({ product: quickAddProduct, variant, quantity: 1 });
    };

    const isAdminRoute = location.pathname.startsWith('/admin');
    const isStaffUser = user && (user.role === 'admin' || user.role === 'staff');
    const shouldShowCartToasts = !isAdminRoute && !isStaffUser;

    useEffect(() => {
        if (!socket) return;
        const updateQueueRef = { current: new Map() };
        const deleteQueueRef = { current: new Set() };
        let debounceTimer = null;
        let isSyncingRemovals = false;

        const resolveProductSnapshotForItem = (item, product) => {
            const variants = Array.isArray(product?.variants) ? product.variants : [];
            const media = parseMedia(product?.media);
            const variant = item.variantId ? variants.find(v => String(v.id) === String(item.variantId)) : null;
            const imageUrl = variant?.image_url || media[0] || item.imageUrl;
            const price = toNumber(variant?.discount_price || variant?.price || product?.discount_price || product?.mrp || item.price, 0);
            const compareAt = toNumber(variant?.price || product?.mrp || item.compareAt, 0);
            const trackQuantity = variant ? toBool(variant.track_quantity) : toBool(product?.track_quantity);
            const availableQuantity = variant ? toNumber(variant.quantity, 0) : toNumber(product?.quantity, 0);
            const isOutOfStock = Boolean(trackQuantity && availableQuantity <= 0);
            const status = String(product?.status || item.status || '').toLowerCase() || 'active';

            return {
                ...item,
                title: product?.title || item.title,
                status,
                categories: Array.isArray(product?.categories) ? product.categories : (item.categories || []),
                variantTitle: variant?.variant_title || item.variantTitle,
                imageUrl,
                price,
                compareAt,
                trackQuantity,
                availableQuantity,
                isOutOfStock
            };
        };

        const flushUpdates = () => {
            const updates = updateQueueRef.current;
            const deletes = deleteQueueRef.current;
            updateQueueRef.current = new Map();
            deleteQueueRef.current = new Set();

            let removedUnavailableCount = 0;
            let removedDeletedCount = 0;
            let priceChangedCount = 0;
            let outOfStockBecameCount = 0;
            const serverRemovals = [];

            setItems(prev => {
                const next = [];
                prev.forEach((item) => {
                    if (deletes.has(item.productId)) {
                        removedDeletedCount += 1;
                        if (user) {
                            serverRemovals.push({ productId: item.productId, variantId: item.variantId || '' });
                        }
                        return;
                    }

                    const product = updates.get(item.productId);
                    if (!product) {
                        next.push(item);
                        return;
                    }

                    const nextItem = resolveProductSnapshotForItem(item, product);
                    const isInactive = String(nextItem.status || '').toLowerCase() !== 'active';
                    if (isInactive) {
                        removedUnavailableCount += 1;
                        if (user) {
                            serverRemovals.push({ productId: item.productId, variantId: item.variantId || '' });
                        }
                        return;
                    }

                    if (Number(nextItem.price || 0) !== Number(item.price || 0)) {
                        priceChangedCount += 1;
                    }
                    if (!item.isOutOfStock && nextItem.isOutOfStock) {
                        outOfStockBecameCount += 1;
                    }
                    next.push(nextItem);
                });
                return next;
            });

            if (user && serverRemovals.length > 0 && !isSyncingRemovals) {
                isSyncingRemovals = true;
                Promise.all(
                    serverRemovals.map((entry) => cartService.removeItem(entry).catch(() => null))
                ).finally(() => {
                    isSyncingRemovals = false;
                });
            }

            if (!shouldShowCartToasts) return;
            if (removedDeletedCount > 0 || removedUnavailableCount > 0) {
                toast.warning(`${removedDeletedCount + removedUnavailableCount} item(s) were removed from your cart (inactive or unavailable).`);
            }
            if (outOfStockBecameCount > 0) {
                toast.warning(`${outOfStockBecameCount} item(s) in your cart are now out of stock.`);
            }
            if (priceChangedCount > 0) {
                toast.info(`Price updated for ${priceChangedCount} cart item(s).`);
            }
        };

        const scheduleFlush = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(flushUpdates, 200);
        };

        const handleProductUpdate = (product) => {
            if (!product?.id) return;
            updateQueueRef.current.set(product.id, product);
            scheduleFlush();
        };
        const handleProductDelete = ({ id }) => {
            if (!id) return;
            deleteQueueRef.current.add(id);
            scheduleFlush();
        };

        socket.on('product:update', handleProductUpdate);
        socket.on('product:delete', handleProductDelete);

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            socket.off('product:update', handleProductUpdate);
            socket.off('product:delete', handleProductDelete);
        };
    }, [socket, shouldShowCartToasts, user]);

    const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);
    const subtotal = useMemo(() => items.reduce((sum, i) => sum + (i.price * i.quantity), 0), [items]);

    const value = useMemo(() => ({
        items,
        itemCount,
        subtotal,
        isOpen,
        isSyncing,
        openCart,
        closeCart,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        openQuickAdd
    }), [items, itemCount, subtotal, isOpen, isSyncing]);

    return (
        <CartContext.Provider value={value}>
            {children}
            <CartDrawer />
            <QuickAddModal 
                product={quickAddProduct}
                onClose={closeQuickAdd}
                onConfirm={handleQuickAddConfirm}
            />
        </CartContext.Provider>
    );
};

export const useCart = () => useContext(CartContext) || defaultCartContext;
