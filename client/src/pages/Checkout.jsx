import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight, CreditCard, Edit3, Home, Mail, Phone, Sparkles, Ticket, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { authService } from '../services/authService';
import { orderService } from '../services/orderService';
import { useShipping } from '../context/ShippingContext';
import { useSocket } from '../context/SocketContext';
import logo from '../assets/logo.webp';
import cartIllustration from '../assets/cart.svg';
import successDing from '../assets/success_ding.mp3';
import { burstConfetti, playCue } from '../utils/celebration';

const emptyAddress = { line1: '', city: '', state: '', zip: '' };
const RAZORPAY_SCRIPT_ID = 'razorpay-checkout-js';
const RAZORPAY_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

const ensureRazorpayScript = () => {
    if (typeof window === 'undefined') return Promise.resolve(false);
    if (window.Razorpay) return Promise.resolve(true);

    const existing = document.getElementById(RAZORPAY_SCRIPT_ID);
    if (existing) {
        return new Promise((resolve) => {
            existing.addEventListener('load', () => resolve(true), { once: true });
            existing.addEventListener('error', () => resolve(false), { once: true });
        });
    }

    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.id = RAZORPAY_SCRIPT_ID;
        script.src = RAZORPAY_SCRIPT_SRC;
        script.async = true;
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
};

const hasCompleteAddress = (address = null) => {
    const value = address || {};
    return Boolean(
        String(value?.line1 || '').trim()
        && String(value?.city || '').trim()
        && String(value?.state || '').trim()
        && String(value?.zip || '').trim()
    );
};

const normalizeStateKey = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const formatLongDate = (value) => {
    if (!value) return 'No expiry';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'No expiry';
    const day = date.getDate();
    const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
    const month = date.toLocaleString('en-IN', { month: 'short' });
    const year = date.getFullYear();
    return `${day}${suffix} ${month} ${year}`;
};

const TIER_THEME = {
    regular: { card: 'from-slate-700 via-slate-600 to-slate-700', chip: 'bg-slate-100 text-slate-700 border-slate-200', title: 'text-white', body: 'text-white/90', caption: 'text-white/80', track: 'bg-white/25', fill: 'bg-white', tag: 'bg-white/20 border-white/35 text-white' },
    bronze: { card: 'from-amber-800 via-orange-700 to-amber-800', chip: 'bg-amber-100 text-amber-800 border-amber-200', title: 'text-white', body: 'text-white/90', caption: 'text-white/80', track: 'bg-white/20', fill: 'bg-white', tag: 'bg-white/15 border-white/30 text-white' },
    silver: { card: 'from-slate-600 via-zinc-500 to-slate-600', chip: 'bg-slate-100 text-slate-700 border-slate-200', title: 'text-white', body: 'text-white/90', caption: 'text-white/80', track: 'bg-white/22', fill: 'bg-white', tag: 'bg-white/15 border-white/30 text-white' },
    gold: { card: 'from-amber-900 via-amber-800 to-amber-900', chip: 'bg-yellow-100 text-yellow-800 border-yellow-200', title: 'text-amber-50', body: 'text-amber-100', caption: 'text-amber-200', track: 'bg-amber-200/40', fill: 'bg-white', tag: 'bg-amber-200/20 border-amber-200/40 text-amber-50' },
    platinum: { card: 'from-sky-800 via-blue-700 to-sky-800', chip: 'bg-sky-100 text-sky-800 border-sky-200', title: 'text-white', body: 'text-sky-100', caption: 'text-sky-200', track: 'bg-white/22', fill: 'bg-white', tag: 'bg-white/15 border-white/30 text-white' }
};

export default function Checkout() {
    const { user, loading, updateUser } = useAuth();
    const { items, subtotal, itemCount, clearCart } = useCart();
    const { zones } = useShipping();
    const { socket } = useSocket();
    const toast = useToast();
    const navigate = useNavigate();
    const location = useLocation();

    const [editing, setEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [coupon, setCoupon] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState(null);
    const [checkoutSummary, setCheckoutSummary] = useState(null);
    const [isSummaryLoading, setIsSummaryLoading] = useState(false);
    const [loyaltyStatus, setLoyaltyStatus] = useState(null);
    const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
    const [availableCoupons, setAvailableCoupons] = useState([]);
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [orderResult, setOrderResult] = useState(null);
    const [activeAttemptId, setActiveAttemptId] = useState(null);
    const orderCelebratedRef = useRef(false);
    const autoCouponAttemptsRef = useRef(new Set());
    const lastTierSeenRef = useRef(String(user?.loyaltyTier || 'regular').toLowerCase());
    const [form, setForm] = useState({
        name: '',
        email: '',
        mobile: '',
        address: { ...emptyAddress },
        billingAddress: { ...emptyAddress }
    });
    const couponFromQuery = useMemo(() => {
        const raw = new URLSearchParams(location.search).get('coupon');
        return String(raw || '').trim().toUpperCase();
    }, [location.search]);

    const refreshAvailableCoupons = useCallback(async () => {
        if (!user || itemCount <= 0) {
            setAvailableCoupons([]);
            return;
        }
        try {
            const res = await orderService.getAvailableCoupons();
            const nextCoupons = Array.isArray(res?.coupons) ? res.coupons : [];
            setAvailableCoupons(nextCoupons);
            if (appliedCoupon?.code && !nextCoupons.some((entry) => String(entry.code || '').toUpperCase() === String(appliedCoupon.code || '').toUpperCase())) {
                setAppliedCoupon(null);
                setCoupon('');
                toast.info('Applied coupon is no longer available.');
            }
        } catch {
            setAvailableCoupons([]);
        }
    }, [user, itemCount, appliedCoupon?.code, toast]);

    useEffect(() => {
        if (!loading && !user) {
            navigate(`/login?redirect=${encodeURIComponent('/checkout')}`, { replace: true });
        }
        if (!loading && user && user.role === 'admin') {
            navigate('/admin/dashboard', { replace: true });
        }
    }, [loading, user, navigate]);

    useEffect(() => {
        if (!user) return;
        lastTierSeenRef.current = String(user?.loyaltyTier || 'regular').toLowerCase();
        setForm({
            name: user.name || '',
            email: user.email || '',
            mobile: user.mobile || '',
            address: { ...emptyAddress, ...(user.address || {}) },
            billingAddress: { ...emptyAddress, ...(user.billingAddress || user.address || {}) }
        });
    }, [user]);

    useEffect(() => {
        if (!user || !couponFromQuery) return;
        if (itemCount <= 0) {
            setIsApplyingCoupon(false);
            return;
        }
        if (appliedCoupon?.code === couponFromQuery) {
            setCoupon(couponFromQuery);
            setIsApplyingCoupon(false);
            return;
        }
        if (autoCouponAttemptsRef.current.has(couponFromQuery)) {
            setIsApplyingCoupon(false);
            return;
        }
        autoCouponAttemptsRef.current.add(couponFromQuery);

        setIsApplyingCoupon(true);
        orderService.validateRecoveryCoupon({
            code: couponFromQuery,
            shippingAddress: user?.address || null
        }).then((data) => {
            setCoupon(couponFromQuery);
            setAppliedCoupon({
                code: couponFromQuery,
                discountTotal: Number(data?.discountTotal || 0),
                coupon: data?.coupon || null
            });
            toast.success(`Coupon applied: ${couponFromQuery}`);
        }).catch((error) => {
            toast.error(error?.message || 'Coupon is invalid or expired');
            setAppliedCoupon(null);
        }).finally(() => {
            setIsApplyingCoupon(false);
        });
    }, [user, couponFromQuery, appliedCoupon?.code, toast, itemCount]);

    useEffect(() => {
        if (!user || itemCount <= 0) {
            setCheckoutSummary(null);
            return;
        }
        const timer = setTimeout(async () => {
            setIsSummaryLoading(true);
            try {
                const [summaryRes, loyaltyRes] = await Promise.all([
                    orderService.getCheckoutSummary({
                        shippingAddress: form.address,
                        couponCode: appliedCoupon?.code || null
                    }),
                    authService.getLoyaltyStatus()
                ]);
                const summary = summaryRes?.summary || null;
                const status = loyaltyRes?.status || null;
                setCheckoutSummary(summary);
                setLoyaltyStatus(status);

                const prevTier = String(lastTierSeenRef.current || 'regular').toLowerCase();
                const nextTier = String(status?.tier || prevTier).toLowerCase();
                if (prevTier !== nextTier) {
                    lastTierSeenRef.current = nextTier;
                    if (['bronze', 'silver', 'gold', 'platinum'].includes(nextTier)) {
                        burstConfetti();
                        playCue(successDing);
                        toast.success(`Membership upgraded to ${status?.profile?.label || nextTier}!`);
                    }
                }
            } catch {
                setCheckoutSummary(null);
            } finally {
                setIsSummaryLoading(false);
            }
        }, 280);
        return () => clearTimeout(timer);
    }, [user, itemCount, form.address, appliedCoupon?.code, toast]);

    useEffect(() => {
        refreshAvailableCoupons();
    }, [refreshAvailableCoupons]);

    useEffect(() => {
        if (!socket || !user?.id) return undefined;
        const handleCouponChanged = (payload = {}) => {
            const affectedUserId = payload?.userId || null;
            if (affectedUserId && String(affectedUserId) !== String(user.id)) return;
            refreshAvailableCoupons();
        };
        socket.on('coupon:changed', handleCouponChanged);
        return () => {
            socket.off('coupon:changed', handleCouponChanged);
        };
    }, [socket, user?.id, refreshAvailableCoupons]);

    useEffect(() => {
        if (!orderResult?.id) {
            orderCelebratedRef.current = false;
            return;
        }
        if (orderCelebratedRef.current) return;
        orderCelebratedRef.current = true;
        burstConfetti();
        playCue(successDing);
    }, [orderResult?.id]);

    const handleFieldChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    };

    const handleAddressChange = (section, field, value) => {
        setForm((prev) => ({
            ...prev,
            [section]: { ...prev[section], [field]: value }
        }));
    };

    const handleSave = async () => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            const res = await authService.updateProfile({
                name: form.name,
                email: form.email,
                mobile: form.mobile,
                address: form.address,
                billingAddress: form.billingAddress
            });
            if (res?.user) {
                updateUser(res.user);
                toast.success('Address updated');
                setEditing(false);
            } else {
                toast.error(res?.message || 'Failed to update profile');
            }
        } catch (error) {
            toast.error(error?.message || 'Failed to update profile');
        } finally {
            setIsSaving(false);
        }
    };

    const handleApplyCoupon = () => {
        const code = String(coupon || '').trim().toUpperCase();
        if (!code) return toast.error('Enter a coupon code');
        setIsApplyingCoupon(true);
        orderService.validateRecoveryCoupon({
            code,
            shippingAddress: form.address
        }).then((data) => {
            setCoupon(code);
            setAppliedCoupon({
                code,
                discountTotal: Number(data?.discountTotal || 0),
                coupon: data?.coupon || null
            });
            toast.success(`Coupon applied: ${code}`);
        }).catch((error) => {
            toast.error(error?.message || 'Coupon is invalid or expired');
            setAppliedCoupon(null);
        }).finally(() => {
            setIsApplyingCoupon(false);
        });
    };

    const handleRemoveCoupon = () => {
        setAppliedCoupon(null);
        setCoupon('');
    };

    const handleApplyAvailableCoupon = (code) => {
        setCoupon(String(code || '').toUpperCase());
        if (appliedCoupon?.code === String(code || '').toUpperCase()) return;
        setIsApplyingCoupon(true);
        orderService.validateRecoveryCoupon({
            code,
            shippingAddress: form.address
        }).then((data) => {
            setAppliedCoupon({
                code: String(code || '').toUpperCase(),
                discountTotal: Number(data?.discountTotal || 0),
                coupon: data?.coupon || null
            });
            toast.success(`Coupon applied: ${String(code || '').toUpperCase()}`);
        }).catch((error) => {
            toast.error(error?.message || 'Coupon is invalid or expired');
            setAppliedCoupon(null);
        }).finally(() => {
            setIsApplyingCoupon(false);
        });
    };

    const lineItems = useMemo(() => items.map(item => ({
        ...item,
        lineTotal: Number(item.price || 0) * Number(item.quantity || 0),
        weightKg: Number(item.weightKg || 0)
    })), [items]);
    const productMrpSavings = useMemo(() => lineItems.reduce((sum, item) => {
        const mrp = Number(item.compareAt || 0);
        const price = Number(item.price || 0);
        const qty = Number(item.quantity || 0);
        if (mrp <= price || qty <= 0) return sum;
        return sum + ((mrp - price) * qty);
    }, 0), [lineItems]);

    const getOrderResultItemImage = (item) => (
        item?.image_url
        || item?.imageUrl
        || item?.item_snapshot?.imageUrl
        || item?.snapshot?.imageUrl
        || null
    );

    const totalWeightKg = useMemo(() => lineItems.reduce((sum, item) => {
        return sum + (Number(item.weightKg || 0) * Number(item.quantity || 0));
    }, 0), [lineItems]);

    const fallbackShippingFee = useMemo(() => {
        if (!zones || zones.length === 0) return 0;
        const state = normalizeStateKey(form.address?.state);
        if (!state) return 0;
        const zone = zones.find(z => Array.isArray(z.states) && z.states.some(s => normalizeStateKey(s) === state));
        if (!zone || !Array.isArray(zone.options)) return 0;
        const eligible = zone.options.filter(opt => {
            const min = opt.min == null ? null : Number(opt.min);
            const max = opt.max == null ? null : Number(opt.max);
            if (opt.conditionType === 'weight') {
                if (min != null && totalWeightKg < min) return false;
                if (max != null && totalWeightKg > max) return false;
                return true;
            }
            if (opt.conditionType === 'price' || !opt.conditionType) {
                if (min != null && subtotal < min) return false;
                if (max != null && subtotal > max) return false;
                return true;
            }
            return true;
        });
        if (!eligible.length) return 0;
        eligible.sort((a, b) => Number(a.rate || 0) - Number(b.rate || 0));
        return Number(eligible[0].rate || 0);
    }, [zones, form.address?.state, subtotal, totalWeightKg]);

    const shippingFee = useMemo(
        () => Number(checkoutSummary?.shippingFee ?? fallbackShippingFee ?? 0),
        [checkoutSummary?.shippingFee, fallbackShippingFee]
    );
    const couponDiscount = useMemo(
        () => Number(checkoutSummary?.couponDiscountTotal ?? appliedCoupon?.discountTotal ?? 0),
        [checkoutSummary?.couponDiscountTotal, appliedCoupon?.discountTotal]
    );
    const loyaltyDiscount = useMemo(
        () => Number(checkoutSummary?.loyaltyDiscountTotal ?? 0),
        [checkoutSummary?.loyaltyDiscountTotal]
    );
    const loyaltyShippingDiscount = useMemo(
        () => Number(checkoutSummary?.loyaltyShippingDiscountTotal ?? 0),
        [checkoutSummary?.loyaltyShippingDiscountTotal]
    );
    const totalSavings = useMemo(
        () => Number(productMrpSavings || 0) + Number(couponDiscount || 0) + Number(loyaltyDiscount || 0) + Number(loyaltyShippingDiscount || 0),
        [productMrpSavings, couponDiscount, loyaltyDiscount, loyaltyShippingDiscount]
    );
    const grandTotal = useMemo(() => {
        if (checkoutSummary?.total != null) return Number(checkoutSummary.total || 0);
        const gross = Number(subtotal || 0) + Number(shippingFee || 0);
        return Math.max(0, gross - Number(couponDiscount || 0) - Number(loyaltyDiscount || 0) - Number(loyaltyShippingDiscount || 0));
    }, [checkoutSummary?.total, subtotal, shippingFee, couponDiscount, loyaltyDiscount, loyaltyShippingDiscount]);
    const isMobileMissingOnProfile = !String(user?.mobile || '').trim();
    const hasMobileForPayment = Boolean(String(form.mobile || '').trim());
    const isAddressReadyForPayment = hasCompleteAddress(form.address) && hasCompleteAddress(form.billingAddress);
    const hasUnavailableItems = useMemo(() => (
        lineItems.some((item) => String(item?.status || '').toLowerCase() !== 'active' || Boolean(item?.isOutOfStock))
    ), [lineItems]);
    const isReadyForPayment = isAddressReadyForPayment && (!isMobileMissingOnProfile || hasMobileForPayment) && !hasUnavailableItems;

    const handlePayNow = async () => {
        if (lineItems.length === 0) return toast.error('Your cart is empty');
        if (isPlacingOrder) return;
        if (hasUnavailableItems) return toast.error('Some items are unavailable. Please review your cart before payment.');
        if (isMobileMissingOnProfile && !hasMobileForPayment) return toast.error('Please add mobile number before payment');
        if (!hasCompleteAddress(form.address)) return toast.error('Please complete shipping address before payment');
        if (!hasCompleteAddress(form.billingAddress)) return toast.error('Please complete billing address before payment');
        setIsPlacingOrder(true);
        try {
            const profileNeedsAddressSync = (
                !hasCompleteAddress(user?.address)
                || !hasCompleteAddress(user?.billingAddress)
                || (isMobileMissingOnProfile && hasMobileForPayment)
            );
            const checkoutHasAddress = hasCompleteAddress(form.address) && hasCompleteAddress(form.billingAddress);
            if (profileNeedsAddressSync && checkoutHasAddress && (!isMobileMissingOnProfile || hasMobileForPayment)) {
                const profileRes = await authService.updateProfile({
                    name: form.name,
                    email: form.email,
                    mobile: form.mobile,
                    address: form.address,
                    billingAddress: form.billingAddress
                });
                if (profileRes?.user) {
                    updateUser(profileRes.user);
                    toast.success('Address saved to profile');
                }
            }

            const scriptLoaded = await ensureRazorpayScript();
            if (!scriptLoaded || !window.Razorpay) {
                throw new Error('Unable to load Razorpay checkout');
            }

            const init = await orderService.createRazorpayOrder({
                billingAddress: form.billingAddress,
                shippingAddress: form.address,
                couponCode: appliedCoupon?.code || null,
                notes: {
                    source: 'web_checkout'
                }
            });
            if (!init?.order?.id || !init?.keyId) {
                throw new Error(init?.message || 'Failed to initialize payment');
            }
            setActiveAttemptId(init?.attempt?.id || null);

            const prefillContact = form.mobile
                ? (String(form.mobile).startsWith('+') ? String(form.mobile) : `+91${String(form.mobile).replace(/\D/g, '')}`)
                : '';

            const paidOrder = await new Promise((resolve, reject) => {
                let settled = false;
                const markSettled = () => { settled = true; };

                const rzp = new window.Razorpay({
                    key: init.keyId,
                    amount: init.order.amount,
                    currency: init.order.currency || 'INR',
                    name: 'SSC Jewellery',
                    description: `Order payment (${init.summary?.itemCount || itemCount} items)`,
                    image: '/logo.webp',
                    order_id: init.order.id,
                    prefill: {
                        name: form.name || '',
                        email: form.email || '',
                        contact: prefillContact
                    },
                    notes: {
                        address: form.address?.line1 || ''
                    },
                    theme: {
                        color: '#1F2937'
                    },
                    modal: {
                        confirm_close: true,
                        ondismiss: () => {
                            if (!settled) {
                                markSettled();
                                reject(new Error('Payment cancelled'));
                            }
                        }
                    },
                    handler: async (response) => {
                        try {
                            const verification = await orderService.verifyRazorpayPayment(response);
                            if (!verification?.order) {
                                throw new Error('Payment verified but order was not created');
                            }
                            setOrderResult(verification.order);
                            setActiveAttemptId(null);
                            await clearCart();
                            toast.success('Payment successful, order placed');
                            markSettled();
                            resolve(verification.order);
                        } catch (error) {
                            markSettled();
                            reject(error);
                        }
                    }
                });

                rzp.on('payment.failed', (response) => {
                    if (settled) return;
                    markSettled();
                    const message = response?.error?.description || 'Payment failed. Please retry.';
                    reject(new Error(message));
                });

                rzp.open();
            });
            void paidOrder;
        } catch (error) {
            const message = error?.message || 'Failed to complete payment';
            toast.error(message === 'Payment cancelled' ? 'Payment cancelled. You can retry the payment.' : message);
            const params = new URLSearchParams();
            params.set('reason', message);
            if (activeAttemptId) params.set('attemptId', String(activeAttemptId));
            navigate(`/payment/failed?${params.toString()}`);
        } finally {
            setIsPlacingOrder(false);
        }
    };

    if (!user) return null;
    const tier = String(loyaltyStatus?.tier || checkoutSummary?.loyaltyTier || user?.loyaltyTier || 'regular').toLowerCase();
    const tierTheme = TIER_THEME[tier] || TIER_THEME.regular;
    const progressPct = Number(loyaltyStatus?.progress?.progressPct || 0);
    const nextTierLabel = loyaltyStatus?.nextTierProfile?.label || loyaltyStatus?.progress?.nextTier || '';

    return (
        <div className="min-h-screen bg-secondary">
            <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 md:py-12">
                <div className="flex flex-col gap-6">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <h1 className="text-2xl md:text-3xl font-serif text-primary">Checkout</h1>
                                <p className="text-sm text-gray-500 mt-2">Review your order and confirm delivery details.</p>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-widest">
                                Secure checkout
                            </div>
                        </div>

                        <div className="mt-8">
                                <div className="flex items-center gap-3 text-sm text-gray-500">
                                    <Link to="/cart" className="font-semibold text-primary">Shopping Cart</Link>
                                <ChevronRight size={14} />
                                <span className="font-semibold text-primary">Contact Information</span>
                                <ChevronRight size={14} />
                                <span>Payment Method</span>
                                <ChevronRight size={14} />
                                <span>Confirmation</span>
                            </div>
                            <div className="mt-4 relative">
                                <div className="h-1 rounded-full bg-gray-100" />
                                <div className="absolute top-0 left-0 h-1 rounded-full bg-primary w-1/2" />
                                <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                                    <span className="text-primary font-semibold">Cart</span>
                                    <span className="text-primary font-semibold">Checkout</span>
                                    <span>Payment</span>
                                    <span>Done</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className={`rounded-2xl p-5 bg-gradient-to-r ${tierTheme.card} shadow-lg`}>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className={`text-xs uppercase tracking-[0.24em] font-semibold ${tierTheme.caption}`}>Membership</p>
                                <p className={`text-xl font-semibold mt-1 ${tierTheme.title}`}>{loyaltyStatus?.profile?.label || tier} Tier</p>
                                <p className={`text-sm mt-2 ${tierTheme.body}`}>
                                    {loyaltyStatus?.progress?.message || 'Keep shopping to unlock higher tier benefits.'}
                                </p>
                            </div>
                            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${tierTheme.tag}`}>
                                <Sparkles size={14} /> Extra member pricing
                            </span>
                        </div>
                        <div className="mt-4">
                            <div className={`h-2 rounded-full overflow-hidden ${tierTheme.track}`}>
                                <div className={`h-full rounded-full ${tierTheme.fill}`} style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }} />
                            </div>
                            <div className={`mt-2 flex items-center justify-between text-xs ${tierTheme.caption}`}>
                                <span>{progressPct}% to next tier</span>
                                <span>{nextTierLabel ? `Next: ${nextTierLabel}` : 'Highest tier reached'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6">
                        {lineItems.length === 0 ? (
                            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-8 md:p-10">
                                <div className="flex flex-col items-center text-center">
                                    <img src={cartIllustration} alt="Empty cart" className="w-48 md:w-56" />
                                    <h2 className="mt-5 text-xl md:text-2xl font-semibold text-gray-800">Your checkout is empty</h2>
                                    <p className="mt-2 text-sm text-gray-500 max-w-md">
                                        It looks like there are no items in your cart right now. Explore products and add your favourites to continue.
                                    </p>
                                    <Link
                                        to="/shop"
                                        className="mt-6 inline-flex items-center justify-center px-6 py-3 rounded-xl bg-primary text-accent font-semibold hover:bg-primary-light"
                                    >
                                        Explore Products
                                    </Link>
                                </div>
                            </div>
                        ) : (
                        <>
                        <div className="space-y-6">
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <h2 className="text-lg font-semibold text-gray-800">Contact & Delivery</h2>
                                        <p className="text-sm text-gray-500">Update your billing and shipping addresses.</p>
                                    </div>
                                    {!editing ? (
                                        <button onClick={() => setEditing(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                                            <Edit3 size={16} /> Edit
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50">
                                                Cancel
                                            </button>
                                            <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 rounded-xl bg-primary text-accent text-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary-light disabled:opacity-60">
                                                {isSaving ? 'Saving...' : 'Save'}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                                    <div className="space-y-2">
                                        <label className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Name</label>
                                        <div className="relative">
                                            <input
                                                name="name"
                                                value={form.name}
                                                onChange={handleFieldChange}
                                                disabled={!editing}
                                                className="input-field pl-10 disabled:bg-gray-50"
                                            />
                                            <CheckCircle2 size={16} className="absolute left-3 top-3.5 text-gray-400" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Email</label>
                                        <div className="relative">
                                            <input
                                                name="email"
                                                value={form.email}
                                                onChange={handleFieldChange}
                                                disabled={!editing}
                                                className="input-field pl-10 disabled:bg-gray-50"
                                            />
                                            <Mail size={16} className="absolute left-3 top-3.5 text-gray-400" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Phone</label>
                                        <div className="relative">
                                            <input
                                                name="mobile"
                                                value={form.mobile}
                                                onChange={handleFieldChange}
                                                disabled={!editing}
                                                className="input-field pl-10 disabled:bg-gray-50"
                                            />
                                            <Phone size={16} className="absolute left-3 top-3.5 text-gray-400" />
                                        </div>
                                        {isMobileMissingOnProfile && !hasMobileForPayment && (
                                            <p className="text-[11px] text-amber-700">Mobile is required to place this order.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
                                    <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                                        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                            <CreditCard size={16} className="text-primary" /> Billing Address
                                        </h3>
                                        <div className="mt-4 space-y-3">
                                            <input
                                                value={form.billingAddress.line1}
                                                onChange={(e) => handleAddressChange('billingAddress', 'line1', e.target.value)}
                                                disabled={!editing}
                                                placeholder="Street Address"
                                                className="input-field disabled:bg-gray-50"
                                            />
                                            <div className="grid grid-cols-2 gap-3">
                                                <input
                                                    value={form.billingAddress.city}
                                                    onChange={(e) => handleAddressChange('billingAddress', 'city', e.target.value)}
                                                    disabled={!editing}
                                                    placeholder="City"
                                                    className="input-field disabled:bg-gray-50"
                                                />
                                                <input
                                                    value={form.billingAddress.state}
                                                    onChange={(e) => handleAddressChange('billingAddress', 'state', e.target.value)}
                                                    disabled={!editing}
                                                    placeholder="State"
                                                    className="input-field disabled:bg-gray-50"
                                                />
                                            </div>
                                            <input
                                                value={form.billingAddress.zip}
                                                onChange={(e) => handleAddressChange('billingAddress', 'zip', e.target.value)}
                                                disabled={!editing}
                                                placeholder="Zip"
                                                className="input-field disabled:bg-gray-50"
                                            />
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                                        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                            <Home size={16} className="text-primary" /> Shipping Address
                                        </h3>
                                        <div className="mt-4 space-y-3">
                                            <input
                                                value={form.address.line1}
                                                onChange={(e) => handleAddressChange('address', 'line1', e.target.value)}
                                                disabled={!editing}
                                                placeholder="Street Address"
                                                className="input-field disabled:bg-gray-50"
                                            />
                                            <div className="grid grid-cols-2 gap-3">
                                                <input
                                                    value={form.address.city}
                                                    onChange={(e) => handleAddressChange('address', 'city', e.target.value)}
                                                    disabled={!editing}
                                                    placeholder="City"
                                                    className="input-field disabled:bg-gray-50"
                                                />
                                                <input
                                                    value={form.address.state}
                                                    onChange={(e) => handleAddressChange('address', 'state', e.target.value)}
                                                    disabled={!editing}
                                                    placeholder="State"
                                                    className="input-field disabled:bg-gray-50"
                                                />
                                            </div>
                                            <input
                                                value={form.address.zip}
                                                onChange={(e) => handleAddressChange('address', 'zip', e.target.value)}
                                                disabled={!editing}
                                                placeholder="Zip"
                                                className="input-field disabled:bg-gray-50"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <h2 className="text-lg font-semibold text-gray-800">Coupon</h2>
                                        <p className="text-sm text-gray-500">Apply discounts or promotional codes.</p>
                                    </div>
                                    <Ticket className="text-primary" size={20} />
                                </div>
                                <div className="mt-4 flex flex-col md:flex-row gap-3">
                                    <input
                                        value={coupon}
                                        onChange={(e) => setCoupon(e.target.value)}
                                        placeholder="Enter coupon code"
                                        className="input-field flex-1"
                                    />
                                    {appliedCoupon ? (
                                        <button onClick={handleRemoveCoupon} className="px-6 py-3 rounded-xl border border-gray-200 font-semibold text-gray-500 hover:bg-gray-50">
                                            Remove
                                        </button>
                                    ) : (
                                        <button onClick={handleApplyCoupon} disabled={isApplyingCoupon} className="px-6 py-3 rounded-xl bg-primary text-accent font-semibold shadow-lg shadow-primary/20 hover:bg-primary-light disabled:opacity-60">
                                            {isApplyingCoupon ? 'Applying...' : 'Apply'}
                                        </button>
                                    )}
                                </div>
                                {appliedCoupon && (
                                    <p className="text-xs text-emerald-600 mt-3">Coupon {appliedCoupon.code} applied. Discount: ₹{Number(appliedCoupon.discountTotal || 0).toLocaleString()}.</p>
                                )}
                                {availableCoupons.length > 0 && (
                                    <div className="mt-4">
                                        <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-semibold">Available Coupons</p>
                                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {availableCoupons.map((entry) => (
                                                <button
                                                    key={entry.id || entry.code}
                                                    type="button"
                                                    onClick={() => handleApplyAvailableCoupon(entry.code)}
                                                    className={`relative text-left rounded-xl transition-all ${appliedCoupon?.code === entry.code ? 'ring-2 ring-emerald-100' : ''}`}
                                                >
                                                    <div className={`rounded-xl border overflow-hidden grid grid-cols-[1fr_156px] h-[104px] ${appliedCoupon?.code === entry.code ? 'border-emerald-300' : 'border-gray-200 hover:border-primary/30'}`}>
                                                        <div className="bg-primary px-4 py-3 flex flex-col justify-center">
                                                            <p className="text-[10px] uppercase tracking-wider text-slate-300">Voucher Code</p>
                                                            <p className="text-sm font-bold mt-1 text-white leading-5 break-all min-h-[2.5rem] max-h-[2.5rem] line-clamp-2">{entry.code}</p>
                                                        </div>
                                                        <div className="bg-accent px-4 py-3 text-primary border-l border-dashed border-primary/30 flex flex-col justify-center">
                                                            <p className="text-[15px] font-extrabold tracking-wide">
                                                                {entry.discountType === 'fixed'
                                                                    ? `₹${Number(entry.discountValue || 0).toLocaleString('en-IN')} OFF`
                                                                    : `${Number(entry.discountValue || 0)}% OFF`}
                                                            </p>
                                                            <p className="text-[11px] mt-1 text-primary/80 font-medium">
                                                                {entry.expiresAt ? `Expires ${formatLongDate(entry.expiresAt)}` : 'No expiry'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <span style={{ left: 'calc(100% - 156px)' }} className="absolute -top-[5px] h-[10px] w-[10px] -translate-x-1/2 rounded-full bg-white border border-gray-200 z-10" />
                                                    <span style={{ left: 'calc(100% - 156px)' }} className="absolute -bottom-[5px] h-[10px] w-[10px] -translate-x-1/2 rounded-full bg-white border border-gray-200 z-10" />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-semibold text-gray-800">Order Summary</h2>
                                    <span className="text-sm text-gray-500">{itemCount} items</span>
                                </div>
                                {lineItems.length === 0 && (
                                    <div className="py-10 text-center text-gray-400">
                                        Your cart is empty. <Link to="/shop" className="text-primary font-semibold">Shop now</Link>
                                    </div>
                                )}
                                {lineItems.length > 0 && (
                                    <div className="mt-5 space-y-4">
                                        {lineItems.map(item => {
                                            const price = Number(item.price || 0);
                                            const mrp = Number(item.compareAt || 0);
                                            const hasDiscount = mrp > price;
                                            const discountPct = hasDiscount ? Math.round(((mrp - price) / mrp) * 100) : 0;
                                            return (
                                                <div key={item.key} className={`flex gap-4 items-center ${item.isOutOfStock ? 'grayscale opacity-80' : ''}`}>
                                                    <div className="w-16 h-16 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden">
                                                        {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold text-gray-800 line-clamp-1">{item.title}</p>
                                                        {item.variantTitle && <p className="text-xs text-gray-500 line-clamp-1">{item.variantTitle}</p>}
                                                        {item.isOutOfStock && (
                                                            <span className="inline-flex mt-1 text-[10px] px-2 py-0.5 rounded-full bg-black text-white uppercase tracking-wide">
                                                                Out of Stock
                                                            </span>
                                                        )}
                                                        <p className="text-xs text-gray-400 mt-1">
                                                            ₹{price.toLocaleString()} x {item.quantity}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                                            <p className="text-sm font-semibold text-gray-800">₹{price.toLocaleString()}</p>
                                                            {hasDiscount && (
                                                                <>
                                                                    <p className="text-[11px] text-gray-400 line-through">₹{mrp.toLocaleString()}</p>
                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 font-semibold">
                                                                        {discountPct}% OFF
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-gray-400 mt-1">₹{item.lineTotal.toLocaleString()}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                <div className="border-t border-gray-100 mt-6 pt-4 space-y-2 text-sm">
                                    {isSummaryLoading && (
                                        <div className="text-[11px] text-gray-500 flex items-center gap-1">
                                            <TrendingUp size={12} /> Refreshing member pricing...
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between text-gray-500">
                                        <span>Subtotal</span>
                                        <span className="font-semibold text-gray-800">₹{subtotal.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-gray-500">
                                        <span>Shipping</span>
                                        <span className="font-semibold text-gray-800">₹{Number(shippingFee || 0).toLocaleString()}</span>
                                    </div>
                                    {couponDiscount > 0 && (
                                        <div className="flex items-center justify-between text-emerald-700">
                                            <span>Coupon ({appliedCoupon?.code || 'Applied'})</span>
                                            <span className="font-semibold">- ₹{Number(couponDiscount || 0).toLocaleString()}</span>
                                        </div>
                                    )}
                                    {loyaltyDiscount > 0 && (
                                        <div className="flex items-center justify-between text-blue-700">
                                            <span>Member Discount ({loyaltyStatus?.profile?.label || tier})</span>
                                            <span className="font-semibold">- ₹{Number(loyaltyDiscount || 0).toLocaleString()}</span>
                                        </div>
                                    )}
                                    {loyaltyShippingDiscount > 0 && (
                                        <div className="flex items-center justify-between text-blue-700">
                                            <span>Member Shipping Benefit</span>
                                            <span className="font-semibold">- ₹{Number(loyaltyShippingDiscount || 0).toLocaleString()}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between text-gray-500">
                                        <span>Taxes</span>
                                        <span className="font-semibold text-gray-800">Included</span>
                                    </div>
                                    {totalSavings > 0 && (
                                        <div className="flex items-center justify-between text-emerald-700">
                                            <span>Total Savings</span>
                                            <span className="font-semibold">₹{Number(totalSavings || 0).toLocaleString()}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between text-gray-800 text-base font-semibold pt-3">
                                        <span>Total</span>
                                        <span>₹{grandTotal.toLocaleString()}</span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handlePayNow}
                                    disabled={isPlacingOrder || !isReadyForPayment}
                                    className="mt-6 w-full inline-flex items-center justify-center gap-2 bg-primary text-accent font-bold py-3 rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-light transition-all disabled:opacity-60"
                                >
                                    <CreditCard size={18} /> {isPlacingOrder ? 'Processing...' : 'Pay Now'}
                                </button>
                                {isMobileMissingOnProfile && !hasMobileForPayment && (
                                    <p className="text-[11px] text-amber-700 text-center mt-2">
                                        Mobile number is required to continue payment.
                                    </p>
                                )}
                                {!isAddressReadyForPayment && (
                                    <p className="text-[11px] text-amber-700 text-center mt-2">
                                        Complete shipping and billing address to continue payment.
                                    </p>
                                )}
                                {hasUnavailableItems && (
                                    <p className="text-[11px] text-red-700 text-center mt-2">
                                        Some cart items are inactive or out of stock. Remove them to continue.
                                    </p>
                                )}
                                <p className="text-[11px] text-gray-400 text-center mt-2">
                                    Payment powered by Razorpay.
                                </p>
                                <div className="mt-3 flex items-center justify-center gap-3 text-[11px] text-gray-500">
                                    <Link to="/shipping" className="text-primary font-semibold">Shipping Policy</Link>
                                    <span className="text-gray-300">•</span>
                                    <Link to="/refund" className="text-primary font-semibold">Refund Policy</Link>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <h2 className="text-lg font-semibold text-gray-800">Payment & Trust</h2>
                                <p className="text-sm text-gray-500 mt-1">Secure checkout, trusted by thousands of shoppers.</p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {['SSL Secure', 'Trusted Seller', 'Verified Payments', 'Easy Returns'].map((label) => (
                                        <span key={label} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                            {label}
                                        </span>
                                    ))}
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-500">
                                    {[
                                        { name: 'Visa', logo: '/payment-logos/visa.svg' },
                                        { name: 'Mastercard', logo: '/payment-logos/mastercard.svg' },
                                        { name: 'Amex', logo: '/payment-logos/amex.svg' },
                                        { name: 'RuPay', logo: '/payment-logos/rupay.svg' },
                                        { name: 'UPI', logo: '/payment-logos/upi.svg' },
                                        { name: 'EMI', logo: '/payment-logos/emi.svg' },
                                        { name: 'NetBanking', logo: '/payment-logos/netbanking.svg' },
                                        { name: 'Wallets', logo: '/payment-logos/wallets.svg' }
                                    ].map((method) => (
                                        <div key={method.name} className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50">
                                            <img
                                                src={method.logo}
                                                alt={method.name}
                                                className={`${method.name === 'Amex' ? 'h-7 w-[118px]' : 'h-6 w-full max-w-[72px]'} object-contain`}
                                                loading="lazy"
                                                onError={(e) => {
                                                    e.currentTarget.style.display = 'none';
                                                    const fallback = e.currentTarget.nextElementSibling;
                                                    if (fallback) fallback.classList.remove('hidden');
                                                }}
                                            />
                                            <span className="hidden text-xs font-bold tracking-widest text-gray-700">{method.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        </>
                        )}
                    </div>
                </div>
            </div>

            {orderResult && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-6 animate-fade-in border border-gray-100">
                        <img src={logo} alt="SSC Jewellery" className="h-10 w-auto mb-3" />
                        <h3 className="text-xl font-serif text-primary">Order Confirmed</h3>
                        <p className="text-sm text-gray-500 mt-2">
                            Thank you for shopping with us. Your order is confirmed and will be processed shortly.
                        </p>
                        <div className="mt-4 rounded-xl border border-gray-200 p-4 bg-gray-50">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-500">Order Ref</span>
                                <span className="font-semibold text-gray-800">{orderResult.orderRef || orderResult.order_ref}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm mt-2">
                                <span className="text-gray-500">Subtotal</span>
                                <span className="font-semibold text-gray-800">₹{Number(orderResult.subtotal || orderResult.sub_total || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm mt-2">
                                <span className="text-gray-500">Shipping</span>
                                <span className="font-semibold text-gray-800">₹{Number(orderResult.shippingFee || orderResult.shipping_fee || 0).toLocaleString()}</span>
                            </div>
                            {Number(orderResult.discountTotal || orderResult.discount_total || 0) > 0 && (
                                <div className="flex items-center justify-between text-sm mt-2">
                                    <span className="text-gray-500">Discount{orderResult.couponCode || orderResult.coupon_code ? ` (${orderResult.couponCode || orderResult.coupon_code})` : ''}</span>
                                    <span className="font-semibold text-emerald-700">-₹{Number(orderResult.discountTotal || orderResult.discount_total || 0).toLocaleString()}</span>
                                </div>
                            )}
                            {Number(orderResult.loyalty_discount_total || orderResult.loyaltyDiscountTotal || 0) > 0 && (
                                <div className="flex items-center justify-between text-sm mt-2">
                                    <span className="text-gray-500">Member Discount ({String(orderResult.loyalty_tier || orderResult.loyaltyTier || 'regular').toLowerCase() === 'regular' ? 'BASIC' : String(orderResult.loyalty_tier || orderResult.loyaltyTier || '').toUpperCase()})</span>
                                    <span className="font-semibold text-blue-700">-₹{Number(orderResult.loyalty_discount_total || orderResult.loyaltyDiscountTotal || 0).toLocaleString()}</span>
                                </div>
                            )}
                            {Number(orderResult.loyalty_shipping_discount_total || orderResult.loyaltyShippingDiscountTotal || 0) > 0 && (
                                <div className="flex items-center justify-between text-sm mt-2">
                                    <span className="text-gray-500">Member Shipping Discount</span>
                                    <span className="font-semibold text-blue-700">-₹{Number(orderResult.loyalty_shipping_discount_total || orderResult.loyaltyShippingDiscountTotal || 0).toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex items-center justify-between text-base font-semibold mt-3 text-gray-800">
                                <span>Total</span>
                                <span>₹{Number(orderResult.total || 0).toLocaleString()}</span>
                            </div>
                            {Array.isArray(orderResult.items) && orderResult.items.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-gray-200 space-y-2">
                                    {orderResult.items.slice(0, 3).map((item, idx) => (
                                        <div key={item.id || `${item.product_id || 'item'}-${item.variant_id || ''}-${idx}`} className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="w-10 h-10 rounded-lg border border-gray-200 bg-white overflow-hidden shrink-0">
                                                    {getOrderResultItemImage(item) ? (
                                                        <img src={getOrderResultItemImage(item)} alt={item.title || 'Item'} className="w-full h-full object-cover" />
                                                    ) : null}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm text-gray-700 truncate">{item.title}</p>
                                                    <p className="text-xs text-gray-500">Qty: {Number(item.quantity || 0)}</p>
                                                </div>
                                            </div>
                                            <p className="text-sm font-semibold text-gray-800">₹{Number(item.line_total || item.lineTotal || 0).toLocaleString()}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <p className="text-sm text-gray-600 mt-3">Your items will be shipped in 2-3 working days.</p>
                        <div className="mt-4 text-xs text-gray-500 space-y-1">
                            <p>By placing this order you agree to our policies:</p>
                            <div className="flex gap-3 flex-wrap">
                                <Link to="/shipping" className="text-primary font-semibold">Shipping Policy</Link>
                                <Link to="/refund" className="text-primary font-semibold">Refund Policy</Link>
                            </div>
                        </div>
                        <div className="mt-5 flex items-center justify-end gap-2">
                            <Link to="/" className="px-4 py-2 rounded-lg bg-primary text-accent font-semibold">
                                Home
                            </Link>
                            <Link to="/shop" className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50">
                                Explore
                            </Link>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-4">View your order in the Orders page.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
