import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Crown, Gem, Medal, Pencil, Plus, Search, Shield, Sparkles, Star, Save, Trash2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { adminService } from '../../services/adminService';
import { productService } from '../../services/productService';
import { useToast } from '../../context/ToastContext';
import { useAdminCrudSync } from '../../hooks/useAdminCrudSync';
import Modal from '../../components/Modal';
import { formatAdminDate } from '../../utils/dateFormat';

const ORDER = ['regular', 'bronze', 'silver', 'gold', 'platinum'];

const getTodayDateInput = () => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
};
const MAX_COUPON_RANGE_DAYS = 90;
const toDateOnly = (value) => {
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const addDaysToInput = (value, days) => {
    const date = toDateOnly(value);
    if (!date) return '';
    const copy = new Date(date);
    copy.setDate(copy.getDate() + Number(days || 0));
    const local = new Date(copy.getTime() - copy.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
};

const toNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};
const formatCouponExpiry = (value) => {
    if (!value) return 'No expiry';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'No expiry';
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
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

const getDefaultPopupForm = () => ({
    isActive: false,
    title: '',
    summary: '',
    content: '',
    encouragement: '',
    imageUrl: '',
    audioUrl: '',
    buttonLabel: 'Shop Now',
    buttonLink: '/shop',
    discountType: '',
    discountValue: '',
    couponCode: '',
    startsAt: '',
    endsAt: ''
});

const toDateInput = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
};

const normalizeCategoryOptions = (value) => {
    const rows = Array.isArray(value) ? value : [];
    const mapped = rows.map((row) => {
        if (row == null) return null;
        if (typeof row === 'string') return null;
        const id = Number(row.id ?? row.category_id ?? row.categoryId ?? 0);
        const name = String(row.name ?? row.category_name ?? row.title ?? '').trim();
        if (!Number.isFinite(id) || id <= 0 || !name) return null;
        return { id, name };
    }).filter(Boolean);
    const seen = new Set();
    return mapped.filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
    });
};

export default function LoyaltySettings({ onBack }) {
    const toast = useToast();
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
    const [openSection, setOpenSection] = useState('coupon');
    const [popupForm, setPopupForm] = useState(getDefaultPopupForm());
    const [popupSaving, setPopupSaving] = useState(false);
    const [popupImageUploading, setPopupImageUploading] = useState(false);
    const [popupAudioUploading, setPopupAudioUploading] = useState(false);
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        confirmText: 'Delete',
        type: 'delete',
        coupon: null
    });
    const [isConfirmProcessing, setIsConfirmProcessing] = useState(false);
    const couponStartDateInputRef = useRef(null);
    const couponEndDateInputRef = useRef(null);

    const applyConfigRows = (config = []) => {
        const byTier = Object.fromEntries((Array.isArray(config) ? config : []).map((item) => [String(item.tier || '').toLowerCase(), item]));
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
    };

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            adminService.getLoyaltyConfig(),
            adminService.getLoyaltyPopupConfig().catch(() => ({ popup: null })),
            productService.getCategoryStats().catch(() => null),
            productService.getCategories().catch(() => ({ categories: [] }))
        ]).then(([data, popupData, categoryStats, cats]) => {
            if (cancelled) return;
            applyConfigRows(Array.isArray(data?.config) ? data.config : []);
            const popup = popupData?.popup || null;
            setPopupForm({
                isActive: Boolean(popup?.isActive),
                title: popup?.title || '',
                summary: popup?.summary || '',
                content: popup?.content || '',
                encouragement: popup?.encouragement || '',
                imageUrl: popup?.imageUrl || '',
                audioUrl: popup?.audioUrl || '',
                buttonLabel: popup?.buttonLabel || 'Shop Now',
                buttonLink: popup?.buttonLink || '/shop',
                discountType: popup?.discountType || '',
                discountValue: popup?.discountValue == null ? '' : popup.discountValue,
                couponCode: popup?.couponCode || '',
                startsAt: toDateInput(popup?.startsAt),
                endsAt: toDateInput(popup?.endsAt)
            });
            const statRows = Array.isArray(categoryStats)
                ? categoryStats
                : (Array.isArray(categoryStats?.categories) ? categoryStats.categories : []);
            const categoryRows = Array.isArray(cats)
                ? cats
                : (Array.isArray(cats?.categories) ? cats.categories : []);
            const resolved = normalizeCategoryOptions(statRows);
            setCategories(resolved.length ? resolved : normalizeCategoryOptions(categoryRows));
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

    useAdminCrudSync({
        'coupon:changed': () => {
            adminService.invalidateLoyaltyCouponCache();
            setCouponRefreshKey((v) => v + 1);
        },
        'loyalty:config_update': ({ config } = {}) => {
            if (Array.isArray(config)) {
                applyConfigRows(config);
                return;
            }
            adminService.getLoyaltyConfig()
                .then((data) => applyConfigRows(Array.isArray(data?.config) ? data.config : []))
                .catch(() => {});
        }
    });

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
        if (couponForm.startsAt && couponForm.expiresAt) {
            const start = toDateOnly(couponForm.startsAt);
            const end = toDateOnly(couponForm.expiresAt);
            const diffDays = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
            if (Number.isFinite(diffDays) && diffDays > MAX_COUPON_RANGE_DAYS) {
                toast.error(`Coupon validity cannot exceed ${MAX_COUPON_RANGE_DAYS} days`);
                return;
            }
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

    const openDeleteCouponConfirm = (coupon) => {
        if (!coupon) return;
        setConfirmModal({
            isOpen: true,
            type: 'delete',
            title: 'Delete Coupon',
            message: `Delete coupon ${coupon.code || coupon.id}? This cannot be undone.`,
            confirmText: 'Delete',
            coupon
        });
    };

    const closeConfirmModal = () => {
        if (isConfirmProcessing) return;
        setConfirmModal((prev) => ({ ...prev, isOpen: false, coupon: null }));
    };

    const handleDeleteCoupon = async () => {
        const coupon = confirmModal?.coupon || null;
        const couponId = coupon?.id ?? coupon?.code ?? null;
        if (!couponId) return;
        const deletingKey = coupon?.id ?? coupon?.code ?? null;
        setIsConfirmProcessing(true);
        setCouponDeletingId(deletingKey);
        try {
            await adminService.deleteLoyaltyCoupon(couponId);
            toast.success('Coupon deleted');
            setCouponRefreshKey((v) => v + 1);
            setConfirmModal((prev) => ({ ...prev, isOpen: false, coupon: null }));
        } catch (error) {
            toast.error(error?.message || 'Failed to delete coupon');
        } finally {
            setCouponDeletingId(null);
            setIsConfirmProcessing(false);
        }
    };

    const handlePopupImageUpload = async (file) => {
        if (!file) return;
        setPopupImageUploading(true);
        try {
            const data = await adminService.uploadLoyaltyPopupImage(file);
            setPopupForm((prev) => ({ ...prev, imageUrl: data?.url || prev.imageUrl }));
            toast.success('Popup image uploaded');
        } catch (error) {
            toast.error(error?.message || 'Failed to upload popup image');
        } finally {
            setPopupImageUploading(false);
        }
    };

    const handlePopupAudioUpload = async (file) => {
        if (!file) return;
        setPopupAudioUploading(true);
        try {
            const data = await adminService.uploadLoyaltyPopupAudio(file);
            setPopupForm((prev) => ({ ...prev, audioUrl: data?.url || prev.audioUrl }));
            toast.success('Popup audio uploaded');
        } catch (error) {
            toast.error(error?.message || 'Failed to upload popup audio');
        } finally {
            setPopupAudioUploading(false);
        }
    };

    const handleSavePopup = async () => {
        if (popupForm.startsAt && popupForm.endsAt && popupForm.endsAt < popupForm.startsAt) {
            toast.error('Popup end date must be on or after start date');
            return;
        }
        setPopupSaving(true);
        try {
            const payload = {
                isActive: Boolean(popupForm.isActive),
                title: popupForm.title,
                summary: popupForm.summary,
                content: popupForm.content,
                encouragement: popupForm.encouragement,
                imageUrl: popupForm.imageUrl,
                audioUrl: popupForm.audioUrl,
                buttonLabel: popupForm.buttonLabel,
                buttonLink: popupForm.buttonLink,
                discountType: popupForm.discountType || null,
                discountValue: popupForm.discountValue === '' ? null : Number(popupForm.discountValue || 0),
                couponCode: popupForm.couponCode || null,
                startsAt: popupForm.startsAt ? new Date(`${popupForm.startsAt}T00:00:00`).toISOString() : null,
                endsAt: popupForm.endsAt ? new Date(`${popupForm.endsAt}T23:59:59`).toISOString() : null
            };
            const data = await adminService.updateLoyaltyPopupConfig(payload);
            const popup = data?.popup || null;
            setPopupForm((prev) => ({
                ...prev,
                isActive: Boolean(popup?.isActive),
                startsAt: toDateInput(popup?.startsAt),
                endsAt: toDateInput(popup?.endsAt)
            }));
            toast.success('Popup settings saved');
        } catch (error) {
            toast.error(error?.message || 'Failed to save popup settings');
        } finally {
            setPopupSaving(false);
        }
    };

    if (loading) return <div className="py-16 text-center text-gray-400">Loading loyalty settings...</div>;

    const style = TIER_STYLE[activeRow?.tier || 'regular'] || TIER_STYLE.regular;
    const TierIcon = style.icon || Sparkles;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl md:text-3xl font-serif text-primary font-bold">Loyalty Settings</h2>
                    <p className="text-sm text-gray-500 mt-1">Select tier tab and edit its card.</p>
                </div>
                <button type="button" onClick={onBack} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    <ArrowLeft size={16} /> Back
                </button>
            </div>

            <div className="flex flex-col gap-4">
            <div className="order-2 rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <button
                    type="button"
                    onClick={() => setOpenSection((prev) => (prev === 'tier' ? '' : 'tier'))}
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">Tier Management</h3>
                        <p className="text-sm text-gray-500">Edit thresholds, discounts and shipping priority by tier.</p>
                    </div>
                    <span className="text-sm font-semibold text-gray-500">{openSection === 'tier' ? '−' : '+'}</span>
                </button>
                <div className={`${openSection === 'tier' ? 'block' : 'hidden'} border-t border-gray-100 p-3`}>
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

                    {activeRow && (
                        <div className={`relative mt-3 rounded-2xl border border-gray-200 bg-gradient-to-br ${style.card} p-5 shadow-sm overflow-hidden`}>
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
                </div>
            </div>

            <div className="order-1 rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <button
                    type="button"
                    onClick={() => setOpenSection((prev) => (prev === 'coupon' ? '' : 'coupon'))}
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">Coupon Management</h3>
                        <p className="text-sm text-gray-500">Issue and deactivate loyalty coupons.</p>
                    </div>
                    <span className="text-sm font-semibold text-gray-500">{openSection === 'coupon' ? '−' : '+'}</span>
                </button>
                <div className={`${openSection === 'coupon' ? 'block' : 'hidden'} border-t border-gray-100 p-4 space-y-4`}>
                    <div className="flex items-center justify-between gap-3">
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
                    <div className="rounded-xl border border-gray-200 overflow-hidden hidden md:block">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-2 text-xs uppercase tracking-wider text-gray-500">Code</th>
                                    <th className="px-3 py-2 text-xs uppercase tracking-wider text-gray-500">Name</th>
                                    <th className="px-3 py-2 text-xs uppercase tracking-wider text-gray-500">Scope</th>
                                    <th className="px-3 py-2 text-xs uppercase tracking-wider text-gray-500">Discount</th>
                                    <th className="px-3 py-2 text-xs uppercase tracking-wider text-gray-500">Used</th>
                                    <th className="px-3 py-2 text-xs uppercase tracking-wider text-gray-500">Expiry</th>
                                    <th className="px-3 py-2 text-xs uppercase tracking-wider text-gray-500 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {couponLoading && <tr><td className="px-3 py-4 text-gray-400" colSpan={7}>Loading coupons...</td></tr>}
                                {!couponLoading && couponList.length === 0 && <tr><td className="px-3 py-4 text-gray-400" colSpan={7}>No coupons found.</td></tr>}
                                {!couponLoading && couponList.map((cp) => (
                                    <tr key={cp.id || cp.code}>
                                        <td className="px-3 py-2 font-semibold text-gray-800">{cp.code}</td>
                                        <td className="px-3 py-2 text-gray-600">{cp.name || 'Coupon'}</td>
                                        <td className="px-3 py-2 text-gray-600">{String(cp.scope_type || 'generic')}</td>
                                        <td className="px-3 py-2 text-gray-600">{cp.discount_type === 'fixed' ? `₹${Number(cp.discount_value || 0).toLocaleString('en-IN')}` : `${Number(cp.discount_value || 0)}%`}</td>
                                        <td className="px-3 py-2 text-gray-600">{Number(cp.used_count || 0)}</td>
                                        <td className="px-3 py-2 text-gray-600">{formatCouponExpiry(cp.expires_at || cp.expiresAt)}</td>
                                        <td className="px-3 py-2 text-right">
                                            <button
                                                type="button"
                                                onClick={() => openDeleteCouponConfirm(cp)}
                                                disabled={couponDeletingId === (cp.id || cp.code)}
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
                    <div className="rounded-xl border border-gray-200 overflow-hidden md:hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-2 text-xs uppercase tracking-wider text-gray-500">Coupon</th>
                                    <th className="px-3 py-2 text-xs uppercase tracking-wider text-gray-500 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {couponLoading && <tr><td className="px-3 py-4 text-gray-400" colSpan={2}>Loading coupons...</td></tr>}
                                {!couponLoading && couponList.length === 0 && <tr><td className="px-3 py-4 text-gray-400" colSpan={2}>No coupons found.</td></tr>}
                                {!couponLoading && couponList.map((cp) => (
                                    <tr key={cp.id || cp.code}>
                                        <td className="px-3 py-2">
                                            <p className="font-semibold text-gray-800">{cp.code}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">{cp.name || 'Coupon'}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                {String(cp.scope_type || 'generic')} • {cp.discount_type === 'fixed' ? `₹${Number(cp.discount_value || 0).toLocaleString('en-IN')}` : `${Number(cp.discount_value || 0)}%`} • Used {Number(cp.used_count || 0)}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-0.5">Expiry: {formatCouponExpiry(cp.expires_at || cp.expiresAt)}</p>
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <button
                                                type="button"
                                                onClick={() => openDeleteCouponConfirm(cp)}
                                                disabled={couponDeletingId === (cp.id || cp.code)}
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
            </div>
            <div className="order-3 rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <button
                    type="button"
                    onClick={() => setOpenSection((prev) => (prev === 'popup' ? '' : 'popup'))}
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">Popup Management</h3>
                        <p className="text-sm text-gray-500">Configure customer popup card and media.</p>
                    </div>
                    <span className="text-sm font-semibold text-gray-500">{openSection === 'popup' ? '−' : '+'}</span>
                </button>
                <div className={`${openSection === 'popup' ? 'block' : 'hidden'} border-t border-gray-100 p-4 space-y-4`}>
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
                        <input type="checkbox" checked={Boolean(popupForm.isActive)} onChange={(e) => setPopupForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
                        Popup enabled
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="text-xs text-gray-600">Title<input className="input-field mt-1" value={popupForm.title} onChange={(e) => setPopupForm((prev) => ({ ...prev, title: e.target.value }))} /></label>
                        <label className="text-xs text-gray-600">Summary<input className="input-field mt-1" value={popupForm.summary} onChange={(e) => setPopupForm((prev) => ({ ...prev, summary: e.target.value }))} /></label>
                        <label className="text-xs text-gray-600 md:col-span-2">Content<textarea className="input-field mt-1 min-h-[88px]" value={popupForm.content} onChange={(e) => setPopupForm((prev) => ({ ...prev, content: e.target.value }))} /></label>
                        <label className="text-xs text-gray-600 md:col-span-2">Encouragement Message<input className="input-field mt-1" value={popupForm.encouragement} onChange={(e) => setPopupForm((prev) => ({ ...prev, encouragement: e.target.value }))} /></label>
                        <label className="text-xs text-gray-600">Button Label<input className="input-field mt-1" value={popupForm.buttonLabel} onChange={(e) => setPopupForm((prev) => ({ ...prev, buttonLabel: e.target.value }))} /></label>
                        <label className="text-xs text-gray-600">Button Link<input className="input-field mt-1" value={popupForm.buttonLink} onChange={(e) => setPopupForm((prev) => ({ ...prev, buttonLink: e.target.value }))} /></label>
                        <label className="text-xs text-gray-600">Discount Type<select className="input-field mt-1" value={popupForm.discountType} onChange={(e) => setPopupForm((prev) => ({ ...prev, discountType: e.target.value }))}><option value="">None</option><option value="percent">Percent</option><option value="fixed">Fixed INR</option></select></label>
                        <label className="text-xs text-gray-600">Discount Value<input className="input-field mt-1" type="number" value={popupForm.discountValue} onChange={(e) => setPopupForm((prev) => ({ ...prev, discountValue: e.target.value }))} /></label>
                        <label className="text-xs text-gray-600">Coupon Code<input className="input-field mt-1" value={popupForm.couponCode} onChange={(e) => setPopupForm((prev) => ({ ...prev, couponCode: e.target.value.toUpperCase() }))} /></label>
                        <label className="text-xs text-gray-600">Start Date<input className="input-field mt-1" type="date" value={popupForm.startsAt} onChange={(e) => setPopupForm((prev) => ({ ...prev, startsAt: e.target.value }))} /></label>
                        <label className="text-xs text-gray-600">End Date<input className="input-field mt-1" type="date" value={popupForm.endsAt} min={popupForm.startsAt || undefined} onChange={(e) => setPopupForm((prev) => ({ ...prev, endsAt: e.target.value }))} /></label>
                        <label className="text-xs text-gray-600 md:col-span-2">Popup Image URL<input className="input-field mt-1" value={popupForm.imageUrl} onChange={(e) => setPopupForm((prev) => ({ ...prev, imageUrl: e.target.value }))} /></label>
                        <label className="text-xs text-gray-600 md:col-span-2">Audio URL<input className="input-field mt-1" value={popupForm.audioUrl} onChange={(e) => setPopupForm((prev) => ({ ...prev, audioUrl: e.target.value }))} /></label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-50">
                            {popupImageUploading ? 'Uploading image...' : 'Upload Popup Image'}
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePopupImageUpload(e.target.files?.[0])} />
                        </label>
                        <label className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-50">
                            {popupAudioUploading ? 'Uploading audio...' : 'Upload Popup Audio'}
                            <input type="file" accept="audio/*" className="hidden" onChange={(e) => handlePopupAudioUpload(e.target.files?.[0])} />
                        </label>
                    </div>
                    <div className="flex justify-end">
                        <button type="button" onClick={handleSavePopup} disabled={popupSaving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-accent text-sm font-semibold hover:bg-primary-light disabled:opacity-60">
                            <Save size={16} /> {popupSaving ? 'Saving...' : 'Save Popup'}
                        </button>
                    </div>
                </div>
            </div>
            </div>

            {isCouponModalOpen && createPortal(
                <div className="fixed inset-0 z-[210]">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsCouponModalOpen(false)}></div>
                    <div className="relative z-10 flex min-h-full items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto">
                    <div className="w-full max-w-3xl rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col my-auto">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div><p className="text-xs uppercase tracking-[0.25em] text-gray-400 font-semibold">Coupon</p><h3 className="text-lg font-semibold text-gray-900 mt-1">Issue New Coupon</h3></div>
                            <button onClick={() => setIsCouponModalOpen(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><X size={16} /></button>
                        </div>
                        <div className="p-5 space-y-4 overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <label className="text-xs text-gray-600">Coupon Name<input className="input-field mt-1" placeholder="Coupon name" value={couponForm.name} onChange={(e) => setCouponForm((p) => ({ ...p, name: e.target.value }))} /></label>
                                <label className="text-xs text-gray-600">Coupon Scope<select className="input-field mt-1" value={couponForm.scopeType} onChange={(e) => setCouponForm((p) => ({ ...p, scopeType: e.target.value }))}><option value="generic">Generic</option><option value="category">Category specific</option><option value="tier">Tier specific</option></select></label>
                                <label className="text-xs text-gray-600">Discount Type<select className="input-field mt-1" value={couponForm.discountType} onChange={(e) => setCouponForm((p) => ({ ...p, discountType: e.target.value }))}><option value="percent">Percent</option><option value="fixed">Fixed INR</option></select></label>
                                <label className="text-xs text-gray-600">Discount Value<input className="input-field mt-1" type="number" value={couponForm.discountValue} onChange={(e) => setCouponForm((p) => ({ ...p, discountValue: e.target.value }))} /></label>
                                <label className="text-xs text-gray-600">Usage Limit Per User<input className="input-field mt-1" type="number" value={couponForm.usageLimitPerUser} onChange={(e) => setCouponForm((p) => ({ ...p, usageLimitPerUser: e.target.value }))} /></label>
                                <label className="text-xs text-gray-600">
                                    Start Date <span className="text-red-500">*</span>
                                    <input
                                        ref={couponStartDateInputRef}
                                        className="sr-only"
                                        type="date"
                                        value={couponForm.startsAt}
                                        min={couponForm.expiresAt ? addDaysToInput(couponForm.expiresAt, -MAX_COUPON_RANGE_DAYS) : undefined}
                                        max={couponForm.expiresAt || undefined}
                                        onChange={(e) => setCouponForm((p) => ({ ...p, startsAt: e.target.value }))}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (couponStartDateInputRef.current?.showPicker) couponStartDateInputRef.current.showPicker();
                                            else couponStartDateInputRef.current?.click();
                                        }}
                                        className="w-full input-field mt-1 text-left"
                                    >
                                        {couponForm.startsAt ? formatAdminDate(`${couponForm.startsAt}T00:00:00`) : 'Start Date'}
                                    </button>
                                </label>
                                <label className="text-xs text-gray-600">
                                    End Date (Optional)
                                    <input
                                        ref={couponEndDateInputRef}
                                        className="sr-only"
                                        type="date"
                                        value={couponForm.expiresAt}
                                        min={couponForm.startsAt || undefined}
                                        max={couponForm.startsAt ? addDaysToInput(couponForm.startsAt, MAX_COUPON_RANGE_DAYS) : undefined}
                                        onChange={(e) => setCouponForm((p) => ({ ...p, expiresAt: e.target.value }))}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (couponEndDateInputRef.current?.showPicker) couponEndDateInputRef.current.showPicker();
                                            else couponEndDateInputRef.current?.click();
                                        }}
                                        className="w-full input-field mt-1 text-left"
                                    >
                                        {couponForm.expiresAt ? formatAdminDate(`${couponForm.expiresAt}T00:00:00`) : 'End Date'}
                                    </button>
                                </label>
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
                                    {categories.length === 0 && (
                                        <p className="mt-2 text-[11px] text-amber-700">No categories found. Create categories first to issue category-scoped coupons.</p>
                                    )}
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
                </div>,
                document.body
            )}

            {editRow && createPortal(
                <div className="fixed inset-0 z-[95] bg-black/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
                    <div className="w-full max-w-2xl rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col my-auto">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div><p className="text-xs uppercase tracking-[0.25em] text-gray-400 font-semibold">Edit Tier</p><h3 className="text-lg font-semibold text-gray-900 mt-1">{editRow.label}</h3></div>
                            <button onClick={() => setEditingTier(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><X size={16} /></button>
                        </div>
                        <div className="p-5 space-y-4 overflow-y-auto">
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
                </div>,
                document.body
            )}
            <Modal
                isOpen={confirmModal.isOpen}
                onClose={closeConfirmModal}
                title={confirmModal.title}
                message={confirmModal.message}
                type={confirmModal.type}
                confirmText={confirmModal.confirmText}
                onConfirm={handleDeleteCoupon}
                isLoading={isConfirmProcessing}
            />
        </div>
    );
}
