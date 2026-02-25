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
  const parseJsonSafely = async () => {
    const raw = await res.text().catch(() => '');
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
  };
  if (!res.ok) {
    const data = await parseJsonSafely();
    throw new Error(data.message || 'Request failed');
  }
  return parseJsonSafely();
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
