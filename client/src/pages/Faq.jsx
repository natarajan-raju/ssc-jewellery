import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleHelp, Mail, Phone } from 'lucide-react';

const CMS_API_URL = import.meta.env.PROD ? '/api/cms' : 'http://localhost:5000/api/cms';

const DEFAULT_COMPANY = {
    displayName: 'SSC Impon Jewellery',
    supportEmail: '',
    contactNumber: ''
};

export default function Faq() {
    const [company, setCompany] = useState(DEFAULT_COMPANY);

    useEffect(() => {
        let cancelled = false;
        const loadCompanyInfo = async () => {
            try {
                const res = await fetch(`${CMS_API_URL}/company-info`);
                const data = await res.json();
                if (!res.ok || cancelled) return;
                const payload = data?.company && typeof data.company === 'object' ? data.company : {};
                setCompany((prev) => ({ ...prev, ...payload }));
            } catch {
                // Keep defaults.
            }
        };
        loadCompanyInfo();
        return () => {
            cancelled = true;
        };
    }, []);

    const faqs = useMemo(() => ([
        {
            q: 'Are the products real gold or silver?',
            a: 'No. Unless explicitly stated, products are artificial/imitation/fashion jewellery.'
        },
        {
            q: 'Do you provide Cash on Delivery (COD)?',
            a: 'No. Only prepaid payment methods are accepted.'
        },
        {
            q: 'Can I return a product?',
            a: 'Returns are not accepted unless a verified manufacturing defect is proven with an open-box video within 24 hours.'
        },
        {
            q: 'How long does shipping take?',
            a: 'Orders are usually processed in 2-3 working days, and delivery depends on location and courier timelines.'
        },
        {
            q: 'Do you offer polishing support?',
            a: 'Yes. A 6-month polishing service is available as per Terms & Conditions.'
        }
    ]), []);

    return (
        <div className="min-h-screen bg-secondary py-10">
            <div className="max-w-5xl mx-auto px-4 md:px-8">
                <div className="mb-4 text-sm text-gray-500">
                    <Link to="/" className="hover:text-primary">Home</Link>
                    <span className="mx-2 text-gray-300">{'>'}</span>
                    <span className="text-gray-700">FAQs</span>
                </div>

                <div className="emboss-card relative overflow-hidden bg-white border border-gray-200 rounded-2xl p-6 md:p-8 shadow-sm">
                    <CircleHelp size={160} className="bg-emboss-icon absolute top-3 right-3 text-sky-100" strokeWidth={1.4} />
                    <h1 className="text-3xl md:text-4xl font-serif text-primary">Frequently Asked Questions</h1>
                    <div className="mt-6 space-y-4">
                        {faqs.map((item) => (
                            <div key={item.q} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                <p className="text-sm font-semibold text-gray-900">{item.q}</p>
                                <p className="text-sm text-gray-700 mt-1">{item.a}</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-700 flex items-center gap-2">
                            <Mail size={16} className="text-primary" />
                            {company.supportEmail || 'Support email not configured'}
                        </div>
                        <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-700 flex items-center gap-2">
                            <Phone size={16} className="text-primary" />
                            {company.contactNumber || 'Support phone not configured'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
