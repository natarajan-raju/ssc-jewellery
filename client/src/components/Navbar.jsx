import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, User, LogOut, ShoppingCart, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useSocket } from '../context/SocketContext';
import { productService } from '../services/productService';
import logo from '/logo.webp';

export default function Navbar() {
    const { user, logout } = useAuth();
    const { itemCount, openCart } = useCart();
    const { socket } = useSocket();
    const [shakeCart, setShakeCart] = useState(false);
    const [popBadge, setPopBadge] = useState(false);
    const prevCountRef = useRef(itemCount);
    const navigate = useNavigate();
    const location = useLocation();
    
    // UI States
    const [isOpen, setIsOpen] = useState(false);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [isMegaOpen, setIsMegaOpen] = useState(false);
    const [categories, setCategories] = useState([]);
    const [isLoadingCategories, setIsLoadingCategories] = useState(false);
    const userMenuRef = useRef(null);
    const megaMenuRef = useRef(null);
    const megaTriggerRef = useRef(null);
    const refreshTimerRef = useRef(null);

   

    // Close User Menu on Click Outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
                setIsUserMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!isMegaOpen) return;
        const handleClickOutside = (event) => {
            if (megaMenuRef.current?.contains(event.target)) return;
            if (megaTriggerRef.current?.contains(event.target)) return;
            setIsMegaOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isMegaOpen]);

    useEffect(() => {
        if (itemCount > prevCountRef.current) {
            setShakeCart(true);
            setPopBadge(true);
            const t = setTimeout(() => setShakeCart(false), 400);
            const b = setTimeout(() => setPopBadge(false), 250);
            prevCountRef.current = itemCount;
            return () => { clearTimeout(t); clearTimeout(b); };
        }
        prevCountRef.current = itemCount;
    }, [itemCount]);

    const loadCategories = useCallback(async () => {
        setIsLoadingCategories(true);
        try {
            const data = await productService.getCategoryStats();
            const filtered = Array.isArray(data)
                ? data.filter((category) =>
                    category &&
                    typeof category.name === 'string' &&
                    category.name.trim().length > 0 &&
                    Number(category.product_count) > 0
                )
                : [];
            const sorted = filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setCategories(sorted);
        } catch (error) {
            console.error('Failed to load categories for mega menu', error);
            setCategories([]);
        } finally {
            setIsLoadingCategories(false);
        }
    }, []);

    useEffect(() => {
        loadCategories();
    }, [loadCategories]);

    useEffect(() => {
        if (!isMegaOpen) return;
        loadCategories();
    }, [isMegaOpen, loadCategories]);

    useEffect(() => {
        if (!socket) return;

        const scheduleRefresh = () => {
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = setTimeout(() => {
                loadCategories();
            }, 200);
        };

        socket.on('refresh:categories', scheduleRefresh);
        socket.on('product:category_change', scheduleRefresh);

        return () => {
            socket.off('refresh:categories', scheduleRefresh);
            socket.off('product:category_change', scheduleRefresh);
            if (refreshTimerRef.current) {
                clearTimeout(refreshTimerRef.current);
                refreshTimerRef.current = null;
            }
        };
    }, [socket, loadCategories]);

    const handleLogout = async () => {
        await logout();
        setIsUserMenuOpen(false);
        navigate('/login');
    };

    const navLinks = [
        { name: 'Home', path: '/' },
        { name: 'About', path: '/about' },
        { name: 'Contact', path: '/contact' },
    ];

    const isActive = (path) => location.pathname === path;
    const isShopActive = () => location.pathname === '/shop' || location.pathname.startsWith('/shop/');

    return (
        // [FIX] Dynamic Classes for Animation
        // - 'py-4' -> 'py-2': Shrinks height
        // - 'shadow-none' -> 'shadow-md': Adds depth
        <nav className={`fixed top-0 w-full z-[80] bg-white transition-all duration-300 ease-in-out py-4 shadow-sm border-b border-gray-100
        `}>
            <div className="container mx-auto px-4 md:px-8">
                <div className="flex justify-between items-center">
                    
                    
                    <Link to="/" className="flex items-center gap-2 group">
                        <img 
                            src={logo} 
                            alt="Logo" 
                            className={`w-auto object-contain transition-all duration-300 h-10`} 
                        />
                        <span className={`font-serif font-bold tracking-wide text-primary transition-all duration-300 text-xl`}>
                            SSC Jewellery
                        </span>
                    </Link>

                    {/* Desktop Links */}
                    <div className="hidden md:flex items-center gap-8">
                        {navLinks.slice(0, 1).map((link) => (
                            <Link key={link.name} to={link.path} className={`text-sm font-medium tracking-wide transition-colors relative group ${isActive(link.path) ? 'text-accent-deep' : 'text-gray-600 hover:text-accent-deep'}`}>
                                {link.name}
                                <span className={`absolute -bottom-1 left-0 w-0 h-0.5 bg-accent transition-all duration-300 group-hover:w-full ${isActive(link.path) ? 'w-full' : ''}`}></span>
                            </Link>
                        ))}

                        <div className="relative flex items-center gap-2" ref={megaTriggerRef}>
                            <Link
                                to="/shop"
                                className={`text-sm font-medium tracking-wide transition-colors relative group ${isShopActive() ? 'text-accent-deep' : 'text-gray-600 hover:text-accent-deep'}`}
                            >
                                Shop
                                <span className={`absolute -bottom-1 left-0 w-0 h-0.5 bg-accent transition-all duration-300 group-hover:w-full ${isShopActive() ? 'w-full' : ''}`}></span>
                            </Link>
                            <button
                                type="button"
                                aria-label="Toggle shop categories"
                                aria-expanded={isMegaOpen}
                                onClick={() => setIsMegaOpen((prev) => !prev)}
                                className="p-1 rounded-full text-gray-500 hover:text-primary hover:bg-gray-100 transition-colors"
                            >
                                <ChevronDown
                                    size={18}
                                    className={`transition-transform duration-200 ${isMegaOpen ? 'rotate-180' : 'rotate-0'}`}
                                />
                            </button>

                            <div
                                ref={megaMenuRef}
                                className={`absolute left-1/2 top-full mt-6 w-[760px] max-w-[90vw] -translate-x-1/2 rounded-2xl border border-gray-100 bg-white shadow-2xl transition-all duration-200 ${
                                    isMegaOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-2 pointer-events-none'
                                }`}
                            >
                                <div className="p-6">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Browse Categories</p>
                                        <Link to="/shop" className="text-xs font-semibold text-accent-deep hover:text-primary transition-colors">
                                            View All
                                        </Link>
                                    </div>
                                    <div className="mt-5 grid grid-cols-2 lg:grid-cols-3 gap-4">
                                        {isLoadingCategories && (
                                            <div className="col-span-2 lg:col-span-3 text-sm text-gray-500">
                                                Loading categories...
                                            </div>
                                        )}
                                        {!isLoadingCategories && categories.length === 0 && (
                                            <div className="col-span-2 lg:col-span-3 text-sm text-gray-500">
                                                No categories available yet.
                                            </div>
                                        )}
                                        {!isLoadingCategories && categories.map((category) => {
                                            const categoryName = (category?.name || '').trim();
                                            if (!categoryName) return null;
                                            const categoryId = category?.id ?? categoryName;
                                            return (
                                            <Link
                                                key={`cat-${categoryId}`}
                                                to={`/shop/${encodeURIComponent(categoryName)}`}
                                                onClick={() => setIsMegaOpen(false)}
                                                className="group flex items-center gap-3 rounded-xl border border-transparent p-3 transition-all hover:border-gray-100 hover:bg-gray-50"
                                            >
                                                <div className="h-12 w-12 rounded-full bg-gray-100 shadow-inner overflow-hidden">
                                                    <img
                                                        src={category?.image_url || '/placeholder_banner.jpg'}
                                                        alt={categoryName}
                                                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                        onError={(e) => { e.currentTarget.src = '/placeholder_banner.jpg'; }}
                                                    />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-semibold text-gray-800 group-hover:text-primary transition-colors">
                                                        {categoryName}
                                                    </span>
                                                    {typeof category.product_count === 'number' && (
                                                        <span className="text-xs text-gray-400">{category.product_count} items</span>
                                                    )}
                                                </div>
                                            </Link>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {navLinks.slice(1).map((link) => (
                            <Link key={link.name} to={link.path} className={`text-sm font-medium tracking-wide transition-colors relative group ${isActive(link.path) ? 'text-accent-deep' : 'text-gray-600 hover:text-accent-deep'}`}>
                                {link.name}
                                <span className={`absolute -bottom-1 left-0 w-0 h-0.5 bg-accent transition-all duration-300 group-hover:w-full ${isActive(link.path) ? 'w-full' : ''}`}></span>
                            </Link>
                        ))}
                    </div>

                    {/* Actions */}
                    <div className="hidden md:flex items-center gap-4 relative" ref={userMenuRef}>
                        <button 
                            onClick={openCart}
                            className={`relative p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-primary transition-colors ${shakeCart ? 'cart-shake' : ''}`}
                        >
                            <ShoppingCart size={22} strokeWidth={2} />
                            {itemCount > 0 && (
                                <span className={`absolute -top-1 -right-1 bg-primary text-accent text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center ${popBadge ? 'cart-pop' : ''}`}>
                                    {itemCount}
                                </span>
                            )}
                        </button>
                        {user ? (
                            <>
                                <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className={`p-2 rounded-full transition-colors ${isUserMenuOpen ? 'bg-primary text-white' : 'hover:bg-gray-100 text-gray-600'}`}>
                                    <User size={22} strokeWidth={2} />
                                </button>
                                {isUserMenuOpen && (
                                    <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 animate-in fade-in slide-in-from-top-2 overflow-hidden">
                                        <div className="px-4 py-2 border-b border-gray-50">
                                            <p className="text-xs text-gray-400 font-bold uppercase">Hi, {user.name}</p>
                                        </div>
                                        <Link to="/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">My Profile</Link>
                                        <Link to="/orders" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">My Orders</Link>
                                        <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2 border-t border-gray-50 mt-1">
                                            <LogOut size={16} /> Logout
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <Link to="/login" className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-primary transition-colors">
                                <User size={22} strokeWidth={2} />
                            </Link>
                        )}
                    </div>

                    {/* Mobile Actions */}
                    <div className="md:hidden flex items-center gap-2">
                        <button 
                            onClick={openCart}
                            className={`relative p-2 text-primary ${shakeCart ? 'cart-shake' : ''}`}
                        >
                            <ShoppingCart size={24} />
                            {itemCount > 0 && (
                                <span className={`absolute -top-1 -right-1 bg-primary text-accent text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center ${popBadge ? 'cart-pop' : ''}`}>
                                    {itemCount}
                                </span>
                            )}
                        </button>
                        <button 
                            className="p-2 text-primary"
                            onClick={() => setIsOpen(!isOpen)}
                        >
                            {isOpen ? <X size={28} /> : <Menu size={28} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu */}
            <div className={`md:hidden absolute top-full left-0 w-full bg-white shadow-xl transition-all duration-300 overflow-hidden ${
                isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
            }`}>
                <div className="flex flex-col p-6 space-y-4 text-center">
                    <Link 
                        to="/shop"
                        className={`text-lg font-medium py-2 border-b border-gray-100 ${isShopActive() ? 'text-accent-deep font-bold' : 'text-gray-600'}`}
                        onClick={() => setIsOpen(false)}
                    >
                        Shop
                    </Link>
                    {navLinks.map((link) => (
                        <Link 
                            key={link.name} 
                            to={link.path}
                            className={`text-lg font-medium py-2 border-b border-gray-100 ${isActive(link.path) ? 'text-accent-deep font-bold' : 'text-gray-600'}`}
                            onClick={() => setIsOpen(false)}
                        >
                            {link.name}
                        </Link>
                    ))}
                    {user ? (
                        <button onClick={handleLogout} className="flex items-center justify-center gap-2 text-red-500 font-bold pt-4">
                            <LogOut size={20} /> Logout
                        </button>
                    ) : (
                        <Link to="/login" className="flex items-center justify-center gap-2 text-primary font-bold pt-4" onClick={() => setIsOpen(false)}>
                            <User size={20} /> Login
                        </Link>
                    )}
                </div>
            </div>
        </nav>
    );
}
