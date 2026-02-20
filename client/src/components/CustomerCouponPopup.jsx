import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { orderService } from '../services/orderService';
import { burstConfetti, playCue } from '../utils/celebration';
import couponImageFallback from '../assets/coupon.jpg';
import giftIllustration from '../assets/gift.svg';

const MEDIA_BASE_URL = import.meta.env.PROD
    ? ''
    : (typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.hostname}:5000`
        : 'http://localhost:5000');
const DEFAULT_POP_CUE = '/assets/pop.mp3';

const resolveMediaUrl = (value, fallback = '') => {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
    if (raw.startsWith('/uploads/')) return `${MEDIA_BASE_URL}${raw}`;
    return raw;
};

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
    const { user, loading } = useAuth();
    const [open, setOpen] = useState(false);
    const [popup, setPopup] = useState(null);
    const [dismissed, setDismissed] = useState(false);
    const [showGiftIntro, setShowGiftIntro] = useState(false);
    const [creattieLoaded, setCreattieLoaded] = useState(false);
    const isCustomer = !!user && String(user.role || '').toLowerCase() === 'customer';

    const storageKey = useMemo(() => {
        if (!popup?.key) return '';
        const owner = user?.id ? `user:${user.id}` : 'guest';
        return `customer-popup-dismissed:${owner}:${popup.key}`;
    }, [popup?.key, user?.id]);

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const scriptId = 'creattie-embed-script';
        const waitForCreattie = async () => {
            if (window.customElements?.get('creattie-embed')) {
                setCreattieLoaded(true);
                return;
            }
            try {
                await Promise.race([
                    window.customElements.whenDefined('creattie-embed'),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
                ]);
                setCreattieLoaded(true);
            } catch {
                setCreattieLoaded(false);
            }
        };
        const existing = document.getElementById(scriptId);
        if (existing) {
            existing.addEventListener('load', waitForCreattie, { once: true });
            void waitForCreattie();
            return;
        }
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://creattie.com/js/embed.js?id=3efa1fcb5d85991e845a';
        script.defer = true;
        script.onload = () => { void waitForCreattie(); };
        script.onerror = () => setCreattieLoaded(false);
        document.body.appendChild(script);
    }, []);

    useEffect(() => {
        if (loading) return;
        if (user && !isCustomer) return;
        let active = true;
        setDismissed(false);
        const timer = setTimeout(async () => {
            try {
                const data = isCustomer
                    ? await orderService.getCustomerPopupData()
                    : await orderService.getPublicPopupData();
                const nextPopup = data?.popup || null;
                if (!active || !nextPopup) return;
                const owner = user?.id ? `user:${user.id}` : 'guest';
                const key = `customer-popup-dismissed:${owner}:${nextPopup.key || ''}`;
                if (nextPopup.key && localStorage.getItem(key) === '1') {
                    setDismissed(true);
                    return;
                }
                setPopup(nextPopup);
                setOpen(true);
                setShowGiftIntro(true);
            } catch {
                // ignore popup fetch errors
            }
        }, 5000);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [isCustomer, loading, user]);

    useEffect(() => {
        if (!open || !popup || showGiftIntro) return;
        if (typeof window !== 'undefined') window.__sscPopupAudioPlayedAt = 0;
        burstConfetti();
        const customSrc = resolveMediaUrl(popup.audioUrl, '');
        if (!customSrc) {
            playCue(DEFAULT_POP_CUE, { volume: 0.9 });
            return;
        }
        const probe = new Audio(customSrc);
        let settled = false;
        const useFallback = () => {
            if (settled) return;
            settled = true;
            playCue(DEFAULT_POP_CUE, { volume: 0.9 });
        };
        const useCustom = () => {
            if (settled) return;
            settled = true;
            playCue(customSrc, { volume: 0.9 });
        };
        probe.preload = 'metadata';
        probe.addEventListener('error', useFallback, { once: true });
        probe.addEventListener('canplaythrough', useCustom, { once: true });
        probe.load();
        const timer = setTimeout(useFallback, 1800);
        return () => clearTimeout(timer);
    }, [open, popup, showGiftIntro]);

    const handleDontShowAgain = () => {
        if (storageKey) {
            localStorage.setItem(storageKey, '1');
        }
        setOpen(false);
        setShowGiftIntro(false);
    };

    if (!open || !popup) return null;
    if (dismissed) return null;
    const coupon = popup.coupon || null;

    return createPortal(
        <div className="fixed inset-0 z-[240]">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <div className="relative z-10 min-h-full overflow-y-auto flex items-start sm:items-center justify-center p-4">
                {showGiftIntro ? (
                    <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl text-center my-auto">
                        <p className="text-lg md:text-xl font-serif text-primary font-bold">Exclusive Gift for you</p>
                        <p className="text-sm text-gray-500 mt-2">Tap to reveal your offer</p>
                        <button
                            type="button"
                            onClick={() => setShowGiftIntro(false)}
                            className="group relative mt-6 inline-flex items-center justify-center"
                            aria-label="Reveal gift"
                        >
                            <span className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/45 blur-2xl" />
                            <span className="relative inline-flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-yellow-500 shadow-xl ring-4 ring-white/70 transition-transform duration-300 group-hover:scale-105 group-active:scale-95 overflow-hidden">
                                {creattieLoaded ? (
                                    <div
                                        dangerouslySetInnerHTML={{
                                            __html: `
<creattie-embed
 src="https://d1jj76g3lut4fe.cloudfront.net/saved_colors/103226/ZO9A2pG06lNpSud4.json"
 delay="1"
 speed="100"
 frame_rate="24"
 trigger="loop"
 style="width:96px;height:96px;background-color:transparent;">
</creattie-embed>`
                                        }}
                                    />
                                ) : (
                                    <img src={giftIllustration} alt="" className="h-11 w-11" />
                                )}
                            </span>
                        </button>
                    </div>
                ) : (
                <div className="w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto bg-white rounded-2xl border border-gray-200 shadow-2xl my-auto">
                    <div className="relative h-44 bg-gray-100">
                        <img src={resolveMediaUrl(popup.imageUrl, couponImageFallback)} alt="Offer" className="w-full h-full object-cover" />
                        <button type="button" onClick={() => setOpen(false)} className="absolute top-3 right-3 p-2 rounded-full bg-white/90 text-gray-600 hover:bg-white">
                            <X size={16} />
                        </button>
                    </div>
                    <div className="p-5">
                        <div className="flex flex-col md:flex-row gap-5 md:items-start">
                            <div className="flex-1 space-y-3 text-center md:text-left">
                                <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-semibold">Special Offer</p>
                                <h3 className="text-2xl font-serif text-primary font-bold">{popup.title || 'Exclusive Offer'}</h3>
                                {!!popup.summary && <p className="text-sm text-gray-700">{popup.summary}</p>}
                                {!!popup.content && <p className="text-sm text-gray-600">{popup.content}</p>}
                                {!!popup.encouragement && <p className="text-sm text-emerald-700 font-medium">{popup.encouragement}</p>}
                            </div>
                            <div className="order-last md:order-none md:w-44 md:shrink-0 flex justify-center md:justify-end">
                                <img src={giftIllustration} alt="Gift offer" className="w-28 md:w-40 h-auto opacity-90" />
                            </div>
                        </div>
                        {coupon && (
                            <div className="mt-4 flex justify-center">
                                <div className="relative inline-grid max-w-full rounded-xl border overflow-hidden grid-cols-[auto_148px]">
                                    <div className="bg-primary px-5 py-4 flex flex-col justify-center">
                                        <p className="text-[10px] uppercase tracking-wider text-slate-300">Voucher Code</p>
                                        <p className="mt-1">
                                            <span className="inline-flex w-fit max-w-full rounded-md bg-white/10 px-2 py-1 text-sm font-bold leading-5 text-white break-all">
                                                {coupon.code}
                                            </span>
                                        </p>
                                    </div>
                                    <div className="bg-accent px-5 py-4 text-primary border-l border-dashed border-primary/30 flex flex-col justify-center">
                                        <p className="text-[15px] font-extrabold tracking-wide">
                                            {formatCouponOffer(coupon)}
                                        </p>
                                        <p className="text-[11px] mt-1 text-primary/80 font-medium">
                                            {coupon.expiresAt ? `Expires ${formatLongDate(coupon.expiresAt)}` : 'No expiry'}
                                        </p>
                                    </div>
                                    <span style={{ left: 'calc(100% - 148px)' }} className="absolute -top-[5px] h-[10px] w-[10px] -translate-x-1/2 rounded-full bg-white border border-gray-200 z-10" />
                                    <span style={{ left: 'calc(100% - 148px)' }} className="absolute -bottom-[5px] h-[10px] w-[10px] -translate-x-1/2 rounded-full bg-white border border-gray-200 z-10" />
                                </div>
                            </div>
                        )}

                        <div className="pt-4 flex items-center justify-between gap-3">
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
                )}
            </div>
        </div>,
        document.body
    );
}
