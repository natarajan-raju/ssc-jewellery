import { useState } from 'react';
import Customers from './Customers';
import { Users, ShoppingBag, LayoutDashboard, LogOut, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logo from '../../assets/logo_light.webp'; 

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState('customers');
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('token');
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
                    <NavItem icon={Users} label="Customers" id="customers" />
                    <NavItem icon={ShoppingBag} label="Orders" id="orders" />
                </nav>

                <div className="p-4 border-t border-white/10 space-y-4">
                    <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors">
                        <LogOut size={20} />
                        <span>Logout</span>
                    </button>
                    
                    {/* Sidebar Footer */}
                    <div className="text-center">
                        <p className="text-[10px] text-gray-500">Powered by</p>
                        <a href="https://creativecodz.com" target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-accent transition-colors font-medium">
                            Creativecodz
                        </a>
                    </div>
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
                    {activeTab === 'customers' && <Customers />}
                    {activeTab === 'dashboard' && <div className="p-10 text-center text-gray-400">Dashboard Stats Coming Soon</div>}
                    {activeTab === 'orders' && <div className="p-10 text-center text-gray-400">Order Management Coming Soon</div>}
                </div>

                {/* Mobile Footer Credit (Visible only on mobile at bottom of content) */}
                <div className="md:hidden text-center py-6 pb-24 text-gray-400">
                    <p className="text-[10px] flex items-center justify-center gap-1">
                        Powered by 
                        <a href="https://creativecodz.com" target="_blank" rel="noopener noreferrer" className="text-accent-deep hover:underline font-bold">
                            Creativecodz
                        </a>
                    </p>
                </div>
            </main>

            {/* --- MOBILE BOTTOM NAV --- */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] pb-safe pt-2 px-6 flex justify-between items-center z-40">
                <MobileNavBtn icon={LayoutDashboard} label="Home" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
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