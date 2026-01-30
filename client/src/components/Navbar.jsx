import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, User, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import logo from '/logo.webp';

export default function Navbar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    
    // UI States
    const [isOpen, setIsOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false); // [NEW] Track scroll
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const userMenuRef = useRef(null);

    // [NEW] 1. Scroll Detection Effect
    useEffect(() => {
        const handleScroll = () => {
            // Check if user has scrolled more than 20px
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

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

    const handleLogout = async () => {
        await logout();
        setIsUserMenuOpen(false);
        navigate('/login');
    };

    const navLinks = [
        { name: 'Home', path: '/' },
        { name: 'Shop', path: '/shop' },
        { name: 'About', path: '/about' },
        { name: 'Contact', path: '/contact' },
    ];

    const isActive = (path) => location.pathname === path;

    return (
        // [FIX] Dynamic Classes for Animation
        // - 'py-4' -> 'py-2': Shrinks height
        // - 'shadow-none' -> 'shadow-md': Adds depth
        <nav className={`fixed top-0 w-full z-50 bg-white transition-all duration-300 ease-in-out ${
            scrolled ? 'py-2 shadow-md' : 'py-4 shadow-sm border-b border-gray-100'
        }`}>
            <div className="container mx-auto px-4 md:px-8">
                <div className="flex justify-between items-center">
                    
                    {/* Logo - Scales slightly on scroll */}
                    <Link to="/" className="flex items-center gap-2 group">
                        <img 
                            src={logo} 
                            alt="Logo" 
                            className={`w-auto object-contain transition-all duration-300 ${
                                scrolled ? 'h-8' : 'h-10'
                            }`} 
                        />
                        <span className={`font-serif font-bold tracking-wide text-primary transition-all duration-300 ${
                            scrolled ? 'text-lg' : 'text-xl'
                        }`}>
                            SSC Jewellery
                        </span>
                    </Link>

                    {/* Desktop Links */}
                    <div className="hidden md:flex items-center gap-8">
                        {navLinks.map((link) => (
                            <Link key={link.name} to={link.path} className={`text-sm font-medium tracking-wide transition-colors relative group ${isActive(link.path) ? 'text-accent-deep' : 'text-gray-600 hover:text-accent-deep'}`}>
                                {link.name}
                                <span className={`absolute -bottom-1 left-0 w-0 h-0.5 bg-accent transition-all duration-300 group-hover:w-full ${isActive(link.path) ? 'w-full' : ''}`}></span>
                            </Link>
                        ))}
                    </div>

                    {/* Actions */}
                    <div className="hidden md:flex items-center gap-4 relative" ref={userMenuRef}>
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

                    {/* Mobile Toggle */}
                    <button 
                        className="md:hidden p-2 text-primary"
                        onClick={() => setIsOpen(!isOpen)}
                    >
                        {isOpen ? <X size={28} /> : <Menu size={28} />}
                    </button>
                </div>
            </div>

            {/* Mobile Menu */}
            <div className={`md:hidden absolute top-full left-0 w-full bg-white shadow-xl transition-all duration-300 overflow-hidden ${
                isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
            }`}>
                <div className="flex flex-col p-6 space-y-4 text-center">
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