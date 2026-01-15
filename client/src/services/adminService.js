const API_URL = import.meta.env.PROD 
  ? '/api/admin' 
  : 'http://localhost:5000/api/admin';

// 1. Get Token Securely
const getAuthHeader = () => {
    let token = null;
    const userObj = JSON.parse(localStorage.getItem('user') || '{}');
    const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
    token = userObj.token || userInfo.token || localStorage.getItem('token');

    return { 
        'Authorization': `Bearer ${token}`, 
        'Content-Type': 'application/json' 
    };
};

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
    getUsers: async () => {
        const res = await fetch(`${API_URL}/users`, { headers: getAuthHeader() });
        return handleResponse(res);
    },

    deleteUser: async (id) => {
        const res = await fetch(`${API_URL}/users/${id}`, { 
            method: 'DELETE',
            headers: getAuthHeader() 
        });
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
        return handleResponse(res);
    }
};