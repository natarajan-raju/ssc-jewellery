import { dispatchSessionExpired, getStoredToken, shouldTreatAsExpiredSession } from '../utils/authSession';

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const SEARCH_CACHE_DURATION = 2 * 60 * 1000; // 2 minutes
const CATEGORY_STATS_CACHE_KEY = 'category_stats_cache_v1';
const API_URL = import.meta.env.PROD 
  ? '/api/products' 
  : 'http://localhost:5000/api/products';

// --- CACHE STORAGE ---
let productCache = {};

const buildProductsCacheKey = (page, category, status, sort, limit, categoryId = '') =>
    `page${page}_limit${limit}_cat${category}_catid${categoryId || ''}_stat${status}_sort${sort}`;
const buildSearchCacheKey = ({
    query = '',
    page = 1,
    limit = 40,
    category = 'all',
    status = 'active',
    sort = 'relevance',
    inStockOnly = false,
    minPrice = '',
    maxPrice = ''
} = {}) =>
    `search_q${String(query || '').trim().toLowerCase()}_p${page}_l${limit}_cat${category}_stat${status}_sort${sort}_stock${inStockOnly ? 1 : 0}_min${minPrice ?? ''}_max${maxPrice ?? ''}`;

const parseProductsCacheKey = (key = '') => {
    const match = /^page(\d+)_limit(\d+)_cat(.*)_catid(.*)_stat(.+)_sort(.+)$/.exec(String(key));
    if (!match) return null;
    return {
        page: Number(match[1]),
        limit: Number(match[2]),
        category: match[3],
        categoryId: match[4],
        status: match[5],
        sort: match[6]
    };
};

const normalizeText = (value) => String(value || '').trim().toLowerCase();
const getCurrentClientRole = () => {
    const userObj = safeLocalStorageJson('user', {});
    const userInfo = safeLocalStorageJson('userInfo', {});
    return normalizeText(userObj?.role || userInfo?.role || '');
};
const canViewAdminCategoryData = () => ['admin', 'staff'].includes(getCurrentClientRole());
const filterPublicCategoryStats = (data = []) => (
    (Array.isArray(data) ? data : []).filter((category) =>
        category &&
        typeof category.name === 'string' &&
        category.name.trim().length > 0 &&
        Number(category.product_count || 0) > 0
    )
);
const filterPublicCategoryNames = (data = []) => (
    (Array.isArray(data) ? data : []).filter((name) => typeof name === 'string' && name.trim().length > 0)
);

const matchesCategory = (product, category) => {
    const normalizedCategory = normalizeText(category);
    if (normalizedCategory === 'all') return true;
    const categories = Array.isArray(product?.categories) ? product.categories : [];
    if (normalizedCategory === 'uncategorized') return categories.length === 0;
    const wanted = normalizedCategory;
    return categories.some((entry) => normalizeText(entry) === wanted);
};

const matchesStatus = (product, status) => {
    if (normalizeText(status) === 'all') return true;
    return normalizeText(product?.status) === normalizeText(status);
};
const safeLocalStorageJson = (key, fallback = {}) => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
        return fallback;
    }
};

// --- AUTH HEADER HELPER ---
const getAuthHeader = () => {
    const userObj = safeLocalStorageJson('user', {});
    const userInfo = safeLocalStorageJson('userInfo', {});
    const token = userObj.token || userInfo.token || getStoredToken();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
};

const handleResponse = async (res) => {
    const parseJsonSafely = async () => {
        const raw = await res.text().catch(() => '');
        if (!raw) return {};
        try { return JSON.parse(raw); } catch { return {}; }
    };
    if (!res.ok) {
        const err = await parseJsonSafely();
        if (shouldTreatAsExpiredSession(res.status, err.message || res.statusText)) {
            dispatchSessionExpired(err.message || 'Session expired. Please login again.');
        }
        throw new Error(err.message || res.statusText || 'Server Error');
    }
    return parseJsonSafely();
};

export const productService = {
    clearCache: () => {
        productCache = {};
        try { localStorage.removeItem(CATEGORY_STATS_CACHE_KEY); } catch { /* ignore storage errors */ }
    },
    // --- GET PRODUCTS (With Caching) ---
    getProducts: async (page = 1, category = 'all', status = 'all', sort = 'newest', limit = 10, categoryId = null, { forceRefresh = false } = {}) => {
        // [NEW] Include sort + limit in cache key
        const cacheKey = buildProductsCacheKey(page, category, status, sort, limit, categoryId || '');

        const cached = productCache[cacheKey];
        if (!forceRefresh && cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
            return cached.data;
        }

        // Use URLSearchParams so category names like "Bangles & Bracelet" are encoded safely.
        const params = new URLSearchParams({
            page: String(page),
            limit: String(limit),
            category: String(category || 'all'),
            status: String(status || 'all'),
            sort: String(sort || 'newest')
        });
        if (forceRefresh) params.set('force', '1');
        if (categoryId) params.set('categoryId', String(categoryId));
        const res = await fetch(`${API_URL}?${params.toString()}`, {
            headers: { 
                ...getAuthHeader(),
                'Content-Type': 'application/json' 
            }
        });
        const data = await handleResponse(res);

        productCache[cacheKey] = { data, timestamp: Date.now() };
        return data;
    },
    searchProducts: async ({
        query = '',
        page = 1,
        limit = 40,
        category = 'all',
        status = 'active',
        sort = 'relevance',
        inStockOnly = false,
        minPrice = '',
        maxPrice = ''
    } = {}, { signal, force = false } = {}) => {
        const cleanQuery = String(query || '').trim();
        if (!cleanQuery) {
            return { products: [], total: 0, totalPages: 0, page: 1, limit: 0 };
        }
        const cacheKey = buildSearchCacheKey({
            query: cleanQuery,
            page,
            limit,
            category,
            status,
            sort,
            inStockOnly,
            minPrice,
            maxPrice
        });
        const cached = productCache[cacheKey];
        if (!force && cached && (Date.now() - cached.timestamp < SEARCH_CACHE_DURATION)) {
            return cached.data;
        }

        const params = new URLSearchParams({
            q: cleanQuery,
            page: String(page),
            limit: String(limit),
            category: String(category || 'all'),
            status: String(status || 'active'),
            sort: String(sort || 'relevance')
        });
        if (inStockOnly) params.set('inStockOnly', 'true');
        if (minPrice !== '' && minPrice != null) params.set('minPrice', String(minPrice));
        if (maxPrice !== '' && maxPrice != null) params.set('maxPrice', String(maxPrice));

        const res = await fetch(`${API_URL}/search?${params.toString()}`, {
            headers: {
                ...getAuthHeader(),
                'Content-Type': 'application/json'
            },
            signal
        });
        const data = await handleResponse(res);
        productCache[cacheKey] = { data, timestamp: Date.now() };
        return data;
    },
    clearProductsCache: ({ category, status, sort, limit } = {}) => {
        const keys = Object.keys(productCache);
        keys.forEach((key) => {
            if (key.startsWith('search_')) {
                if (category && !key.includes(`_cat${category}_`)) return;
                delete productCache[key];
                return;
            }
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
        try { localStorage.removeItem(CATEGORY_STATS_CACHE_KEY); } catch { /* ignore storage errors */ }
    },
    invalidateCategoryListCache: () => {
        delete productCache['all_categories'];
    },
    removeProductFromProductsCache: (productId) => {
        const id = String(productId || '');
        if (!id) return;

        const keys = Object.keys(productCache);
        keys.forEach((key) => {
            if (key.startsWith('search_')) {
                delete productCache[key];
                return;
            }
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
            if (key.startsWith('search_')) delete productCache[key];
        });

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
            const res = await fetch(`${API_URL}/${id}`, {
                headers: getAuthHeader()
            });
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
            return canViewAdminCategoryData() ? cached.data : filterPublicCategoryNames(cached.data);
        }

        // 2. Fetch if missing
        const res = await fetch(`${API_URL}/categories`);
        const data = await handleResponse(res);

        // 3. Store in Cache
        productCache['all_categories'] = { data, timestamp: Date.now() };
        return canViewAdminCategoryData() ? data : filterPublicCategoryNames(data);
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
            try { localStorage.removeItem(CATEGORY_STATS_CACHE_KEY); } catch { /* ignore storage errors */ }
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
                    return canViewAdminCategoryData() ? parsed.data : filterPublicCategoryStats(parsed.data);
                }
            }
        } catch {
            // Ignore corrupt or unavailable local storage cache.
        }

        const res = await fetch(`${API_URL}/categories/stats`);
        const data = await handleResponse(res);
        const payload = { data, timestamp: Date.now() };
        productCache['category_stats'] = payload;
        try { localStorage.setItem(CATEGORY_STATS_CACHE_KEY, JSON.stringify(payload)); } catch { /* ignore storage errors */ }
        return canViewAdminCategoryData() ? data : filterPublicCategoryStats(data);
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
        } catch {
            // Ignore local storage cache update failures.
        }
    },

    getCategoryDetails: async (id) => {
        const res = await fetch(`${API_URL}/categories/${id}`, {
            headers: getAuthHeader()
        });
        return handleResponse(res);
    },

    // [UPDATED] Update Category (Supports Image)
    updateCategory: async (id, formData) => {
        const token = getStoredToken();
        const res = await fetch(`${API_URL}/categories/${id}`, {
            method: 'PUT',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData
        });
        const data = await res.json();
        if (!res.ok) {
            if (shouldTreatAsExpiredSession(res.status, data?.message || res.statusText)) {
                dispatchSessionExpired(data?.message || 'Session expired. Please login again.');
            }
            throw new Error(data.message || 'Failed to update category');
        }
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
    manageCategoryProductsBulk: async (categoryId, productIds = [], action) => {
        const res = await fetch(`${API_URL}/categories/${categoryId}/products/bulk`, {
            method: 'POST',
            headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ productIds, action })
        });
        return handleResponse(res);
    },

    // [UPDATED] Create Category (Supports Image)
    createCategory: async (formData) => {
        const token = getStoredToken();
        // Note: Do NOT set Content-Type header for FormData; browser sets boundary automatically
        const res = await fetch(`${API_URL}/categories`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData
        });
        const data = await res.json();
        if (!res.ok) {
            if (shouldTreatAsExpiredSession(res.status, data?.message || res.statusText)) {
                dispatchSessionExpired(data?.message || 'Session expired. Please login again.');
            }
            throw new Error(data.message || 'Failed to create category');
        }
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
