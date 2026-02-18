import { useEffect, useMemo, useState } from 'react';
import { Facebook, Instagram, Key, Plus, Save, ShieldCheck, Trash2, UserCog, Youtube } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useCustomers } from '../../context/CustomerContext';
import AddCustomerModal from '../../components/AddCustomerModal';
import Modal from '../../components/Modal';

const DEFAULT_FORM = {
    displayName: '',
    contactNumber: '',
    supportEmail: '',
    address: '',
    instagramUrl: '',
    youtubeUrl: '',
    facebookUrl: '',
    whatsappNumber: ''
};

export default function CompanyInfo() {
    const toast = useToast();
    const { user: currentUser } = useAuth();
    const { users, refreshUsers } = useCustomers();
    const [form, setForm] = useState(DEFAULT_FORM);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        type: 'default',
        title: '',
        message: '',
        targetUser: null
    });

    const staffAndAdmins = useMemo(
        () => users.filter((u) => u.role === 'admin' || u.role === 'staff'),
        [users]
    );

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            try {
                const data = await adminService.getCompanyInfo();
                setForm({ ...DEFAULT_FORM, ...(data?.company || {}) });
                await refreshUsers(false);
            } catch (error) {
                toast.error(error.message || 'Failed to load company info');
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [toast, refreshUsers]);

    const canResetPassword = (targetUser) => {
        if (!currentUser) return false;
        if (currentUser.role === 'admin' && targetUser.role !== 'customer') return true;
        if (currentUser.role === 'staff' && targetUser.id === currentUser.id) return true;
        return false;
    };

    const canDeleteUser = (targetUser) => {
        if (!currentUser) return false;
        if (currentUser.role === 'admin' && targetUser.role !== 'admin') return true;
        return false;
    };

    const handleChange = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const data = await adminService.updateCompanyInfo(form);
            setForm({ ...DEFAULT_FORM, ...(data?.company || {}) });
            toast.success('Company info updated');
        } catch (error) {
            toast.error(error.message || 'Failed to update company info');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddStaff = async (userData) => {
        const payload = {
            ...userData,
            role: 'staff'
        };
        delete payload.addressLine1;
        delete payload.city;
        delete payload.state;
        delete payload.zip;

        await adminService.createUser(payload);
        await refreshUsers(true);
        setIsAddStaffOpen(false);
        toast.success('Staff added successfully');
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

    if (isLoading) {
        return <div className="py-16 text-center text-gray-400">Loading company information...</div>;
    }

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
                isOpen={isAddStaffOpen}
                onClose={() => setIsAddStaffOpen(false)}
                onConfirm={handleAddStaff}
                roleToAdd="staff"
            />

            <div className="mb-6">
                <h1 className="text-2xl md:text-3xl font-serif text-primary font-bold">Company Info</h1>
                <p className="text-gray-500 text-sm mt-1">These values are used for invoices and public footer details.</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Admins & Staff</h3>
                    {currentUser?.role === 'admin' && (
                        <button
                            onClick={() => setIsAddStaffOpen(true)}
                            className="w-36 bg-gray-800 hover:bg-gray-700 text-white font-bold px-3 py-2 rounded-lg text-xs shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
                        >
                            <Plus size={14} strokeWidth={3} /> Add Staff
                        </button>
                    )}
                </div>
                <table className="hidden md:table w-full text-left">
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
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        {canResetPassword(user) && (
                                            <button
                                                onClick={() => openResetModal(user)}
                                                className="text-gray-400 hover:text-accent-deep hover:bg-amber-50 p-2 rounded-lg transition-all"
                                                title="Reset Password"
                                            >
                                                <Key size={18} />
                                            </button>
                                        )}
                                        {canDeleteUser(user) && (
                                            <button
                                                onClick={() => openDeleteModal(user)}
                                                className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-all"
                                                title="Delete User"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="md:hidden divide-y divide-gray-100">
                    {staffAndAdmins.map((user) => (
                        <div key={`m-${user.id}`} className="px-4 py-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${user.role === 'admin' ? 'bg-accent text-primary' : 'bg-blue-100 text-blue-700'}`}>
                                        {user.role === 'admin' ? <ShieldCheck size={14} /> : <UserCog size={14} />}
                                    </div>
                                    <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
                                </div>
                                <div className="flex justify-end gap-1">
                                    {canResetPassword(user) && (
                                        <button
                                            onClick={() => openResetModal(user)}
                                            className="text-gray-400 hover:text-accent-deep hover:bg-amber-50 p-1.5 rounded-md transition-all"
                                            title="Reset Password"
                                        >
                                            <Key size={16} />
                                        </button>
                                    )}
                                    {canDeleteUser(user) && (
                                        <button
                                            onClick={() => openDeleteModal(user)}
                                            className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-md transition-all"
                                            title="Delete User"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Contact</p>
                                    <p className="text-xs text-gray-700 mt-1 break-all">{user.email || '—'}</p>
                                    <p className="text-xs text-gray-500 mt-1">{user.mobile || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Role</p>
                                    <div className="mt-1">
                                        {user.role === 'admin' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-primary text-accent">ADMIN</span>}
                                        {user.role === 'staff' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700">STAFF</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <form onSubmit={handleSave} className="grid grid-cols-1 gap-5">
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field
                            label="Company Display Name"
                            value={form.displayName}
                            onChange={(value) => handleChange('displayName', value)}
                            placeholder="SSC Jewellery"
                        />
                        <Field
                            label="Contact Number"
                            value={form.contactNumber}
                            onChange={(value) => handleChange('contactNumber', value)}
                            placeholder="+91 95009 41350"
                        />
                        <Field
                            label="Support Email"
                            value={form.supportEmail}
                            onChange={(value) => handleChange('supportEmail', value)}
                            placeholder="support@example.com"
                            type="email"
                        />
                        <Field
                            label="WhatsApp Number"
                            value={form.whatsappNumber}
                            onChange={(value) => handleChange('whatsappNumber', value)}
                            placeholder="919500941350"
                        />
                    </div>

                    <label className="block">
                        <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Address</span>
                        <textarea
                            value={form.address}
                            onChange={(e) => handleChange('address', e.target.value)}
                            placeholder="Registered office address"
                            rows={3}
                            className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 focus:border-accent outline-none"
                        />
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field
                            label="Instagram URL"
                            value={form.instagramUrl}
                            onChange={(value) => handleChange('instagramUrl', value)}
                            placeholder="https://instagram.com/..."
                            icon={Instagram}
                            iconClassName="text-pink-500"
                        />
                        <Field
                            label="YouTube URL"
                            value={form.youtubeUrl}
                            onChange={(value) => handleChange('youtubeUrl', value)}
                            placeholder="https://youtube.com/..."
                            icon={Youtube}
                            iconClassName="text-red-600"
                        />
                        <Field
                            label="Facebook URL"
                            value={form.facebookUrl}
                            onChange={(value) => handleChange('facebookUrl', value)}
                            placeholder="https://facebook.com/..."
                            icon={Facebook}
                            iconClassName="text-blue-600"
                        />
                    </div>

                    <div className="pt-2 flex justify-end">
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-accent font-semibold shadow-lg shadow-primary/20 hover:bg-primary-light disabled:opacity-60"
                        >
                            <Save size={16} />
                            {isSaving ? 'Saving...' : 'Save Company Info'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}

function Field({ label, value, onChange, placeholder, type = 'text', icon: Icon = null, iconClassName = 'text-gray-400' }) {
    return (
        <label className="block">
            <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">{label}</span>
            <div className="relative mt-2">
                {Icon && <Icon size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${iconClassName}`} />}
                <input
                    type={type}
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className={`w-full rounded-xl border border-gray-200 py-3 text-sm text-gray-700 focus:border-accent outline-none ${Icon ? 'pl-10 pr-4' : 'px-4'}`}
                />
            </div>
        </label>
    );
}
