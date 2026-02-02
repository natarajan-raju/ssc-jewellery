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
    // 1. Check if token exists and is not a "garbage" string
    if (!token || token === 'undefined' || token === 'null') {
        return {}; // Return empty object so no Authorization header is sent
    }
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
    clearCache: () => {
        productCache = {};
    },
    // --- GET PRODUCTS (With Caching) ---
    getProducts: async (page = 1, category = 'all', status = 'all', sort = 'newest') => {
        // [NEW] Include sort in cache key
        const cacheKey = `page${page}_cat${category}_stat${status}_sort${sort}`;

        if (productCache[cacheKey]) {
            return productCache[cacheKey];
        }

        // [NEW] Add sort to query string (and timestamp for cache busting)
        const query = `?page=${page}&limit=10&category=${category}&status=${status}&sort=${sort}&_t=${Date.now()}`;
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
        const res = await fetch(`${API_URL}/categories`);
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
    },

    // --- CATEGORY MANAGEMENT ---
    getCategoryStats: async () => {
        const res = await fetch(`${API_URL}/categories/stats`);
        return handleResponse(res);
    },

    getCategoryDetails: async (id) => {
        const res = await fetch(`${API_URL}/categories/${id}`);
        return handleResponse(res);
    },

    // [UPDATED] Update Category (Supports Image)
    updateCategory: async (id, formData) => {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/categories/${id}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to update category');
        return data;
    },

    reorderCategory: async (id, productIds) => {
        const res = await fetch(`${API_URL}/categories/${id}/reorder`, {
            method: 'PUT',
            headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ productIds })
        });
        return handleResponse(res);
    },

    manageCategoryProduct: async (categoryId, productId, action) => {
        // action = 'add' or 'remove'
        const res = await fetch(`${API_URL}/categories/${categoryId}/products`, {
            method: 'POST',
            headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId, action })
        });
        return handleResponse(res);
    },

    // [UPDATED] Create Category (Supports Image)
    createCategory: async (formData) => {
        const token = localStorage.getItem('token');
        // Note: Do NOT set Content-Type header for FormData; browser sets boundary automatically
        const res = await fetch(`${API_URL}/categories`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to create category');
        return data;
    },

    deleteCategory: async (id) => {
        const res = await fetch(`${API_URL}/categories/${id}`, {
            method: 'DELETE',
            headers: getAuthHeader()
        });
        return handleResponse(res);
    },
};