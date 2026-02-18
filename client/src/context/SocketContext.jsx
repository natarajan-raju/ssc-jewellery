import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { orderService } from '../services/orderService';
import { productService } from '../services/productService';
import { adminService } from '../services/adminService';
import { useToast } from './ToastContext';

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
const ADMIN_PAYMENT_TOAST_DEDUPE_MS = 15000;
const adminPaymentToastSeen = new Map();
const ADMIN_ORDER_TOAST_DEDUPE_MS = 8000;
const adminOrderToastSeen = new Map();

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(globalSocket);
    const { user } = useAuth();
    const toast = useToast();

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
            if (!payload?.silent && user && (user.role === 'admin' || user.role === 'staff')) {
                const orderRef = payload?.order?.order_ref || payload?.order?.orderRef || `#${payload?.order?.id || payload?.orderId || ''}`;
                const status = String(payload?.status || payload?.order?.status || '').toLowerCase();
                if (status) {
                    const key = `${payload?.orderId || payload?.order?.id || ''}::${status}`;
                    const now = Date.now();
                    const seenAt = adminOrderToastSeen.get(key) || 0;
                    if (!seenAt || now - seenAt > ADMIN_ORDER_TOAST_DEDUPE_MS) {
                        if (payload?.deleted || status === 'deleted') {
                            toast.warning(`Order removed: ${orderRef}`);
                        } else {
                            toast.info(`Order ${status}: ${orderRef}`);
                        }
                        adminOrderToastSeen.set(key, now);
                    }
                }
            }
            orderService.clearAdminListCache();
            notifyApp(payload);
        };

        const handleOrderCreate = async (payload = {}) => {
            let finalOrder = payload?.order || null;
            if (finalOrder) {
                orderService.patchMyOrdersCache(finalOrder);
            }
            if (user && (user.role === 'admin' || user.role === 'staff')) {
                const orderId = finalOrder?.id || payload?.orderId || null;
                if (orderId) {
                    try {
                        const detail = await orderService.getAdminOrder(orderId);
                        if (detail?.order) {
                            finalOrder = detail.order;
                        }
                    } catch {
                        // fallback to socket payload
                    }
                }
                const orderRef = finalOrder?.order_ref || finalOrder?.orderRef || `#${finalOrder?.id || orderId || ''}`;
                toast.success(`New order received: ${orderRef}`);
                if (typeof window !== 'undefined' && finalOrder) {
                    window.dispatchEvent(new CustomEvent('admin:new-order', { detail: finalOrder }));
                }
            }
            orderService.clearAdminListCache();
            notifyApp({ ...payload, order: finalOrder || payload?.order || null });
        };

        const handlePaymentUpdate = (payload = {}) => {
            if (payload?.order) {
                orderService.patchMyOrdersCache(payload.order);
            }
            if (!payload?.silent && user && (user.role === 'admin' || user.role === 'staff')) {
                const orderRef = payload?.order?.order_ref || payload?.order?.orderRef || `#${payload?.order?.id || ''}`;
                const paymentStatus = payload?.payment?.paymentStatus;
                const settlementStatus = payload?.payment?.settlementStatus
                    || payload?.settlement?.status
                    || payload?.order?.settlement_snapshot?.status
                    || null;
                const settlementId = payload?.payment?.settlementId
                    || payload?.settlementId
                    || payload?.settlement?.id
                    || payload?.order?.settlement_id
                    || null;
                const status = String(paymentStatus || settlementStatus || '').toLowerCase();
                const orderId = String(payload?.order?.id || payload?.orderId || settlementId || '');
                const key = `${orderId}::${status || payload?.eventType || payload?.payment?.event || 'payment_update'}`;
                const now = Date.now();
                const seenAt = adminPaymentToastSeen.get(key) || 0;
                if (!seenAt || now - seenAt > ADMIN_PAYMENT_TOAST_DEDUPE_MS) {
                    if (paymentStatus) {
                        const lower = String(paymentStatus).toLowerCase();
                        if (['failed', 'expired'].includes(lower)) {
                            toast.warning(`Payment ${paymentStatus}: ${orderRef}`);
                        } else if (lower === 'refunded') {
                            toast.info(`Refund update: ${orderRef}`);
                        } else {
                            toast.success(`Payment ${paymentStatus}: ${orderRef}`);
                        }
                    }

                    if (settlementStatus) {
                        const label = settlementId ? `${settlementStatus} (${settlementId})` : settlementStatus;
                        if (String(settlementStatus).toLowerCase() === 'failed') {
                            toast.warning(`Settlement ${label}`);
                        } else {
                            toast.info(`Settlement ${label}`);
                        }
                    }

                    if (payload?.payment?.refundReference || payload?.order?.refund_reference) {
                        toast.info(`Refund reference updated: ${orderRef}`);
                    }
                    adminPaymentToastSeen.set(key, now);
                }
                if (adminPaymentToastSeen.size > 300) {
                    const cutoff = now - ADMIN_PAYMENT_TOAST_DEDUPE_MS;
                    for (const [k, ts] of adminPaymentToastSeen.entries()) {
                        if (ts < cutoff) adminPaymentToastSeen.delete(k);
                    }
                }
            }
            orderService.clearAdminListCache();
            notifyApp(payload);
        };

        socket.on('order:update', handleOrderUpdate);
        socket.on('order:create', handleOrderCreate);
        socket.on('payment:update', handlePaymentUpdate);
        return () => {
            socket.off('order:update', handleOrderUpdate);
            socket.off('order:create', handleOrderCreate);
            socket.off('payment:update', handlePaymentUpdate);
        };
    }, [socket, toast, user]);

    useEffect(() => {
        if (!socket) return;

        const handleProductCreate = () => {
            productService.clearProductsCache();
            productService.invalidateCategoryStatsCache();
            productService.invalidateCategoryListCache();
        };

        const handleProductUpdate = (product = {}) => {
            productService.patchProductInProductsCache(product);
            const categories = Array.isArray(product?.categories) ? product.categories : [];
            categories.forEach((categoryName) => {
                productService.clearProductsCache({ category: categoryName });
            });
            if (!categories.length) {
                productService.clearProductsCache();
            }
        };

        const handleProductDelete = (payload = {}) => {
            productService.removeProductFromProductsCache(payload?.id);
            productService.invalidateCategoryStatsCache();
            productService.clearProductsCache();
        };

        const handleCategoryRefresh = (payload = {}) => {
            productService.invalidateCategoryStatsCache();
            productService.invalidateCategoryListCache();
            const categoryName = payload?.categoryName || payload?.category?.name;
            if (payload?.action === 'reorder' || payload?.action === 'sync_all') {
                productService.clearProductsCache();
            } else if (categoryName) {
                productService.clearProductsCache({ category: categoryName });
            } else {
                productService.clearProductsCache();
            }
        };

        const handleProductCategoryChange = (payload = {}) => {
            const product = payload?.product;
            if (product) {
                productService.patchProductInProductsCache(product);
                const categories = Array.isArray(product?.categories) ? product.categories : [];
                categories.forEach((categoryName) => {
                    productService.clearProductsCache({ category: categoryName });
                });
            }
            if (payload?.categoryName) {
                productService.clearProductsCache({ category: payload.categoryName });
            } else {
                productService.clearProductsCache();
            }
            productService.invalidateCategoryStatsCache();
            productService.invalidateCategoryListCache();
        };

        const handleAdminCrud = () => {
            adminService.clearCache();
        };

        socket.on('product:create', handleProductCreate);
        socket.on('product:update', handleProductUpdate);
        socket.on('product:delete', handleProductDelete);
        socket.on('product:category_change', handleProductCategoryChange);
        socket.on('refresh:categories', handleCategoryRefresh);
        socket.on('user:create', handleAdminCrud);
        socket.on('user:update', handleAdminCrud);
        socket.on('user:delete', handleAdminCrud);
        socket.on('company:info_update', handleAdminCrud);
        socket.on('coupon:changed', handleAdminCrud);
        socket.on('shipping:update', handleAdminCrud);
        socket.on('cms:hero_update', handleAdminCrud);
        socket.on('cms:texts_update', handleAdminCrud);
        socket.on('cms:banner_update', handleAdminCrud);
        socket.on('cms:banner_secondary_update', handleAdminCrud);
        socket.on('cms:featured_category_update', handleAdminCrud);

        return () => {
            socket.off('product:create', handleProductCreate);
            socket.off('product:update', handleProductUpdate);
            socket.off('product:delete', handleProductDelete);
            socket.off('product:category_change', handleProductCategoryChange);
            socket.off('refresh:categories', handleCategoryRefresh);
            socket.off('user:create', handleAdminCrud);
            socket.off('user:update', handleAdminCrud);
            socket.off('user:delete', handleAdminCrud);
            socket.off('company:info_update', handleAdminCrud);
            socket.off('coupon:changed', handleAdminCrud);
            socket.off('shipping:update', handleAdminCrud);
            socket.off('cms:hero_update', handleAdminCrud);
            socket.off('cms:texts_update', handleAdminCrud);
            socket.off('cms:banner_update', handleAdminCrud);
            socket.off('cms:banner_secondary_update', handleAdminCrud);
            socket.off('cms:featured_category_update', handleAdminCrud);
        };
    }, [socket]);

    return (
        <SocketContext.Provider value={{ socket }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => useContext(SocketContext);
