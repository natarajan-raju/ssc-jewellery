import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight, CreditCard, Edit3, Home, Mail, Phone, Ticket } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { authService } from '../services/authService';
import { orderService } from '../services/orderService';
import { useShipping } from '../context/ShippingContext';

const emptyAddress = { line1: '', city: '', state: '', zip: '' };

export default function Checkout() {
    const { user, loading, updateUser } = useAuth();
    const { items, subtotal, itemCount, clearCart } = useCart();
    const { zones } = useShipping();
    const toast = useToast();
    const navigate = useNavigate();

    const [editing, setEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [coupon, setCoupon] = useState('');
    const [couponApplied, setCouponApplied] = useState(false);
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [orderResult, setOrderResult] = useState(null);
    const [form, setForm] = useState({
        name: '',
        email: '',
        mobile: '',
        address: { ...emptyAddress },
        billingAddress: { ...emptyAddress }
    });

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
        setForm({
            name: user.name || '',
            email: user.email || '',
            mobile: user.mobile || '',
            address: { ...emptyAddress, ...(user.address || {}) },
            billingAddress: { ...emptyAddress, ...(user.billingAddress || user.address || {}) }
        });
    }, [user]);

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
        if (!coupon.trim()) return toast.error('Enter a coupon code');
        setCouponApplied(true);
        toast.success('Coupon applied (preview)');
    };

    const handleRemoveCoupon = () => {
        setCouponApplied(false);
        setCoupon('');
    };

    const lineItems = useMemo(() => items.map(item => ({
        ...item,
        lineTotal: Number(item.price || 0) * Number(item.quantity || 0),
        weightKg: Number(item.weightKg || 0)
    })), [items]);

    const totalWeightKg = useMemo(() => lineItems.reduce((sum, item) => {
        return sum + (Number(item.weightKg || 0) * Number(item.quantity || 0));
    }, 0), [lineItems]);

    const shippingFee = useMemo(() => {
        if (!zones || zones.length === 0) return 0;
        const state = (form.address?.state || '').trim().toLowerCase();
        if (!state) return 0;
        const zone = zones.find(z => Array.isArray(z.states) && z.states.some(s => String(s).trim().toLowerCase() === state));
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

    const grandTotal = useMemo(() => Number(subtotal || 0) + Number(shippingFee || 0), [subtotal, shippingFee]);

    const handlePayNow = async () => {
        if (lineItems.length === 0) return toast.error('Your cart is empty');
        if (isPlacingOrder) return;
        setIsPlacingOrder(true);
        try {
            const res = await orderService.checkout({
                billingAddress: form.billingAddress,
                shippingAddress: form.address
            });
            if (res?.order) {
                setOrderResult(res.order);
                await clearCart();
                toast.success('Order placed successfully');
                setTimeout(() => navigate('/'), 3500);
            } else {
                toast.error(res?.message || 'Failed to place order');
            }
        } catch (error) {
            toast.error(error?.message || 'Failed to place order');
        } finally {
            setIsPlacingOrder(false);
        }
    };

    if (!user) return null;

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

                    <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6">
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
                                    {couponApplied ? (
                                        <button onClick={handleRemoveCoupon} className="px-6 py-3 rounded-xl border border-gray-200 font-semibold text-gray-500 hover:bg-gray-50">
                                            Remove
                                        </button>
                                    ) : (
                                        <button onClick={handleApplyCoupon} className="px-6 py-3 rounded-xl bg-primary text-accent font-semibold shadow-lg shadow-primary/20 hover:bg-primary-light">
                                            Apply
                                        </button>
                                    )}
                                </div>
                                {couponApplied && (
                                    <p className="text-xs text-emerald-600 mt-3">Coupon applied. Discounts will reflect in the final step.</p>
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
                                                <div key={item.key} className="flex gap-4 items-center">
                                                    <div className="w-16 h-16 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden">
                                                        {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold text-gray-800 line-clamp-1">{item.title}</p>
                                                        {item.variantTitle && <p className="text-xs text-gray-500 line-clamp-1">{item.variantTitle}</p>}
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
                                    <div className="flex items-center justify-between text-gray-500">
                                        <span>Subtotal</span>
                                        <span className="font-semibold text-gray-800">₹{subtotal.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-gray-500">
                                        <span>Shipping</span>
                                        <span className="font-semibold text-gray-800">₹{Number(shippingFee || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-gray-500">
                                        <span>Taxes</span>
                                        <span className="font-semibold text-gray-800">Included</span>
                                    </div>
                                    <div className="flex items-center justify-between text-gray-800 text-base font-semibold pt-3">
                                        <span>Total</span>
                                        <span>₹{grandTotal.toLocaleString()}</span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handlePayNow}
                                    disabled={isPlacingOrder}
                                    className="mt-6 w-full inline-flex items-center justify-center gap-2 bg-primary text-accent font-bold py-3 rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-light transition-all disabled:opacity-60"
                                >
                                    <CreditCard size={18} /> {isPlacingOrder ? 'Processing...' : 'Pay Now'}
                                </button>
                                <p className="text-[11px] text-gray-400 text-center mt-2">
                                    Orders are confirmed instantly for now.
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
                                                className="h-6 w-auto object-contain"
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
                    </div>
                </div>
            </div>

            {orderResult && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-6 animate-fade-in border border-gray-100">
                        <h3 className="text-xl font-serif text-primary">Order Confirmed</h3>
                        <p className="text-sm text-gray-500 mt-2">
                            Thank you for shopping with us. Your order is confirmed and will be processed shortly.
                        </p>
                        <div className="mt-4 rounded-xl border border-gray-200 p-4 bg-gray-50">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-500">Order Ref</span>
                                <span className="font-semibold text-gray-800">{orderResult.orderRef}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm mt-2">
                                <span className="text-gray-500">Subtotal</span>
                                <span className="font-semibold text-gray-800">₹{Number(orderResult.subtotal || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm mt-2">
                                <span className="text-gray-500">Shipping</span>
                                <span className="font-semibold text-gray-800">₹{Number(orderResult.shippingFee || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between text-base font-semibold mt-3 text-gray-800">
                                <span>Total</span>
                                <span>₹{Number(orderResult.total || 0).toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="mt-4 text-xs text-gray-500 space-y-1">
                            <p>By placing this order you agree to our policies:</p>
                            <div className="flex gap-3 flex-wrap">
                                <Link to="/shipping" className="text-primary font-semibold">Shipping Policy</Link>
                                <Link to="/refund" className="text-primary font-semibold">Refund Policy</Link>
                            </div>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-4">Redirecting to home page...</p>
                    </div>
                </div>
            )}
        </div>
    );
}
