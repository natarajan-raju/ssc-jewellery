const API_URL = import.meta.env.PROD 
  ? '/api/admin' 
  : 'http://localhost:5000/api/admin';

// 1. Get Token Securely
const getAuthHeader = () => {
    const token = localStorage.getItem('token');

    // [FIX] Safety check: Return JSON header only if no token (prevents "Bearer null" error)
    if (!token || token === 'undefined' || token === 'null') {
        return { 'Content-Type': 'application/json' };
    }

    return { 
        'Authorization': `Bearer ${token}`, 
        'Content-Type': 'application/json' 
    };
};

// --- SIMPLE IN-MEMORY CACHE ---
let userCache = {};
let abandonedCache = {
    campaign: null,
    insights: {},
    journeys: {},
    timelines: {}
};
const ABANDONED_CACHE_TTL = 60 * 1000;

// 2. ERROR HANDLER (The Fix for "Fake Success")
const handleResponse = async (res) => {
    if (!res.ok) {
        try {
            const err = await res.json();
            throw new Error(err.message || 'Action failed');
        } catch (e) {
            // Pass the error message to the UI
            throw new Error(e.message || res.statusText || 'Server Error');
        }
    }
    return res.json();
};

export const adminService = {
    getUsers: async (page = 1, role = 'all', limit = 10) => {
        // 1. Create a unique key for this request (e.g., "page1_roleadmin")
        const cacheKey = `page${page}_role${role}_limit${limit}`;

        // 2. Check Cache
        if (userCache[cacheKey]) {
            console.log("Serving from Cache:", cacheKey); // Debug
            return userCache[cacheKey];
        }

        // 3. Fetch from Network
        const query = `?page=${page}&limit=${limit}&role=${role}`;
        const res = await fetch(`${API_URL}/users${query}`, { headers: getAuthHeader() });
        const data = await handleResponse(res);

        // 4. Save to Cache
        userCache[cacheKey] = data;
        return data;
    },

    deleteUser: async (id) => {
        const res = await fetch(`${API_URL}/users/${id}`, { 
            method: 'DELETE',
            headers: getAuthHeader() 
        });
        userCache = {};
        return handleResponse(res);
    },

    resetPassword: async (id, newPassword) => {
        // Sends 'password' to match controller expectation
        const res = await fetch(`${API_URL}/users/${id}/reset-password`, { 
            method: 'PUT',
            headers: getAuthHeader(),
            body: JSON.stringify({ password: newPassword }) 
        });
        return handleResponse(res);
    },

    createUser: async (userData) => {
        const res = await fetch(`${API_URL}/users`, { 
            method: 'POST',
            headers: getAuthHeader(),
            body: JSON.stringify(userData)
        });
        userCache = {};
        return handleResponse(res);
    },

    getUserCart: async (userId) => {
        const res = await fetch(`${API_URL}/users/${userId}/cart`, { headers: getAuthHeader() });
        return handleResponse(res);
    },

    getUsersAll: async (role = 'all') => {
        const all = [];
        let page = 1;
        let totalPages = 1;
        const pageSize = 200;
        do {
            const data = await adminService.getUsers(page, role, pageSize);
            const users = data.users || data || [];
            all.push(...users);
            totalPages = data.pagination?.totalPages || 1;
            page += 1;
        } while (page <= totalPages);
        return all;
    },

    getAbandonedCartCampaign: async () => {
        const cached = abandonedCache.campaign;
        if (cached && Date.now() - cached.ts < ABANDONED_CACHE_TTL) {
            return cached.data;
        }
        const res = await fetch(`${API_URL}/communications/abandoned-carts/campaign`, { headers: getAuthHeader() });
        const data = await handleResponse(res);
        abandonedCache.campaign = { ts: Date.now(), data };
        return data;
    },

    updateAbandonedCartCampaign: async (payload = {}) => {
        const res = await fetch(`${API_URL}/communications/abandoned-carts/campaign`, {
            method: 'PUT',
            headers: getAuthHeader(),
            body: JSON.stringify(payload || {})
        });
        const data = await handleResponse(res);
        abandonedCache.campaign = { ts: Date.now(), data };
        abandonedCache.journeys = {};
        abandonedCache.timelines = {};
        abandonedCache.insights = {};
        return data;
    },

    processAbandonedCartRecoveries: async (limit = 25) => {
        const res = await fetch(`${API_URL}/communications/abandoned-carts/process`, {
            method: 'POST',
            headers: getAuthHeader(),
            body: JSON.stringify({ limit })
        });
        const data = await handleResponse(res);
        abandonedCache.insights = {};
        abandonedCache.journeys = {};
        return data;
    },

    getAbandonedCartInsights: async (rangeDays = 30) => {
        const cacheKey = String(rangeDays);
        const cached = abandonedCache.insights[cacheKey];
        if (cached && Date.now() - cached.ts < ABANDONED_CACHE_TTL) {
            return cached.data;
        }
        const res = await fetch(`${API_URL}/communications/abandoned-carts/insights?rangeDays=${encodeURIComponent(rangeDays)}`, { headers: getAuthHeader() });
        const data = await handleResponse(res);
        abandonedCache.insights[cacheKey] = { ts: Date.now(), data };
        return data;
    },

    getAbandonedCartJourneys: async ({ status = 'all', search = '', sortBy = 'newest', limit = 50, offset = 0 } = {}) => {
        const cacheKey = `${status}::${search}::${sortBy}::${limit}::${offset}`;
        const cached = abandonedCache.journeys[cacheKey];
        if (cached && Date.now() - cached.ts < ABANDONED_CACHE_TTL) {
            return cached.data;
        }
        const query = `?status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}&sortBy=${encodeURIComponent(sortBy)}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`;
        const res = await fetch(`${API_URL}/communications/abandoned-carts/journeys${query}`, { headers: getAuthHeader() });
        const data = await handleResponse(res);
        abandonedCache.journeys[cacheKey] = { ts: Date.now(), data };
        return data;
    },

    getAbandonedCartJourneyTimeline: async (journeyId) => {
        const cacheKey = String(journeyId);
        const cached = abandonedCache.timelines[cacheKey];
        if (cached && Date.now() - cached.ts < ABANDONED_CACHE_TTL) {
            return cached.data;
        }
        const res = await fetch(`${API_URL}/communications/abandoned-carts/journeys/${journeyId}/timeline`, { headers: getAuthHeader() });
        const data = await handleResponse(res);
        abandonedCache.timelines[cacheKey] = { ts: Date.now(), data };
        return data;
    },
    getCompanyInfo: async () => {
        const res = await fetch(`${API_URL}/company-info`, { headers: getAuthHeader() });
        return handleResponse(res);
    },
    updateCompanyInfo: async (payload = {}) => {
        const res = await fetch(`${API_URL}/company-info`, {
            method: 'PUT',
            headers: getAuthHeader(),
            body: JSON.stringify(payload || {})
        });
        return handleResponse(res);
    },
    getLoyaltyConfig: async () => {
        const res = await fetch(`${API_URL}/loyalty/config`, { headers: getAuthHeader() });
        return handleResponse(res);
    },
    updateLoyaltyConfig: async (config = []) => {
        const res = await fetch(`${API_URL}/loyalty/config`, {
            method: 'PUT',
            headers: getAuthHeader(),
            body: JSON.stringify({ config })
        });
        return handleResponse(res);
    },

    patchAbandonedJourneyCache: (journey) => {
        if (!journey?.id) return;
        Object.keys(abandonedCache.journeys).forEach((cacheKey) => {
            const entry = abandonedCache.journeys[cacheKey];
            const rows = entry?.data?.journeys;
            if (!Array.isArray(rows)) return;
            const idx = rows.findIndex((row) => String(row.id) === String(journey.id));
            if (idx < 0) return;
            const nextRows = [...rows];
            nextRows[idx] = { ...nextRows[idx], ...journey };
            abandonedCache.journeys[cacheKey] = {
                ...entry,
                ts: Date.now(),
                data: { ...entry.data, journeys: nextRows }
            };
        });
        const timelineKey = String(journey.id);
        if (abandonedCache.timelines[timelineKey]?.data?.journey) {
            abandonedCache.timelines[timelineKey] = {
                ...abandonedCache.timelines[timelineKey],
                ts: Date.now(),
                data: {
                    ...abandonedCache.timelines[timelineKey].data,
                    journey: {
                        ...abandonedCache.timelines[timelineKey].data.journey,
                        ...journey
                    }
                }
            };
        }
    },

    invalidateAbandonedCache: () => {
        abandonedCache = {
            campaign: null,
            insights: {},
            journeys: {},
            timelines: {}
        };
    },

    // IMPORTANT: Clear cache when data changes!
    clearCache: () => {
        console.log("Invalidating Cache...");
        userCache = {};
        abandonedCache = {
            campaign: null,
            insights: {},
            journeys: {},
            timelines: {}
        };
    }
};
