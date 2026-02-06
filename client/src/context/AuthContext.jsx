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
            if (token && storedUser && token !== "undefined" && token !== "null") {
                try {
                    // [FIX] Wrap checks in try-catch to prevent app crash on bad tokens
                    if (!authService.isTokenExpired(token)) {
                        // Valid Session found -> Restore User
                        setUser(JSON.parse(storedUser));
                    } else {
                        // Token expired -> Cleanup
                        await performLogout();
                    }
                } catch (error) {
                    console.error("Session restoration failed:", error);
                    await performLogout(); // Corrupt token? Clear it.
                }
            } else {
                // [FIX] If we have garbage data (like token="undefined"), clean it up
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

    // 3. Centralized Logout Function
    const performLogout = async () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        try { await signOut(auth); } catch (e) { console.error(e); }
        setUser(null); // Updates Navbar instantly!
        productService.clearCache();
    };

    return (
        <AuthContext.Provider value={{ user, login, logout: performLogout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
