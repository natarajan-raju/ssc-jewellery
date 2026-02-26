import { useEffect, useMemo, useState } from 'react';
import {
    Building2,
    CreditCard,
    Facebook,
    Instagram,
    Key,
    Plus,
    Save,
    ShieldCheck,
    Trash2,
    UserCog,
    Upload,
    Youtube
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useCustomers } from '../../context/CustomerContext';
import { useAdminCrudSync } from '../../hooks/useAdminCrudSync';
import AddCustomerModal from '../../components/AddCustomerModal';
import Modal from '../../components/Modal';
import fallbackContactImage from '../../assets/contact.jpg';

const DEFAULT_FORM = {
    displayName: '',
    contactNumber: '',
    supportEmail: '',
    address: '',
    instagramUrl: '',
    youtubeUrl: '',
    facebookUrl: '',
    whatsappNumber: '',
    contactJumbotronImageUrl: '/assets/contact.jpg',
    razorpayKeyId: '',
    razorpayKeySecret: '',
    razorpayWebhookSecret: '',
    razorpayEmiMinAmount: 3000,
    razorpayStartingTenureMonths: 12
};

const isValidEmail = (value = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
const isValidContact = (value = '') => /^[0-9+\-\s()]{7,20}$/.test(String(value || '').trim());
const isValidWhatsApp = (value = '') => /^\d{10,14}$/.test(String(value || '').trim());
const isValidUrl = (value = '') => {
    const raw = String(value || '').trim();
    if (!raw) return true;
    try {
        const parsed = new URL(raw);
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
        return false;
    }
};

export default function CompanyInfo() {
    const toast = useToast();
    const { user: currentUser } = useAuth();
    const { users, refreshUsers } = useCustomers();
    const [form, setForm] = useState(DEFAULT_FORM);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isJumbotronUploading, setIsJumbotronUploading] = useState(false);
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
                setForm({
                    ...DEFAULT_FORM,
                    ...(data?.company || {}),
                    razorpayKeySecret: '',
                    razorpayWebhookSecret: ''
                });
                await refreshUsers(false);
            } catch (error) {
                toast.error(error.message || 'Failed to load settings');
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [toast, refreshUsers]);

    useAdminCrudSync({
        'company:info_update': ({ company } = {}) => {
            if (!company || typeof company !== 'object') return;
            setForm((prev) => ({
                ...prev,
                ...DEFAULT_FORM,
                ...company,
                razorpayKeySecret: '',
                razorpayWebhookSecret: ''
            }));
        }
    });

    const formErrors = useMemo(() => {
        const errors = {};
        if (!String(form.displayName || '').trim()) {
            errors.displayName = 'Company name is required';
        }
        if (!String(form.contactNumber || '').trim()) {
            errors.contactNumber = 'Contact number is required';
        } else if (!isValidContact(form.contactNumber)) {
            errors.contactNumber = 'Contact number format is invalid';
        }
        if (!String(form.supportEmail || '').trim()) {
            errors.supportEmail = 'Support email is required';
        } else if (!isValidEmail(form.supportEmail)) {
            errors.supportEmail = 'Support email is invalid';
        }
        if (!String(form.whatsappNumber || '').trim()) {
            errors.whatsappNumber = 'WhatsApp number is required';
        } else if (!isValidWhatsApp(form.whatsappNumber)) {
            errors.whatsappNumber = 'WhatsApp number must be 10-14 digits';
        }
        if (!String(form.razorpayKeyId || '').trim()) {
            errors.razorpayKeyId = 'Razorpay Key ID is required';
        } else if (!/^rzp_(test|live)_[a-zA-Z0-9]+$/.test(String(form.razorpayKeyId || '').trim())) {
            errors.razorpayKeyId = 'Razorpay Key ID format is invalid';
        }
        if (!Number.isFinite(Number(form.razorpayEmiMinAmount)) || Number(form.razorpayEmiMinAmount) < 1) {
            errors.razorpayEmiMinAmount = 'Minimum EMI amount must be greater than 0';
        }
        if (!Number.isFinite(Number(form.razorpayStartingTenureMonths)) || Number(form.razorpayStartingTenureMonths) < 1) {
            errors.razorpayStartingTenureMonths = 'Starting tenure must be greater than 0';
        }
        if (!isValidUrl(form.instagramUrl) || !isValidUrl(form.youtubeUrl) || !isValidUrl(form.facebookUrl)) {
            errors.socialUrl = 'One or more social URLs are invalid';
        }
        const jumbotron = String(form.contactJumbotronImageUrl || '').trim();
        if (jumbotron && !isValidUrl(jumbotron) && !jumbotron.startsWith('/')) {
            errors.contactJumbotronImageUrl = 'Contact jumbotron image must be a valid URL or an absolute asset path';
        }
        return errors;
    }, [form]);

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

    const handleContactJumbotronUpload = async (file) => {
        if (!file) return;
        setIsJumbotronUploading(true);
        try {
            const data = await adminService.uploadContactJumbotronImage(file);
            const imageUrl = String(data?.url || '').trim();
            if (!imageUrl) throw new Error('Upload did not return an image URL');
            setForm((prev) => ({ ...prev, contactJumbotronImageUrl: imageUrl }));
            toast.success('Contact jumbotron image uploaded');
        } catch (error) {
            toast.error(error?.message || 'Failed to upload contact jumbotron image');
        } finally {
            setIsJumbotronUploading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const firstError = Object.values(formErrors)[0];
        if (firstError) {
            toast.error(firstError);
            return;
        }
        setIsSaving(true);
        try {
            const data = await adminService.updateCompanyInfo({
                ...form,
                razorpayEmiMinAmount: Number(form.razorpayEmiMinAmount || 0),
                razorpayStartingTenureMonths: Number(form.razorpayStartingTenureMonths || 0)
            });
            setForm({
                ...DEFAULT_FORM,
                ...(data?.company || {}),
                razorpayKeySecret: '',
                razorpayWebhookSecret: ''
            });
            toast.success('Settings updated');
        } catch (error) {
            toast.error(error.message || 'Failed to update settings');
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
        return <div className="py-16 text-center text-gray-400">Loading settings...</div>;
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
                <h1 className="text-2xl md:text-3xl font-serif text-primary font-bold">Settings</h1>
                <p className="text-gray-500 text-sm mt-1">Manage company profile and payment gateway configuration.</p>
            </div>

            <div className="emboss-card relative bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6">
                <Building2 size={70} className="bg-emboss-icon absolute right-3 bottom-2 text-gray-100" />
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3 relative z-10">
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
                <table className="hidden md:table w-full text-left relative z-10">
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
            </div>

            <form onSubmit={handleSave} className="grid grid-cols-1 gap-5">
                <div className="emboss-card relative bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4 overflow-hidden">
                    <Building2 size={72} className="bg-emboss-icon absolute right-3 bottom-2 text-gray-100" />
                    <div className="relative z-10">
                        <h3 className="text-sm font-semibold text-gray-800">Company Info</h3>
                        <p className="text-xs text-gray-500 mt-1">Mandatory fields are highlighted in red if invalid.</p>
                    </div>
                    <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field
                            label="Company Display Name"
                            value={form.displayName}
                            onChange={(value) => handleChange('displayName', value)}
                            placeholder="SSC Jewellery"
                            required
                            error={formErrors.displayName}
                        />
                        <Field
                            label="Contact Number"
                            value={form.contactNumber}
                            onChange={(value) => handleChange('contactNumber', value)}
                            placeholder="+91 95009 41350"
                            required
                            error={formErrors.contactNumber}
                        />
                        <Field
                            label="Support Email"
                            value={form.supportEmail}
                            onChange={(value) => handleChange('supportEmail', value)}
                            placeholder="support@example.com"
                            type="email"
                            required
                            error={formErrors.supportEmail}
                        />
                        <Field
                            label="WhatsApp Number"
                            value={form.whatsappNumber}
                            onChange={(value) => handleChange('whatsappNumber', String(value || '').replace(/\D/g, '').slice(0, 14))}
                            placeholder="919500941350"
                            required
                            error={formErrors.whatsappNumber}
                        />
                    </div>

                    <label className="relative z-10 block">
                        <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Address</span>
                        <textarea
                            value={form.address}
                            onChange={(e) => handleChange('address', e.target.value)}
                            placeholder="Registered office address"
                            rows={3}
                            className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 focus:border-accent outline-none"
                        />
                    </label>

                    <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        <Field
                            label="Contact Jumbotron Image URL"
                            value={form.contactJumbotronImageUrl}
                            onChange={(value) => handleChange('contactJumbotronImageUrl', value)}
                            placeholder="/assets/contact.jpg"
                            error={formErrors.contactJumbotronImageUrl}
                        />
                    </div>
                    <div className="relative z-10">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                            <Upload size={14} />
                            {isJumbotronUploading ? 'Uploading image...' : 'Browse & Upload Jumbotron'}
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={isJumbotronUploading}
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    handleContactJumbotronUpload(file);
                                    e.target.value = '';
                                }}
                            />
                        </label>
                        {form.contactJumbotronImageUrl && (
                            <div className="mt-3 h-28 w-full max-w-sm overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                                <img
                                    src={form.contactJumbotronImageUrl}
                                    alt="Contact jumbotron preview"
                                    className="h-full w-full object-cover"
                                    onError={(e) => { e.currentTarget.src = fallbackContactImage; }}
                                />
                            </div>
                        )}
                    </div>
                    {formErrors.socialUrl && <p className="relative z-10 text-xs text-red-600">{formErrors.socialUrl}</p>}
                </div>

                <div className="emboss-card relative bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4 overflow-hidden">
                    <CreditCard size={72} className="bg-emboss-icon absolute right-3 bottom-2 text-gray-100" />
                    <div className="relative z-10">
                        <h3 className="text-sm font-semibold text-gray-800">Razorpay Settings</h3>
                        <p className="text-xs text-gray-500 mt-1">Stored in database and used by checkout/webhooks.</p>
                    </div>
                    <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field
                            label="Razorpay Key ID"
                            value={form.razorpayKeyId}
                            onChange={(value) => handleChange('razorpayKeyId', value.trim())}
                            placeholder="rzp_live_xxxxx"
                            required
                            error={formErrors.razorpayKeyId}
                        />
                        <Field
                            label="Razorpay Key Secret"
                            value={form.razorpayKeySecret}
                            onChange={(value) => handleChange('razorpayKeySecret', value)}
                            placeholder={form.hasRazorpayKeySecret ? `Saved (${form.razorpayKeySecretMask || '******'}) - enter to replace` : 'Enter key secret'}
                            type="password"
                        />
                        <Field
                            label="Webhook Secret"
                            value={form.razorpayWebhookSecret}
                            onChange={(value) => handleChange('razorpayWebhookSecret', value)}
                            placeholder={form.hasRazorpayWebhookSecret ? `Saved (${form.razorpayWebhookSecretMask || '******'}) - enter to replace` : 'Enter webhook secret'}
                            type="password"
                        />
                        <Field
                            label="EMI Min Amount (INR)"
                            value={form.razorpayEmiMinAmount}
                            onChange={(value) => handleChange('razorpayEmiMinAmount', String(value || '').replace(/[^0-9]/g, ''))}
                            type="number"
                            required
                            error={formErrors.razorpayEmiMinAmount}
                        />
                        <Field
                            label="Starting Tenure (Months)"
                            value={form.razorpayStartingTenureMonths}
                            onChange={(value) => handleChange('razorpayStartingTenureMonths', String(value || '').replace(/[^0-9]/g, ''))}
                            type="number"
                            required
                            error={formErrors.razorpayStartingTenureMonths}
                        />
                    </div>
                </div>

                <div className="pt-2 flex justify-end">
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-accent font-semibold shadow-lg shadow-primary/20 hover:bg-primary-light disabled:opacity-60"
                    >
                        <Save size={16} />
                        {isSaving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            </form>
        </div>
    );
}

function Field({
    label,
    value,
    onChange,
    placeholder,
    type = 'text',
    icon: Icon = null,
    iconClassName = 'text-gray-400',
    required = false,
    error = ''
}) {
    return (
        <label className="block">
            <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">
                {label}
                {required ? <span className="text-red-500"> *</span> : null}
            </span>
            <div className="relative mt-2">
                {Icon && <Icon size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${iconClassName}`} />}
                <input
                    type={type}
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className={`w-full rounded-xl border py-3 text-sm text-gray-700 focus:border-accent outline-none ${Icon ? 'pl-10 pr-4' : 'px-4'} ${error ? 'border-red-400 bg-red-50/30' : 'border-gray-200'}`}
                />
            </div>
            {error ? <p className="mt-1 text-[11px] text-red-600">{error}</p> : null}
        </label>
    );
}
