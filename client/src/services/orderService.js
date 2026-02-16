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

const handleBlobResponse = async (res) => {
    if (!res.ok) {
        try {
            const err = await res.json();
            throw new Error(err.message || 'Download failed');
        } catch (error) {
            throw new Error(error.message || res.statusText || 'Download failed');
        }
    }
    return res.blob();
};

let adminOrdersCache = {};
let adminOrderDetailCache = {};
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
    const couponMeta = (() => {
        if (!order.coupon_meta && !order.couponMeta) return null;
        const raw = order.coupon_meta || order.couponMeta;
        if (typeof raw === 'object') return raw;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    })();
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
        coupon_code: order.coupon_code || order.couponCode || '',
        coupon_type: order.coupon_type || order.couponType || '',
        coupon_discount_value: Number(order.coupon_discount_value ?? order.couponDiscountValue ?? 0),
        coupon_meta: couponMeta,
        source_channel: order.source_channel || order.sourceChannel || '',
        is_abandoned_recovery: Boolean(order.is_abandoned_recovery ?? order.isAbandonedRecovery ?? false),
        abandoned_journey_id: order.abandoned_journey_id ?? order.abandonedJourneyId ?? null,
        subtotal: Number(order.subtotal ?? order.subTotal ?? 0),
        shipping_fee: Number(order.shipping_fee ?? order.shippingFee ?? 0),
        discount_total: Number(order.discount_total ?? order.discountTotal ?? 0),
        total: Number(order.total ?? 0),
        items
    };
};

const matchesAdminQuickRange = (createdAt, query = {}) => {
    const quickRange = String(query.quickRange || 'all');
    if (quickRange === 'all' || quickRange === 'latest_10' || quickRange === 'custom') return true;
    const created = new Date(createdAt);
    if (Number.isNaN(created.getTime())) return true;
    const now = new Date();
    if (quickRange === 'last_7_days') {
        const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return created >= cutoff;
    }
    if (quickRange === 'last_1_month') {
        const cutoff = new Date(now);
        cutoff.setMonth(cutoff.getMonth() - 1);
        return created >= cutoff;
    }
    if (quickRange === 'last_1_year') {
        const cutoff = new Date(now);
        cutoff.setFullYear(cutoff.getFullYear() - 1);
        return created >= cutoff;
    }
    return true;
};

const matchesAdminCustomDate = (createdAt, query = {}) => {
    const created = new Date(createdAt);
    if (Number.isNaN(created.getTime())) return true;
    if (query.startDate) {
        const start = new Date(`${query.startDate}T00:00:00`);
        if (!Number.isNaN(start.getTime()) && created < start) return false;
    }
    if (query.endDate) {
        const end = new Date(`${query.endDate}T23:59:59`);
        if (!Number.isNaN(end.getTime()) && created > end) return false;
    }
    return true;
};

const matchesAdminSearch = (order, query = {}) => {
    const term = String(query.search || '').trim().toLowerCase();
    if (!term) return true;
    const haystack = [
        order?.order_ref,
        order?.customer_name,
        order?.customer_mobile,
        order?.razorpay_order_id,
        order?.razorpay_payment_id
    ].map((v) => String(v || '').toLowerCase()).join(' ');
    return haystack.includes(term);
};

const matchesAdminStatus = (order, query = {}) => {
    const status = String(query.status || 'all').toLowerCase();
    if (status === 'all') return true;
    if (status === 'failed') {
        return String(order?.status || '').toLowerCase() === 'failed'
            || String(order?.payment_status || '').toLowerCase() === 'failed';
    }
    return String(order?.status || '').toLowerCase() === status;
};

const sortAdminOrders = (orders = [], query = {}) => {
    const list = [...orders];
    const quickRange = String(query.quickRange || 'all');
    const sortBy = String(query.sortBy || 'newest');
    const byCreatedDesc = (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    const byCreatedAsc = (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    if (quickRange === 'latest_10') return list.sort(byCreatedDesc);
    if (sortBy === 'oldest') return list.sort(byCreatedAsc);
    if (sortBy === 'amount_high') {
        return list.sort((a, b) => Number(b.total || 0) - Number(a.total || 0) || byCreatedDesc(a, b));
    }
    if (sortBy === 'amount_low') {
        return list.sort((a, b) => Number(a.total || 0) - Number(b.total || 0) || byCreatedDesc(a, b));
    }
    return list.sort(byCreatedDesc);
};

const orderMatchesAdminQuery = (order, query = {}) => {
    if (!matchesAdminStatus(order, query)) return false;
    if (!matchesAdminSearch(order, query)) return false;
    if (!matchesAdminQuickRange(order?.created_at, query)) return false;
    if (!matchesAdminCustomDate(order?.created_at, query)) return false;
    return true;
};

const patchAdminOrderCaches = (order) => {
    if (!order) return;
    const normalized = normalizeOrderForCache(order);
    Object.keys(adminOrdersCache).forEach((key) => {
        const entry = adminOrdersCache[key];
        const query = entry?.query || {};
        const data = entry?.data;
        if (!data || !Array.isArray(data.orders)) return;
        const nextOrders = [...data.orders];
        const idx = nextOrders.findIndex((row) => String(row.id) === String(normalized.id));
        const matches = orderMatchesAdminQuery(normalized, query);

        if (idx >= 0) {
            if (!matches) {
                nextOrders.splice(idx, 1);
            } else {
                nextOrders[idx] = { ...nextOrders[idx], ...normalized };
            }
        } else if (matches && Number(query.page || 1) === 1) {
            nextOrders.unshift(normalized);
            const limit = Number(query.limit || nextOrders.length || 20);
            if (nextOrders.length > limit) nextOrders.length = limit;
        } else {
            return;
        }

        const sorted = sortAdminOrders(nextOrders, query);
        adminOrdersCache[key] = {
            ...entry,
            ts: Date.now(),
            data: {
                ...data,
                orders: sorted
            }
        };
    });
};

const patchAdminAttemptCaches = (attempt) => {
    if (!attempt?.id) return;
    const normalized = normalizeOrderForCache({
        ...attempt,
        id: `attempt_${attempt.id}`,
        entity_type: 'attempt',
        order_id: null,
        attempt_id: attempt.id,
        order_ref: attempt.order_ref || `PAY-${attempt.razorpay_order_id || attempt.id}`,
        status: 'failed',
        total: Number(attempt.amount_subunits || 0) / 100,
        subtotal: Number(attempt.amount_subunits || 0) / 100,
        shipping_fee: 0,
        discount_total: 0,
        customer_name: attempt.customer_name || '',
        customer_mobile: attempt.customer_mobile || ''
    });
    Object.keys(adminOrdersCache).forEach((key) => {
        const entry = adminOrdersCache[key];
        const data = entry?.data;
        if (!data || !Array.isArray(data.orders)) return;
        const nextOrders = [...data.orders];
        const idx = nextOrders.findIndex((row) => String(row.attempt_id || '') === String(attempt.id) || String(row.id) === String(normalized.id));
        if (idx < 0) return;
        nextOrders[idx] = { ...nextOrders[idx], ...normalized };
        adminOrdersCache[key] = {
            ...entry,
            ts: Date.now(),
            data: { ...data, orders: nextOrders }
        };
    });
};

const removeAdminEntityFromCache = ({ id, entityType = 'order' } = {}) => {
    if (!id) return;
    Object.keys(adminOrdersCache).forEach((key) => {
        const entry = adminOrdersCache[key];
        const data = entry?.data;
        if (!data || !Array.isArray(data.orders)) return;
        const before = data.orders.length;
        const nextOrders = data.orders.filter((row) => {
            if (entityType === 'attempt') {
                return String(row.attempt_id || row.id) !== String(id) && String(row.id) !== `attempt_${id}`;
            }
            return String(row.order_id || row.id) !== String(id);
        });
        if (nextOrders.length === before) return;
        adminOrdersCache[key] = {
            ...entry,
            ts: Date.now(),
            data: { ...data, orders: nextOrders }
        };
    });
};

export const orderService = {
    createRazorpayOrder: async ({ billingAddress, shippingAddress, notes, couponCode } = {}) => {
        const res = await fetch(`${API_URL}/razorpay/order`, {
            method: 'POST',
            headers: getAuthHeader(),
            body: JSON.stringify({ billingAddress, shippingAddress, notes, couponCode })
        });
        return handleResponse(res);
    },
    validateRecoveryCoupon: async ({ code, shippingAddress } = {}) => {
        const res = await fetch(`${API_URL}/coupon/validate`, {
            method: 'POST',
            headers: getAuthHeader(),
            body: JSON.stringify({ code, shippingAddress })
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
        adminOrdersCache[cacheKey] = {
            ts: Date.now(),
            query: { page, limit, status, search, startDate, endDate, quickRange, sortBy },
            data
        };
        return data;
    },
    getAdminOrder: async (id) => {
        const key = String(id);
        const cached = adminOrderDetailCache[key];
        if (cached && Date.now() - cached.ts < ADMIN_CACHE_TTL) {
            return cached.data;
        }
        const res = await fetch(`${API_URL}/admin/${id}`, { headers: getAuthHeader() });
        const data = await handleResponse(res);
        adminOrderDetailCache[key] = { ts: Date.now(), data };
        return data;
    },
    updateAdminOrderStatus: async (id, status, options = {}) => {
        const res = await fetch(`${API_URL}/admin/${id}/status`, {
            method: 'PUT',
            headers: getAuthHeader(),
            body: JSON.stringify({
                status,
                processRefund: Boolean(options?.processRefund),
                refundAmount: options?.refundAmount ?? null
            })
        });
        const data = await handleResponse(res);
        if (data?.order) {
            patchAdminOrderCaches(data.order);
            adminOrderDetailCache[String(data.order.id)] = { ts: Date.now(), data: { order: data.order } };
        }
        return data;
    },
    deleteAdminOrder: async (id) => {
        const res = await fetch(`${API_URL}/admin/${id}`, {
            method: 'DELETE',
            headers: getAuthHeader()
        });
        const data = await handleResponse(res);
        removeAdminEntityFromCache({ id, entityType: 'order' });
        delete adminOrderDetailCache[String(id)];
        return data;
    },
    deleteAdminPaymentAttempt: async (id) => {
        const res = await fetch(`${API_URL}/admin/attempt/${id}`, {
            method: 'DELETE',
            headers: getAuthHeader()
        });
        const data = await handleResponse(res);
        removeAdminEntityFromCache({ id, entityType: 'attempt' });
        return data;
    },
    fetchAdminPaymentStatus: async (payload = {}) => {
        const res = await fetch(`${API_URL}/admin/payment/fetch-status`, {
            method: 'POST',
            headers: getAuthHeader(),
            body: JSON.stringify(payload || {})
        });
        const data = await handleResponse(res);
        if (data?.order) patchAdminOrderCaches(data.order);
        if (data?.order?.id) {
            adminOrderDetailCache[String(data.order.id)] = { ts: Date.now(), data: { order: data.order } };
        }
        if (data?.attempt) patchAdminAttemptCaches(data.attempt);
        return data;
    },
    fetchMyPaymentStatus: async ({ orderId } = {}) => {
        const id = Number(orderId);
        if (!Number.isFinite(id) || id <= 0) throw new Error('Valid order id is required');
        const res = await fetch(`${API_URL}/my/payment/fetch-status`, {
            method: 'POST',
            headers: getAuthHeader(),
            body: JSON.stringify({ orderId: id })
        });
        const data = await handleResponse(res);
        if (data?.order) {
            orderService.patchMyOrdersCache(data.order);
        }
        return data;
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
    getMyOrderByPaymentRef: async (paymentId) => {
        const ref = String(paymentId || '').trim();
        if (!ref) throw new Error('Payment reference is required');
        const res = await fetch(`${API_URL}/my/payment/${encodeURIComponent(ref)}`, {
            headers: getAuthHeader()
        });
        const data = await handleResponse(res);
        if (data?.order) {
            orderService.patchMyOrdersCache(data.order);
        }
        return data;
    },
    downloadMyInvoice: async (orderId) => {
        const id = Number(orderId);
        if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid order id');
        const res = await fetch(`${API_URL}/my/${id}/invoice`, {
            headers: getAuthHeader()
        });
        const blob = await handleBlobResponse(res);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `invoice-${id}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return true;
    },
    downloadAdminInvoice: async (orderId) => {
        const id = Number(orderId);
        if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid order id');
        const res = await fetch(`${API_URL}/admin/${id}/invoice`, {
            headers: getAuthHeader()
        });
        const blob = await handleBlobResponse(res);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `invoice-${id}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return true;
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

            const previousTotalOrders = Number(data.pagination?.totalOrders || nextOrders.length);
            let totalOrders = idx >= 0
                ? previousTotalOrders
                : previousTotalOrders + 1;
            if (meta.duration === 'latest_10') {
                totalOrders = Math.min(10, totalOrders);
            }
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
        adminOrderDetailCache = {};
    },
    clearAdminListCache: () => {
        adminOrdersCache = {};
    },
    patchAdminOrderCache: (order) => {
        patchAdminOrderCaches(order);
    },
    patchAdminAttemptCache: (attempt) => {
        patchAdminAttemptCaches(attempt);
    },
    removeAdminEntityCache: ({ id, entityType = 'order' } = {}) => {
        removeAdminEntityFromCache({ id, entityType });
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
