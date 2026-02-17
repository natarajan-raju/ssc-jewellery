import { useEffect, useMemo, useState } from 'react';
import { adminService } from '../../services/adminService';
import { useAuth } from '../../context/AuthContext';
import {
    ChevronDown,
    ChevronUp,
    Key,
    Loader2,
    Mail,
    MessageCircle,
    Phone,
    Plus,
    Search,
    ShieldCheck,
    ShoppingCart,
    Sparkles,
    TicketPercent,
    Trash2,
    UserCog,
    X
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

const getWhatsappLink = (mobile = '') => {
    const digits = String(mobile || '').replace(/\D/g, '');
    if (!digits) return null;
    const full = digits.length === 10 ? `91${digits}` : digits;
    return `https://wa.me/${full}`;
};

const isBirthdayToday = (dob) => {
    if (!dob) return false;
    const [_, month, day] = String(dob).split('T')[0].split('-');
    if (!month || !day) return false;
    const now = new Date();
    return Number(month) === now.getMonth() + 1 && Number(day) === now.getDate();
};

export default function Customers({ onOpenLoyalty }) {
    const { users, loading: isLoading, refreshUsers } = useCustomers();
    const { user: currentUser } = useAuth();
    const toast = useToast();

    const [searchTerm, setSearchTerm] = useState('');
    const [tierFilter, setTierFilter] = useState('all');
    const [birthdayOnly, setBirthdayOnly] = useState(false);
    const [page, setPage] = useState(1);
    const [adminAccordionOpen, setAdminAccordionOpen] = useState(false);

    const [modalConfig, setModalConfig] = useState({ isOpen: false, type: 'default', title: '', message: '', targetUser: null });
    const [addModalRole, setAddModalRole] = useState(null);
    const [isActionLoading, setIsActionLoading] = useState(false);

    const [selectedUser, setSelectedUser] = useState(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [cartItems, setCartItems] = useState([]);
    const [isCartLoading, setIsCartLoading] = useState(false);
    const [activeCoupons, setActiveCoupons] = useState([]);

    const [couponModalUser, setCouponModalUser] = useState(null);
    const [couponSaving, setCouponSaving] = useState(false);
    const [couponForm, setCouponForm] = useState({
        name: '',
        discountType: 'percent',
        discountValue: 5,
        minCartValue: 0,
        usageLimitPerUser: 1,
        expiresAt: ''
    });

    useEffect(() => {
        refreshUsers(false);
    }, [refreshUsers]);

    const canResetPassword = (targetUser) => {
        if (!currentUser) return false;
        if (currentUser.role === 'admin' && targetUser.role !== 'customer') return true;
        if (currentUser.role === 'staff' && targetUser.id === currentUser.id) return true;
        return false;
    };

    const canDeleteUser = (targetUser) => {
        if (!currentUser) return false;
        if (currentUser.role === 'admin' && targetUser.role !== 'admin') return true;
        if (currentUser.role === 'staff' && targetUser.role === 'customer') return true;
        return false;
    };

    const staffAndAdmins = useMemo(
        () => users.filter((u) => u.role === 'admin' || u.role === 'staff'),
        [users]
    );

    const customersOnly = useMemo(
        () => users.filter((u) => !u.role || u.role === 'customer'),
        [users]
    );

    const filteredCustomers = useMemo(() => {
        let rows = customersOnly;
        const term = String(searchTerm || '').trim().toLowerCase();
        if (term) {
            rows = rows.filter((u) =>
                String(u.name || '').toLowerCase().includes(term)
                || String(u.mobile || '').includes(term)
                || String(u.email || '').toLowerCase().includes(term)
            );
        }
        if (tierFilter !== 'all') {
            rows = rows.filter((u) => String(u.loyaltyTier || 'regular').toLowerCase() === tierFilter);
        }
        if (birthdayOnly) {
            rows = rows.filter((u) => isBirthdayToday(u.dob));
        }
        return rows;
    }, [customersOnly, searchTerm, tierFilter, birthdayOnly]);

    const customerTotalPages = useMemo(
        () => Math.max(1, Math.ceil(filteredCustomers.length / CUSTOMER_PAGE_SIZE)),
        [filteredCustomers.length]
    );

    const paginatedCustomersOnly = useMemo(() => {
        const start = (Math.max(1, Number(page || 1)) - 1) * CUSTOMER_PAGE_SIZE;
        return filteredCustomers.slice(start, start + CUSTOMER_PAGE_SIZE);
    }, [filteredCustomers, page]);

    const visiblePages = useMemo(
        () => buildVisiblePages(page, customerTotalPages, 5),
        [customerTotalPages, page]
    );

    useEffect(() => {
        setPage(1);
    }, [searchTerm, tierFilter, birthdayOnly]);

    useEffect(() => {
        setPage((prev) => Math.min(Math.max(1, Number(prev || 1)), customerTotalPages));
    }, [customerTotalPages]);

    const handleAddUser = async (userData) => {
        const payload = { ...userData, role: addModalRole };
        if (addModalRole === 'staff') {
            delete payload.addressLine1;
            delete payload.city;
            delete payload.state;
            delete payload.zip;
        }
        await adminService.createUser(payload);
        await refreshUsers(true);
        setAddModalRole(null);
        toast.success(`${addModalRole === 'staff' ? 'Staff' : 'Customer'} added successfully`);
    };

    const openDeleteModal = (user) => {
        setModalConfig({
            isOpen: true,
            type: 'delete',
            title: 'Delete User?',
            message: `Are you sure you want to remove ${user.name}?`,
            targetUser: user
        });
    };

    const openResetModal = (user) => {
        setModalConfig({
            isOpen: true,
            type: 'password',
            title: 'Reset Password',
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
                await refreshUsers(true);
                toast.success('User deleted successfully');
            } else if (type === 'password') {
                if (!inputValue || inputValue.length < 6) {
                    toast.error('Password must be at least 6 characters');
                    setIsActionLoading(false);
                    return;
                }
                await adminService.resetPassword(targetUser.id, inputValue);
                toast.success('Password updated successfully');
            }
            setModalConfig((prev) => ({ ...prev, isOpen: false }));
        } catch (error) {
            toast.error(error?.message || 'Action failed');
        } finally {
            setIsActionLoading(false);
        }
    };

    const openCart = async (user) => {
        setSelectedUser(user);
        setIsCartOpen(true);
        setIsCartLoading(true);
        try {
            const data = await adminService.getUserCart(user.id);
            setCartItems(data.items || []);
        } catch {
            toast.error('Failed to load cart');
        } finally {
            setIsCartLoading(false);
        }
    };

    const openProfile = async (user) => {
        if (String(user.role || 'customer') !== 'customer') return;
        setSelectedUser(user);
        setIsProfileOpen(true);
        setActiveCoupons([]);
        try {
            const data = await adminService.getUserActiveCoupons(user.id);
            setActiveCoupons(Array.isArray(data?.coupons) ? data.coupons : []);
        } catch {}
    };

    const openIssueCouponModal = (user) => {
        setCouponModalUser(user);
        setCouponForm({
            name: `Offer for ${user.name || 'Customer'}`,
            discountType: 'percent',
            discountValue: 5,
            minCartValue: 0,
            usageLimitPerUser: 1,
            expiresAt: ''
        });
    };

    const handleIssueCouponToUser = async () => {
        if (!couponModalUser?.id) return;
        setCouponSaving(true);
        try {
            const payload = {
                name: couponForm.name || `Offer for ${couponModalUser.name || ''}`,
                discountType: couponForm.discountType,
                discountValue: Number(couponForm.discountValue || 0),
                minCartValue: Number(couponForm.minCartValue || 0),
                usageLimitPerUser: Math.max(1, Number(couponForm.usageLimitPerUser || 1)),
                expiresAt: couponForm.expiresAt ? new Date(couponForm.expiresAt).toISOString() : null
            };
            const res = await adminService.issueCouponToUser(couponModalUser.id, payload);
            toast.success(`Coupon issued: ${res?.coupon?.code || ''}`);
            setCouponModalUser(null);
            if (selectedUser?.id === couponModalUser.id) {
                const data = await adminService.getUserActiveCoupons(couponModalUser.id);
                setActiveCoupons(Array.isArray(data?.coupons) ? data.coupons : []);
            }
        } catch (error) {
            toast.error(error?.message || 'Failed to issue coupon');
        } finally {
            setCouponSaving(false);
        }
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

    return (
        <div className="animate-fade-in">
            <Modal
                isOpen={modalConfig.isOpen}
                onClose={() => setModalConfig((prev) => ({ ...prev, isOpen: false }))}
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

            {couponModalUser && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-800">Issue Coupon to {couponModalUser.name}</h3>
                            <button onClick={() => setCouponModalUser(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><X size={16} /></button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <input className="input-field md:col-span-2" placeholder="Coupon name" value={couponForm.name} onChange={(e) => setCouponForm((p) => ({ ...p, name: e.target.value }))} />
                            <select className="input-field" value={couponForm.discountType} onChange={(e) => setCouponForm((p) => ({ ...p, discountType: e.target.value }))}>
                                <option value="percent">Percent</option>
                                <option value="fixed">Fixed INR</option>
                            </select>
                            <input className="input-field" type="number" placeholder="Discount value" value={couponForm.discountValue} onChange={(e) => setCouponForm((p) => ({ ...p, discountValue: e.target.value }))} />
                            <input className="input-field" type="number" placeholder="Min cart value (INR)" value={couponForm.minCartValue} onChange={(e) => setCouponForm((p) => ({ ...p, minCartValue: e.target.value }))} />
                            <input className="input-field" type="number" placeholder="Usage per user" value={couponForm.usageLimitPerUser} onChange={(e) => setCouponForm((p) => ({ ...p, usageLimitPerUser: e.target.value }))} />
                            <input className="input-field md:col-span-2" type="datetime-local" value={couponForm.expiresAt} onChange={(e) => setCouponForm((p) => ({ ...p, expiresAt: e.target.value }))} />
                        </div>
                        <p className="text-xs text-gray-500">Coupon will be sent via email and WhatsApp (if mobile is available).</p>
                        <div className="flex justify-end gap-2">
                            <button className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50" onClick={() => setCouponModalUser(null)}>Cancel</button>
                            <button disabled={couponSaving} className="px-4 py-2 rounded-lg bg-primary text-accent text-sm font-semibold hover:bg-primary-light disabled:opacity-60" onClick={handleIssueCouponToUser}>
                                {couponSaving ? 'Issuing...' : 'Issue Coupon'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isCartOpen && selectedUser && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-800">{selectedUser.name}'s Cart</h3>
                            <button onClick={() => setIsCartOpen(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><X size={18} /></button>
                        </div>
                        <div className="max-h-80 overflow-y-auto space-y-3">
                            {isCartLoading && <div className="flex items-center justify-center text-xs text-gray-400 py-6"><Loader2 className="animate-spin mr-2" size={14} />Loading cart...</div>}
                            {!isCartLoading && cartItems.length === 0 && <div className="text-center text-xs text-gray-400 py-6">Cart is empty.</div>}
                            {cartItems.map((item) => (
                                <div key={`${item.productId}_${item.variantId}`} className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden border border-gray-200">{item.imageUrl && <img src={item.imageUrl} className="w-full h-full object-cover" />}</div>
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

            {isProfileOpen && selectedUser && (
                <div className="fixed inset-0 z-[60] flex items-stretch justify-end bg-black/40 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-xl h-full shadow-2xl p-6 overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-gray-800">Customer Profile</h3>
                            <button onClick={() => setIsProfileOpen(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><X size={18} /></button>
                        </div>
                        <div className="bg-gray-50 rounded-2xl p-4 mb-6 border border-gray-100">
                            <h4 className="text-lg font-bold text-gray-800">{selectedUser.name}</h4>
                            <p className="text-sm text-gray-500 mt-1">{selectedUser.email || '—'}</p>
                            <p className="text-sm text-gray-500">{selectedUser.mobile || '—'}</p>
                            <p className="text-xs text-gray-400 mt-2">Tier: {String(selectedUser.loyaltyTier || 'regular').toUpperCase()}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="p-4 rounded-xl border border-gray-200 bg-white"><p className="text-xs text-gray-400 font-bold uppercase">Overall Volume</p><p className="text-lg font-bold text-gray-800 mt-1">₹{Number(selectedUser.totalSpend || 0).toLocaleString('en-IN')}</p></div>
                            <div className="p-4 rounded-xl border border-gray-200 bg-white"><p className="text-xs text-gray-400 font-bold uppercase">Avg Order</p><p className="text-lg font-bold text-gray-800 mt-1">₹{Number(selectedUser.avgOrderValue || 0).toLocaleString('en-IN')}</p></div>
                            <div className="p-4 rounded-xl border border-gray-200 bg-white"><p className="text-xs text-gray-400 font-bold uppercase">Total Orders</p><p className="text-lg font-bold text-gray-800 mt-1">{Number(selectedUser.totalOrders || 0)}</p></div>
                            <div className="p-4 rounded-xl border border-gray-200 bg-white"><p className="text-xs text-gray-400 font-bold uppercase">Last Order</p><p className="text-sm font-bold text-gray-800 mt-1">{selectedUser.lastOrderAt ? formatAdminDate(selectedUser.lastOrderAt) : '—'}</p></div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 mb-6">
                            <div className="p-4 rounded-xl border border-gray-200 bg-white">
                                <p className="text-xs text-gray-400 font-bold uppercase">Date of Birth</p>
                                <p className="text-sm text-gray-700 mt-2">{selectedUser.dob ? formatAdminDate(String(selectedUser.dob).split('T')[0]) : '—'}</p>
                            </div>
                            <div className="p-4 rounded-xl border border-gray-200 bg-white">
                                <p className="text-xs text-gray-400 font-bold uppercase">Billing Address</p>
                                <p className="text-sm text-gray-700 mt-2">{formatAddress(selectedUser.billingAddress)}</p>
                            </div>
                            <div className="p-4 rounded-xl border border-gray-200 bg-white">
                                <p className="text-xs text-gray-400 font-bold uppercase">Shipping Address</p>
                                <p className="text-sm text-gray-700 mt-2">{formatAddress(selectedUser.address)}</p>
                            </div>
                            <div className="p-4 rounded-xl border border-gray-200 bg-white">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs text-gray-400 font-bold uppercase">Active Coupons</p>
                                    <button type="button" onClick={() => openIssueCouponModal(selectedUser)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-600">
                                        <TicketPercent size={12} /> Issue
                                    </button>
                                </div>
                                <p className="text-sm text-gray-700 mt-2">{activeCoupons.length} active coupon(s)</p>
                                <div className="mt-2 space-y-1">
                                    {activeCoupons.slice(0, 6).map((cp) => (
                                        <p key={cp.id || cp.code} className="text-xs text-gray-600">- {cp.code} ({cp.discountType === 'fixed' ? `₹${Number(cp.discountValue || 0)}` : `${Number(cp.discountValue || 0)}%`})</p>
                                    ))}
                                    {activeCoupons.length === 0 && <p className="text-xs text-gray-400">No active coupons.</p>}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-serif text-primary font-bold">User Management</h1>
                    <p className="text-gray-500 text-sm mt-1">Manage staff access and customers</p>
                </div>
                <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                    <button type="button" onClick={() => setBirthdayOnly((prev) => !prev)} className={`flex items-center gap-2 px-4 py-3 rounded-xl border shadow-sm text-sm font-semibold transition-all ${birthdayOnly ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-gray-200 text-gray-600 hover:border-accent'}`}>
                        <Sparkles size={16} /> Birthdays Today
                    </button>
                    <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} className="px-4 py-3 bg-white rounded-xl border border-gray-200 shadow-sm focus:border-accent outline-none">
                        <option value="all">All Tiers</option>
                        <option value="regular">Regular</option>
                        <option value="bronze">Bronze</option>
                        <option value="silver">Silver</option>
                        <option value="gold">Gold</option>
                        <option value="platinum">Platinum</option>
                    </select>
                    <div className="relative flex-1 md:w-72">
                        <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                        <input placeholder="Search customers..." className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-gray-200 shadow-sm focus:border-accent outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    <button type="button" onClick={() => onOpenLoyalty?.()} className="bg-white hover:bg-gray-50 text-gray-700 font-bold px-4 py-3 rounded-xl shadow-sm border border-gray-200 flex items-center justify-center gap-2 transition-all active:scale-95">
                        <Sparkles size={18} /><span className="whitespace-nowrap">Loyalty</span>
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20"><Loader2 className="animate-spin text-accent w-10 h-10" /></div>
            ) : (
                <>
                    <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6">
                        <button type="button" onClick={() => setAdminAccordionOpen((prev) => !prev)} className="w-full px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Admins & Staff</h3>
                            {adminAccordionOpen ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                        </button>
                        {adminAccordionOpen && (
                            <>
                                <div className="px-6 py-3 border-b border-gray-100 flex justify-end">
                                    {currentUser?.role === 'admin' && (
                                        <button onClick={() => setAddModalRole('staff')} className="w-36 bg-gray-800 hover:bg-gray-700 text-white font-bold px-3 py-2 rounded-lg text-xs shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95">
                                            <UserCog size={14} strokeWidth={2} /> Add Staff
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
                                            <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${user.role === 'admin' ? 'bg-accent text-primary' : 'bg-blue-100 text-blue-700'}`}>
                                                            {user.role === 'admin' ? <ShieldCheck size={14} /> : <UserCog size={14} />}
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
                                                    {canResetPassword(user) && <button onClick={() => openResetModal(user)} className="text-gray-400 hover:text-accent-deep hover:bg-amber-50 p-2 rounded-lg transition-all" title="Reset Password"><Key size={18} /></button>}
                                                    {canDeleteUser(user) && <button onClick={() => openDeleteModal(user)} className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-all" title="Delete User"><Trash2 size={18} /></button>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </>
                        )}
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Customers</h3>
                            <button onClick={() => setAddModalRole('customer')} className="w-36 bg-primary hover:bg-primary-light text-accent font-bold px-3 py-2 rounded-lg text-xs shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all active:scale-95">
                                <Plus size={14} strokeWidth={3} /> Add Customer
                            </button>
                        </div>
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Tier</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Contact</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {paginatedCustomersOnly.map((user) => {
                                    const waLink = getWhatsappLink(user.mobile);
                                    return (
                                        <tr key={user.id} onClick={() => openProfile(user)} className={`hover:bg-gray-50/50 transition-colors cursor-pointer ${isBirthdayToday(user.dob) ? 'bg-amber-50/60' : ''}`}>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs bg-primary/10 text-primary">{String(user.name || 'U').charAt(0)}</div>
                                                    <span className="font-medium text-gray-900">{user.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 uppercase">{String(user.loyaltyTier || 'regular')}</span></td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-900">{user.email || '—'}</div>
                                                <div className="text-xs text-gray-500">{user.mobile || '—'}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                <button onClick={(e) => { e.stopPropagation(); openIssueCouponModal(user); }} className="text-gray-400 hover:text-indigo-700 hover:bg-indigo-50 p-2 rounded-lg transition-all" title="Issue Coupon">
                                                    <TicketPercent size={18} />
                                                </button>
                                                {waLink && (
                                                    <a href={waLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-gray-400 hover:text-green-700 hover:bg-green-50 p-2 rounded-lg transition-all" title="Open WhatsApp">
                                                        <MessageCircle size={18} />
                                                    </a>
                                                )}
                                                <button onClick={(e) => { e.stopPropagation(); openCart(user); }} className={`relative p-2 rounded-lg border transition-colors ${user.cart_count > 0 ? 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100' : 'text-gray-500 bg-gray-50 border-gray-200 hover:text-primary'}`} title="View Cart">
                                                    <ShoppingCart size={16} />
                                                    {user.cart_count > 0 && <span className="absolute -top-1 -right-1 text-[10px] font-bold bg-green-600 text-white rounded-full px-1.5 py-0.5">{user.cart_count}</span>}
                                                </button>
                                                {canDeleteUser(user) && <button onClick={(e) => { e.stopPropagation(); openDeleteModal(user); }} className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-all" title="Delete User"><Trash2 size={18} /></button>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {customerTotalPages > 1 && (
                        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                            <button onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page === 1} className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 disabled:opacity-40">Prev</button>
                            {visiblePages.map((p) => (
                                <button key={p} onClick={() => setPage(p)} className={`px-3 py-2 rounded-lg border text-sm ${page === p ? 'bg-primary text-accent border-primary' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                    {p}
                                </button>
                            ))}
                            <button onClick={() => setPage((prev) => Math.min(customerTotalPages, prev + 1))} disabled={page === customerTotalPages} className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 disabled:opacity-40">Next</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
