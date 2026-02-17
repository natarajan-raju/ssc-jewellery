import { useEffect, useState, useMemo } from 'react';
import { adminService } from '../../services/adminService';
import { useAuth } from '../../context/AuthContext';
import { 
    Loader2, Trash2, Search, Mail, Phone, Key, 
    ShieldCheck, Plus, UserCog, Filter, ShoppingCart, X, Sparkles, Settings
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/Modal';
import AddCustomerModal from '../../components/AddCustomerModal';
import { useCustomers } from '../../context/CustomerContext';
import { formatAdminDate } from '../../utils/dateFormat';

const CUSTOMER_PAGE_SIZE = 20;
const buildVisiblePages = (currentPage, totalPages, windowSize = 5) => {
    const safeTotal = Math.max(1, Number(totalPages || 1));
    const safeCurrent = Math.min(safeTotal, Math.max(1, Number(currentPage || 1)));
    if (safeTotal <= windowSize) return Array.from({ length: safeTotal }, (_, idx) => idx + 1);
    const half = Math.floor(windowSize / 2);
    let start = Math.max(1, safeCurrent - half);
    let end = Math.min(safeTotal, start + windowSize - 1);
    if (end - start + 1 < windowSize) start = Math.max(1, end - windowSize + 1);
    return Array.from({ length: end - start + 1 }, (_, idx) => start + idx);
};

export default function Customers({ onOpenLoyalty }) {
    const { users, loading: isLoading, refreshUsers } = useCustomers();
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);

    const [roleFilter, setRoleFilter] = useState('all');
    const [birthdayOnly, setBirthdayOnly] = useState(false);
    
    // --- ROLE & ID TRACKING ---
    // const [currentUserRole, setCurrentUserRole] = useState(null);
    // const [currentUserId, setCurrentUserId] = useState(null); 
    // [NEW] Get Current User from Context
    const { user: currentUser } = useAuth();
    
    const toast = useToast();
    const [modalConfig, setModalConfig] = useState({ isOpen: false, type: 'default', title: '', message: '', targetUser: null });
    const [addModalRole, setAddModalRole] = useState(null); 
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [cartItems, setCartItems] = useState([]);
    const [isCartLoading, setIsCartLoading] = useState(false);

    useEffect(() => { 
        refreshUsers(false);
    }, [refreshUsers]);

    const handleAddUser = async (userData) => {
        const payload = { ...userData, role: addModalRole };
        if (addModalRole === 'staff') {
            delete payload.addressLine1; delete payload.city; delete payload.state; delete payload.zip;
        }
        await adminService.createUser(payload);
        // adminService.clearCache();
        await refreshUsers(true);
        setAddModalRole(null);
        toast.success(`${addModalRole === 'staff' ? 'Staff' : 'Customer'} added successfully`);
    };

    const openDeleteModal = (user) => {
        setModalConfig({ isOpen: true, type: 'delete', title: 'Delete User?', message: `Are you sure you want to remove ${user.name}?`, targetUser: user });
    };

    const openResetModal = (user) => {
        setModalConfig({ 
            isOpen: true, 
            type: 'password', 
            title: `Reset Password`, 
            message: `Enter a new password for ${user.name}.`, 
            targetUser: user 
        });
    };

    const handleModalConfirm = async (inputValue) => {
        setIsActionLoading(true);
        const { type, targetUser } = modalConfig;
        try {
            if (type === 'delete') {
                await adminService.deleteUser(targetUser.id);
                // adminService.clearCache();
                await refreshUsers(true);
                toast.success("User deleted successfully");
            } else if (type === 'password' || type === 'input') {
                if (!inputValue || inputValue.length < 6) {
                    toast.error("Password must be at least 6 characters");
                    setIsActionLoading(false); return;
                }
                await adminService.resetPassword(targetUser.id, inputValue);
                toast.success("Password updated successfully");
            }
            setModalConfig({ ...modalConfig, isOpen: false });
        } catch (error) { 
            console.error(error);
            toast.error(error.response?.data?.message || "Action failed"); 
        } 
        finally { setIsActionLoading(false); }
    };

    const filteredUsers = users.filter(user => 
        (user.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
        (user.mobile || '').includes(searchTerm)
    );

    const roleFilteredUsers = useMemo(() => {
        if (roleFilter === 'all') return filteredUsers;
        return filteredUsers.filter(u => u.role === roleFilter);
    }, [filteredUsers, roleFilter]);

    const isBirthdayToday = (dob) => {
        if (!dob) return false;
        const [year, month, day] = String(dob).split('T')[0].split('-');
        if (!month || !day) return false;
        const now = new Date();
        return Number(month) === now.getMonth() + 1 && Number(day) === now.getDate();
    };

    const formatDob = (dob) => {
        if (!dob) return '—';
        return formatAdminDate(String(dob).split('T')[0]);
    };

    const birthdayFilteredUsers = useMemo(() => {
        if (!birthdayOnly) return roleFilteredUsers;
        return roleFilteredUsers.filter(u => (u.role === 'customer' || !u.role) && isBirthdayToday(u.dob));
    }, [roleFilteredUsers, birthdayOnly]);

    const staffAndAdmins = roleFilteredUsers.filter(u => u.role === 'admin' || u.role === 'staff');
    const customersOnly = birthdayFilteredUsers.filter(u => !u.role || u.role === 'customer');
    const customerTotalPages = useMemo(
        () => Math.max(1, Math.ceil(customersOnly.length / CUSTOMER_PAGE_SIZE)),
        [customersOnly.length]
    );
    const paginatedCustomersOnly = useMemo(() => {
        const start = (Math.max(1, Number(page || 1)) - 1) * CUSTOMER_PAGE_SIZE;
        return customersOnly.slice(start, start + CUSTOMER_PAGE_SIZE);
    }, [customersOnly, page]);
    const visiblePages = useMemo(
        () => buildVisiblePages(page, customerTotalPages, 5),
        [customerTotalPages, page]
    );

    useEffect(() => {
        setPage(1);
    }, [searchTerm, roleFilter, birthdayOnly]);

    useEffect(() => {
        setPage((prev) => Math.min(Math.max(1, Number(prev || 1)), customerTotalPages));
    }, [customerTotalPages]);

    const openProfile = (user) => {
        if (user.role !== 'customer') return;
        setSelectedUser(user);
        setIsProfileOpen(true);
    };

    const formatAddress = (address) => {
        if (!address) return '—';
        if (typeof address === 'string') {
            try {
                const parsed = JSON.parse(address);
                return [parsed.line1, parsed.city, parsed.state, parsed.zip].filter(Boolean).join(', ') || '—';
            } catch {
                return address;
            }
        }
        return [address.line1, address.city, address.state, address.zip].filter(Boolean).join(', ') || '—';
    };

    const openCart = async (user) => {
        setSelectedUser(user);
        setIsCartOpen(true);
        setIsCartLoading(true);
        try {
            const data = await adminService.getUserCart(user.id);
            setCartItems(data.items || []);
        } catch (error) {
            toast.error('Failed to load cart');
        } finally {
            setIsCartLoading(false);
        }
    };

    // --- HELPER FOR PERMISSIONS ---
    const canResetPassword = (targetUser) => {
        if(!currentUser) return false;
        // 1. Admin can reset ANYONE except Customers
        if (currentUser.role === 'admin' && targetUser.role !== 'customer') return true;
        // 2. Staff can reset THEMSELVES only
        if (currentUser.role === 'staff' && targetUser.id === currentUser.id) return true;
        
        return false;
    };

    const canDeleteUser = (targetUser) => {
        if(!currentUser) return false;
        // 1. Admin can delete Staff & Customers (NOT other Admins)
        if (currentUser.role === 'admin' && targetUser.role !== 'admin') return true;
        // 2. Staff can delete Customers ONLY
        if (currentUser.role === 'staff' && targetUser.role === 'customer') return true;
        
        return false;
    };

    return (
        <div className="animate-fade-in">
            <Modal 
                isOpen={modalConfig.isOpen}
                onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
                onConfirm={handleModalConfirm}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                isLoading={isActionLoading}
            />

            <AddCustomerModal 
                isOpen={!!addModalRole} 
                onClose={() => setAddModalRole(null)}
                onConfirm={handleAddUser}
                roleToAdd={addModalRole} 
            />

            {/* --- CART MODAL --- */}
            {isCartOpen && selectedUser && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-800">
                                {selectedUser.name}'s Cart
                            </h3>
                            <button onClick={() => setIsCartOpen(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="max-h-80 overflow-y-auto space-y-3">
                            {isCartLoading && (
                                <div className="flex items-center justify-center text-xs text-gray-400 py-6">
                                    <Loader2 className="animate-spin mr-2" size={14} />
                                    Loading cart...
                                </div>
                            )}
                            {!isCartLoading && cartItems.length === 0 && (
                                <div className="text-center text-xs text-gray-400 py-6">
                                    Cart is empty.
                                </div>
                            )}
                            {cartItems.map(item => (
                                <div key={`${item.productId}_${item.variantId}`} className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden border border-gray-200">
                                        {item.imageUrl && <img src={item.imageUrl} className="w-full h-full object-cover" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-800 line-clamp-1">{item.title}</p>
                                        {item.variantTitle && <p className="text-xs text-gray-500 line-clamp-1">{item.variantTitle}</p>}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                                        <p className="text-sm font-bold text-primary">₹{Number(item.price || 0).toLocaleString()}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* --- PROFILE DRAWER --- */}
            {isProfileOpen && selectedUser && selectedUser.role === 'customer' && (
                <div className="fixed inset-0 z-[60] flex items-stretch justify-end bg-black/40 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white w-full max-w-xl h-full shadow-2xl p-6 overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-gray-800">Customer Profile</h3>
                            <button onClick={() => setIsProfileOpen(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="bg-gray-50 rounded-2xl p-4 mb-6 border border-gray-100 flex items-center gap-4">
                            <div className="w-16 h-16 rounded-2xl bg-white border border-gray-200 overflow-hidden flex items-center justify-center">
                                {selectedUser.profileImage ? (
                                    <img src={selectedUser.profileImage} alt={selectedUser.name} className="w-full h-full object-cover" />
                                ) : (
                                    <UserCog size={24} className="text-gray-400" />
                                )}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h4 className="text-lg font-bold text-gray-800">{selectedUser.name}</h4>
                                    {isBirthdayToday(selectedUser.dob) && (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                            <Sparkles size={12} /> Birthday
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-gray-500 mt-1">{selectedUser.email || '—'}</p>
                                <p className="text-sm text-gray-500">{selectedUser.mobile || '—'}</p>
                                <p className="text-xs text-gray-400 mt-2">Role: {selectedUser.role || 'customer'}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 mb-6">
                            <div className="p-4 rounded-xl border border-gray-200 bg-white">
                                <p className="text-xs text-gray-400 font-bold uppercase">Date of Birth</p>
                                <p className="text-sm text-gray-700 mt-2">{formatDob(selectedUser.dob)}</p>
                            </div>
                            <div className="p-4 rounded-xl border border-gray-200 bg-white">
                                <p className="text-xs text-gray-400 font-bold uppercase">Billing Address</p>
                                <p className="text-sm text-gray-700 mt-2">{formatAddress(selectedUser.billingAddress)}</p>
                            </div>
                            <div className="p-4 rounded-xl border border-gray-200 bg-white">
                                <p className="text-xs text-gray-400 font-bold uppercase">Shipping Address</p>
                                <p className="text-sm text-gray-700 mt-2">{formatAddress(selectedUser.address)}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl border border-gray-200 bg-white">
                                <p className="text-xs text-gray-400 font-bold uppercase">Overall Volume</p>
                                <p className="text-lg font-bold text-gray-800 mt-1">₹0</p>
                            </div>
                            <div className="p-4 rounded-xl border border-gray-200 bg-white">
                                <p className="text-xs text-gray-400 font-bold uppercase">Avg Order</p>
                                <p className="text-lg font-bold text-gray-800 mt-1">₹0</p>
                            </div>
                            <div className="p-4 rounded-xl border border-gray-200 bg-white">
                                <p className="text-xs text-gray-400 font-bold uppercase">Last Order</p>
                                <p className="text-lg font-bold text-gray-800 mt-1">—</p>
                            </div>
                            <div className="p-4 rounded-xl border border-gray-200 bg-white">
                                <p className="text-xs text-gray-400 font-bold uppercase">Status</p>
                                <p className="text-lg font-bold text-gray-800 mt-1">Active</p>
                            </div>
                        </div>

                        <div className="mt-6 p-4 rounded-xl border border-dashed border-gray-200 text-sm text-gray-500">
                            Analytics will update once Orders & Checkout are enabled.
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-serif text-primary font-bold">User Management</h1>
                    <p className="text-gray-500 text-sm mt-1">Manage staff access & customers</p>
                </div>
                
                <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                    {/* --- INSERT THIS BLOCK BEFORE SEARCH --- */}
                    <div className="relative hidden md:block">
                        <Filter className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                        <select 
                            value={roleFilter}
                            onChange={(e) => {
                                setRoleFilter(e.target.value);
                                setPage(1); // Reset to page 1
                            }}
                            className="pl-10 pr-8 py-3 bg-white rounded-xl border border-gray-200 shadow-sm focus:border-accent outline-none appearance-none cursor-pointer"
                        >
                            <option value="all">All Roles</option>
                            <option value="customer">Customers</option>
                            <option value="staff">Staff</option>
                            <option value="admin">Admins</option>
                        </select>
                    </div>
                    <button
                        type="button"
                        onClick={() => setBirthdayOnly((prev) => !prev)}
                        className={`flex items-center gap-2 px-4 py-3 rounded-xl border shadow-sm text-sm font-semibold transition-all
                            ${birthdayOnly ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-gray-200 text-gray-600 hover:border-accent'}`}
                    >
                        <Sparkles size={16} />
                        Birthdays Today
                    </button>
                    <div className="relative flex-1 md:w-64 lg:w-80">                        
                        <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                        <input 
                            placeholder="Search users..." 
                            className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-gray-200 shadow-sm focus:border-accent outline-none"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    
                    <button
                        type="button"
                        onClick={() => onOpenLoyalty?.()}
                        className="bg-white hover:bg-gray-50 text-gray-700 font-bold px-4 py-3 rounded-xl shadow-sm border border-gray-200 flex items-center justify-center gap-2 transition-all active:scale-95 flex-1 md:flex-none"
                    >
                        <Settings size={18} />
                        <span className="whitespace-nowrap">Loyalty</span>
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20"><Loader2 className="animate-spin text-accent w-10 h-10" /></div>
            ) : (
                <>
                    {/* MOBILE LIST: ADMINS/STAFF */}
                    <div className="md:hidden space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Admins & Staff</h3>
                            {currentUser?.role === 'admin' && (
                                <button
                                    onClick={() => setAddModalRole('staff')}
                                    className="bg-gray-800 hover:bg-gray-700 text-white font-bold px-3 py-2 rounded-lg text-xs shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
                                >
                                    <UserCog size={14} strokeWidth={2} />
                                    <span className="whitespace-nowrap">Add Staff</span>
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                            {staffAndAdmins.map((user) => (
                                <div 
                                    key={user.id} 
                                    onClick={() => openProfile(user)}
                                    className={`p-5 rounded-xl shadow-sm border relative cursor-pointer
                                    ${user.role === 'admin' ? 'bg-amber-50 border-accent/30' : 
                                      user.role === 'staff' ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100'}`}>
                                    
                                    <div className="flex items-start gap-4">
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 
                                            ${user.role === 'admin' ? 'bg-accent text-primary' : 
                                              user.role === 'staff' ? 'bg-blue-100 text-blue-600' : 'bg-primary/5 text-primary'}`}>
                                            {user.role === 'admin' ? <ShieldCheck size={20} /> : 
                                             user.role === 'staff' ? <UserCog size={20} /> : 
                                             <span className="font-bold">{user.name.charAt(0)}</span>}
                                        </div>

                                        <div className="flex-1 overflow-hidden">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-gray-800">{user.name}</h3>
                                                {user.role === 'admin' && <span className="text-[10px] bg-primary text-accent px-2 py-0.5 rounded uppercase font-bold tracking-wider">Admin</span>}
                                                {user.role === 'staff' && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase font-bold tracking-wider">Staff</span>}
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1"><Mail size={12}/> {user.email}</p>
                                            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1"><Phone size={12}/> {user.mobile}</p>
                                        </div>
                                    </div>

                                    <div className="mt-4 pt-3 border-t border-gray-200/50 flex justify-end gap-3">
                                        {canResetPassword(user) && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); openResetModal(user); }} 
                                                className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-accent-deep bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200"
                                            >
                                                <Key size={14} /> Reset Pwd
                                            </button>
                                        )}
                                        {canDeleteUser(user) && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); openDeleteModal(user); }} 
                                                className="flex items-center gap-1 text-xs font-medium text-red-400 hover:text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100"
                                            >
                                                <Trash2 size={14} /> Delete
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* MOBILE LIST: CUSTOMERS */}
                    <div className="md:hidden space-y-3 mt-8">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Customers</h3>
                            <button
                                onClick={() => setAddModalRole('customer')}
                                className="bg-primary hover:bg-primary-light text-accent font-bold px-3 py-2 rounded-lg text-xs shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all active:scale-95"
                            >
                                <Plus size={14} strokeWidth={3} />
                                <span className="whitespace-nowrap">Add Customer</span>
                            </button>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                            {paginatedCustomersOnly.map((user) => (
                                <div 
                                    key={user.id} 
                                    onClick={() => openProfile(user)}
                                    className={`p-5 rounded-xl shadow-sm border relative cursor-pointer
                                    ${isBirthdayToday(user.dob) ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
                                    
                                    <div className="flex items-start gap-4">
                                        <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-primary/5 text-primary">
                                            <span className="font-bold">{user.name.charAt(0)}</span>
                                        </div>

                                        <div className="flex-1 overflow-hidden">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-gray-800">{user.name}</h3>
                                                {isBirthdayToday(user.dob) && (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                                        <Sparkles size={12} /> Birthday
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1"><Mail size={12}/> {user.email}</p>
                                            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1"><Phone size={12}/> {user.mobile}</p>
                                        </div>
                                    </div>

                                    <div className="mt-4 pt-3 border-t border-gray-200/50 flex justify-end gap-3">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); openCart(user); }}
                                            className={`relative flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${user.cart_count > 0 ? 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100' : 'text-gray-500 bg-gray-50 border-gray-200 hover:text-primary'}`}
                                        >
                                            <ShoppingCart size={14} /> Cart
                                            {user.cart_count > 0 && (
                                                <span className="ml-1 text-[10px] font-bold bg-green-600 text-white rounded-full px-1.5 py-0.5">
                                                    {user.cart_count}
                                                </span>
                                            )}
                                        </button>
                                        {canDeleteUser(user) && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); openDeleteModal(user); }} 
                                                className="flex items-center gap-1 text-xs font-medium text-red-400 hover:text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100"
                                            >
                                                <Trash2 size={14} /> Delete
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* DESKTOP TABLE: ADMINS/STAFF */}
                    <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Admins & Staff</h3>
                            {currentUser?.role === 'admin' && (
                                <button
                                    onClick={() => setAddModalRole('staff')}
                                    className="bg-gray-800 hover:bg-gray-700 text-white font-bold px-3 py-2 rounded-lg text-xs shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
                                >
                                    <UserCog size={14} strokeWidth={2} />
                                    <span className="whitespace-nowrap">Add Staff</span>
                                </button>
                            )}
                        </div>
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">User</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Contact</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Role</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {staffAndAdmins.map((user) => (
                                    <tr 
                                        key={user.id} 
                                        onClick={() => openProfile(user)}
                                        className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs 
                                                    ${user.role === 'admin' ? 'bg-accent text-primary' : 
                                                      user.role === 'staff' ? 'bg-blue-100 text-blue-600' : 'bg-primary/10 text-primary'}`}>
                                                    {user.role === 'admin' ? <ShieldCheck size={14}/> : 
                                                     user.role === 'staff' ? <UserCog size={14}/> : 
                                                     user.name.charAt(0)}
                                                </div>
                                                <span className="font-medium text-gray-900">{user.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-gray-900">{user.email}</div>
                                            <div className="text-xs text-gray-500">{user.mobile}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {user.role === 'admin' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary text-accent">ADMIN</span>}
                                            {user.role === 'staff' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">STAFF</span>}
                                        </td>
                                        <td className="px-6 py-4 text-right flex justify-end gap-2">
                                            {canResetPassword(user) && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); openResetModal(user); }} 
                                                    className="text-gray-400 hover:text-accent-deep hover:bg-amber-50 p-2 rounded-lg transition-all" 
                                                    title="Reset Password"
                                                >
                                                    <Key size={18} />
                                                </button>
                                            )}

                                            {canDeleteUser(user) && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); openDeleteModal(user); }} 
                                                    className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-all" 
                                                    title="Delete User"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}

                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* DESKTOP TABLE: CUSTOMERS */}
                    <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Customers</h3>
                            <button
                                onClick={() => setAddModalRole('customer')}
                                className="bg-primary hover:bg-primary-light text-accent font-bold px-3 py-2 rounded-lg text-xs shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all active:scale-95"
                            >
                                <Plus size={14} strokeWidth={3} />
                                <span className="whitespace-nowrap">Add Customer</span>
                            </button>
                        </div>
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Contact</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {paginatedCustomersOnly.map((user) => (
                                    <tr 
                                        key={user.id} 
                                        onClick={() => openProfile(user)}
                                        className={`hover:bg-gray-50/50 transition-colors cursor-pointer ${isBirthdayToday(user.dob) ? 'bg-amber-50/60' : ''}`}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs bg-primary/10 text-primary">
                                                    {user.name.charAt(0)}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-gray-900">{user.name}</span>
                                                    {isBirthdayToday(user.dob) && (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                                            <Sparkles size={12} /> Birthday
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-gray-900">{user.email}</div>
                                            <div className="text-xs text-gray-500">{user.mobile}</div>
                                        </td>
                                        <td className="px-6 py-4 text-right flex justify-end gap-2">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); openCart(user); }} 
                                                className={`relative p-2 rounded-lg transition-all ${user.cart_count > 0 ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:text-primary hover:bg-emerald-50'}`}
                                                title="View Cart"
                                            >
                                                <ShoppingCart size={18} />
                                                {user.cart_count > 0 && (
                                                    <span className="absolute -top-1 -right-1 bg-green-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                                        {user.cart_count}
                                                    </span>
                                                )}
                                            </button>

                                            {canDeleteUser(user) && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); openDeleteModal(user); }} 
                                                    className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-all" 
                                                    title="Delete User"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}

                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {customersOnly.length > 0 && customerTotalPages > 1 && (
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mt-6 p-4 flex flex-col md:flex-row items-center justify-between gap-3">
                            <p className="text-xs text-gray-500">Page {page} of {customerTotalPages}</p>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                                    disabled={page <= 1}
                                    className="px-3 py-1.5 rounded-md border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Previous
                                </button>
                                {visiblePages.map((pageNo) => (
                                    <button
                                        key={pageNo}
                                        type="button"
                                        onClick={() => setPage(pageNo)}
                                        className={`px-3 py-1.5 rounded-md border text-xs font-semibold ${
                                            pageNo === page
                                                ? 'border-primary bg-primary text-accent'
                                                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                                        }`}
                                    >
                                        {pageNo}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setPage((prev) => Math.min(customerTotalPages, prev + 1))}
                                    disabled={page >= customerTotalPages}
                                    className="px-3 py-1.5 rounded-md border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}

                    {/* --- EMPTY STATE ILLUSTRATION (Only Admins Visible) --- */}
                    {!isLoading && roleFilteredUsers.length > 0 && roleFilteredUsers.every(u => u.role === 'admin') && (
                        <div className="flex flex-col items-center justify-center py-12 animate-fade-in bg-white rounded-2xl border border-dashed border-gray-200 mt-6 mx-4 md:mx-0 shadow-sm">
                            <img 
                                src="/user_add.svg" 
                                alt="Add users" 
                                className="w-40 h-40 md:w-56 md:h-56 mb-4 opacity-80"
                            />
                            <h3 className="text-lg font-bold text-gray-800 mb-2">No customers or staff yet</h3>
                            <p className="text-gray-500 text-center max-w-sm mb-6 text-sm">
                                It looks like only administrators are here. Start adding your team or customers.
                            </p>
                            <button 
                                onClick={() => setAddModalRole('customer')}
                                className="bg-primary hover:bg-primary-light text-accent font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all active:scale-95"
                            >
                                <Plus size={18} strokeWidth={3} />
                                <span>Add First Customer</span>
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
