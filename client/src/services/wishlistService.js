const API_URL = import.meta.env.PROD
    ? '/api/wishlist'
    : 'http://localhost:5000/api/wishlist';

const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    if (!token || token === 'undefined' || token === 'null') {
        return { 'Content-Type': 'application/json' };
    }
    return {
        Authorization: `Bearer ${token}`,
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

export const wishlistService = {
    getWishlist: async () => {
        const res = await fetch(`${API_URL}`, { headers: getAuthHeader() });
        return handleResponse(res);
    },
    addItem: async (productId) => {
        const res = await fetch(`${API_URL}/items`, {
            method: 'POST',
            headers: getAuthHeader(),
            body: JSON.stringify({ productId })
        });
        return handleResponse(res);
    },
    removeItem: async (productId) => {
        const res = await fetch(`${API_URL}/items`, {
            method: 'DELETE',
            headers: getAuthHeader(),
            body: JSON.stringify({ productId })
        });
        return handleResponse(res);
    },
    clearWishlist: async () => {
        const res = await fetch(`${API_URL}`, {
            method: 'DELETE',
            headers: getAuthHeader()
        });
        return handleResponse(res);
    }
};
