const API_URL = import.meta.env.PROD 
  ? '/api/cart' 
  : 'http://localhost:5000/api/cart';

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

export const cartService = {
    getCart: async () => {
        const res = await fetch(`${API_URL}`, { headers: getAuthHeader() });
        return handleResponse(res);
    },
    addItem: async ({ productId, variantId = '', quantity = 1 }) => {
        const res = await fetch(`${API_URL}/items`, {
            method: 'POST',
            headers: getAuthHeader(),
            body: JSON.stringify({ productId, variantId, quantity })
        });
        return handleResponse(res);
    },
    updateItem: async ({ productId, variantId = '', quantity }) => {
        const res = await fetch(`${API_URL}/items`, {
            method: 'PATCH',
            headers: getAuthHeader(),
            body: JSON.stringify({ productId, variantId, quantity })
        });
        return handleResponse(res);
    },
    removeItem: async ({ productId, variantId = '' }) => {
        const res = await fetch(`${API_URL}/items`, {
            method: 'DELETE',
            headers: getAuthHeader(),
            body: JSON.stringify({ productId, variantId })
        });
        return handleResponse(res);
    },
    clearCart: async () => {
        const res = await fetch(`${API_URL}`, {
            method: 'DELETE',
            headers: getAuthHeader()
        });
        return handleResponse(res);
    },
    bulkAdd: async (items = []) => {
        const res = await fetch(`${API_URL}/bulk`, {
            method: 'POST',
            headers: getAuthHeader(),
            body: JSON.stringify({ items })
        });
        return handleResponse(res);
    }
};
