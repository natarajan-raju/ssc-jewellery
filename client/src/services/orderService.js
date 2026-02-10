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

export const orderService = {
    checkout: async ({ billingAddress, shippingAddress }) => {
        const res = await fetch(`${API_URL}/checkout`, {
            method: 'POST',
            headers: getAuthHeader(),
            body: JSON.stringify({ billingAddress, shippingAddress })
        });
        return handleResponse(res);
    },
    getAdminOrders: async ({ page = 1, limit = 20, status = 'all', search = '', startDate = '', endDate = '' }) => {
        const cacheKey = `${page}_${limit}_${status}_${search}_${startDate}_${endDate}`;
        const cached = adminOrdersCache[cacheKey];
        if (cached && Date.now() - cached.ts < ADMIN_CACHE_TTL) {
            return cached.data;
        }
        const query = `?page=${page}&limit=${limit}&status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
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
    getMyOrders: async () => {
        const res = await fetch(`${API_URL}/my`, { headers: getAuthHeader() });
        return handleResponse(res);
    },
    clearAdminCache: () => {
        adminOrdersCache = {};
    }
};
