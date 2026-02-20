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

export default function CustomerCouponPopup() {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [popup, setPopup] = useState(null);

    const storageKey = useMemo(() => {
        if (!user?.id || !popup?.key) return '';
        return `customer-popup-seen:${user.id}:${popup.key}`;
    }, [popup?.key, user?.id]);

    useEffect(() => {
        if (!user || String(user.role || '').toLowerCase() !== 'customer') return;
        let active = true;
        const timer = setTimeout(async () => {
            try {
                const data = await orderService.getCustomerPopupData();
                const nextPopup = data?.popup || null;
                if (!active || !nextPopup) return;
                const key = `customer-popup-seen:${user.id}:${nextPopup.key || ''}`;
                if (nextPopup.key && sessionStorage.getItem(key) === '1') return;
                setPopup(nextPopup);
                setOpen(true);
                burstConfetti();
                playCue(nextPopup.audioUrl || defaultPopCue, { volume: 0.9 });
                if (nextPopup.key) {
                    sessionStorage.setItem(key, '1');
                }
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
        if (!open || !storageKey) return;
        sessionStorage.setItem(storageKey, '1');
    }, [open, storageKey]);

    if (!open || !popup) return null;
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
                            <div className="rounded-xl border overflow-hidden grid grid-cols-[1fr_156px] h-[104px]">
                                <div className="bg-primary px-4 py-3 flex flex-col justify-center">
                                    <p className="text-[10px] uppercase tracking-wider text-slate-300">Voucher Code</p>
                                    <p className="text-sm font-bold mt-1 text-white leading-5 break-all min-h-[2.5rem] max-h-[2.5rem] line-clamp-2">{coupon.code}</p>
                                </div>
                                <div className="bg-accent px-4 py-3 text-primary border-l border-dashed border-primary/30 flex flex-col justify-center">
                                    <p className="text-[15px] font-extrabold tracking-wide">
                                        {coupon.discountType === 'fixed'
                                            ? `₹${Number(coupon.discountValue || 0).toLocaleString('en-IN')} OFF`
                                            : `${Number(coupon.discountValue || 0)}% OFF`}
                                    </p>
                                    <p className="text-[11px] mt-1 text-primary/80 font-medium">
                                        {coupon.expiresAt ? `Expires ${formatLongDate(coupon.expiresAt)}` : 'No expiry'}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="pt-1 flex justify-end">
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
