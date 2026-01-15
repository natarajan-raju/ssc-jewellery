const API_URL = import.meta.env.PROD 
  ? '/api/admin' 
  : 'http://localhost:5000/api/admin';

// --- FIX: Robust Token Retrieval ---
const getAuthHeader = () => {
    let token = null;

    // 1. Try finding token in 'user' object (Pattern used in Customers.jsx)
    const userObj = JSON.parse(localStorage.getItem('user') || '{}');
    if (userObj.token) token = userObj.token;

    // 2. Fallback: Try 'userInfo' object (Common pattern)
    if (!token) {
        const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        if (userInfo.token) token = userInfo.token;
    }

    // 3. Fallback: Try direct 'token' string
    if (!token) {
        token = localStorage.getItem('token');
    }

    return { 
        'Authorization': `Bearer ${token}`, 
        'Content-Type': 'application/json' 
    };
};

export const adminService = {
    getUsers: async () => {
        const res = await fetch(`${API_URL}/users`, { headers: getAuthHeader() });
        if (!res.ok) throw new Error('Unauthorized');
        return res.json();
    },
    deleteUser: async (id) => {
        const res = await fetch(`${API_URL}/users/${id}`, { 
            method: 'DELETE',
            headers: getAuthHeader() 
        });
        return res.json();
    },
    resetPassword: async (id, newPassword) => {
        const res = await fetch(`${API_URL}/users/${id}/reset-password`, { 
            method: 'PUT',
            headers: getAuthHeader(),
            body: JSON.stringify({ newPassword })
        });
        return res.json();
    },
    createUser: async (userData) => {
        const res = await fetch(`${API_URL}/users`, { 
            method: 'POST',
            headers: getAuthHeader(),
            body: JSON.stringify(userData)
        });
        // Handle non-200 errors specifically to parse backend message
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'Failed to create user');
        }
        return res.json();
    }
};