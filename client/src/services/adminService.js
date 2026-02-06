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

    // IMPORTANT: Clear cache when data changes!
    clearCache: () => {
        console.log("Invalidating Cache...");
        userCache = {};
    }
};
