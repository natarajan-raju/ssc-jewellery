import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Youtube, Phone, Mail, MapPin, MessageCircle, Home, Store, Info, PhoneCall, HelpCircle, User, Package, LogIn, FileText, ShieldCheck, Truck, RefreshCw, Copyright, Search as SearchIcon } from 'lucide-react';
import { productService } from '../services/productService';
import { useAuth } from '../context/AuthContext';
import logoLight from '../assets/logo_light.webp';
import { useSocket } from '../context/SocketContext';

export default function Footer() {
    const { user } = useAuth();
    const { socket } = useSocket();
    const [categories, setCategories] = useState([]);

    const loadCategories = async () => {
        try {
            const data = await productService.getCategoryStats();
            const list = Array.isArray(data) ? data : [];
            setCategories(list);
        } catch {
            setCategories([]);
        }
    };

    useEffect(() => {
        loadCategories();
    }, []);

    useEffect(() => {
        if (!socket) return;
        const handleCategoryRefresh = () => loadCategories();
        socket.on('refresh:categories', handleCategoryRefresh);
        socket.on('product:category_change', handleCategoryRefresh);
        return () => {
            socket.off('refresh:categories', handleCategoryRefresh);
            socket.off('product:category_change', handleCategoryRefresh);
        };
    }, [socket]);

    const categoryLinks = categories
        .filter(c => c?.name && Number(c.product_count) > 0)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return (
        <footer className="bg-primary text-white mt-16">
            <div className="container mx-auto px-4 py-12">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
                    <div className="space-y-4">
                        <img src={logoLight} alt="SSC Jewellery" className="h-14 w-auto" />
                        <p className="text-sm text-white/70">
                            Premium Impon jewellery crafted with care. Discover timeless designs and elegant collections.
                        </p>
                        <div className="flex items-center gap-3">
                            <a href="https://www.instagram.com/sreesaiimpon_jewelery_official" target="_blank" rel="noreferrer" className="p-2 rounded-full bg-white/10 text-white/60 hover:text-[#E1306C] hover:bg-white/20 transition-colors">
                                <Instagram size={18} />
                            </a>
                            <a href="https://youtube.com/@sreesaicollection8996" target="_blank" rel="noreferrer" className="p-2 rounded-full bg-white/10 text-white/60 hover:text-[#FF0000] hover:bg-white/20 transition-colors">
                                <Youtube size={18} />
                            </a>
                            <a href="https://wa.me/919500941350" target="_blank" rel="noreferrer" className="p-2 rounded-full bg-white/10 text-white/60 hover:text-[#25D366] hover:bg-white/20 transition-colors">
                                <MessageCircle size={18} />
                            </a>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-bold uppercase tracking-widest text-white/70 mb-2 inline-block border-b-2 border-accent pb-1">Categories</h4>
                        <div className="space-y-2">
                            {categoryLinks.slice(0, 5).map((cat) => (
                                <Link key={cat.id || cat.name} to={`/shop/${encodeURIComponent(cat.name)}`} className="flex items-center gap-2 text-sm text-white/80 hover:text-accent transition-colors">
                                    <SearchIcon size={14} className="text-white/40" />
                                    {cat.name}
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-bold uppercase tracking-widest text-white/70 mb-2 inline-block border-b-2 border-accent pb-1">Shop</h4>
                        <div className="space-y-2">
                            <Link to="/" className="flex items-center gap-2 text-sm text-white/80 hover:text-accent transition-colors"><Home size={14} className="text-white/40" />Home</Link>
                            <Link to="/shop" className="flex items-center gap-2 text-sm text-white/80 hover:text-accent transition-colors"><Store size={14} className="text-white/40" />Shop</Link>
                            <Link to="/about" className="flex items-center gap-2 text-sm text-white/80 hover:text-accent transition-colors"><Info size={14} className="text-white/40" />About</Link>
                            <Link to="/contact" className="flex items-center gap-2 text-sm text-white/80 hover:text-accent transition-colors"><PhoneCall size={14} className="text-white/40" />Contact</Link>
                            <Link to="/faq" className="flex items-center gap-2 text-sm text-white/80 hover:text-accent transition-colors"><HelpCircle size={14} className="text-white/40" />FAQs</Link>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-bold uppercase tracking-widest text-white/70 mb-2 inline-block border-b-2 border-accent pb-1">Account</h4>
                        <div className="space-y-2">
                            {user ? (
                                <>
                                    <Link to="/profile" className="flex items-center gap-2 text-sm text-white/80 hover:text-accent transition-colors"><User size={14} className="text-white/40" />My Profile</Link>
                                    <Link to="/orders" className="flex items-center gap-2 text-sm text-white/80 hover:text-accent transition-colors"><Package size={14} className="text-white/40" />My Orders</Link>
                                </>
                            ) : (
                                <>
                                    <Link to="/login" className="flex items-center gap-2 text-sm text-white/80 hover:text-accent transition-colors"><LogIn size={14} className="text-white/40" />Login</Link>
                                    <Link to="/register" className="flex items-center gap-2 text-sm text-white/80 hover:text-accent transition-colors"><User size={14} className="text-white/40" />Create Account</Link>
                                </>
                            )}
                            <Link to="/track-order" className="flex items-center gap-2 text-sm text-white/80 hover:text-accent transition-colors"><Package size={14} className="text-white/40" />Track Order</Link>
                            <Link to="/support" className="flex items-center gap-2 text-sm text-white/80 hover:text-accent transition-colors"><HelpCircle size={14} className="text-white/40" />Customer Support</Link>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-bold uppercase tracking-widest text-white/70 mb-2 inline-block border-b-2 border-accent pb-1">Policies</h4>
                        <div className="space-y-2">
                            <Link to="/terms" className="flex items-center gap-2 text-sm text-white/80 hover:text-accent transition-colors"><FileText size={14} className="text-white/40" />Terms & Conditions</Link>
                            <Link to="/privacy" className="flex items-center gap-2 text-sm text-white/80 hover:text-accent transition-colors"><ShieldCheck size={14} className="text-white/40" />Privacy Policy</Link>
                            <Link to="/refund" className="flex items-center gap-2 text-sm text-white/80 hover:text-accent transition-colors"><RefreshCw size={14} className="text-white/40" />Refund Policy</Link>
                            <Link to="/shipping" className="flex items-center gap-2 text-sm text-white/80 hover:text-accent transition-colors"><Truck size={14} className="text-white/40" />Shipping Policy</Link>
                            <Link to="/copyright" className="flex items-center gap-2 text-sm text-white/80 hover:text-accent transition-colors"><Copyright size={14} className="text-white/40" />Copyright Claimer</Link>
                        </div>
                    </div>
                </div>

                <div className="mt-10 border-t border-white/10 pt-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-white/70">
                    <div className="flex items-start gap-2">
                        <MapPin size={16} className="text-accent mt-0.5" />
                        <span>Registered Address: 12/4, Market Road, Sivakasi, Tamil Nadu, India</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Mail size={16} className="text-accent" />
                        <a href="mailto:support@sscimpon.com" className="text-white/60 hover:text-accent">support@sscimpon.com</a>
                    </div>
                    <div className="flex items-center gap-2">
                        <Phone size={16} className="text-accent" />
                        <a href="tel:+919500941350" className="text-white/60 hover:text-accent">+91 95009 41350</a>
                    </div>
                </div>
            </div>
            <div className="bg-black/30 text-center text-xs text-white/60 py-4">
                © {new Date().getFullYear()} SSC Jewellery. All rights reserved.
            </div>
        </footer>
    );
}
