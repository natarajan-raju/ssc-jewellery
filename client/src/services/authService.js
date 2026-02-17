const API_URL = import.meta.env.PROD 
  ? '/api/auth' 
  : 'http://localhost:5000/api/auth';

export const authService = {
  getAuthHeader: () => {
    const token = localStorage.getItem('token');
    if (!token || token === 'undefined' || token === 'null') {
      return { 'Content-Type': 'application/json' };
    }
    return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  },
  getAuthTokenHeader: () => {
    const token = localStorage.getItem('token');
    if (!token || token === 'undefined' || token === 'null') {
      return {};
    }
    return { 'Authorization': `Bearer ${token}` };
  },
  sendOtp: async (mobile) => {
    const res = await fetch(`${API_URL}/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile })
    });
    return res.json();
  },
  verifyOtp: async (mobile, otp) => {
    const res = await fetch(`${API_URL}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, otp })
    });
    return res.json();
  },

  register: async (userData) => {
    const res = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    return res.json();
  },

  login: async (payload) => {
    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },
  googleLogin: async (idToken) => {
    const res = await fetch(`${API_URL}/google-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    return res.json();
  },
  getProfile: async () => {
    const res = await fetch(`${API_URL}/profile`, {
      method: 'GET',
      headers: authService.getAuthHeader()
    });
    return res.json();
  },
  getLoyaltyStatus: async () => {
    const res = await fetch(`${API_URL}/loyalty-status`, {
      method: 'GET',
      headers: authService.getAuthHeader()
    });
    return res.json();
  },
  updateProfile: async (payload) => {
    const res = await fetch(`${API_URL}/profile`, {
      method: 'PUT',
      headers: authService.getAuthHeader(),
      body: JSON.stringify(payload)
    });
    return res.json();
  },
  uploadProfileImage: async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`${API_URL.replace('/auth', '')}/uploads/profile-image`, {
      method: 'POST',
      headers: authService.getAuthTokenHeader(),
      body: formData
    });
    return res.json();
  },

  resetPassword: async (payload) => {
    const res = await fetch(`${API_URL}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return res.json();
  },
  isTokenExpired: (token) => {
    if (!token) return true;
    try {
        // Decode the payload (2nd part of JWT)
        const payload = JSON.parse(atob(token.split('.')[1]));
        
        // Check if current time is past expiration (exp is in seconds, Date.now is ms)
        return payload.exp * 1000 < Date.now();
    } catch (e) {
        return true; // If invalid format, treat as expired
    }
  }
};
