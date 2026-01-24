import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, User } from 'lucide-react';
import logo from '/logo.webp'; // Ensure image is in public folder

export default function Navbar() {
    const [isOpen, setIsOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const location = useLocation();

    // Handle Scroll Effect
    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Close mobile menu when route changes
    useEffect(() => {
        setIsOpen(false);
    }, [location]);

    const navLinks = [
        { name: 'Home', path: '/' },
        { name: 'Shop', path: '/shop' },
        { name: 'About', path: '/about' },
        { name: 'Contact', path: '/contact' },
    ];

    const isActive = (path) => location.pathname === path;

    return (
        <nav 
            className={`fixed w-full z-50 transition-all duration-300 ${
                scrolled 
                ? 'bg-white/90 backdrop-blur-md shadow-md py-3' 
                : 'bg-transparent py-5'
            }`}
        >
            <div className="container mx-auto px-4 md:px-8">
                <div className="flex justify-between items-center">
                    
                    {/* --- LOGO --- */}
                    <Link to="/" className="flex items-center gap-2 group">
                        <img src={logo} alt="Logo" className="h-10 w-auto object-contain transition-transform group-hover:scale-105" />
                        <span className={`font-serif font-bold text-xl tracking-wide ${scrolled ? 'text-primary' : 'text-primary'}`}>
                            SMR Handmade
                        </span>
                    </Link>

                    {/* --- DESKTOP NAVIGATION --- */}
                    <div className="hidden md:flex items-center gap-8">
                        {navLinks.map((link) => (
                            <Link 
                                key={link.name} 
                                to={link.path}
                                className={`text-sm font-medium tracking-wide transition-colors relative group ${
                                    isActive(link.path) ? 'text-accent-deep' : 'text-gray-600 hover:text-accent-deep'
                                }`}
                            >
                                {link.name}
                                {/* Animated Underline */}
                                <span className={`absolute -bottom-1 left-0 w-0 h-0.5 bg-accent transition-all duration-300 group-hover:w-full ${isActive(link.path) ? 'w-full' : ''}`}></span>
                            </Link>
                        ))}
                    </div>

                    {/* --- ACTIONS (Login / Cart) --- */}
                    <div className="hidden md:flex items-center gap-4">
                        <Link to="/login" className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-primary transition-colors">
                            <User size={22} strokeWidth={2} />
                        </Link>
                        {/* Future Cart Icon can go here */}
                    </div>

                    {/* --- MOBILE TOGGLE --- */}
                    <button 
                        className="md:hidden p-2 text-primary"
                        onClick={() => setIsOpen(!isOpen)}
                    >
                        {isOpen ? <X size={28} /> : <Menu size={28} />}
                    </button>
                </div>
            </div>

            {/* --- MOBILE MENU OVERLAY --- */}
            <div className={`md:hidden absolute top-full left-0 w-full bg-white shadow-xl transition-all duration-300 overflow-hidden ${
                isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
            }`}>
                <div className="flex flex-col p-6 space-y-4 text-center">
                    {navLinks.map((link) => (
                        <Link 
                            key={link.name} 
                            to={link.path}
                            className={`text-lg font-medium py-2 border-b border-gray-100 ${
                                isActive(link.path) ? 'text-accent-deep font-bold' : 'text-gray-600'
                            }`}
                        >
                            {link.name}
                        </Link>
                    ))}
                    <Link to="/login" className="flex items-center justify-center gap-2 text-primary font-bold pt-4">
                        <User size={20} /> Login
                    </Link>
                </div>
            </div>
        </nav>
    );
}