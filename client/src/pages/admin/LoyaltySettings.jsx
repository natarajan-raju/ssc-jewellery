import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Crown, Gem, Medal, Pencil, Plus, Search, Shield, Sparkles, Star, Save, Trash2, X } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { productService } from '../../services/productService';
import { useToast } from '../../context/ToastContext';
import { useSocket } from '../../context/SocketContext';

const ORDER = ['regular', 'bronze', 'silver', 'gold', 'platinum'];

const getTodayDateInput = () => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
};

const toNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const shippingPriorityLabel = (value = 'standard') => {
    const map = {
        standard: 'Standard',
        standard_plus: 'Standard+',
        high: 'High',
        higher: 'Higher',
        highest: 'Highest'
    };
    return map[String(value || '').toLowerCase()] || 'Standard';
};

const tierLabel = (tier = 'regular') => (String(tier).toLowerCase() === 'regular' ? 'Basic' : String(tier));

const SHIPPING_PRIORITY_OPTIONS = [
    { value: 'standard', label: 'Standard' },
    { value: 'standard_plus', label: 'Standard+' },
    { value: 'high', label: 'High' },
    { value: 'higher', label: 'Higher' },
    { value: 'highest', label: 'Highest' }
];

const TIER_STYLE = {
    regular: { card: 'from-slate-100 via-slate-50 to-slate-100 text-slate-800', stat: 'bg-white/80 border-slate-200', icon: Shield },
    bronze: { card: 'from-orange-100 via-amber-50 to-orange-100 text-amber-900', stat: 'bg-white/75 border-amber-200', icon: Medal },
    silver: { card: 'from-gray-100 via-slate-50 to-gray-100 text-slate-800', stat: 'bg-white/80 border-gray-200', icon: Star },
    gold: { card: 'from-yellow-100 via-amber-50 to-yellow-100 text-amber-950', stat: 'bg-white/75 border-yellow-300', icon: Crown },
    platinum: { card: 'from-sky-100 via-blue-50 to-sky-100 text-sky-900', stat: 'bg-white/75 border-sky-200', icon: Gem }
};

const buildBenefitsPreview = (row) => {
    const tier = String(row?.tier || 'regular').toLowerCase();
    if (tier === 'regular') return ['Standard pricing', 'Standard shipping', 'Progress tracking to next tier'];
    return [
        `${toNumber(row.extraDiscountPct)}% extra member discount`,
        `${toNumber(row.shippingDiscountPct)}% shipping fee discount`,
        `${toNumber(row.birthdayDiscountPct ?? 10)}% birthday coupon offer`,
        `${toNumber(row.abandonedCartBoostPct)}% abandoned cart offer boost`,
        `${shippingPriorityLabel(row.shippingPriority)} dispatch priority`
    ];
};

const getDefaultCouponForm = () => ({
    name: '',
    scopeType: 'generic',
    discountType: 'percent',
    discountValue: 5,
    usageLimitPerUser: 1,
    tierScope: 'regular',
    categoryIds: [],
    startsAt: getTodayDateInput(),
    expiresAt: ''
});

export default function LoyaltySettings({ onBack }) {
    const toast = useToast();
    const { socket } = useSocket();
    const [rows, setRows] = useState([]);
    const [activeTier, setActiveTier] = useState('regular');
    const [editingTier, setEditingTier] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [couponForm, setCouponForm] = useState(getDefaultCouponForm());
    const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
    const [categories, setCategories] = useState([]);
    const [couponList, setCouponList] = useState([]);
    const [couponPage, setCouponPage] = useState(1);
    const [couponTotalPages, setCouponTotalPages] = useState(1);
    const [couponSearch, setCouponSearch] = useState('');
    const [couponLoading, setCouponLoading] = useState(false);
    const [couponCreating, setCouponCreating] = useState(false);
    const [couponDeletingId, setCouponDeletingId] = useState(null);
    const [couponRefreshKey, setCouponRefreshKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            adminService.getLoyaltyConfig(),
            productService.getCategories().catch(() => ({ categories: [] }))
        ]).then(([data, cats]) => {
            if (cancelled) return;
            const config = Array.isArray(data?.config) ? data.config : [];
            const byTier = Object.fromEntries(config.map((item) => [String(item.tier || '').toLowerCase(), item]));
            setRows(ORDER.map((tier) => {
                const item = byTier[tier] || {};
                const rowLabel = String(item.label || tierLabel(tier));
                return {
                    tier,
                    label: rowLabel.toLowerCase() === 'regular' ? 'Basic' : rowLabel,
                    threshold: toNumber(item.threshold),
                    windowDays: toNumber(item.windowDays, 30),
                    extraDiscountPct: toNumber(item.extraDiscountPct),
                    shippingDiscountPct: toNumber(item.shippingDiscountPct),
                    birthdayDiscountPct: toNumber(item.birthdayDiscountPct, 10),
                    abandonedCartBoostPct: toNumber(item.abandonedCartBoostPct),
                    priorityWeight: toNumber(item.priorityWeight),
                    shippingPriority: item.shippingPriority || 'standard',
                    benefits: Array.isArray(item.benefits) ? item.benefits : buildBenefitsPreview({ ...item, tier })
                };
            }));

            const categoryRows = Array.isArray(cats)
                ? cats
                : (Array.isArray(cats?.categories) ? cats.categories : []);
            setCategories(categoryRows);
        }).catch((error) => {
            toast.error(error?.message || 'Failed to load loyalty settings');
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
    }, [toast]);

    useEffect(() => {
        let cancelled = false;
        setCouponLoading(true);
        adminService.getLoyaltyCoupons({ page: couponPage, limit: 10, search: couponSearch, sourceType: 'all' })
            .then((data) => {
                if (cancelled) return;
                setCouponList(Array.isArray(data?.coupons) ? data.coupons : []);
                setCouponTotalPages(Number(data?.pagination?.totalPages || 1));
            })
            .catch(() => {
                if (!cancelled) setCouponList([]);
            })
            .finally(() => {
                if (!cancelled) setCouponLoading(false);
            });
        return () => { cancelled = true; };
    }, [couponPage, couponSearch, couponRefreshKey]);

    useEffect(() => {
        if (!socket) return undefined;
        const handleCouponChanged = () => {
            adminService.invalidateLoyaltyCouponCache();
            setCouponRefreshKey((v) => v + 1);
        };
        socket.on('coupon:changed', handleCouponChanged);
        return () => {
            socket.off('coupon:changed', handleCouponChanged);
        };
    }, [socket]);

    const updateRow = (tier, patch) => {
        setRows((prev) => prev.map((row) => (row.tier === tier ? { ...row, ...patch } : row)));
    };

    const activeRow = useMemo(
        () => rows.find((row) => row.tier === activeTier) || rows[0] || null,
        [rows, activeTier]
    );

    const editRow = useMemo(
        () => rows.find((row) => row.tier === editingTier) || null,
        [rows, editingTier]
    );

    const handleSaveTier = async () => {
        if (!editRow) return;
        setSaving(true);
        try {
            const payload = rows.map((row) => ({
                tier: row.tier,
                label: row.label,
                threshold: toNumber(row.threshold),
                windowDays: Math.max(1, toNumber(row.windowDays, 30)),
                extraDiscountPct: toNumber(row.extraDiscountPct),
                shippingDiscountPct: toNumber(row.shippingDiscountPct),
                birthdayDiscountPct: toNumber(row.birthdayDiscountPct, 10),
                abandonedCartBoostPct: toNumber(row.abandonedCartBoostPct),
                priorityWeight: toNumber(row.priorityWeight),
                shippingPriority: row.shippingPriority || 'standard'
            }));
            await adminService.updateLoyaltyConfig(payload);
            toast.success(`${editRow.label} tier updated`);
            setEditingTier(null);
        } catch (error) {
            toast.error(error?.message || 'Failed to save loyalty config');
        } finally {
            setSaving(false);
        }
    };

    const handleIssueCoupon = async () => {
        if (!couponForm.startsAt) {
            toast.error('Start date is required');
            return;
        }
        if (couponForm.expiresAt && couponForm.expiresAt < couponForm.startsAt) {
            toast.error('End date must be on or after start date');
            return;
        }
        setCouponCreating(true);
        try {
            const payload = {
                name: couponForm.name || 'Admin Coupon',
                scopeType: couponForm.scopeType,
                discountType: couponForm.discountType,
                discountValue: Number(couponForm.discountValue || 0),
                usageLimitPerUser: Math.max(1, Number(couponForm.usageLimitPerUser || 1)),
                tierScope: couponForm.scopeType === 'tier' ? couponForm.tierScope : undefined,
                categoryIds: couponForm.scopeType === 'category' ? couponForm.categoryIds : [],
                startsAt: new Date(`${couponForm.startsAt}T00:00:00`).toISOString(),
                expiresAt: couponForm.expiresAt ? new Date(`${couponForm.expiresAt}T23:59:59`).toISOString() : null,
                sourceType: 'admin'
            };
            const res = await adminService.createLoyaltyCoupon(payload);
            toast.success(`Coupon created: ${res?.coupon?.code || ''}`);
            setCouponRefreshKey((v) => v + 1);
            setCouponForm(getDefaultCouponForm());
            setIsCouponModalOpen(false);
        } catch (error) {
            toast.error(error?.message || 'Failed to create coupon');
        } finally {
            setCouponCreating(false);
        }
    };

    const handleDeleteCoupon = async (couponId) => {
        const id = Number(couponId || 0);
        if (!Number.isFinite(id) || id <= 0) return;
        if (!window.confirm('Delete this coupon?')) return;
        setCouponDeletingId(id);
        try {
            await adminService.deleteLoyaltyCoupon(id);
            toast.success('Coupon deleted');
            setCouponRefreshKey((v) => v + 1);
        } catch (error) {
            toast.error(error?.message || 'Failed to delete coupon');
        } finally {
            setCouponDeletingId(null);
        }
    };

    if (loading) return <div className="py-16 text-center text-gray-400">Loading loyalty settings...</div>;

    const style = TIER_STYLE[activeRow?.tier || 'regular'] || TIER_STYLE.regular;
    const TierIcon = style.icon || Sparkles;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <button type="button" onClick={onBack} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    <ArrowLeft size={16} /> Back
                </button>
                <div>
                    <h2 className="text-2xl font-serif text-primary font-bold">Loyalty Settings</h2>
                    <p className="text-sm text-gray-500 mt-1">Select tier tab and edit its card.</p>
                </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-3">
                <div className="flex flex-wrap gap-2">
                    {ORDER.map((tier) => (
                        <button
                            key={tier}
                            type="button"
                            onClick={() => setActiveTier(tier)}
                            className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${activeTier === tier ? 'bg-primary text-accent border-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                        >
                            {tierLabel(tier).toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            {activeRow && (
                <div className={`relative rounded-2xl border border-gray-200 bg-gradient-to-br ${style.card} p-5 shadow-sm overflow-hidden`}>
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs uppercase tracking-[0.25em] font-semibold opacity-70">Tier</p>
                            <p className="text-2xl font-bold mt-1">{activeRow.label}</p>
                            <p className="text-sm mt-1 opacity-80">Threshold ₹{toNumber(activeRow.threshold).toLocaleString('en-IN')} in {toNumber(activeRow.windowDays)} days</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setEditingTier(activeRow.tier)}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-black/10 bg-white/80 text-sm font-semibold hover:bg-white"
                        >
                            <Pencil size={14} /> Edit
                        </button>
                    </div>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className={`rounded-xl border px-3 py-2 ${style.stat}`}><p className="text-[11px] uppercase tracking-wider opacity-70">Extra Discount</p><p className="text-lg font-bold mt-1">{toNumber(activeRow.extraDiscountPct)}%</p></div>
                        <div className={`rounded-xl border px-3 py-2 ${style.stat}`}><p className="text-[11px] uppercase tracking-wider opacity-70">Shipping Discount</p><p className="text-lg font-bold mt-1">{toNumber(activeRow.shippingDiscountPct)}%</p></div>
                        <div className={`rounded-xl border px-3 py-2 ${style.stat}`}><p className="text-[11px] uppercase tracking-wider opacity-70">Birthday Discount</p><p className="text-lg font-bold mt-1">{toNumber(activeRow.birthdayDiscountPct, 10)}%</p></div>
                        <div className={`rounded-xl border px-3 py-2 ${style.stat}`}><p className="text-[11px] uppercase tracking-wider opacity-70">Abandoned Boost</p><p className="text-lg font-bold mt-1">{toNumber(activeRow.abandonedCartBoostPct)}%</p></div>
                    </div>
                    <div className={`mt-3 rounded-xl border px-3 py-2 ${style.stat}`}>
                        <p className="text-[11px] uppercase tracking-wider opacity-70">Shipping Priority</p>
                        <p className="text-lg font-bold mt-1">{shippingPriorityLabel(activeRow.shippingPriority)}</p>
                    </div>
                    <div className={`mt-3 rounded-xl border p-3 ${style.stat}`}>
                        <p className="text-[11px] uppercase tracking-wider opacity-70">Benefit Preview</p>
                        <ul className="mt-2 space-y-2">
                            {(activeRow.benefits?.length ? activeRow.benefits : buildBenefitsPreview(activeRow)).map((line) => (
                                <li key={line} className="text-sm leading-6">- {line}</li>
                            ))}
                        </ul>
                    </div>
                    <TierIcon size={82} className="absolute right-4 bottom-4 opacity-20" />
                </div>
            )}

            <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-gray-800">Coupon Module</h3>
                    <div className="flex items-center gap-2 w-full justify-end">
                        <div className="relative w-full max-w-xs">
                            <Search size={14} className="absolute left-3 top-3 text-gray-400" />
                            <input value={couponSearch} onChange={(e) => { setCouponSearch(e.target.value); setCouponPage(1); }} placeholder="Search coupons" className="input-field pl-8 py-2.5" />
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setCouponForm(getDefaultCouponForm());
                                setIsCouponModalOpen(true);
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-accent text-sm font-semibold hover:bg-primary-light"
                        >
                            <Plus size={14} /> Issue New Coupon
                        </button>
                    </div>
                </div>

                <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-3 py-2 text-xs uppercase tracking-wider text-gray-500">Code</th>
                                <th className="px-3 py-2 text-xs uppercase tracking-wider text-gray-500">Name</th>
                                <th className="px-3 py-2 text-xs uppercase tracking-wider text-gray-500">Scope</th>
                                <th className="px-3 py-2 text-xs uppercase tracking-wider text-gray-500">Discount</th>
                                <th className="px-3 py-2 text-xs uppercase tracking-wider text-gray-500">Used</th>
                                <th className="px-3 py-2 text-xs uppercase tracking-wider text-gray-500 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {couponLoading && <tr><td className="px-3 py-4 text-gray-400" colSpan={6}>Loading coupons...</td></tr>}
                            {!couponLoading && couponList.length === 0 && <tr><td className="px-3 py-4 text-gray-400" colSpan={6}>No coupons found.</td></tr>}
                            {!couponLoading && couponList.map((cp) => (
                                <tr key={cp.id}>
                                    <td className="px-3 py-2 font-semibold text-gray-800">{cp.code}</td>
                                    <td className="px-3 py-2 text-gray-600">{cp.name}</td>
                                    <td className="px-3 py-2 text-gray-600">{cp.scope_type}</td>
                                    <td className="px-3 py-2 text-gray-600">{cp.discount_type === 'fixed' ? `₹${Number(cp.discount_value || 0).toLocaleString('en-IN')}` : `${Number(cp.discount_value || 0)}%`}</td>
                                    <td className="px-3 py-2 text-gray-600">{Number(cp.used_count || 0)}</td>
                                    <td className="px-3 py-2 text-right">
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteCoupon(cp.id)}
                                            disabled={couponDeletingId === cp.id}
                                            className="inline-flex items-center justify-center p-1.5 rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
                                            title="Delete Coupon"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={() => setCouponPage((p) => Math.max(1, p - 1))} disabled={couponPage <= 1} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-50">Prev</button>
                    <span className="text-sm text-gray-500">Page {couponPage} / {Math.max(1, couponTotalPages)}</span>
                    <button type="button" onClick={() => setCouponPage((p) => Math.min(couponTotalPages, p + 1))} disabled={couponPage >= couponTotalPages} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-50">Next</button>
                </div>
            </div>

            {isCouponModalOpen && (
                <div className="fixed inset-0 z-[96] bg-black/50 flex items-center justify-center p-4">
                    <div className="w-full max-w-3xl rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div><p className="text-xs uppercase tracking-[0.25em] text-gray-400 font-semibold">Coupon</p><h3 className="text-lg font-semibold text-gray-900 mt-1">Issue New Coupon</h3></div>
                            <button onClick={() => setIsCouponModalOpen(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><X size={16} /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <label className="text-xs text-gray-600">Coupon Name<input className="input-field mt-1" placeholder="Coupon name" value={couponForm.name} onChange={(e) => setCouponForm((p) => ({ ...p, name: e.target.value }))} /></label>
                                <label className="text-xs text-gray-600">Coupon Scope<select className="input-field mt-1" value={couponForm.scopeType} onChange={(e) => setCouponForm((p) => ({ ...p, scopeType: e.target.value }))}><option value="generic">Generic</option><option value="category">Category specific</option><option value="tier">Tier specific</option></select></label>
                                <label className="text-xs text-gray-600">Discount Type<select className="input-field mt-1" value={couponForm.discountType} onChange={(e) => setCouponForm((p) => ({ ...p, discountType: e.target.value }))}><option value="percent">Percent</option><option value="fixed">Fixed INR</option></select></label>
                                <label className="text-xs text-gray-600">Discount Value<input className="input-field mt-1" type="number" value={couponForm.discountValue} onChange={(e) => setCouponForm((p) => ({ ...p, discountValue: e.target.value }))} /></label>
                                <label className="text-xs text-gray-600">Usage Limit Per User<input className="input-field mt-1" type="number" value={couponForm.usageLimitPerUser} onChange={(e) => setCouponForm((p) => ({ ...p, usageLimitPerUser: e.target.value }))} /></label>
                                <label className="text-xs text-gray-600">Start Date <span className="text-red-500">*</span><input className="input-field mt-1" type="date" value={couponForm.startsAt} onChange={(e) => setCouponForm((p) => ({ ...p, startsAt: e.target.value }))} /></label>
                                <label className="text-xs text-gray-600">End Date (Optional)<input className="input-field mt-1" type="date" value={couponForm.expiresAt} min={couponForm.startsAt || undefined} onChange={(e) => setCouponForm((p) => ({ ...p, expiresAt: e.target.value }))} /></label>
                                {couponForm.scopeType === 'tier' && (
                                    <label className="text-xs text-gray-600">Tier Scope<select className="input-field mt-1" value={couponForm.tierScope} onChange={(e) => setCouponForm((p) => ({ ...p, tierScope: e.target.value }))}>{ORDER.map((tier) => <option key={tier} value={tier}>{tierLabel(tier).toUpperCase()}</option>)}</select></label>
                                )}
                            </div>
                            {couponForm.scopeType === 'category' && (
                                <label className="text-xs text-gray-600 block">Category Scope (Multi-select)
                                    <select
                                        multiple
                                        className="input-field mt-1 min-h-[140px]"
                                        value={couponForm.categoryIds.map(String)}
                                        onChange={(e) => {
                                            const selected = Array.from(e.target.selectedOptions).map((op) => Number(op.value)).filter((n) => Number.isFinite(n) && n > 0);
                                            setCouponForm((p) => ({ ...p, categoryIds: selected }));
                                        }}
                                    >
                                        {categories.map((cat) => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                </label>
                            )}
                            <p className="text-xs text-gray-500">Date format: DD MMM YYYY (eg 17th Feb 2026). End date is optional.</p>
                        </div>
                        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
                            <button type="button" onClick={() => setIsCouponModalOpen(false)} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
                            <button type="button" onClick={handleIssueCoupon} disabled={couponCreating} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-accent text-sm font-semibold hover:bg-primary-light disabled:opacity-60">
                                <Plus size={16} /> {couponCreating ? 'Issuing...' : 'Issue Coupon'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editRow && (
                <div className="fixed inset-0 z-[95] bg-black/50 flex items-center justify-center p-4">
                    <div className="w-full max-w-2xl rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div><p className="text-xs uppercase tracking-[0.25em] text-gray-400 font-semibold">Edit Tier</p><h3 className="text-lg font-semibold text-gray-900 mt-1">{editRow.label}</h3></div>
                            <button onClick={() => setEditingTier(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><X size={16} /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <label className="text-xs text-gray-600">Threshold (INR)<input className="input-field mt-1" type="number" value={editRow.threshold} onChange={(e) => updateRow(editRow.tier, { threshold: e.target.value })} /></label>
                                <label className="text-xs text-gray-600">Window Days<input className="input-field mt-1" type="number" value={editRow.windowDays} onChange={(e) => updateRow(editRow.tier, { windowDays: e.target.value })} /></label>
                                <label className="text-xs text-gray-600">Extra Discount %<input className="input-field mt-1" type="number" step="0.1" value={editRow.extraDiscountPct} onChange={(e) => updateRow(editRow.tier, { extraDiscountPct: e.target.value })} /></label>
                                <label className="text-xs text-gray-600">Shipping Discount %<input className="input-field mt-1" type="number" step="0.1" value={editRow.shippingDiscountPct} onChange={(e) => updateRow(editRow.tier, { shippingDiscountPct: e.target.value })} /></label>
                                <label className="text-xs text-gray-600">Birthday Discount %<input className="input-field mt-1" type="number" step="0.1" value={editRow.birthdayDiscountPct} onChange={(e) => updateRow(editRow.tier, { birthdayDiscountPct: e.target.value })} /></label>
                                <label className="text-xs text-gray-600">Abandoned Cart Boost %<input className="input-field mt-1" type="number" step="0.1" value={editRow.abandonedCartBoostPct} onChange={(e) => updateRow(editRow.tier, { abandonedCartBoostPct: e.target.value })} /></label>
                                <label className="text-xs text-gray-600">Priority Weight<input className="input-field mt-1" type="number" value={editRow.priorityWeight} onChange={(e) => updateRow(editRow.tier, { priorityWeight: e.target.value })} /></label>
                            </div>
                            <label className="text-xs text-gray-600 block">
                                Shipping Priority
                                <select className="input-field mt-1" value={editRow.shippingPriority} onChange={(e) => updateRow(editRow.tier, { shippingPriority: e.target.value })}>
                                    {SHIPPING_PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </select>
                            </label>
                        </div>
                        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
                            <button type="button" onClick={() => setEditingTier(null)} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
                            <button type="button" onClick={handleSaveTier} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-accent text-sm font-semibold hover:bg-primary-light disabled:opacity-60">
                                <Save size={16} /> {saving ? 'Saving...' : 'Save Tier'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
