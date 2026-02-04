import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import Customers from './Customers';
import Products from './Products';
import Categories from './Categories';
import { Users, ShoppingBag, LayoutDashboard, LogOut, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logo from '../../assets/logo_light.webp'; 
import { Images } from 'lucide-react'; // Add 'Images' icon
import HeroCMS from './HeroCMS'; // Import the new component

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState('customers');
    const [expandedMenu, setExpandedMenu] = useState('products'); // Default open for demo
    const navigate = useNavigate();
    const { logout } = useAuth();
    
    
    const handleLogout = async () => {
        await logout(); // [FIX] Uses AuthContext to clear session & Firebase
        navigate('/admin/login');
    };
   

    const NavItem = ({ icon: Icon, label, id }) => (
        <button 
            onClick={() => setActiveTab(id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 
            ${activeTab === id 
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

    return (
        <div className="bg-gray-50 min-h-screen flex">
            
            {/* --- DESKTOP SIDEBAR --- */}
            <aside className="hidden md:flex flex-col w-64 bg-primary fixed h-full border-r border-white/10 shadow-2xl z-50">
                <div className="p-6 flex flex-col items-center border-b border-white/10">
                    <img src={logo} alt="Logo" className="w-16 h-auto mb-2 opacity-90" />
                    <h2 className="text-white font-serif text-lg tracking-wide">Admin Panel</h2>
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
                    <div className="flex items-center gap-2">
                        <img src={logo} className="w-8" alt="Logo" />
                        <span className="font-serif font-bold text-primary">SSC Admin</span>
                    </div>
                    <button onClick={handleLogout} className="text-gray-400"><LogOut size={20}/></button>
                </div>

                <div className="flex-1 p-4 md:p-8 pb-24 md:pb-8 max-w-7xl mx-auto w-full">
                    {activeTab === 'products' && <Products onNavigate={setActiveTab} />}
                    {activeTab === 'categories' && <Categories />}
                    {activeTab === 'customers' && <Customers />}
                    {activeTab === 'cms' && <HeroCMS />}
                    {activeTab === 'dashboard' && <div className="p-10 text-center text-gray-400">Dashboard Stats Coming Soon</div>}
                    {activeTab === 'orders' && <div className="p-10 text-center text-gray-400">Order Management Coming Soon</div>}
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
            <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] pb-safe pt-2 px-6 flex justify-between items-center z-40">
                <MobileNavBtn icon={LayoutDashboard} label="Home" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
                <MobileNavBtn icon={Package} label="Products" active={activeTab === 'products'} onClick={() => setActiveTab('products')} />
                <MobileNavBtn icon={Users} label="Customers" active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} />
                <MobileNavBtn icon={ShoppingBag} label="Orders" active={activeTab === 'orders'} onClick={() => setActiveTab('orders')} />
            </div>
        </div>
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