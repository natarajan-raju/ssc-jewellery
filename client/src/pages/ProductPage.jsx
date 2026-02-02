import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
    Heart, ShoppingCart, Share2, ChevronDown, ChevronUp, 
    AlertTriangle, Check, ArrowRight, Home, ShieldCheck 
} from 'lucide-react';
import { productService } from '../services/productService';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ProductCard from '../components/ProductCard';
import placeholderImg from '../assets/placeholder.jpg'

export default function ProductPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { socket } = useSocket();
    const { user } = useAuth(); // Assuming cart logic might need user later
    const toast = useToast();

    // --- State ---
    const [product, setProduct] = useState(null);
    const [relatedProducts, setRelatedProducts] = useState([]);
    const [activeVariant, setActiveVariant] = useState(null);
    const [selectedImage, setSelectedImage] = useState(null);
    const [loading, setLoading] = useState(true);
    const [zoomStyle, setZoomStyle] = useState({ display: 'none' });
    const [activeAccordion, setActiveAccordion] = useState(null);

    // --- Refs ---
    const mainImageRef = useRef(null);

      // --- Safe Data Parsing ---
    
    // 1. Media List (Images) - Extract URLs from objects if necessary
    const mediaList = useMemo(() => {
        if (!product?.media) return [];
        try {
            const rawMedia = typeof product.media === 'string' ? JSON.parse(product.media) : product.media;
            
            if (Array.isArray(rawMedia)) {
                return rawMedia.map(item => {
                    // Handle case: { type: 'image', url: '/path/to/img' }
                    if (typeof item === 'object' && item !== null && item.url) {
                        return item.url;
                    }
                    // Handle case: "/path/to/img" (Legacy/Simple)
                    return item;
                }).filter(Boolean); // Remove nulls/undefined
            }
            return [];
        } catch (e) {
            console.error("Error parsing media:", e);
            return [];
        }
    }, [product]);

    // 2. Additional Info (Accordion)
    const parsedAdditionalInfo = useMemo(() => {
        if (!product?.additional_info) return [];
        try {
            return typeof product.additional_info === 'string' ? JSON.parse(product.additional_info) : product.additional_info;
        } catch (e) {
            return [];
        }
    }, [product]);

    // 3. Product Options
    const productOptions = useMemo(() => {
        if (!product?.options) return [];
        try {
            return typeof product.options === 'string' ? JSON.parse(product.options) : product.options;
        } catch (e) {
            return [];
        }
    }, [product]);

   // [FIX] Helper to handle image paths and fallbacks
    const getImgUrl = (path) => {
        // Ensure path is a valid string
        if (!path || typeof path !== 'string') return placeholderImg;
        
        try {
            // If it's a web URL, return as is
            if (path.startsWith('http')) return path;
            // If it's a local upload, ensure it starts with /
            if (!path.startsWith('/')) return `/${path}`;
        } catch (e) {
            return placeholderImg;
        }
        return path;
    };

    // --- 1. Initial Fetch ---
    useEffect(() => {
        const fetchAllData = async () => {
            setLoading(true);
            try {
                const data = await productService.getProduct(id);
                setProduct(data);

                // [FIX] Extract plain URLs from media (Handle Object vs String)
                let images = [];
                try {
                    const raw = typeof data.media === 'string' ? JSON.parse(data.media) : data.media;
                    if (Array.isArray(raw)) {
                        images = raw.map(m => (typeof m === 'object' && m?.url) ? m.url : m).filter(Boolean);
                    }
                } catch (e) { console.error("Media parse error", e); }
                
                // Initialize Variant (Newest first strategy)
                if (data.variants && data.variants.length > 0) {
                    setActiveVariant(data.variants[0]);
                    // Use variant image, otherwise fallback to first product image
                    setSelectedImage(data.variants[0].image_url || (images.length > 0 ? images[0] : null));
                } else {
                    // Standard Product Image
                    setSelectedImage(images.length > 0 ? images[0] : null);
                }

            } catch (err) {
                console.error(err);
                toast.error("Failed to load product");
                navigate('/store');
            } finally {
                setLoading(false);
            }
        };
        fetchAllData();
    }, [id, navigate]);

    // --- 2. Real-Time Sync ---
    useEffect(() => {
        if (!socket) return;
        const handleUpdate = (updatedProduct) => {
            if (updatedProduct.id === id) {
                toast.info("Product information updated");
                setProduct(prev => ({ ...prev, ...updatedProduct }));
            }
        };
        socket.on('product:update', handleUpdate);
        return () => socket.off('product:update', handleUpdate);
    }, [socket, id]);

    // --- 3. Handlers ---
    const handleVariantChange = (variant) => {
        setActiveVariant(variant);
        // If variant has an image, use it. Otherwise try first product image.
        if (variant.image_url) {
            setSelectedImage(variant.image_url);
        } else if (mediaList.length > 0) {
            setSelectedImage(mediaList[0]);
        } else {
            setSelectedImage(null); // Will trigger placeholder
        }
    };

    const handleMouseMove = (e) => {
        const { left, top, width, height } = e.target.getBoundingClientRect();
        const x = ((e.pageX - left) / width) * 100;
        const y = ((e.pageY - top) / height) * 100;
        setZoomStyle({
            display: 'block',
            backgroundPosition: `${x}% ${y}%`,
            backgroundImage: `url(${selectedImage})`
        });
    };

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: product.title,
                    text: product.subtitle,
                    url: window.location.href,
                });
            } catch (err) {
                console.error("Share failed", err);
            }
        } else {
            // Fallback: Copy to clipboard
            navigator.clipboard.writeText(window.location.href);
            toast.success("Link copied to clipboard!");
        }
    };

    // --- Render Helpers ---
    if (loading) return <div className="h-screen flex items-center justify-center"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
    if (!product) return null;

  

    // Determine current display values (Variant vs Base)
    const currentPrice = activeVariant ? activeVariant.price : product.mrp;
    const currentDiscount = activeVariant ? activeVariant.discount_price : product.discount_price;
    const currentQty = activeVariant ? activeVariant.quantity : product.quantity;
    const currentSKU = activeVariant ? activeVariant.sku : product.sku;
    const isOutOfStock = product.status !== 'active' || (product.track_quantity && currentQty <= 0);
    const isLowStock = !isOutOfStock && product.track_low_stock && currentQty <= product.low_stock_threshold;

    

    return (
        <div className="bg-secondary min-h-screen pb-20">
            {/* Breadcrumb */}
            <div className="bg-white border-b border-gray-100">
                <div className="container mx-auto px-4 py-3 flex items-center gap-2 text-xs md:text-sm text-gray-500">
                    <Link to="/" className="hover:text-primary"><Home size={14} /></Link>
                    <span>/</span>
                    <Link to="/store" className="hover:text-primary">Store</Link>
                    <span>/</span>
                    <span className="font-bold text-gray-800 line-clamp-1">{product.title}</span>
                </div>
            </div>

            <div className="container mx-auto px-4 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    
                    {/* --- LEFT: MEDIA GALLERY --- */}
                    <div className="space-y-4">
                        {/* Main Image with Zoom */}
                        <div 
                            className="relative aspect-square bg-white rounded-2xl overflow-hidden border shadow-sm group cursor-crosshair"
                            onMouseMove={handleMouseMove}
                            onMouseLeave={() => setZoomStyle({ display: 'none' })}
                        >
                            <img 
                                ref={mainImageRef}
                                src={getImgUrl(selectedImage)} 
                                alt={product.title} 
                                className="w-full h-full object-cover"
                            />
                            {/* Zoom Lens / Overlay */}
                            <div 
                                className="absolute inset-0 z-10 pointer-events-none bg-no-repeat transition-opacity duration-200"
                                style={{
                                    ...zoomStyle,
                                    backgroundSize: '200%', // Zoom level
                                }}
                            />
                            {/* Tags */}
                            {product.ribbon_tag && (
                                <div className="absolute top-4 left-4 bg-accent text-primary text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-md">
                                    {product.ribbon_tag}
                                </div>
                            )}
                        </div>

                        {/* Thumbnails */}
                        <div className="grid grid-cols-5 gap-2 md:gap-4">
                            {mediaList.map((img, idx) => (
                                <button 
                                    key={idx} 
                                    onClick={() => setSelectedImage(img)}
                                    className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${selectedImage === img ? 'border-primary' : 'border-transparent hover:border-gray-300'}`}
                                >
                                    <img src={getImgUrl(img)} className="w-full h-full object-cover" alt={`thumb-${idx}`} />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* --- RIGHT: PRODUCT INFO --- */}
                    <div>
                        <div className="flex justify-between items-start">
                            <div>
                                <h1 className="text-3xl md:text-4xl font-serif text-primary mb-2">{product.title}</h1>
                                {product.subtitle && <p className="text-gray-500 text-lg mb-4">{product.subtitle}</p>}
                            </div>
                            <button onClick={handleShare} className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors text-gray-600">
                                <Share2 size={20} />
                            </button>
                        </div>

                        {/* Pricing */}
                        <div className="flex items-end gap-3 mb-6">
                            <span className="text-3xl font-bold text-primary">
                                ₹{currentDiscount > 0 ? currentDiscount.toLocaleString() : currentPrice.toLocaleString()}
                            </span>
                            {currentDiscount > 0 && (
                                <span className="text-lg text-gray-400 line-through mb-1">
                                    ₹{Number(currentPrice).toLocaleString()}
                                </span>
                            )}
                        </div>

                        {/* Stock Status */}
                        <div className="flex items-center gap-4 mb-6 text-sm">
                            {isOutOfStock ? (
                                <span className="flex items-center gap-1 text-red-500 font-bold bg-red-50 px-3 py-1 rounded-full">
                                    <AlertTriangle size={16} /> Out of Stock
                                </span>
                            ) : (
                                <span className="flex items-center gap-1 text-green-600 font-bold bg-green-50 px-3 py-1 rounded-full">
                                    <Check size={16} /> In Stock
                                </span>
                            )}
                            {isLowStock && (
                                <span className="text-orange-500 font-medium">
                                    Only {currentQty} left!
                                </span>
                            )}
                            {currentSKU && <span className="text-gray-400">SKU: {currentSKU}</span>}
                        </div>

                        <p className="text-gray-600 leading-relaxed mb-8 border-b border-gray-100 pb-8">
                            {product.description}
                        </p>

                        {/* Variants Selection */}
                        {product.variants && product.variants.length > 0 && (
                            <div className="mb-8">
                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">
                                    Select Variant
                                </h3>
                                <div className="flex flex-wrap gap-3">
                                    {product.variants.map(variant => (
                                        <button
                                            key={variant.id}
                                            onClick={() => handleVariantChange(variant)}
                                            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                                                activeVariant?.id === variant.id 
                                                ? 'border-primary bg-primary text-white shadow-md' 
                                                : 'border-gray-200 hover:border-primary text-gray-700'
                                            }`}
                                        >
                                            {variant.variant_title}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-4 mb-10">
                            <button 
                                disabled={isOutOfStock}
                                className={`flex-1 btn-primary py-4 text-lg ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : ''}`}
                                onClick={() => toast.success("Added to Cart")} // Placeholder for Cart Context
                            >
                                <ShoppingCart size={20} className="mr-2" />
                                {isOutOfStock ? 'Sold Out' : 'Add to Cart'}
                            </button>
                            <button 
                                className="px-4 py-4 rounded-lg border border-gray-300 hover:border-red-500 hover:text-red-500 transition-colors"
                                onClick={() => toast.success("Added to Wishlist")}
                            >
                                <Heart size={24} />
                            </button>
                        </div>

                        {/* Additional Info Accordion */}
                        <div className="border rounded-xl bg-white overflow-hidden">
                            {/* Standard Guarantee Item */}
                            <div className="border-b">
                                <button className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 text-left" onClick={() => setActiveAccordion(activeAccordion === 'guarantee' ? null : 'guarantee')}>
                                    <span className="font-bold flex items-center gap-2"><ShieldCheck size={18}/> Quality Guarantee</span>
                                    {activeAccordion === 'guarantee' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                </button>
                                {activeAccordion === 'guarantee' && (
                                    <div className="px-5 pb-4 text-gray-600 text-sm animate-fade-in">
                                        All our products go through rigorous quality checks. We provide up to 12 months of polish warranty on selected items.
                                    </div>
                                )}
                            </div>

                            {/* Dynamic Items from DB */}
                            {parsedAdditionalInfo.map((info, i) => (
                                <div key={i} className={i !== parsedAdditionalInfo.length - 1 ? 'border-b' : ''}>
                                    <button 
                                        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 text-left"
                                        onClick={() => setActiveAccordion(activeAccordion === i ? null : i)}
                                    >
                                        <span className="font-bold text-gray-800">{info.title}</span>
                                        {activeAccordion === i ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                    </button>
                                    {activeAccordion === i && (
                                        <div className="px-5 pb-4 text-gray-600 text-sm animate-fade-in whitespace-pre-line">
                                            {info.description}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                    </div>
                </div>

                {/* --- RELATED PRODUCTS --- */}
                {relatedProducts.length > 0 && (
                    <div className="mt-20">
                        <h2 className="text-2xl font-serif font-bold text-primary mb-8 flex items-center gap-3">
                            {product.related_products?.title || "Explore Similar Products"}
                            <ArrowRight size={24} className="text-accent" />
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                            {relatedProducts.map(p => (
                                <ProductCard key={p.id} product={p} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}