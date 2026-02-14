import { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, ShoppingCart, Check, Minus, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';

export default function ProductCard({ product }) {
    const [isHovered, setIsHovered] = useState(false);
    const [quickAddAdded, setQuickAddAdded] = useState(false);
    const [isUpdatingQty, setIsUpdatingQty] = useState(false);
    const resetTimerRef = useRef(null);
    const { user } = useAuth();
    const { items, addItem, updateQuantity, openQuickAdd } = useCart();
    const navigate = useNavigate();

    // --- 1. Pricing Logic ---
    const getPriceDetails = () => {
        // Case A: Product has variants
        if (product.variants && product.variants.length > 0) {
            // Find the lowest price among all variants
            const prices = product.variants.map(v => {
                const p = parseFloat(v.price) || 0;
                const d = parseFloat(v.discount_price) || 0;
                return d > 0 ? d : p;
            });
            
            const minPrice = Math.min(...prices);
            
            return {
                displayPrice: minPrice,
                originalPrice: null, // We don't show crossed-out price for ranges usually
                label: 'From ' // Optional prefix
            };
        }

        // Case B: No variants (Standard Product)
        const mrp = parseFloat(product.mrp) || 0;
        const discountPrice = parseFloat(product.discount_price) || 0;

        if (discountPrice > 0 && discountPrice < mrp) {
            return {
                displayPrice: discountPrice,
                originalPrice: mrp,
                label: ''
            };
        }

        return {
            displayPrice: mrp,
            originalPrice: null,
            label: ''
        };
    };

    const { displayPrice, originalPrice, label } = getPriceDetails();

    // --- 2. Discount Calculation for Ribbon ---
    const calculateDiscountPercentage = () => {
        if (originalPrice && displayPrice < originalPrice) {
            return Math.round(((originalPrice - displayPrice) / originalPrice) * 100);
        }
        return 0;
    };

    const discountPercentage = calculateDiscountPercentage();
    const productCartItems = useMemo(() => (
        items.filter((item) => String(item.productId) === String(product.id))
    ), [items, product.id]);
    const productCartQty = useMemo(
        () => productCartItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        [productCartItems]
    );
    const inlineCartItem = useMemo(() => {
        if (!productCartItems.length) return null;
        if (!(product.variants && product.variants.length > 0)) {
            return productCartItems.find((item) => !item.variantId) || productCartItems[0];
        }
        if (productCartItems.length === 1) return productCartItems[0];
        return null;
    }, [product.variants, productCartItems]);
    const canAdjustInlineQty = Boolean(inlineCartItem);

    // --- 3. Image Logic (Based on your JSON 'media' array) ---
    const mainImage = product.media && product.media.length > 0 
        ? product.media[0].url 
        : '../assets/placeholder.jpg';

    const handleWishlist = (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        if (!user) {
            const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
            navigate(`/login?redirect=${currentPath}`);
            return;
        }
        console.log(`Add product ${product.id} to user ${user.id}'s wishlist`);
    };

    useEffect(() => {
        const handleAdded = (event) => {
            const addedProductId = String(event?.detail?.productId || '');
            if (!addedProductId || addedProductId !== String(product.id || '')) return;

            setQuickAddAdded(true);
            if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
            resetTimerRef.current = setTimeout(() => {
                setQuickAddAdded(false);
            }, 1200);
        };

        window.addEventListener('cart:item-added', handleAdded);
        return () => {
            window.removeEventListener('cart:item-added', handleAdded);
            if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        };
    }, [product.id]);

    const handleAddToCart = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (product.variants && product.variants.length > 0) {
            openQuickAdd(product);
            return;
        }
        await addItem({ product, quantity: 1 });
    };

    const handleIncrement = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isUpdatingQty) return;
        if (!canAdjustInlineQty) {
            openQuickAdd(product);
            return;
        }
        setIsUpdatingQty(true);
        try {
            await updateQuantity({
                productId: inlineCartItem.productId,
                variantId: inlineCartItem.variantId || '',
                quantity: Number(inlineCartItem.quantity || 0) + 1
            });
        } finally {
            setIsUpdatingQty(false);
        }
    };

    const handleDecrement = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isUpdatingQty || !canAdjustInlineQty) return;
        const nextQty = Number(inlineCartItem.quantity || 0) - 1;
        setIsUpdatingQty(true);
        try {
            await updateQuantity({
                productId: inlineCartItem.productId,
                variantId: inlineCartItem.variantId || '',
                quantity: nextQty
            });
        } finally {
            setIsUpdatingQty(false);
        }
    };

    const renderQuickAction = (isMobile = false) => {
        const wrapperClasses = isMobile
            ? 'mt-3 w-full'
            : `w-full transition-all duration-300 ${(quickAddAdded || isHovered || productCartQty > 0) ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`;
        const buttonClasses = isMobile
            ? 'w-full font-bold py-2 rounded-lg border transition-colors flex items-center justify-center gap-2'
            : 'w-full font-bold py-2 rounded-lg shadow-lg transition-colors flex items-center justify-center gap-2';

        return (
            <div className={wrapperClasses}>
                {productCartQty > 0 && canAdjustInlineQty ? (
                    <div className={`w-full rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 flex items-center justify-between px-2 ${isMobile ? 'py-1.5' : 'py-2'}`}>
                        <button
                            onClick={handleDecrement}
                            disabled={isUpdatingQty}
                            className="w-8 h-8 rounded-md border border-emerald-200 bg-white hover:bg-emerald-100 disabled:opacity-50 flex items-center justify-center"
                            aria-label="Decrease quantity"
                        >
                            <Minus size={16} />
                        </button>
                        <span className="text-sm font-bold min-w-10 text-center">{productCartQty}</span>
                        <button
                            onClick={handleIncrement}
                            disabled={isUpdatingQty}
                            className="w-8 h-8 rounded-md border border-emerald-200 bg-white hover:bg-emerald-100 disabled:opacity-50 flex items-center justify-center"
                            aria-label="Increase quantity"
                        >
                            <Plus size={16} />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={handleAddToCart}
                        className={`${buttonClasses} ${
                            quickAddAdded
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : 'bg-white border-gray-200 text-gray-900 hover:bg-primary hover:text-white hover:border-primary'
                        }`}
                    >
                        {quickAddAdded ? <Check size={isMobile ? 16 : 18} /> : <ShoppingCart size={isMobile ? 16 : 18} />}
                        {quickAddAdded ? 'Added' : 'Add to cart'}
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className="group relative bg-white rounded-2xl border border-gray-100 hover:shadow-xl hover:border-accent/30 transition-all duration-300 transform hover:-translate-y-1 cursor-pointer transform-gpu isolate"            
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => navigate(`/product/${product.id}`)}
        >
            {/* --- RIBBONS --- */}
            <div className="absolute top-0 left-0 z-20 flex flex-col items-start gap-1 rounded-tl-2xl overflow-hidden">
                {/* Priority 1: Calculated Discount */}
                {discountPercentage > 0 && (
                    <div className="bg-red-500 text-white text-[10px] md:text-xs font-bold px-3 py-1 rounded-br-lg shadow-sm">
                        {discountPercentage}% OFF
                    </div>
                )}
                
                {/* Priority 2: Explicit Ribbon Tag (New Arrival, etc.) */}
                {product.ribbon_tag && !discountPercentage && (
                    <div className="bg-accent text-primary text-[10px] md:text-xs font-bold px-3 py-1 rounded-br-lg shadow-sm">
                        {product.ribbon_tag}
                    </div>
                )}
            </div>

            {/* --- WISHLIST BUTTON --- */}
            <button 
                onClick={handleWishlist}
                className="absolute top-3 right-3 z-20 p-2 bg-white/80 backdrop-blur-sm rounded-full text-gray-400 hover:text-red-500 hover:bg-white transition-all shadow-sm active:scale-95"
            >
                <Heart size={20} className={product.is_wishlisted ? "fill-red-500 text-red-500" : ""} />
            </button>

            {/* --- IMAGE AREA --- */}
            <div className="relative aspect-[4/5] bg-gray-50 overflow-hidden rounded-t-2xl">
                <img 
                    src={mainImage} 
                    alt={product.title}
                    className={`w-full h-full object-cover transition-transform duration-700 ${isHovered ? 'scale-110' : 'scale-100'}`}
                    onError={(e) => e.target.src = '../assets/placeholder.jpg'}
                />
                
                {/* Quick Add Overlay */}
                <div className="hidden md:block absolute inset-x-0 bottom-0 p-4">
                    {renderQuickAction(false)}
                </div>
            </div>

            {/* --- INFO AREA --- */}
            <div className="p-4">
                {/* Categories */}
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1 font-medium">
                    {Array.isArray(product.categories) ? product.categories[0] : (product.categories || 'Collection')}
                </p>
                
                {/* Title */}
                <h3 className="font-bold text-gray-800 text-base line-clamp-2 min-h-[3rem] mb-1 group-hover:text-primary transition-colors">
                    {product.title}
                </h3>
                
                {/* Subtitle (Optional) */}
                {product.subtitle && (
                    <p className="text-xs text-gray-500 mb-2">{product.subtitle}</p>
                )}
                
                {/* Price Section */}
                <div className="flex items-center gap-2 mt-2">
                    <span className="text-lg font-bold text-primary">
                        {label}₹{displayPrice.toLocaleString()}
                    </span>
                    {originalPrice && (
                        <span className="text-sm text-gray-400 line-through decoration-red-400">
                            ₹{originalPrice.toLocaleString()}
                        </span>
                    )}
                </div>
                <div className="md:hidden">
                    {renderQuickAction(true)}
                </div>
            </div>
        </div>
    );
}
