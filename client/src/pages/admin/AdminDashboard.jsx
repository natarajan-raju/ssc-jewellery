import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useProducts } from '../../context/ProductContext';
import Customers from './Customers';
import Products from './Products';
import Categories from './Categories';
import { Users, ShoppingBag, LayoutDashboard, LogOut, Package, Truck, ShoppingCart, Settings, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logo from '../../assets/logo_light.webp'; 
import { Images } from 'lucide-react'; // Add 'Images' icon
import HeroCMS from './HeroCMS'; // Import the new component
import ShippingSettings from './ShippingSettings';
import Orders from './Orders';
import AbandonedCarts from './AbandonedCarts';
import CompanyInfo from './CompanyInfo';
import LoyaltySettings from './LoyaltySettings';
import { AdminKPIProvider } from '../../context/AdminKPIContext';
import dashboardIllustration from '../../assets/dashboard.svg';
import orderIllustration from '../../assets/order.svg';
import receivedOrderAudio from '../../assets/received_order.mp3';
import { burstConfetti } from '../../utils/celebration';
import { orderService } from '../../services/orderService';
import { useToast } from '../../context/ToastContext';

const ADMIN_LAST_SEEN_ORDER_TS_KEY = 'admin_last_seen_order_ts_v1';

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState('customers');
    const [expandedMenu, setExpandedMenu] = useState('products'); // Default open for demo
    const [focusOrderId, setFocusOrderId] = useState(null);
    const [incomingOrders, setIncomingOrders] = useState([]);
    const [incomingModalOpen, setIncomingModalOpen] = useState(false);
    const playedOrderSoundRef = useRef(false);
    const navigate = useNavigate();
    const toast = useToast();
    const { logout, user } = useAuth();
    const { isDownloading, progress } = useProducts();
    
    
    const handleLogout = async () => {
        await logout(); // [FIX] Uses AuthContext to clear session & Firebase
        navigate('/admin/login');
    };
   

    const NavItem = ({ icon: Icon, label, id }) => (
        <button 
            onClick={() => setActiveTab(id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 
            ${(activeTab === id || (id === 'customers' && activeTab === 'loyalty'))
                ? 'bg-accent text-primary font-bold shadow-lg shadow-accent/20' 
                : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
        >
            <Icon size={20} />
            <span>{label}</span>
        </button>
    );

    const SubNavItem = ({ label, id }) => (
        <button 
            onClick={() => setActiveTab(id)}
            className={`w-full flex items-center gap-3 px-4 py-2 pl-12 rounded-lg transition-all duration-200 text-sm font-medium
            ${activeTab === id 
                ? 'text-white bg-white/10' 
                : 'text-gray-400 hover:text-white'}`}
        >
            <div className={`w-1.5 h-1.5 rounded-full ${activeTab === id ? 'bg-accent' : 'bg-gray-600'}`}></div>
            <span>{label}</span>
        </button>
    );

    const EmptyState = ({ illustration, title, message }) => (
        <div className="p-10 text-center text-gray-400 flex flex-col items-center gap-4">
            <img src={illustration} alt={title} className="w-56 md:w-72" />
            <div>
                <h3 className="text-lg font-semibold text-gray-700">{title}</h3>
                <p className="text-sm text-gray-500 mt-2">{message}</p>
            </div>
        </div>
    );

    const markOrdersSeen = (orders = []) => {
        const maxTs = orders.reduce((max, order) => {
            const ts = new Date(order?.created_at || order?.createdAt || 0).getTime();
            if (!Number.isFinite(ts) || ts <= 0) return max;
            return Math.max(max, ts);
        }, Date.now());
        localStorage.setItem(ADMIN_LAST_SEEN_ORDER_TS_KEY, String(maxTs));
    };

    useEffect(() => {
        if (!user || (user.role !== 'admin' && user.role !== 'staff')) return;
        let cancelled = false;
        const loadMissedOrders = async () => {
            try {
                const data = await orderService.getAdminOrders({
                    page: 1,
                    limit: 10,
                    status: 'all',
                    quickRange: 'latest_10',
                    sortBy: 'newest'
                });
                if (cancelled) return;
                const rows = (Array.isArray(data?.orders) ? data.orders : [])
                    .filter((order) => String(order?.entity_type || 'order').toLowerCase() !== 'attempt');
                const lastSeenTs = Number(localStorage.getItem(ADMIN_LAST_SEEN_ORDER_TS_KEY) || 0);
                const missed = rows.filter((order) => {
                    const ts = new Date(order?.created_at || order?.createdAt || 0).getTime();
                    return Number.isFinite(ts) && ts > lastSeenTs;
                });
                if (missed.length > 0) {
                    setIncomingOrders(missed);
                    setIncomingModalOpen(true);
                    toast.info(
                        missed.length === 1
                            ? `You have 1 new order while you were away`
                            : `You have ${missed.length} new orders while you were away`
                    );
                }
                markOrdersSeen(rows);
            } catch {
                // Ignore initial fetch errors here
            }
        };
        loadMissedOrders();
        return () => {
            cancelled = true;
        };
    }, [toast, user]);

    useEffect(() => {
        if (!user || (user.role !== 'admin' && user.role !== 'staff')) return;
        const handleNewOrder = (event) => {
            const order = event?.detail;
            if (!order?.id) return;
            setIncomingOrders((prev) => {
                if (prev.some((entry) => String(entry.id) === String(order.id))) return prev;
                return [order, ...prev];
            });
            setIncomingModalOpen(true);
        };
        window.addEventListener('admin:new-order', handleNewOrder);
        return () => window.removeEventListener('admin:new-order', handleNewOrder);
    }, [user]);

    const incomingSummary = useMemo(() => {
        const count = incomingOrders.length;
        const totalValue = incomingOrders.reduce((sum, order) => sum + Number(order?.total || 0), 0);
        return { count, totalValue };
    }, [incomingOrders]);

    useEffect(() => {
        if (!incomingModalOpen || incomingSummary.count <= 0) {
            playedOrderSoundRef.current = false;
            return;
        }
        if (playedOrderSoundRef.current) return;
        playedOrderSoundRef.current = true;
        burstConfetti();
        try {
            const audio = new Audio(receivedOrderAudio);
            audio.volume = 0.9;
            void audio.play().catch(() => {});
        } catch {
            // ignore autoplay/audio errors
        }
    }, [incomingModalOpen, incomingSummary.count]);

    const openOrdersFromModal = (orderId = null) => {
        setActiveTab('orders');
        if (orderId) {
            setFocusOrderId(orderId);
        } else {
            setFocusOrderId(null);
        }
        markOrdersSeen(incomingOrders);
        setIncomingOrders([]);
        setIncomingModalOpen(false);
    };

    const dismissIncomingModal = () => {
        markOrdersSeen(incomingOrders);
        setIncomingOrders([]);
        setIncomingModalOpen(false);
    };

    return (
        <AdminKPIProvider>
        <div className="bg-gray-50 min-h-screen flex">
            
            {/* --- DESKTOP SIDEBAR --- */}
            <aside className="hidden md:flex flex-col w-64 bg-primary fixed h-full border-r border-white/10 shadow-2xl z-50">
                <div className="p-4 flex items-center justify-center border-b border-white/10">
                    <img src={logo} alt="Logo" className="w-16 h-auto opacity-90" />
                </div>
                
                <nav className="flex-1 p-4 space-y-2">
                    <NavItem icon={LayoutDashboard} label="Dashboard" id="dashboard" />
                    <div className="space-y-1">
                        <button 
                            onClick={() => setExpandedMenu(expandedMenu === 'products' ? '' : 'products')}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 
                            ${activeTab.includes('products') || expandedMenu === 'products' ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            <div className="flex items-center gap-3">
                                <Package size={20} />
                                <span>Products</span>
                            </div>
                            {/* Chevron Rotation Logic */}
                            <svg 
                                className={`w-4 h-4 transition-transform ${expandedMenu === 'products' ? 'rotate-180' : ''}`} 
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        
                        {/* Submenu */}
                        {expandedMenu === 'products' && (
                            <div className="animate-in slide-in-from-top-2 space-y-1 mb-2">
                                <SubNavItem label="Product list" id="products" />
                                <SubNavItem label="Categories" id="categories" />
                            </div>
                        )}
                    </div>
                    <NavItem icon={Users} label="Customers" id="customers" />
                    <NavItem icon={ShoppingBag} label="Orders" id="orders" />
                    <NavItem icon={Truck} label="Shipping" id="shipping" />
                    <NavItem icon={ShoppingCart} label="Abandoned Carts" id="abandoned" />
                    <NavItem icon={Settings} label="Company Info" id="companyInfo" />
                    <div className="pt-2 mt-2 border-t border-white/10">
                        <NavItem icon={Images} label="Hero CMS" id="cms" />
                    </div>
                </nav>

                <div className="p-4 border-t border-white/10 space-y-4">
                    <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors">
                        <LogOut size={20} />
                        <span>Logout</span>
                    </button>
                    
                    {/* Sidebar Footer */}
                    
                </div>
            </aside>

            {/* --- MAIN CONTENT AREA --- */}
            <main className="flex-1 md:ml-64 min-h-screen transition-all flex flex-col">
                {/* Mobile Header */}
                <div className="md:hidden bg-white p-4 flex items-center justify-between shadow-sm sticky top-0 z-40">
                    <img src={logo} className="w-8" alt="Logo" />
                    <button onClick={handleLogout} className="text-gray-400"><LogOut size={20}/></button>
                </div>

                {isDownloading && (
                    <div className="sticky top-[56px] md:top-0 z-30 bg-white border-b border-gray-200">
                        <div className="h-1 bg-gray-100">
                            <div
                                className="h-1 bg-accent transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <div className="px-4 py-2 text-xs text-gray-500">
                            Syncing products in background... {progress}%
                        </div>
                    </div>
                )}

                <div className="flex-1 p-4 md:p-8 pb-24 md:pb-8 max-w-7xl mx-auto w-full">
                    {activeTab === 'products' && <Products onNavigate={setActiveTab} />}
                    {activeTab === 'categories' && <Categories />}
                    {activeTab === 'customers' && <Customers onOpenLoyalty={() => setActiveTab('loyalty')} />}
                    {activeTab === 'shipping' && <ShippingSettings />}
                    {activeTab === 'cms' && <HeroCMS />}
                    {activeTab === 'dashboard' && (
                        <EmptyState
                            illustration={dashboardIllustration}
                            title="Dashboard insights coming soon"
                            message="We’re preparing analytics for sales, customers, and inventory trends."
                        />
                    )}
                    {activeTab === 'orders' && <Orders focusOrderId={focusOrderId} onFocusHandled={() => setFocusOrderId(null)} />}
                    {activeTab === 'abandoned' && <AbandonedCarts />}
                    {activeTab === 'loyalty' && <LoyaltySettings onBack={() => setActiveTab('customers')} />}
                    {activeTab === 'companyInfo' && <CompanyInfo />}
                </div>

                {/* Mobile Footer Credit (Visible only on mobile at bottom of content) */}
                {/* <div className="md:hidden text-center py-6 pb-24 text-gray-400">
                    <p className="text-[10px] flex items-center justify-center gap-1">
                        Powered by 
                        <a href="https://creativecodz.com" target="_blank" rel="noopener noreferrer" className="text-accent-deep hover:underline font-bold">
                            Creativecodz
                        </a>
                    </p>
                </div> */}
            </main>

            {/* --- MOBILE BOTTOM NAV --- */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] pb-safe pt-2 px-4 flex justify-between items-center z-40">
                <MobileNavBtn icon={LayoutDashboard} label="Home" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
                <MobileNavBtn icon={Package} label="Products" active={activeTab === 'products'} onClick={() => setActiveTab('products')} />
                <MobileNavBtn icon={Users} label="Customers" active={activeTab === 'customers' || activeTab === 'loyalty'} onClick={() => setActiveTab('customers')} />
                <MobileNavBtn icon={ShoppingBag} label="Orders" active={activeTab === 'orders'} onClick={() => setActiveTab('orders')} />
                <MobileNavBtn icon={ShoppingCart} label="Carts" active={activeTab === 'abandoned'} onClick={() => setActiveTab('abandoned')} />
            </div>

            {incomingModalOpen && incomingSummary.count > 0 && (
                <div className="fixed inset-0 z-[95] bg-black/50 flex items-center justify-center p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-gray-900">New Order Alert</h3>
                            <button onClick={dismissIncomingModal} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-5">
                            <div className="flex items-start gap-4">
                                <img src={orderIllustration} alt="New order" className="w-24 h-24 object-contain" />
                                <div className="flex-1">
                                    {incomingSummary.count === 1 ? (
                                        <>
                                            <p className="text-sm text-gray-500">A new order has been received.</p>
                                            <p className="mt-1 text-base font-semibold text-gray-900">
                                                {incomingOrders[0]?.order_ref || `Order #${incomingOrders[0]?.id || ''}`}
                                            </p>
                                            <p className="mt-1 text-sm text-gray-700">
                                                Customer: {incomingOrders[0]?.customer_name || 'Guest'} {incomingOrders[0]?.customer_mobile ? `(${incomingOrders[0].customer_mobile})` : ''}
                                            </p>
                                            <p className="mt-1 text-sm text-gray-700">
                                                Total: ₹{Number(incomingOrders[0]?.total || 0).toLocaleString()}
                                            </p>
                                            <p className="mt-1 text-sm text-gray-700">
                                                Payment: {String(incomingOrders[0]?.payment_status || 'pending').toUpperCase()}
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-sm text-gray-500">Multiple orders received while you were offline.</p>
                                            <p className="mt-1 text-2xl font-bold text-gray-900">{incomingSummary.count} orders</p>
                                            <p className="mt-1 text-sm text-gray-700">
                                                Combined value: ₹{incomingSummary.totalValue.toLocaleString()}
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="mt-5 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={dismissIncomingModal}
                                    className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                    Dismiss
                                </button>
                                <button
                                    type="button"
                                    onClick={() => openOrdersFromModal(incomingSummary.count === 1 ? incomingOrders[0]?.id : null)}
                                    className="px-4 py-2 rounded-lg bg-primary text-accent text-sm font-semibold hover:bg-primary-light"
                                >
                                    {incomingSummary.count === 1 ? 'Open Order Details' : 'Go to Orders'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
        </AdminKPIProvider>
    );
}

function MobileNavBtn({ icon: Icon, label, active, onClick }) {
    return (
        <button 
            onClick={onClick}
            className={`flex flex-col items-center gap-1 p-2 transition-all ${active ? 'text-primary -translate-y-1' : 'text-gray-400'}`}
        >
            <div className={`p-2 rounded-xl ${active ? 'bg-accent text-primary shadow-lg shadow-accent/20' : ''}`}>
                <Icon size={active ? 22 : 22} strokeWidth={2} />
            </div>
            {active && <span className="text-[10px] font-bold">{label}</span>}
        </button>
    );
}
