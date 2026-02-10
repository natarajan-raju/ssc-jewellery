import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useShipping } from '../context/ShippingContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';

export default function CartPage() {
    const { items, itemCount, subtotal, updateQuantity, removeItem, isSyncing } = useCart();
    const { user } = useAuth();
    const { zones } = useShipping();
    const { socket } = useSocket();
    const toast = useToast();
    const navigate = useNavigate();

    useEffect(() => {
        if (user && (user.role === 'admin' || user.role === 'staff')) {
            navigate('/admin/dashboard', { replace: true });
        }
    }, [user, navigate]);

    useEffect(() => {
        if (!socket) return;

        const handleProductUpdate = () => {};
        const handleProductDelete = () => {};
        const handleCategoryChange = () => {
            toast.success('Collections updated.');
        };

        socket.on('product:update', handleProductUpdate);
        socket.on('product:delete', handleProductDelete);
        socket.on('refresh:categories', handleCategoryChange);
        socket.on('product:category_change', handleCategoryChange);

        return () => {
            socket.off('product:update', handleProductUpdate);
            socket.off('product:delete', handleProductDelete);
            socket.off('refresh:categories', handleCategoryChange);
            socket.off('product:category_change', handleCategoryChange);
        };
    }, [socket, toast]);

    const totalWeightKg = useMemo(() => items.reduce((sum, item) => {
        const weight = Number(item.weightKg || 0);
        return sum + weight * Number(item.quantity || 0);
    }, 0), [items]);

    const shippingPreview = useMemo(() => {
        if (!zones || zones.length === 0) return null;
        const state = (user?.address?.state || '').trim().toLowerCase();
        if (!state) return null;
        const zone = zones.find(z => Array.isArray(z.states) && z.states.some(s => String(s).trim().toLowerCase() === state));
        if (!zone || !Array.isArray(zone.options)) return null;
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
        const fee = eligible.length ? Number([...eligible].sort((a, b) => Number(a.rate || 0) - Number(b.rate || 0))[0].rate || 0) : 0;
        const freeOptions = zone.options.filter(opt => (opt.conditionType === 'price' || !opt.conditionType) && Number(opt.rate || 0) === 0 && opt.min != null);
        const freeThreshold = freeOptions.length ? Math.min(...freeOptions.map(opt => Number(opt.min))) : null;
        return { fee, freeThreshold };
    }, [zones, user?.address?.state, subtotal, totalWeightKg]);

    const cartTotal = useMemo(() => {
        if (!shippingPreview) return subtotal;
        return Number(subtotal || 0) + Number(shippingPreview.fee || 0);
    }, [subtotal, shippingPreview]);

    const freeProgress = useMemo(() => {
        if (!shippingPreview?.freeThreshold) return null;
        const pct = Math.min(100, (subtotal / shippingPreview.freeThreshold) * 100);
        const remaining = Math.max(0, shippingPreview.freeThreshold - subtotal);
        return { pct, remaining };
    }, [shippingPreview?.freeThreshold, subtotal]);

    return (
        <div className="min-h-screen bg-secondary">
            <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 md:py-12">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                                <ShoppingCart size={20} />
                            </div>
                            <div>
                                <h1 className="text-2xl md:text-3xl font-serif text-primary">Shopping Cart</h1>
                                <p className="text-sm text-gray-500 mt-1">{itemCount} items in your cart</p>
                            </div>
                        </div>
                        <Link
                            to={user ? '/checkout' : '/login?redirect=%2Fcheckout'}
                            className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-primary text-accent font-semibold shadow-lg shadow-primary/20 hover:bg-primary-light transition-all"
                        >
                            Proceed to Checkout
                        </Link>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_0.7fr] gap-6 mt-6">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        {isSyncing && items.length === 0 && (
                            <div className="text-sm text-gray-400">Syncing your cart...</div>
                        )}
                        {items.length === 0 && !isSyncing && (
                            <div className="text-center text-gray-400 py-16">
                                Your cart is empty. <Link to="/shop" className="text-primary font-semibold">Browse the collection</Link>
                            </div>
                        )}
                        <div className="space-y-6">
                            {items.map(item => (
                                <div key={item.key} className="flex flex-col md:flex-row md:items-center gap-4 border-b border-gray-100 pb-6">
                                    <div className="w-24 h-24 rounded-2xl bg-gray-100 border border-gray-200 overflow-hidden">
                                        {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-base font-semibold text-gray-800 line-clamp-1">{item.title}</p>
                                        {item.variantTitle && <p className="text-sm text-gray-500 line-clamp-1">{item.variantTitle}</p>}
                                        <p className="text-sm text-primary font-semibold mt-2">₹{Number(item.price || 0).toLocaleString()}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-2 py-1">
                                            <button
                                                onClick={() => updateQuantity({ productId: item.productId, variantId: item.variantId, quantity: item.quantity - 1 })}
                                                className="p-1 rounded-lg hover:bg-gray-50"
                                            >
                                                <Minus size={14} />
                                            </button>
                                            <span className="min-w-[24px] text-center font-semibold text-gray-700">{item.quantity}</span>
                                            <button
                                                onClick={() => updateQuantity({ productId: item.productId, variantId: item.variantId, quantity: item.quantity + 1 })}
                                                className="p-1 rounded-lg hover:bg-gray-50"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                        <div className="text-right min-w-[90px]">
                                            <p className="text-sm font-semibold text-gray-800">₹{(Number(item.price || 0) * item.quantity).toLocaleString()}</p>
                                            <button
                                                onClick={() => removeItem({ productId: item.productId, variantId: item.variantId })}
                                                className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-600 mt-2"
                                            >
                                                <Trash2 size={12} /> Remove
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h2 className="text-lg font-semibold text-gray-800">Order Summary</h2>
                            <div className="mt-4 space-y-2 text-sm text-gray-500">
                                <div className="flex items-center justify-between">
                                    <span>Subtotal</span>
                                    <span className="font-semibold text-gray-800">₹{subtotal.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Shipping</span>
                                    <span className="font-semibold text-gray-800">
                                        {shippingPreview == null ? 'Add address to preview' : `₹${Number(shippingPreview.fee || 0).toLocaleString()}`}
                                    </span>
                                </div>
                                {freeProgress && (
                                    <div>
                                        <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
                                            <span>Free shipping progress</span>
                                            <span>₹{Math.max(0, freeProgress.remaining).toLocaleString()} to go</span>
                                        </div>
                                        <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                                            <div className="h-full bg-emerald-500" style={{ width: `${freeProgress.pct}%` }} />
                                        </div>
                                    </div>
                                )}
                                <div className="flex items-center justify-between">
                                    <span>Taxes</span>
                                    <span className="font-semibold text-gray-800">Included</span>
                                </div>
                                <div className="border-t border-gray-100 pt-3 flex items-center justify-between text-base font-semibold text-gray-800">
                                    <span>Total</span>
                                    <span>₹{cartTotal.toLocaleString()}</span>
                                </div>
                            </div>
                            <Link
                                to={user ? '/checkout' : '/login?redirect=%2Fcheckout'}
                                className="mt-6 w-full inline-flex items-center justify-center bg-primary text-accent font-bold py-3 rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-light transition-all"
                            >
                                Continue to Checkout
                            </Link>
                            <p className="text-[11px] text-gray-400 text-center mt-2">
                                Checkout requires login. We’ll guide you to sign in if needed.
                            </p>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h3 className="text-sm font-semibold text-gray-800">Need help?</h3>
                            <p className="text-sm text-gray-500 mt-2">Chat with our team for sizing or delivery questions.</p>
                            <Link to="/contact" className="inline-flex items-center justify-center mt-4 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-primary hover:bg-primary/5">
                                Contact support
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
