import { useAuth } from '../context/AuthContext';
import { useCallback } from 'react';

const API_URL = import.meta.env.PROD 
  ? '/api/cms' 
  : 'http://localhost:5000/api/cms';

export const useCms = () => {
    const { logout } = useAuth(); // [NEW] We can now access Context!

    // Helper to handle Fetch with Auth
    const authFetch = useCallback(async (endpoint, options = {}) => {
        const token = localStorage.getItem('token');
        
        const headers = { ...options.headers };
        if (token && token !== "undefined" && token !== "null") {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

        // [NEW] Security Feature: Auto-Logout on 401
        if (res.status === 401) {
            logout(); 
            throw new Error("Session expired. Please login again.");
        }

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.message || 'API Error');
        }

        return res.json();
    }, [logout]);

    // 1. Get Slides (Public or Admin)
    const getSlides = useCallback(async (isAdmin = false) => {
        // Public requests don't need the authFetch wrapper if strict, 
        // but using it is fine as public endpoints ignore the header.
        const token = localStorage.getItem('token');
        const headers = {};
        // [FIX] Prevent sending "Bearer undefined"
        if (isAdmin && token && token !== "undefined") {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch(`${API_URL}/hero?admin=${isAdmin}`, { headers });
        if (res.status === 401 && isAdmin) {
            logout();
            throw new Error("Session expired");
        }
        return res.json();
    }, [logout]);

    // 2. Create Slide
    const createSlide = useCallback(async (formData) => {
        // Note: FormData does not need Content-Type header
        return authFetch('/hero', {
            method: 'POST',
            body: formData
        });
    }, [authFetch]);

    // 3. Delete Slide
    const deleteSlide = useCallback(async (id) => {
        return authFetch(`/hero/${id}`, {
            method: 'DELETE'
        });
    }, [authFetch]);

    // 4. Reorder Slides
    const reorderSlides = useCallback(async (slideIds) => {
        return authFetch('/hero/reorder', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slideIds })
        });
    }, [authFetch]);

    // 5. Update Slide
    const updateSlide = useCallback(async (id, data) => {
        return authFetch(`/hero/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    }, [authFetch]);

    return { getSlides, createSlide, deleteSlide, reorderSlides, updateSlide };
};