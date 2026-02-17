import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Pencil, Save, X } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';

const ORDER = ['regular', 'bronze', 'silver', 'gold', 'platinum'];

const toNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const SHIPPING_PRIORITY_OPTIONS = [
    { value: 'standard', label: 'Standard', description: 'Normal dispatch queue and SLA.' },
    { value: 'standard_plus', label: 'Standard+', description: 'Slightly improved queue handling over standard.' },
    { value: 'high', label: 'High', description: 'Orders get pushed earlier in dispatch operations.' },
    { value: 'higher', label: 'Higher', description: 'Ahead of High; for premium members.' },
    { value: 'highest', label: 'Highest', description: 'Top queue priority for dispatch and support handling.' }
];

const TIER_ACCENT = {
    regular: '#64748b',
    bronze: '#b45309',
    silver: '#64748b',
    gold: '#ca8a04',
    platinum: '#0369a1'
};

const TIER_CARD_STYLE = {
    regular: 'from-slate-700 via-slate-600 to-slate-700 text-white',
    bronze: 'from-amber-800 via-orange-700 to-amber-800 text-white',
    silver: 'from-slate-600 via-zinc-500 to-slate-600 text-white',
    gold: 'from-yellow-500 via-amber-400 to-yellow-500 text-amber-950',
    platinum: 'from-sky-700 via-blue-500 to-sky-700 text-white'
};

const buildBenefitsPreview = (row) => {
    const tier = String(row?.tier || 'regular').toLowerCase();
    if (tier === 'regular') {
        return ['Standard pricing', 'Standard shipping', 'Progress tracking to next tier'];
    }
    const shippingPriorityMeta = SHIPPING_PRIORITY_OPTIONS.find((item) => item.value === row.shippingPriority);
    return [
        `${toNumber(row.extraDiscountPct)}% extra member discount`,
        `${toNumber(row.shippingDiscountPct)}% shipping fee discount`,
        `${toNumber(row.birthdayDiscountPct ?? 10)}% birthday discount (overrides other discounts)`,
        `${toNumber(row.abandonedCartBoostPct)}% abandoned cart offer boost`,
        `${shippingPriorityMeta?.label || 'Standard'} dispatch priority (weight ${toNumber(row.priorityWeight)})`
    ];
};

export default function LoyaltySettings({ onBack }) {
    const toast = useToast();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingTier, setEditingTier] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const data = await adminService.getLoyaltyConfig();
                if (cancelled) return;
                const config = Array.isArray(data?.config) ? data.config : [];
                const byTier = Object.fromEntries(config.map((item) => [String(item.tier || '').toLowerCase(), item]));
                const ordered = ORDER.map((tier) => {
                    const item = byTier[tier] || {};
                    return {
                        tier,
                        label: item.label || tier,
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
                });
                setRows(ordered);
            } catch (error) {
                toast.error(error?.message || 'Failed to load loyalty config');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [toast]);

    const editRow = useMemo(
        () => rows.find((row) => row.tier === editingTier) || null,
        [rows, editingTier]
    );

    const updateRow = (tier, patch) => {
        setRows((prev) => prev.map((row) => (row.tier === tier ? { ...row, ...patch } : row)));
    };

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

    if (loading) {
        return <div className="py-16 text-center text-gray-400">Loading loyalty settings...</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onBack}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        <ArrowLeft size={16} />
                        Back
                    </button>
                    <div>
                        <h2 className="text-2xl font-serif text-primary font-bold">Loyalty Settings</h2>
                        <p className="text-sm text-gray-500 mt-1">Edit each tier as a card. Tier colors and benefit lines are controlled by code.</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {rows.map((row) => (
                    <div key={row.tier} className={`rounded-2xl border border-gray-200 bg-gradient-to-br ${TIER_CARD_STYLE[row.tier] || TIER_CARD_STYLE.regular} p-5 shadow-sm`}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs uppercase tracking-[0.25em] font-semibold opacity-80">Tier</p>
                                <p className="text-xl font-bold mt-1">{row.label}</p>
                                <p className="text-sm mt-1 opacity-90">Threshold ₹{toNumber(row.threshold).toLocaleString('en-IN')} in {toNumber(row.windowDays)} days</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingTier(row.tier)}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/40 bg-white/10 text-sm font-semibold hover:bg-white/20"
                                title={`Edit ${row.label}`}
                            >
                                <Pencil size={14} />
                                Edit
                            </button>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <div className="rounded-xl border border-white/30 bg-white/10 px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wider font-semibold opacity-80">Extra Discount</p>
                                <p className="text-base font-bold mt-1">{toNumber(row.extraDiscountPct)}%</p>
                            </div>
                            <div className="rounded-xl border border-white/30 bg-white/10 px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wider font-semibold opacity-80">Shipping Discount</p>
                                <p className="text-base font-bold mt-1">{toNumber(row.shippingDiscountPct)}%</p>
                            </div>
                            <div className="rounded-xl border border-white/30 bg-white/10 px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wider font-semibold opacity-80">Birthday Discount</p>
                                <p className="text-base font-bold mt-1">{toNumber(row.birthdayDiscountPct, 10)}%</p>
                            </div>
                            <div className="rounded-xl border border-white/30 bg-white/10 px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wider font-semibold opacity-80">Abandoned Boost</p>
                                <p className="text-base font-bold mt-1">{toNumber(row.abandonedCartBoostPct)}%</p>
                            </div>
                            <div className="rounded-xl border border-white/30 bg-white/10 px-3 py-2 col-span-2">
                                <p className="text-[11px] uppercase tracking-wider font-semibold opacity-80">Shipping Priority</p>
                                <p className="text-base font-bold mt-1">{row.shippingPriority} (weight {toNumber(row.priorityWeight)})</p>
                            </div>
                        </div>
                        <div className="mt-4 rounded-xl border border-white/30 bg-white/10 p-3">
                            <p className="text-[11px] uppercase tracking-wider font-semibold mb-2 opacity-80">Benefit Preview</p>
                            <div className="space-y-1">
                                {(row.benefits?.length ? row.benefits : buildBenefitsPreview(row)).map((benefit) => (
                                    <p key={benefit} className="text-sm">- {benefit}</p>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
                <p className="font-semibold text-gray-800">Field meanings</p>
                <p className="mt-2"><span className="font-semibold">Abandoned Cart Boost %:</span> Additional discount headroom for abandoned cart recovery offers, on top of the campaign base discount.</p>
                <p className="mt-1"><span className="font-semibold">Shipping Priority:</span> Queue level used by operations to prioritize dispatch; higher levels are processed before lower levels.</p>
            </div>

            {editRow && (
                <div className="fixed inset-0 z-[95] bg-black/50 flex items-center justify-center p-4">
                    <div className="w-full max-w-2xl rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-[0.25em] text-gray-400 font-semibold">Edit Tier Card</p>
                                <h3 className="text-lg font-semibold text-gray-900 mt-1">{editRow.label}</h3>
                            </div>
                            <button onClick={() => setEditingTier(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <label className="text-xs text-gray-600">
                                    Threshold (INR)
                                    <input className="input-field mt-1" type="number" value={editRow.threshold} onChange={(e) => updateRow(editRow.tier, { threshold: e.target.value })} />
                                </label>
                                <label className="text-xs text-gray-600">
                                    Window Days
                                    <input className="input-field mt-1" type="number" value={editRow.windowDays} onChange={(e) => updateRow(editRow.tier, { windowDays: e.target.value })} />
                                </label>
                                <label className="text-xs text-gray-600">
                                    Extra Discount %
                                    <input className="input-field mt-1" type="number" step="0.1" value={editRow.extraDiscountPct} onChange={(e) => updateRow(editRow.tier, { extraDiscountPct: e.target.value })} />
                                </label>
                                <label className="text-xs text-gray-600">
                                    Shipping Discount %
                                    <input className="input-field mt-1" type="number" step="0.1" value={editRow.shippingDiscountPct} onChange={(e) => updateRow(editRow.tier, { shippingDiscountPct: e.target.value })} />
                                </label>
                                <label className="text-xs text-gray-600">
                                    Birthday Discount %
                                    <input className="input-field mt-1" type="number" step="0.1" value={editRow.birthdayDiscountPct} onChange={(e) => updateRow(editRow.tier, { birthdayDiscountPct: e.target.value })} />
                                </label>
                                <label className="text-xs text-gray-600">
                                    Abandoned Cart Boost %
                                    <input className="input-field mt-1" type="number" step="0.1" value={editRow.abandonedCartBoostPct} onChange={(e) => updateRow(editRow.tier, { abandonedCartBoostPct: e.target.value })} />
                                </label>
                                <label className="text-xs text-gray-600">
                                    Priority Weight
                                    <input className="input-field mt-1" type="number" value={editRow.priorityWeight} onChange={(e) => updateRow(editRow.tier, { priorityWeight: e.target.value })} />
                                </label>
                            </div>
                            <label className="text-xs text-gray-600 block">
                                Shipping Priority
                                <select
                                    className="input-field mt-1"
                                    value={editRow.shippingPriority}
                                    onChange={(e) => updateRow(editRow.tier, { shippingPriority: e.target.value })}
                                >
                                    {SHIPPING_PRIORITY_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                            <div className="rounded-xl p-3 text-xs border" style={{ borderColor: `${TIER_ACCENT[editRow.tier] || '#64748b'}33`, backgroundColor: `${TIER_ACCENT[editRow.tier] || '#64748b'}11` }}>
                                <p className="font-semibold text-gray-700">Benefits are auto-generated</p>
                                <div className="mt-1 space-y-1 text-gray-600">
                                    {buildBenefitsPreview(editRow).map((line) => (
                                        <p key={line}>- {line}</p>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setEditingTier(null)}
                                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveTier}
                                disabled={saving}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-accent text-sm font-semibold hover:bg-primary-light disabled:opacity-60"
                            >
                                <Save size={16} />
                                {saving ? 'Saving...' : 'Save Tier'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
