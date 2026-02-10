import { useEffect, useMemo, useState } from 'react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { X, Minus, Plus, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useShipping } from '../context/ShippingContext';

export default function CartDrawer() {
    const { isOpen, closeCart, items, itemCount, subtotal, updateQuantity, removeItem, isSyncing } = useCart();
    const { user } = useAuth();
    const { zones } = useShipping();
    const [render, setRender] = useState(false);
    const [closing, setClosing] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setRender(true);
            setClosing(false);
            return;
        }
        if (render) {
            setClosing(true);
            const t = setTimeout(() => {
                setRender(false);
                setClosing(false);
            }, 220);
            return () => clearTimeout(t);
        }
    }, [isOpen, render]);

    const totalWeightKg = useMemo(() => items.reduce((sum, item) => {
        const weight = Number(item.weightKg || 0);
        return sum + weight * Number(item.quantity || 0);
    }, 0), [items]);

    const shippingPreview = useMemo(() => {
        if (!zones || zones.length === 0) return { fee: null, freeThreshold: null };
        const state = (user?.address?.state || '').trim().toLowerCase();
        if (!state) return { fee: null, freeThreshold: null };
        const zone = zones.find(z => Array.isArray(z.states) && z.states.some(s => String(s).trim().toLowerCase() === state));
        if (!zone || !Array.isArray(zone.options)) return { fee: null, freeThreshold: null };
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

    const freeProgress = useMemo(() => {
        if (!shippingPreview.freeThreshold) return null;
        const pct = Math.min(100, (subtotal / shippingPreview.freeThreshold) * 100);
        const remaining = Math.max(0, shippingPreview.freeThreshold - subtotal);
        return { pct, remaining };
    }, [shippingPreview.freeThreshold, subtotal]);

    if (!render) return null;

    return (
        <div className="fixed inset-0 z-[80]">
            <div
                className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${closing ? 'opacity-0' : 'opacity-100'}`}
                onClick={closeCart}
            />
            <div 
                className={`absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col transition-transform duration-200 ${closing ? 'translate-x-full' : 'translate-x-0'}`}
            >
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ShoppingCart size={20} className="text-primary" />
                        <h3 className="font-bold text-gray-800">Your Cart</h3>
                        <span className="text-xs text-gray-400">({itemCount})</span>
                    </div>
                    <button onClick={closeCart} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {isSyncing && items.length === 0 && (
                        <div className="text-xs text-gray-400">Syncing your cart...</div>
                    )}
                    {items.length === 0 && !isSyncing && (
                        <div className="text-center text-gray-400 text-sm py-12">
                            Your cart is empty.
                        </div>
                    )}
                    {items.map(item => (
                        <div key={item.key} className="flex gap-3 items-center">
                            <div className="w-16 h-16 rounded-lg bg-gray-100 overflow-hidden border border-gray-200">
                                {item.imageUrl ? (
                                    <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                                ) : null}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-800 line-clamp-1">{item.title}</p>
                                {item.variantTitle && (
                                    <p className="text-xs text-gray-500 line-clamp-1">{item.variantTitle}</p>
                                )}
                                <p className="text-sm font-bold text-primary mt-1">₹{Number(item.price || 0).toLocaleString()}</p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => updateQuantity({ productId: item.productId, variantId: item.variantId, quantity: item.quantity - 1 })}
                                        className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50"
                                    >
                                        <Minus size={14} />
                                    </button>
                                    <span className="text-sm font-bold w-6 text-center">{item.quantity}</span>
                                    <button
                                        onClick={() => updateQuantity({ productId: item.productId, variantId: item.variantId, quantity: item.quantity + 1 })}
                                        className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                                <button
                                    onClick={() => removeItem({ productId: item.productId, variantId: item.variantId })}
                                    className="text-xs text-gray-400 hover:text-red-500"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-5 border-t border-gray-100">
                    <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
                        <span>Subtotal</span>
                        <span className="font-bold text-gray-800">₹{subtotal.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
                        <span>Shipping</span>
                        <span className="font-bold text-gray-800">
                            {shippingPreview.fee == null ? 'Add address' : `₹${Number(shippingPreview.fee || 0).toLocaleString()}`}
                        </span>
                    </div>
                    {freeProgress && (
                        <div className="mb-4">
                            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                                <span>Free shipping progress</span>
                                <span>₹{Math.max(0, freeProgress.remaining).toLocaleString()} to go</span>
                            </div>
                            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                                <div className="h-full bg-emerald-500" style={{ width: `${freeProgress.pct}%` }} />
                            </div>
                        </div>
                    )}
                    <Link
                        to={user ? '/checkout' : '/login?redirect=%2Fcheckout'}
                        className="w-full inline-flex items-center justify-center bg-primary text-accent font-bold py-3 rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-light transition-all"
                        onClick={closeCart}
                    >
                        Proceed to Checkout
                    </Link>
                    <p className="text-[10px] text-gray-400 text-center mt-2">
                        Checkout requires login. We will prompt you later.
                    </p>
                </div>
            </div>
        </div>
    );
}
