import { useState } from 'react';
import { Heart, ShoppingCart, Eye } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function ProductCard({ product }) {
    const [isHovered, setIsHovered] = useState(false);
    const { user } = useAuth();
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

    return (
        <div className="group relative bg-white rounded-2xl border border-gray-100 hover:shadow-xl hover:border-accent/30 transition-all duration-300 transform hover:-translate-y-1 cursor-pointer transform-gpu isolate"            
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => console.log("Navigate to product", product.id)}
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
                <div className={`absolute inset-x-0 bottom-0 p-4 transition-all duration-300 ${isHovered ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}>
                    <button className="w-full bg-white text-gray-900 font-bold py-2 rounded-lg shadow-lg hover:bg-primary hover:text-white transition-colors flex items-center justify-center gap-2">
                        <ShoppingCart size={18} /> Quick Add
                    </button>
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
            </div>
        </div>
    );
}