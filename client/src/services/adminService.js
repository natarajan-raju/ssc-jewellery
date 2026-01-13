const API_URL = import.meta.env.PROD 
  ? '/api/admin' 
  : 'http://localhost:5000/api/admin';

const getAuthHeader = () => {
    const token = localStorage.getItem('token'); // We will assume you store token here
    return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
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