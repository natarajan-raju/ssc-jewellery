import { useEffect, useState } from 'react';
import { useAdminCrudSync } from '../hooks/useAdminCrudSync';
import { Link } from 'react-router-dom';
import { Gem, Sparkles } from 'lucide-react';

const CMS_API_URL = import.meta.env.PROD ? '/api/cms' : 'http://localhost:5000/api/cms';

const DEFAULT_COMPANY = {
    displayName: 'SSC Impon Jewellery',
    address: '',
    supportEmail: '',
    contactNumber: '',
    whatsappNumber: ''
};

const resolveCompanyAddress = (company = {}) => {
    const direct = String(company.address || '').trim();
    if (direct) return direct;
    const composed = [
        company.addressLine1,
        company.addressLine2,
        company.city,
        company.state,
        company.zip || company.pincode
    ]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(', ');
    return composed;
};

export default function About() {
    const [company, setCompany] = useState(DEFAULT_COMPANY);

    const applyCompanyInfo = (payload = {}) => {
        setCompany((prev) => ({
            ...prev,
            ...payload,
            address: resolveCompanyAddress(payload) || prev.address
        }));
    };

    useEffect(() => {
        let cancelled = false;
        const loadCompanyInfo = async () => {
            try {
                const res = await fetch(`${CMS_API_URL}/company-info`);
                const data = await res.json();
                if (!res.ok || cancelled) return;
                const payload = data?.company && typeof data.company === 'object' ? data.company : {};
                applyCompanyInfo(payload);
            } catch {
                // Keep defaults.
            }
        };
        loadCompanyInfo();
        return () => {
            cancelled = true;
        };
    }, []);

    useAdminCrudSync({
        'company:info_update': ({ company: nextCompany } = {}) => {
            if (!nextCompany || typeof nextCompany !== 'object') return;
            applyCompanyInfo(nextCompany);
        }
    });

    return (
        <div className="min-h-screen bg-secondary py-10">
            <div className="max-w-5xl mx-auto px-4 md:px-8">
                <div className="mb-4 text-sm text-gray-500">
                    <Link to="/" className="hover:text-primary">Home</Link>
                    <span className="mx-2 text-gray-300">{'>'}</span>
                    <span className="text-gray-700">About</span>
                </div>

                <div className="emboss-card relative overflow-hidden bg-white border border-gray-200 rounded-2xl p-6 md:p-8 shadow-sm">
                    <Gem size={160} className="bg-emboss-icon absolute top-3 right-3 text-amber-100" strokeWidth={1.4} />
                    <div className="flex justify-center mb-6">
                        <img
                            src="/assets/logo.webp"
                            alt={`${company.displayName || 'SSC Impon Jewellery'} logo`}
                            className="w-52 md:w-64 lg:w-80 h-auto object-contain"
                        />
                    </div>
                    <h1 className="text-3xl md:text-4xl font-serif text-primary">About {company.displayName || 'SSC Impon Jewellery'}</h1>
                    <p className="mt-3 text-sm text-gray-600 leading-relaxed">
                        {company.displayName || 'SSC Impon Jewellery'} is focused on artificial and fashion jewellery designed for everyday elegance and festive occasions.
                        Our collections are curated for style, comfort, and affordability while maintaining quality standards in finishing.
                    </p>
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                            <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Our Promise</p>
                            <p className="text-sm text-gray-700 mt-2">Transparent policies, support-first communication, and responsible order processing.</p>
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                            <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Customer Care</p>
                            <p className="text-sm text-gray-700 mt-2">For order and product queries, contact us via email, phone, or WhatsApp from the contact page.</p>
                        </div>
                    </div>
                    <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50 p-4">
                        <p className="text-sm text-amber-800 flex items-center gap-2">
                            <Sparkles size={16} />
                            Registered Address: {resolveCompanyAddress(company) || 'Address not set'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
