import { useEffect, useState } from 'react';
import { Save, Building2 } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';

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
    const [form, setForm] = useState(DEFAULT_FORM);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            try {
                const data = await adminService.getCompanyInfo();
                setForm({ ...DEFAULT_FORM, ...(data?.company || {}) });
            } catch (error) {
                toast.error(error.message || 'Failed to load company info');
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [toast]);

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

    if (isLoading) {
        return <div className="py-16 text-center text-gray-400">Loading company information...</div>;
    }

    return (
        <div className="animate-fade-in">
            <div className="mb-6">
                <h1 className="text-2xl md:text-3xl font-serif text-primary font-bold">Company Info</h1>
                <p className="text-gray-500 text-sm mt-1">These values are used for invoices and public footer details.</p>
            </div>

            <form onSubmit={handleSave} className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
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
                        />
                        <Field
                            label="YouTube URL"
                            value={form.youtubeUrl}
                            onChange={(value) => handleChange('youtubeUrl', value)}
                            placeholder="https://youtube.com/..."
                        />
                        <Field
                            label="Facebook URL"
                            value={form.facebookUrl}
                            onChange={(value) => handleChange('facebookUrl', value)}
                            placeholder="https://facebook.com/..."
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

                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                    <div className="flex items-center gap-2 text-primary">
                        <Building2 size={18} />
                        <h2 className="font-semibold">Invoice Preview Info</h2>
                    </div>
                    <div className="mt-4 space-y-2 text-sm text-gray-600">
                        <p className="font-semibold text-gray-800">{form.displayName || 'SSC Jewellery'}</p>
                        {form.address && <p>{form.address}</p>}
                        {form.contactNumber && <p>Phone: {form.contactNumber}</p>}
                        {form.supportEmail && <p>Email: {form.supportEmail}</p>}
                        {!form.address && !form.contactNumber && !form.supportEmail && (
                            <p className="text-gray-400">Update details to reflect them in invoices/footer.</p>
                        )}
                    </div>
                </div>
            </form>
        </div>
    );
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
    return (
        <label className="block">
            <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">{label}</span>
            <input
                type={type}
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 focus:border-accent outline-none"
            />
        </label>
    );
}
