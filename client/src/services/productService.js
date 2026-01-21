const API_URL = import.meta.env.PROD 
  ? '/api/products' 
  : 'http://localhost:5000/api/products';

// --- CACHE STORAGE ---
let productCache = {};

// --- AUTH HEADER HELPER ---
const getAuthHeader = () => {
    let token = null;
    const userObj = JSON.parse(localStorage.getItem('user') || '{}');
    const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
    token = userObj.token || userInfo.token || localStorage.getItem('token');

    return { 
        'Authorization': `Bearer ${token}`
        // Note: Content-Type is NOT set here because FormData sets it automatically
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

export const productService = {
    // --- GET PRODUCTS (With Caching) ---
    getProducts: async (page = 1, category = 'all', status = 'all') => {
        const cacheKey = `page${page}_cat${category}_stat${status}`;

        if (productCache[cacheKey]) {
            return productCache[cacheKey];
        }

        const query = `?page=${page}&limit=10&category=${category}&status=${status}`;
        const res = await fetch(`${API_URL}${query}`, { 
            headers: { 
                ...getAuthHeader(),
                'Content-Type': 'application/json' 
            }
        });
        const data = await handleResponse(res);

        productCache[cacheKey] = data;
        return data;
    },

    // --- GET CATEGORIES (With Caching) ---
    getCategories: async () => {
        // 1. Check Cache
        if (productCache['all_categories']) {
            console.log("Returning categories from cache");
            return productCache['all_categories'];
        }

        // 2. Fetch if missing
        const res = await fetch(`${API_URL}/categories`, { 
            headers: getAuthHeader() 
        });
        const data = await handleResponse(res);

        // 3. Store in Cache
        productCache['all_categories'] = data;
        return data;
    },

    // --- CREATE PRODUCT (Multipart Form Data) ---
    createProduct: async (formData) => {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: getAuthHeader(), // Let browser set Content-Type for FormData
            body: formData
        });
        
        productCache = {}; // Clear cache on change
        return handleResponse(res);
    },

    updateProduct: async (id, formData) => {
        const res = await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            headers: getAuthHeader(), // Browser sets Content-Type for FormData
            body: formData
        });
        
        productCache = {}; // Clear cache so list refreshes
        return handleResponse(res);
    },

    // --- DELETE PRODUCT ---
    deleteProduct: async (id) => {
        const res = await fetch(`${API_URL}/${id}`, {
            method: 'DELETE',
            headers: { 
                ...getAuthHeader(),
                'Content-Type': 'application/json' 
            }
        });

        productCache = {}; // Clear cache
        return handleResponse(res);
    },

    // --- CLEAR CACHE MANUALLY ---
    clearCache: () => {
        productCache = {};
    }
};