import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { useProducts } from '../../context/ProductContext';
import Customers from './Customers';
import Products from './Products';
import Categories from './Categories';
import { Users, ShoppingBag, LayoutDashboard, LogOut, Package, Truck, ShoppingCart, Settings, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Images } from 'lucide-react'; // Add 'Images' icon
import HeroCMS from './HeroCMS'; // Import the new component
import ShippingSettings from './ShippingSettings';
import Orders from './Orders';
import AbandonedCarts from './AbandonedCarts';
import CompanyInfo from './CompanyInfo';
import LoyaltySettings from './LoyaltySettings';
import DashboardInsights from './DashboardInsights';
import { AdminKPIProvider } from '../../context/AdminKPIContext';
import orderIllustration from '../../assets/order.svg';
import courierIllustration from '../../assets/courier.svg';
import receivedOrderAudio from '../../assets/received_order.mp3';
import shippingPopupAudio from '../../assets/pop.mp3';
import logo from '../../assets/logo.webp';
import logoLight from '../../assets/logo_light.webp';
import { burstConfetti } from '../../utils/celebration';
import { orderService } from '../../services/orderService';
import { useToast } from '../../context/ToastContext';

const ADMIN_LAST_SEEN_ORDER_TS_KEY = 'admin_last_seen_order_ts_v1';
const SHIPPING_POPUP_COOLDOWN_MS = 90 * 1000;

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [expandedMenu, setExpandedMenu] = useState('');
    const [focusOrderId, setFocusOrderId] = useState(null);
    const [focusProductId, setFocusProductId] = useState(null);
    const [focusCustomerId, setFocusCustomerId] = useState(null);
    const [ordersInitialStatusFilter, setOrdersInitialStatusFilter] = useState('');
    const [ordersInitialQuickRange, setOrdersInitialQuickRange] = useState('');
    const [ordersInitialStartDate, setOrdersInitialStartDate] = useState('');
    const [ordersInitialEndDate, setOrdersInitialEndDate] = useState('');
    const [ordersInitialSortBy, setOrdersInitialSortBy] = useState('');
    const [ordersInitialSourceChannel, setOrdersInitialSourceChannel] = useState('');
    const [ordersInitialManualCustomerId, setOrdersInitialManualCustomerId] = useState('');
    const [incomingOrders, setIncomingOrders] = useState([]);
    const [activePopupType, setActivePopupType] = useState(null);
    const [activeShippingSummary, setActiveShippingSummary] = useState(null);
    const [shippingPopupQueue, setShippingPopupQueue] = useState([]);
    const [shippingCooldownUntilTs, setShippingCooldownUntilTs] = useState(0);
    const playedOrderSoundRef = useRef(false);
    const playedShippingSoundRef = useRef('');
    const shippingCooldownTimerRef = useRef(null);
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

    const handleDashboardAction = (action = {}) => {
        const target = action?.target || {};
        if (target.tab === 'orders') {
            setActiveTab('orders');
            setOrdersInitialStatusFilter(target.status || '');
            setOrdersInitialQuickRange(target.quickRange || 'last_30_days');
            setOrdersInitialStartDate(target.startDate || '');
            setOrdersInitialEndDate(target.endDate || '');
            setOrdersInitialSortBy(target.sortBy || '');
            setOrdersInitialSourceChannel(target.sourceChannel || 'all');
            setFocusOrderId(target.orderId || null);
            return;
        }
        if (target.tab === 'products') {
            setActiveTab('products');
            setFocusProductId(target.productId || null);
            return;
        }
        if (target.tab === 'customers') {
            setActiveTab('customers');
            setFocusCustomerId(target.userId || null);
            return;
        }
        if (target.tab) {
            setActiveTab(target.tab);
        }
    };

    const markOrdersSeen = (orders = []) => {
        const maxTs = orders.reduce((max, order) => {
            const ts = new Date(order?.created_at || order?.createdAt || 0).getTime();
            if (!Number.isFinite(ts) || ts <= 0) return max;
            return Math.max(max, ts);
        }, Date.now());
        localStorage.setItem(ADMIN_LAST_SEEN_ORDER_TS_KEY, String(maxTs));
    };

    const shippingSummaryKey = (summary = {}) => {
        const total = Number(summary?.total || 0);
        const ids = Array.isArray(summary?.cases)
            ? summary.cases.map((entry) => String(entry?.id || '')).filter(Boolean).join(',')
            : '';
        return `${total}:${ids}`;
    };

    const flushShippingQueueIfPossible = useCallback(() => {
        const now = Date.now();
        if (activePopupType === 'order') return;
        if (now < shippingCooldownUntilTs) return;
        setShippingPopupQueue((prev) => {
            if (!prev.length) return prev;
            const [next, ...rest] = prev;
            setActiveShippingSummary(next);
            setActivePopupType('shipping');
            return rest;
        });
    }, [activePopupType, shippingCooldownUntilTs]);

    const queueShippingSummary = useCallback((summary = {}) => {
        const total = Number(summary?.total || 0);
        if (total <= 0) return;
        const key = shippingSummaryKey(summary);
        const now = Date.now();

        if (activePopupType === 'shipping') {
            setActiveShippingSummary(summary);
            setShippingPopupQueue((prev) => prev.filter((entry) => shippingSummaryKey(entry) !== key));
            return;
        }

        setShippingPopupQueue((prev) => {
            const deduped = prev.filter((entry) => shippingSummaryKey(entry) !== key);
            return [...deduped, summary];
        });

        if (activePopupType === 'order') return;
        if (now < shippingCooldownUntilTs) return;
        setShippingPopupQueue((prev) => {
            const deduped = prev.filter((entry) => shippingSummaryKey(entry) !== key);
            const [next, ...rest] = [...deduped, summary];
            setActiveShippingSummary(next);
            setActivePopupType('shipping');
            return rest;
        });
    }, [activePopupType, shippingCooldownUntilTs]);

    const showOrderPopup = useCallback(() => {
        setActivePopupType('order');
        setActiveShippingSummary(null);
    }, []);

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
                    showOrderPopup();
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
    }, [showOrderPopup, toast, user]);

    useEffect(() => {
        if (!user || (user.role !== 'admin' && user.role !== 'staff')) return;
        let cancelled = false;
        const loadOverdueShipped = async () => {
            try {
                const data = await orderService.getAdminOverdueShippedSummary({ days: 30, limit: 5 });
                if (cancelled) return;
                const total = Number(data?.total || 0);
                const cases = Array.isArray(data?.cases) ? data.cases : [];
                queueShippingSummary({ total, cases });
            } catch {
                // ignore
            }
        };
        loadOverdueShipped();
        const interval = setInterval(loadOverdueShipped, 2 * 60 * 1000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [queueShippingSummary, user]);

    useEffect(() => {
        if (!user || (user.role !== 'admin' && user.role !== 'staff')) return;
        const handleNewOrder = (event) => {
            const order = event?.detail;
            if (!order?.id) return;
            if (activePopupType === 'shipping' && activeShippingSummary) {
                setShippingPopupQueue((prev) => [activeShippingSummary, ...prev]);
            }
            setIncomingOrders((prev) => {
                if (prev.some((entry) => String(entry.id) === String(order.id))) return prev;
                return [order, ...prev];
            });
            showOrderPopup();
        };
        window.addEventListener('admin:new-order', handleNewOrder);
        return () => window.removeEventListener('admin:new-order', handleNewOrder);
    }, [activePopupType, activeShippingSummary, showOrderPopup, user]);

    const incomingSummary = useMemo(() => {
        const count = incomingOrders.length;
        const totalValue = incomingOrders.reduce((sum, order) => sum + Number(order?.total || 0), 0);
        return { count, totalValue };
    }, [incomingOrders]);

    useEffect(() => {
        const visible = activePopupType === 'order' && incomingSummary.count > 0;
        if (!visible) {
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
    }, [activePopupType, incomingSummary.count]);

    useEffect(() => {
        const visible = activePopupType === 'shipping' && Number(activeShippingSummary?.total || 0) > 0;
        if (!visible) {
            playedShippingSoundRef.current = '';
            return;
        }
        const key = shippingSummaryKey(activeShippingSummary || {});
        if (playedShippingSoundRef.current === key) return;
        playedShippingSoundRef.current = key;
        try {
            const audio = new Audio(shippingPopupAudio);
            audio.volume = 0.9;
            void audio.play().catch(() => {});
        } catch {}
    }, [activePopupType, activeShippingSummary]);

    useEffect(() => {
        if (activePopupType === 'order') return;
        if (!shippingPopupQueue.length) return;
        const waitMs = Math.max(0, shippingCooldownUntilTs - Date.now());
        clearTimeout(shippingCooldownTimerRef.current);
        shippingCooldownTimerRef.current = setTimeout(() => {
            flushShippingQueueIfPossible();
        }, waitMs || 10);
        return () => {
            clearTimeout(shippingCooldownTimerRef.current);
        };
    }, [activePopupType, flushShippingQueueIfPossible, shippingCooldownUntilTs, shippingPopupQueue]);

    const openOrdersFromModal = (orderId = null) => {
        setActiveTab('orders');
        setOrdersInitialStatusFilter('');
        if (orderId) {
            setFocusOrderId(orderId);
        } else {
            setFocusOrderId(null);
        }
        markOrdersSeen(incomingOrders);
        setIncomingOrders([]);
        setActivePopupType(null);
        flushShippingQueueIfPossible();
    };

    const dismissIncomingModal = () => {
        markOrdersSeen(incomingOrders);
        setIncomingOrders([]);
        setActivePopupType(null);
        flushShippingQueueIfPossible();
    };

    const dismissOverdueModal = () => {
        setActivePopupType(null);
        setActiveShippingSummary(null);
        const nextTs = Date.now() + SHIPPING_POPUP_COOLDOWN_MS;
        setShippingCooldownUntilTs(nextTs);
        setTimeout(() => {
            flushShippingQueueIfPossible();
        }, SHIPPING_POPUP_COOLDOWN_MS);
    };

    return (
        <AdminKPIProvider>
        <div className="bg-gray-50 min-h-screen flex">
            
            {/* --- DESKTOP SIDEBAR --- */}
            <aside className="hidden md:flex flex-col w-64 bg-primary fixed h-full border-r border-white/10 shadow-2xl z-50">
                <div className="p-4 flex items-center justify-center border-b border-white/10">
                    <img src={logoLight} alt="Logo" className="w-16 h-auto opacity-90" />
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
                    <NavItem icon={Settings} label="Settings" id="companyInfo" />
                    <div className="pt-2 mt-2 border-t border-white/10">
                        <NavItem icon={Images} label="CMS" id="cms" />
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
                    <img src={logo} className="w-10 h-auto" alt="Logo" />
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
                    {activeTab === 'products' && (
                        <Products
                            onNavigate={setActiveTab}
                            focusProductId={focusProductId}
                            onFocusHandled={() => setFocusProductId(null)}
                        />
                    )}
                    {activeTab === 'categories' && <Categories />}
                    {activeTab === 'customers' && (
                        <Customers
                            onOpenLoyalty={() => setActiveTab('loyalty')}
                            onCreateOrderForCustomer={(userId) => {
                                setActiveTab('orders');
                                setOrdersInitialManualCustomerId(String(userId || '').trim());
                            }}
                            focusCustomerId={focusCustomerId}
                            onFocusCustomerHandled={() => setFocusCustomerId(null)}
                        />
                    )}
                    {activeTab === 'shipping' && <ShippingSettings />}
                    {activeTab === 'cms' && <HeroCMS />}
                    {activeTab === 'dashboard' && <DashboardInsights onRunAction={handleDashboardAction} />}
                    {activeTab === 'orders' && (
                        <Orders
                            focusOrderId={focusOrderId}
                            onFocusHandled={() => setFocusOrderId(null)}
                            initialStatusFilter={ordersInitialStatusFilter}
                            onInitialStatusApplied={() => setOrdersInitialStatusFilter('')}
                            initialQuickRange={ordersInitialQuickRange}
                            onInitialQuickRangeApplied={() => setOrdersInitialQuickRange('')}
                            initialStartDate={ordersInitialStartDate}
                            initialEndDate={ordersInitialEndDate}
                            onInitialDateRangeApplied={() => {
                                setOrdersInitialStartDate('');
                                setOrdersInitialEndDate('');
                            }}
                            initialSortBy={ordersInitialSortBy}
                            onInitialSortApplied={() => setOrdersInitialSortBy('')}
                            initialSourceChannel={ordersInitialSourceChannel}
                            onInitialSourceChannelApplied={() => setOrdersInitialSourceChannel('')}
                            initialManualCustomerId={ordersInitialManualCustomerId}
                            onInitialManualCustomerApplied={() => setOrdersInitialManualCustomerId('')}
                        />
                    )}
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

            {activePopupType === 'order' && incomingSummary.count > 0 && createPortal(
                <div className="fixed inset-0 z-[95] bg-black/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
                    <div className="w-full max-w-lg rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col my-auto">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-gray-900">New Order Alert</h3>
                            <button onClick={dismissIncomingModal} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-5 overflow-y-auto">
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
                </div>,
                document.body
            )}

            {activePopupType === 'shipping' && Number(activeShippingSummary?.total || 0) > 0 && createPortal(
                <div className="fixed inset-0 z-[94] bg-black/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
                    <div className="w-full max-w-lg rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col my-auto">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-gray-900">Shipment Completion Pending</h3>
                            <button onClick={dismissOverdueModal} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-5 overflow-y-auto">
                            <div className="flex items-start gap-4">
                                <img src={courierIllustration} alt="Pending shipped orders" className="w-24 h-24 object-contain" />
                                <div className="flex-1">
                                    {Number(activeShippingSummary?.total || 0) === 1 && activeShippingSummary?.cases?.[0] ? (
                                        <>
                                            <p className="text-sm text-gray-500">This order is shipped but pending completion for more than 30 days.</p>
                                            <p className="mt-1 text-base font-semibold text-gray-900">
                                                {activeShippingSummary.cases[0]?.order_ref || `Order #${activeShippingSummary.cases[0]?.id || ''}`}
                                            </p>
                                            <p className="mt-1 text-sm text-gray-700">
                                                Customer: {activeShippingSummary.cases[0]?.customer_name || 'Guest'} {activeShippingSummary.cases[0]?.customer_mobile ? `(${activeShippingSummary.cases[0].customer_mobile})` : ''}
                                            </p>
                                            <p className="mt-1 text-sm text-gray-700">
                                                Courier: {activeShippingSummary.cases[0]?.courier_partner || '—'} {activeShippingSummary.cases[0]?.awb_number ? `| AWB ${activeShippingSummary.cases[0].awb_number}` : ''}
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-sm text-gray-500">Completion status is pending for shipped orders older than 30 days.</p>
                                            <p className="mt-1 text-2xl font-bold text-gray-900">{Number(activeShippingSummary?.total || 0)} cases</p>
                                            <p className="mt-1 text-sm text-gray-700">
                                                Review and close these cases from the Orders panel.
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="mt-5 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={dismissOverdueModal}
                                    className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                    Later
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const total = Number(activeShippingSummary?.total || 0);
                                        const firstId = total === 1 ? activeShippingSummary?.cases?.[0]?.id : null;
                                        if (total > 1) {
                                            setOrdersInitialStatusFilter('shipped');
                                        } else {
                                            setOrdersInitialStatusFilter('');
                                        }
                                        setActivePopupType(null);
                                        setActiveShippingSummary(null);
                                        setActiveTab('orders');
                                        setFocusOrderId(firstId || null);
                                    }}
                                    className="px-4 py-2 rounded-lg bg-primary text-accent text-sm font-semibold hover:bg-primary-light"
                                >
                                    {Number(activeShippingSummary?.total || 0) === 1 ? 'Open Order Details' : 'Go to Orders (Shipped)'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
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
