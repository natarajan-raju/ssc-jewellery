/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { productService } from '../services/productService';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // 3. Centralized Logout Function
    const performLogout = async () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        try { await signOut(auth); } catch (e) { console.error(e); }
        setUser(null); // Updates Navbar instantly!
        productService.clearCache();
    };

    // 1. Check Session on Mount (The "Auto-Login" Logic)
    useEffect(() => {
        let cancelled = false;
        const initAuth = async () => {
            const token = localStorage.getItem('token');
            const storedUser = localStorage.getItem('user');
            let parsedStoredUser = null;
            try {
                parsedStoredUser = storedUser ? JSON.parse(storedUser) : null;
            } catch {
                parsedStoredUser = null;
            }

            // [FIX] Strict check to ensure token is not the string "undefined" or "null"
            if (token && token !== "undefined" && token !== "null") {
                try {
                    if (!authService.isTokenExpired(token)) {
                        // Hydrate immediately from cache so navbar tier/profile render instantly.
                        if (parsedStoredUser && typeof parsedStoredUser === 'object') {
                            if (!cancelled) setUser(parsedStoredUser);
                            if (!cancelled) setLoading(false);
                        }

                        // Refresh latest profile + loyalty in background and merge into auth state.
                        const [profileResult, loyaltyResult] = await Promise.allSettled([
                            authService.getProfile(),
                            authService.getLoyaltyStatus()
                        ]);

                        if (cancelled) return;

                        const profileUser = (
                            profileResult.status === 'fulfilled'
                                ? profileResult.value?.user || null
                                : null
                        );
                        const loyaltyStatus = (
                            loyaltyResult.status === 'fulfilled'
                                ? loyaltyResult.value?.status || null
                                : null
                        );

                        if (profileUser) {
                            const mergedUser = {
                                ...profileUser,
                                ...(loyaltyStatus?.tier ? { loyaltyTier: String(loyaltyStatus.tier).toLowerCase() } : {}),
                                ...(loyaltyStatus?.profile ? { loyaltyProfile: loyaltyStatus.profile } : {})
                            };
                            localStorage.setItem('user', JSON.stringify(mergedUser));
                            setUser(mergedUser);
                        } else if (!parsedStoredUser) {
                            await performLogout();
                        }
                    } else {
                        await performLogout();
                    }
                } catch (error) {
                    console.error("Session restoration failed:", error);
                    await performLogout();
                }
            } else {
                if (token || storedUser) {
                    await performLogout();
                }
            }
            if (!cancelled) setLoading(false);
        };
        initAuth();
        return () => {
            cancelled = true;
        };
    }, []);

    // 2. Centralized Login Function
    const login = (token, userData) => {
        if (!token) return; // [NEW] Stop if token is missing
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        productService.clearCache(); // Avoid stale data after login
    };

    const updateUser = (updates) => {
        setUser((prev) => {
            if (!prev) return prev;
            const next = { ...prev, ...updates };
            localStorage.setItem('user', JSON.stringify(next));
            return next;
        });
    };

    return (
        <AuthContext.Provider value={{ user, login, logout: performLogout, updateUser, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
