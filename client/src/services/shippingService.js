const API_URL = import.meta.env.PROD
  ? '/api'
  : 'http://localhost:5000/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  if (!token || token === 'undefined' || token === 'null') {
    return { 'Content-Type': 'application/json' };
  }
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
};

const handleResponse = async (res) => {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Request failed');
  }
  return res.json();
};

export const shippingService = {
  getZones: async () => {
    const res = await fetch(`${API_URL}/shipping/zones`);
    return handleResponse(res);
  },
  getAdminZones: async () => {
    const res = await fetch(`${API_URL}/admin/shipping/zones`, { headers: getAuthHeader() });
    return handleResponse(res);
  },
  createZone: async (payload) => {
    const res = await fetch(`${API_URL}/admin/shipping/zones`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  },
  updateZone: async (id, payload) => {
    const res = await fetch(`${API_URL}/admin/shipping/zones/${id}`, {
      method: 'PUT',
      headers: getAuthHeader(),
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  },
  deleteZone: async (id) => {
    const res = await fetch(`${API_URL}/admin/shipping/zones/${id}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
    return handleResponse(res);
  }
};
