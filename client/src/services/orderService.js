const API_URL = import.meta.env.PROD
  ? '/api/orders'
  : 'http://localhost:5000/api/orders';

const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    if (!token || token === 'undefined' || token === 'null') {
        return { 'Content-Type': 'application/json' };
    }
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
};

const handleResponse = async (res) => {
    if (!res.ok) {
        try {
            const err = await res.json();
            throw new Error(err.message || 'Action failed');
        } catch (e) {
            throw new Error(e.message || res.statusText || 'Server Error');
        }
    }
    return res.json();
};

let adminOrdersCache = {};
const ADMIN_CACHE_TTL = 60 * 1000;
const MY_ORDERS_CACHE_TTL = 5 * 60 * 1000;
const MY_ORDERS_STORAGE_KEY = 'my_orders_cache_v1';
let myOrdersCache = {};

const getCurrentUserId = () => {
    try {
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        return user?.id || '';
    } catch {
        return '';
    }
};

const buildMyOrdersCacheKey = ({ userId, page, limit, duration }) => {
    return `${userId}::${page}::${limit}::${duration}`;
};

const parseMyOrdersCacheKey = (key) => {
    const [userId, pageRaw, limitRaw, duration] = String(key || '').split('::');
    return {
        userId: userId || '',
        page: Number(pageRaw || 1),
        limit: Number(limitRaw || 10),
        duration: duration || 'all'
    };
};

const readMyOrdersCache = () => {
    try {
        const raw = localStorage.getItem(MY_ORDERS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const writeMyOrdersCache = () => {
    try {
        localStorage.setItem(MY_ORDERS_STORAGE_KEY, JSON.stringify(myOrdersCache));
    } catch {
        // ignore storage errors
    }
};

myOrdersCache = readMyOrdersCache();

const durationMatches = (createdAt, duration) => {
    if (!duration || duration === 'all') return true;
    if (duration === 'latest_10') return true;
    const days = Number(duration);
    if (!Number.isFinite(days) || days <= 0) return true;
    const created = new Date(createdAt);
    if (Number.isNaN(created.getTime())) return true;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return created >= cutoff;
};

const normalizeOrderForCache = (order) => {
    if (!order) return order;
    const createdAt = order.created_at || order.createdAt || new Date().toISOString();
    const items = Array.isArray(order.items)
        ? order.items.map((item) => ({
            ...item,
            quantity: Number(item.quantity ?? item.item_snapshot?.quantity ?? item.snapshot?.quantity ?? 0),
            price: Number(item.price ?? item.item_snapshot?.unitPrice ?? item.snapshot?.unitPrice ?? 0),
            line_total: Number(item.line_total ?? item.lineTotal ?? item.item_snapshot?.lineTotal ?? item.snapshot?.lineTotal ?? 0),
            original_price: Number(item.original_price ?? item.item_snapshot?.originalPrice ?? item.snapshot?.originalPrice ?? item.compare_at ?? item.mrp ?? 0),
            item_snapshot: item.item_snapshot || item.itemSnapshot || item.snapshot || null,
            image_url: item.image_url || item.imageUrl || item.item_snapshot?.imageUrl || item.snapshot?.imageUrl || null
        }))
        : [];
    return {
        ...order,
        order_ref: order.order_ref || order.orderRef || '',
        created_at: createdAt,
        user_id: order.user_id || order.userId || null,
        payment_status: order.payment_status || order.paymentStatus || '',
        payment_gateway: order.payment_gateway || order.paymentGateway || '',
        razorpay_order_id: order.razorpay_order_id || order.razorpayOrderId || '',
        razorpay_payment_id: order.razorpay_payment_id || order.razorpayPaymentId || '',
        refund_reference: order.refund_reference || order.refundReference || '',
        refund_amount: Number(order.refund_amount ?? order.refundAmount ?? 0),
        refund_status: order.refund_status || order.refundStatus || '',
        subtotal: Number(order.subtotal ?? order.subTotal ?? 0),
        shipping_fee: Number(order.shipping_fee ?? order.shippingFee ?? 0),
        discount_total: Number(order.discount_total ?? order.discountTotal ?? 0),
        total: Number(order.total ?? 0),
        items
    };
};

export const orderService = {
    createRazorpayOrder: async ({ billingAddress, shippingAddress, notes } = {}) => {
        const res = await fetch(`${API_URL}/razorpay/order`, {
            method: 'POST',
            headers: getAuthHeader(),
            body: JSON.stringify({ billingAddress, shippingAddress, notes })
        });
        return handleResponse(res);
    },
    retryRazorpayOrder: async ({ attemptId } = {}) => {
        const res = await fetch(`${API_URL}/razorpay/retry`, {
            method: 'POST',
            headers: getAuthHeader(),
            body: JSON.stringify({ attemptId })
        });
        return handleResponse(res);
    },
    verifyRazorpayPayment: async (payload) => {
        const res = await fetch(`${API_URL}/razorpay/verify`, {
            method: 'POST',
            headers: getAuthHeader(),
            body: JSON.stringify(payload || {})
        });
        const data = await handleResponse(res);
        if (data?.order) {
            orderService.patchMyOrdersCache(data.order);
        }
        return data;
    },
    checkout: async ({ billingAddress, shippingAddress }) => {
        const res = await fetch(`${API_URL}/checkout`, {
            method: 'POST',
            headers: getAuthHeader(),
            body: JSON.stringify({ billingAddress, shippingAddress })
        });
        const data = await handleResponse(res);
        if (data?.order) {
            orderService.patchMyOrdersCache(data.order);
        }
        return data;
    },
    getAdminOrders: async ({
        page = 1,
        limit = 20,
        status = 'all',
        search = '',
        startDate = '',
        endDate = '',
        quickRange = 'all',
        sortBy = 'newest'
    }) => {
        const cacheKey = `${page}_${limit}_${status}_${search}_${startDate}_${endDate}_${quickRange}_${sortBy}`;
        const cached = adminOrdersCache[cacheKey];
        if (cached && Date.now() - cached.ts < ADMIN_CACHE_TTL) {
            return cached.data;
        }
        const query = `?page=${page}&limit=${limit}&status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&quickRange=${encodeURIComponent(quickRange)}&sortBy=${encodeURIComponent(sortBy)}`;
        const res = await fetch(`${API_URL}/admin${query}`, { headers: getAuthHeader() });
        const data = await handleResponse(res);
        adminOrdersCache[cacheKey] = { ts: Date.now(), data };
        return data;
    },
    getAdminOrder: async (id) => {
        const res = await fetch(`${API_URL}/admin/${id}`, { headers: getAuthHeader() });
        return handleResponse(res);
    },
    updateAdminOrderStatus: async (id, status) => {
        const res = await fetch(`${API_URL}/admin/${id}/status`, {
            method: 'PUT',
            headers: getAuthHeader(),
            body: JSON.stringify({ status })
        });
        adminOrdersCache = {};
        return handleResponse(res);
    },
    getMyOrders: async ({ page = 1, limit = 10, duration = 'latest_10', force = false } = {}) => {
        const userId = getCurrentUserId();
        const cacheKey = buildMyOrdersCacheKey({ userId, page, limit, duration });
        const cached = myOrdersCache[cacheKey];
        if (!force && cached && Date.now() - cached.ts < MY_ORDERS_CACHE_TTL) {
            return cached.data;
        }

        const query = `?page=${page}&limit=${limit}&duration=${encodeURIComponent(duration)}`;
        const res = await fetch(`${API_URL}/my${query}`, { headers: getAuthHeader() });
        const data = await handleResponse(res);
        myOrdersCache[cacheKey] = { ts: Date.now(), data };
        writeMyOrdersCache();
        return data;
    },
    getCachedMyOrders: ({ page = 1, limit = 10, duration = 'latest_10' } = {}) => {
        const userId = getCurrentUserId();
        const cacheKey = buildMyOrdersCacheKey({ userId, page, limit, duration });
        const cached = myOrdersCache[cacheKey];
        if (!cached || Date.now() - cached.ts >= MY_ORDERS_CACHE_TTL) return null;
        return cached.data;
    },
    patchMyOrdersCache: (order) => {
        if (!order?.id) return;
        const normalizedOrder = normalizeOrderForCache(order);
        const currentUserId = getCurrentUserId();
        const orderUserId = String(normalizedOrder.user_id || '');
        if (orderUserId && currentUserId && orderUserId !== currentUserId) return;

        const entries = Object.entries(myOrdersCache);
        entries.forEach(([key, value]) => {
            const meta = parseMyOrdersCacheKey(key);
            if (!meta.userId || meta.userId !== currentUserId) return;
            const data = value?.data;
            if (!data || !Array.isArray(data.orders)) return;
            if (!durationMatches(normalizedOrder.created_at, meta.duration)) return;

            const nextOrders = [...data.orders];
            const idx = nextOrders.findIndex((o) => String(o.id) === String(normalizedOrder.id));
            if (idx >= 0) {
                nextOrders[idx] = { ...nextOrders[idx], ...normalizedOrder };
            } else if (meta.page === 1) {
                nextOrders.unshift(normalizedOrder);
                if (nextOrders.length > meta.limit) nextOrders.length = meta.limit;
            } else {
                return;
            }

            const totalOrders = idx >= 0
                ? Number(data.pagination?.totalOrders || nextOrders.length)
                : Number(data.pagination?.totalOrders || nextOrders.length) + 1;
            myOrdersCache[key] = {
                ...value,
                ts: Date.now(),
                data: {
                    ...data,
                    orders: nextOrders,
                    pagination: {
                        currentPage: Number(data.pagination?.currentPage || meta.page),
                        totalPages: Math.max(
                            1,
                            Math.ceil(totalOrders / Number(meta.limit || 1))
                        ),
                        totalOrders
                    }
                }
            };
        });
        writeMyOrdersCache();
    },
    clearAdminCache: () => {
        adminOrdersCache = {};
    },
    clearMyOrdersCache: () => {
        const userId = getCurrentUserId();
        if (!userId) {
            myOrdersCache = {};
            writeMyOrdersCache();
            return;
        }
        const next = {};
        Object.entries(myOrdersCache).forEach(([key, value]) => {
            if (!key.startsWith(`${userId}::`)) {
                next[key] = value;
            }
        });
        myOrdersCache = next;
        writeMyOrdersCache();
    }
};
