import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { orderService } from '../services/orderService';
import { burstConfetti, playCue } from '../utils/celebration';
import couponImageFallback from '../assets/coupon.jpg';
import defaultPopCue from '../assets/pop.mp3';

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

const formatCouponOffer = (coupon = {}) => {
    const type = String(coupon.discountType || '').toLowerCase();
    const value = Number(coupon.discountValue || 0);
    if (type === 'fixed') return `₹${value.toLocaleString('en-IN')} OFF`;
    if (type === 'shipping_full') return 'FREE SHIPPING';
    if (type === 'shipping_partial') return `${value}% SHIPPING OFF`;
    return `${value}% OFF`;
};

export default function CustomerCouponPopup() {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [popup, setPopup] = useState(null);
    const [dismissed, setDismissed] = useState(false);

    const storageKey = useMemo(() => {
        if (!user?.id || !popup?.key) return '';
        return `customer-popup-dismissed:${user.id}:${popup.key}`;
    }, [popup?.key, user?.id]);

    useEffect(() => {
        if (!user || String(user.role || '').toLowerCase() !== 'customer') return;
        let active = true;
        setDismissed(false);
        const timer = setTimeout(async () => {
            try {
                const data = await orderService.getCustomerPopupData();
                const nextPopup = data?.popup || null;
                if (!active || !nextPopup) return;
                const key = `customer-popup-dismissed:${user.id}:${nextPopup.key || ''}`;
                if (nextPopup.key && localStorage.getItem(key) === '1') {
                    setDismissed(true);
                    return;
                }
                setPopup(nextPopup);
                setOpen(true);
            } catch {
                // ignore popup fetch errors
            }
        }, 5000);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [user]);

    useEffect(() => {
        if (!open || !popup) return;
        burstConfetti();
        playCue(popup.audioUrl || defaultPopCue, { volume: 0.9 });
    }, [open, popup]);

    const handleDontShowAgain = () => {
        if (storageKey) {
            localStorage.setItem(storageKey, '1');
        }
        setOpen(false);
    };

    if (!open || !popup) return null;
    if (dismissed) return null;
    const coupon = popup.coupon || null;

    return createPortal(
        <div className="fixed inset-0 z-[240]">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <div className="relative z-10 min-h-full overflow-y-auto flex items-start sm:items-center justify-center p-4">
                <div className="w-full max-w-2xl bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden my-auto">
                    <div className="relative h-44 bg-gray-100">
                        <img src={popup.imageUrl || couponImageFallback} alt="Offer" className="w-full h-full object-cover" />
                        <button type="button" onClick={() => setOpen(false)} className="absolute top-3 right-3 p-2 rounded-full bg-white/90 text-gray-600 hover:bg-white">
                            <X size={16} />
                        </button>
                    </div>
                    <div className="p-5 space-y-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-semibold">Special Offer</p>
                        <h3 className="text-2xl font-serif text-primary font-bold">{popup.title || 'Exclusive Offer'}</h3>
                        {!!popup.summary && <p className="text-sm text-gray-700">{popup.summary}</p>}
                        {!!popup.content && <p className="text-sm text-gray-600">{popup.content}</p>}
                        {!!popup.encouragement && <p className="text-sm text-emerald-700 font-medium">{popup.encouragement}</p>}

                        {coupon && (
                            <div className="relative rounded-xl border overflow-hidden grid grid-cols-[1fr_156px] h-[104px]">
                                <div className="bg-primary px-4 py-3 flex flex-col justify-center">
                                    <p className="text-[10px] uppercase tracking-wider text-slate-300">Voucher Code</p>
                                    <p className="mt-1">
                                        <span className="inline-flex w-fit max-w-full rounded-md bg-white/10 px-2 py-1 text-sm font-bold leading-5 text-white break-all">
                                            {coupon.code}
                                        </span>
                                    </p>
                                </div>
                                <div className="bg-accent px-4 py-3 text-primary border-l border-dashed border-primary/30 flex flex-col justify-center">
                                    <p className="text-[15px] font-extrabold tracking-wide">
                                        {formatCouponOffer(coupon)}
                                    </p>
                                    <p className="text-[11px] mt-1 text-primary/80 font-medium">
                                        {coupon.expiresAt ? `Expires ${formatLongDate(coupon.expiresAt)}` : 'No expiry'}
                                    </p>
                                </div>
                                <span style={{ left: 'calc(100% - 156px)' }} className="absolute -top-[5px] h-[10px] w-[10px] -translate-x-1/2 rounded-full bg-white border border-gray-200 z-10" />
                                <span style={{ left: 'calc(100% - 156px)' }} className="absolute -bottom-[5px] h-[10px] w-[10px] -translate-x-1/2 rounded-full bg-white border border-gray-200 z-10" />
                            </div>
                        )}

                        <div className="pt-1 flex items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={handleDontShowAgain}
                                className="text-[11px] text-gray-400 hover:text-gray-600 underline"
                            >
                                Don&apos;t show me again
                            </button>
                            <Link
                                to={popup.buttonLink || '/shop'}
                                onClick={() => setOpen(false)}
                                className="inline-flex items-center px-5 py-2.5 rounded-lg bg-primary text-accent text-sm font-semibold hover:bg-primary-light"
                            >
                                {popup.buttonLabel || 'Shop Now'}
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
