const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const CATEGORY_STATS_CACHE_KEY = 'category_stats_cache_v1';
const API_URL = import.meta.env.PROD 
  ? '/api/products' 
  : 'http://localhost:5000/api/products';

// --- CACHE STORAGE ---
let productCache = {};

const buildProductsCacheKey = (page, category, status, sort, limit) =>
    `page${page}_limit${limit}_cat${category}_stat${status}_sort${sort}`;

const parseProductsCacheKey = (key = '') => {
    const match = /^page(\d+)_limit(\d+)_cat(.+)_stat(.+)_sort(.+)$/.exec(String(key));
    if (!match) return null;
    return {
        page: Number(match[1]),
        limit: Number(match[2]),
        category: match[3],
        status: match[4],
        sort: match[5]
    };
};

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const matchesCategory = (product, category) => {
    if (normalizeText(category) === 'all') return true;
    const categories = Array.isArray(product?.categories) ? product.categories : [];
    const wanted = normalizeText(category);
    return categories.some((entry) => normalizeText(entry) === wanted);
};

const matchesStatus = (product, status) => {
    if (normalizeText(status) === 'all') return true;
    return normalizeText(product?.status) === normalizeText(status);
};

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
        try { localStorage.removeItem(CATEGORY_STATS_CACHE_KEY); } catch {}
    },
    // --- GET PRODUCTS (With Caching) ---
    getProducts: async (page = 1, category = 'all', status = 'all', sort = 'newest', limit = 10) => {
        // [NEW] Include sort + limit in cache key
        const cacheKey = buildProductsCacheKey(page, category, status, sort, limit);

        const cached = productCache[cacheKey];
        if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
            return cached.data;
        }

        // [NEW] Add sort to query string (and timestamp for cache busting)
        const query = `?page=${page}&limit=${limit}&category=${category}&status=${status}&sort=${sort}&_t=${Date.now()}`;
        const res = await fetch(`${API_URL}${query}`, { 
            headers: { 
                ...getAuthHeader(),
                'Content-Type': 'application/json' 
            }
        });
        const data = await handleResponse(res);

        productCache[cacheKey] = { data, timestamp: Date.now() };
        return data;
    },
    clearProductsCache: ({ category, status, sort, limit } = {}) => {
        const keys = Object.keys(productCache);
        keys.forEach((key) => {
            if (!key.startsWith('page')) return;
            if (category && !key.includes(`_cat${category}_`)) return;
            if (status && !key.includes(`_stat${status}_`)) return;
            if (sort && !key.includes(`_sort${sort}`)) return;
            if (limit && !key.includes(`_limit${limit}_`)) return;
            delete productCache[key];
        });
    },
    invalidateCategoryStatsCache: () => {
        delete productCache['category_stats'];
        try { localStorage.removeItem(CATEGORY_STATS_CACHE_KEY); } catch {}
    },
    invalidateCategoryListCache: () => {
        delete productCache['all_categories'];
    },
    removeProductFromProductsCache: (productId) => {
        const id = String(productId || '');
        if (!id) return;

        const keys = Object.keys(productCache);
        keys.forEach((key) => {
            if (!key.startsWith('page')) return;
            const entry = productCache[key];
            const data = entry?.data;
            const list = Array.isArray(data?.products) ? data.products : null;
            if (!list) return;
            const next = list.filter((item) => String(item?.id || '') !== id);
            if (next.length === list.length) return;
            productCache[key] = {
                ...entry,
                timestamp: Date.now(),
                data: {
                    ...data,
                    products: next
                }
            };
        });

        delete productCache[`product_${id}`];
    },
    patchProductInProductsCache: (updatedProduct, { sorts = [] } = {}) => {
        if (!updatedProduct || updatedProduct.id == null) return;
        const allowedSorts = Array.isArray(sorts) && sorts.length ? new Set(sorts.map((v) => String(v))) : null;
        const productId = String(updatedProduct.id);
        const keys = Object.keys(productCache);

        keys.forEach((key) => {
            if (!key.startsWith('page')) return;
            const meta = parseProductsCacheKey(key);
            if (!meta) return;
            if (allowedSorts && !allowedSorts.has(String(meta.sort))) return;

            const entry = productCache[key];
            const data = entry?.data;
            const list = Array.isArray(data?.products) ? data.products : null;
            if (!list || list.length === 0) return;

            let touched = false;
            const nextProducts = [];
            list.forEach((product) => {
                if (String(product?.id) !== productId) {
                    nextProducts.push(product);
                    return;
                }
                touched = true;
                const merged = { ...product, ...updatedProduct };
                const keep = matchesCategory(merged, meta.category) && matchesStatus(merged, meta.status);
                if (keep) nextProducts.push(merged);
            });

            if (!touched) return;
            productCache[key] = {
                ...entry,
                timestamp: Date.now(),
                data: {
                    ...data,
                    products: nextProducts
                }
            };
        });

        const singleKey = `product_${productId}`;
        if (productCache[singleKey]?.data) {
            productCache[singleKey] = {
                ...productCache[singleKey],
                timestamp: Date.now(),
                data: { ...productCache[singleKey].data, ...updatedProduct }
            };
        }
    },

    
    // [NEW] Get Single Product by ID (with variants)
    getProduct: async (id) => {
        try {
            // [FIX] Use object bracket notation instead of .get()
            const cached = productCache[`product_${id}`];
            
            if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
                return cached.data;
            }
            const res = await fetch(`${API_URL}/${id}`);
            const data = await handleResponse(res);
            
            
            // [FIX] Use object assignment instead of .set()
            productCache[`product_${id}`] = {
                data: data,
                timestamp: Date.now()
            };

            return data;
        } catch (error) {
            console.error("Error fetching product details:", error);
            throw error;
        }
    },
    // --- GET CATEGORIES (With Caching) ---
    getCategories: async () => {
        // 1. Check Cache
        const cached = productCache['all_categories'];
        if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
            console.log("Returning categories from cache");
            return cached.data;
        }

        // 2. Fetch if missing
        const res = await fetch(`${API_URL}/categories`);
        const data = await handleResponse(res);

        // 3. Store in Cache
        productCache['all_categories'] = { data, timestamp: Date.now() };
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

    // --- CATEGORY MANAGEMENT ---
    getCategoryStats: async (force = false) => {
        if (force) {
            try { localStorage.removeItem(CATEGORY_STATS_CACHE_KEY); } catch {}
            delete productCache['category_stats'];
        }
        const cached = productCache['category_stats'];
        if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
            return cached.data;
        }

        try {
            const raw = localStorage.getItem(CATEGORY_STATS_CACHE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed?.data && (Date.now() - parsed.timestamp < CACHE_DURATION)) {
                    productCache['category_stats'] = parsed;
                    return parsed.data;
                }
            }
        } catch {}

        const res = await fetch(`${API_URL}/categories/stats`);
        const data = await handleResponse(res);
        const payload = { data, timestamp: Date.now() };
        productCache['category_stats'] = payload;
        try { localStorage.setItem(CATEGORY_STATS_CACHE_KEY, JSON.stringify(payload)); } catch {}
        return data;
    },
    patchCategoryStatsCache: (updater) => {
        try {
            const raw = localStorage.getItem(CATEGORY_STATS_CACHE_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            const current = parsed?.data || [];
            const next = updater(Array.isArray(current) ? current : []);
            const payload = { data: next, timestamp: Date.now() };
            productCache['category_stats'] = payload;
            localStorage.setItem(CATEGORY_STATS_CACHE_KEY, JSON.stringify(payload));
        } catch {}
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
