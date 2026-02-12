import { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { productService } from '../services/productService';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // 1. Check Session on Mount (The "Auto-Login" Logic)
    useEffect(() => {
        const initAuth = async () => {
            const token = localStorage.getItem('token');
            const storedUser = localStorage.getItem('user');

            // [FIX] Strict check to ensure token is not the string "undefined" or "null"
            if (token && token !== "undefined" && token !== "null") {
                try {
                    if (!authService.isTokenExpired(token)) {
                        // Validate session and fetch latest user (role included) from server.
                        const data = await authService.getProfile();
                        if (data?.user) {
                            localStorage.setItem('user', JSON.stringify(data.user));
                            setUser(data.user);
                        } else {
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
            setLoading(false);
        };
        initAuth();
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

    // 3. Centralized Logout Function
    const performLogout = async () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        try { await signOut(auth); } catch (e) { console.error(e); }
        setUser(null); // Updates Navbar instantly!
        productService.clearCache();
    };

    return (
        <AuthContext.Provider value={{ user, login, logout: performLogout, updateUser, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
