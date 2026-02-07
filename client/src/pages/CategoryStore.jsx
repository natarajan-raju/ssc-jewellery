import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { productService } from '../services/productService';
import ProductCard from '../components/ProductCard';
import { Filter, SlidersHorizontal, Loader2, ChevronDown, Folder, ArrowRight, ChevronLeft, ChevronRight, ArrowUp, Share2, MessageCircle, Facebook, Twitter, Send, Copy, Home } from 'lucide-react';
// import { io } from 'socket.io-client';

export default function CategoryStore() {
    const { category } = useParams();
    const navigate = useNavigate();
    const scrollRef = useRef(null);

    const { user } = useAuth();
    const { socket } = useSocket();
    const [products, setProducts] = useState([]);
    const [categoryInfo, setCategoryInfo] = useState(null); 
    const [otherCategories, setOtherCategories] = useState([]); 
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [sortBy, setSortBy] = useState('default');
    const [isHovered, setIsHovered] = useState(false);
    const [isShareOpen, setIsShareOpen] = useState(false);
    const shareRef = useRef(null);
    const pageRef = useRef(page);
    const [showTopBtn, setShowTopBtn] = useState(false);
    const PAGE_LIMIT = 20;

    const shareUrl = window.location.href;
    const shareText = `I found this category in SSC Impo jewellery website - ${shareUrl}`;
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(shareText);
    const shareLinks = {
        whatsapp: `https://wa.me/9500941350?text=${encodedText}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
        twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
        telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`
    };

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
        } catch (err) {
            console.error("Copy failed", err);
        }
    };

    const handleShareClick = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `SSC Impo Jewellery`,
                    text: shareText,
                    url: shareUrl
                });
                return;
            } catch (err) {
                // Fall back to panel
            }
        }
        setIsShareOpen((prev) => !prev);
    };

    // --- FILTER STATE ---
    const [showFilters, setShowFilters] = useState(false);
    const [inStockOnly, setInStockOnly] = useState(false);
    const [priceRange, setPriceRange] = useState({ min: '', max: '' });

    // Scroll Listener for "Back to Top" Button
    useEffect(() => {
        const toggleVisibility = () => {
            if (window.scrollY > 300) {
                setShowTopBtn(true);
            } else {
                setShowTopBtn(false);
            }
        };
        window.addEventListener('scroll', toggleVisibility);
        return () => window.removeEventListener('scroll', toggleVisibility);
    }, []);


    // Add Scroll Function
    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth',
        });
    };

    useEffect(() => {
        pageRef.current = page;
    }, [page]);

    useEffect(() => {
        if (!isShareOpen) return;
        const handleClickOutside = (event) => {
            if (shareRef.current && !shareRef.current.contains(event.target)) {
                setIsShareOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isShareOpen]);
    // --- 1. Fetch Jumbotron & Explore Data ---
    const fetchCategoryMetadata = async () => {
        try {
            const allCategories = await productService.getCategoryStats();
            const cleanName = decodeURIComponent(category).toLowerCase();
            const currentCat = allCategories.find(c => c.name.toLowerCase() === cleanName);
            
            setCategoryInfo(currentCat ? { ...currentCat } : { name: category, image_url: null });
            setOtherCategories(allCategories.filter(c => c.name.toLowerCase() !== cleanName));
        } catch (err) {
            console.error("Failed to load category info", err);
        }
    };

    // --- 2. Fetch Products ---
    // [FIX] Added 'skipLoading' param to prevent premature spinner dismissal during Promise.all
    const fetchProducts = async (currentPage, shouldAppend = false, skipLoading = false) => {
        if (!skipLoading) setIsLoading(true);
        try {
            // [FIX] Pass 'sortBy' to the server (3rd arg is 'active' for clients)
            const serverSort = sortBy === 'default' ? 'manual' : sortBy;
            const data = await productService.getProducts(currentPage, category, 'active', serverSort, PAGE_LIMIT);
            let newItems = data.products || [];            

            if (shouldAppend) {
                setProducts(prev => [...prev, ...newItems]);
            } else {
                setProducts(newItems);
            }
            
            setHasMore(newItems.length >= PAGE_LIMIT);
        } catch (error) {
            console.error("Store load error", error);
        } finally {
            if (!skipLoading) setIsLoading(false);
        }
    };

    const reorderByIds = (items, orderedIds = []) => {
        if (!Array.isArray(orderedIds) || orderedIds.length === 0) return items;
        const map = new Map(items.map(p => [String(p.id), p]));
        const ordered = orderedIds.map(id => map.get(String(id))).filter(Boolean);
        const remaining = items.filter(p => !orderedIds.includes(String(p.id)));
        return [...ordered, ...remaining];
    };
    
    // Initial Load (Optimized with Promise.all)
    useEffect(() => {
        const loadInitialData = async () => {
            setIsLoading(true);
            setPage(1);
            setHasMore(true);

            // Execute both requests in parallel and wait for both to finish
            await Promise.all([
                fetchCategoryMetadata(),
                fetchProducts(1, false, true) // Pass true to skip internal loading toggle
            ]);

            setIsLoading(false);
        };

        loadInitialData();
    }, [category, sortBy]);

    // --- 3. Socket.io Sync (Optimized: Local Append/Patch) ---
    useEffect(() => {
        if (!socket) return; 
        if (!socket.connected) {
            socket.connect();
        }

        if (import.meta.env.DEV) {
            console.log('[Socket] connected?', socket.connected);
        }

        // [HELPER] Check if an item belongs in this current view
        const shouldItemBeVisible = (item) => {
            // 1. Must be active
            if (item.status && item.status !== 'active') return false;

            // 2. Must match the current URL category
            // We decode the URL param (e.g., "Gold%20Rings" -> "gold rings")
            const cleanCatParam = decodeURIComponent(category).toLowerCase();
            const belongsToCategory = item.categories && item.categories.some(c => c.toLowerCase() === cleanCatParam);
            
            return belongsToCategory;
        };

        // A. Handle Item Creation (APPEND/PREPEND LOCALLY)
        const handleProductCreate = (newProduct) => {
            console.log("⚡ New Product Created:", newProduct.title);
            
            // Only add if it belongs to this category and is active
            if (shouldItemBeVisible(newProduct)) {
                setProducts(prev => {
                    // Prevent duplicates
                    if (prev.find(p => p.id === newProduct.id)) return prev;

                    // Logic: If sorting by 'newest', add to TOP. Else add to BOTTOM.
                    if (sortBy === 'newest') {
                        return [newProduct, ...prev];
                    }
                    return [...prev, newProduct];
                });
            }
        };

        // B. Handle Item Updates (PATCH LOCALLY + REAPPEARANCE)
        const handleProductUpdate = (updatedItem) => {
            console.log("⚡ Item Update Received:", updatedItem.id);
            setProducts(prevProducts => {
                const exists = prevProducts.find(p => p.id === updatedItem.id);
                const isVisible = shouldItemBeVisible(updatedItem);

                if (exists) {
                    if (!isVisible) {
                        // Case 1: Was visible -> Now Hidden/Removed (Remove locally)
                        return prevProducts.filter(p => p.id !== updatedItem.id);
                    } else {
                        // Case 2: Was visible -> Still visible (Update details in place)
                        return prevProducts.map(p => p.id === updatedItem.id ? { ...p, ...updatedItem } : p);
                    }
                } else {
                    if (isVisible) {
                        // Case 3: Was HIDDEN -> Now Active (Reappearance)
                        // Inject it into the list without fetching
                        if (sortBy === 'newest') return [updatedItem, ...prevProducts];
                        return [...prevProducts, updatedItem];
                    }
                    return prevProducts; // Item irrelevant to this page
                }
            });
        };

        // C. Handle Deletes (REMOVE LOCALLY)
        const handleProductDelete = ({ id }) => {
            console.log("⚡ Item Deleted:", id);
            setProducts(prev => prev.filter(p => p.id !== id));
        };

        // D. Handle Category Add/Remove (Admin Action)
        const handleCategoryChange = (payload) => {
            const { id, categoryId, action } = payload || {};
            // Check if event relates to THIS category page
            if (categoryInfo && String(categoryInfo.id) === String(categoryId)) {
                if (action === 'remove') {
                    // Locally remove
                    setProducts(prev => prev.filter(p => p.id !== id));
                } else {
                    // 'Add' via Admin usually only sends IDs, not full data.
                    // We MUST fetch here to get the image/price/etc.
                    // However, we only fetch if necessary.
                    console.log("⚡ Product added to category. Refreshing...");
                    if (payload.product && shouldItemBeVisible(payload.product)) {
                        setProducts(prev => {
                            if (prev.find(p => p.id === payload.product.id)) return prev;
                            if (sortBy === 'newest') return [payload.product, ...prev];
                            return [...prev, payload.product];
                        });
                    }
                }
            }
        };

        // E. Handle Metadata (Jumbotron/Counts)
        const handleMetadataRefresh = (payload = {}) => {
            if (import.meta.env.DEV) {
                console.log('[Socket] refresh:categories', payload);
            }
            fetchCategoryMetadata();
            if (payload.action === 'reorder' && payload.orderedProductIds) {
                const cleanCatParam = decodeURIComponent(category).toLowerCase();
                const matchesByName = payload.categoryName && payload.categoryName.toLowerCase() === cleanCatParam;
                const matchesById = categoryInfo && payload.categoryId && String(categoryInfo.id) === String(payload.categoryId);
                if (matchesByName || matchesById) {
                    setProducts(prev => reorderByIds(prev, payload.orderedProductIds));
                }
            }
        };

        // Attach Listeners
        socket.on('product:create', handleProductCreate);
        socket.on('product:update', handleProductUpdate);
        socket.on('product:delete', handleProductDelete);
        socket.on('product:category_change', handleCategoryChange);
        socket.on('refresh:categories', handleMetadataRefresh); 
        socket.on('connect', () => {
            if (import.meta.env.DEV) console.log('[Socket] connected');
        });
        socket.on('connect_error', (err) => {
            console.error('[Socket] connect_error', err?.message || err);
        });

        return () => {
            socket.off('product:create', handleProductCreate);
            socket.off('product:update', handleProductUpdate);
            socket.off('product:delete', handleProductDelete);
            socket.off('product:category_change', handleCategoryChange);
            socket.off('refresh:categories', handleMetadataRefresh);
            socket.off('connect');
            socket.off('connect_error');
        };
    }, [socket, category, categoryInfo, sortBy]); // Removed 'products' dependency to prevent loop
    // --- 4. Carousel Auto-Slide Logic ---
    useEffect(() => {
        if (otherCategories.length === 0 || isHovered) return;

        const interval = setInterval(() => {
            if (scrollRef.current) {
                const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
                // Loop back logic
                if (scrollLeft + clientWidth >= scrollWidth - 10) {
                    scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
                } else {
                    // Scroll 1 item width approx
                    const itemWidth = clientWidth / (window.innerWidth >= 768 ? 5 : 3);
                    scrollRef.current.scrollBy({ left: itemWidth, behavior: 'smooth' });
                }
            }
        }, 3000); 

        return () => clearInterval(interval);
    }, [otherCategories, isHovered]);

    const scrollCarousel = (direction) => {
        if (scrollRef.current) {
            const { clientWidth } = scrollRef.current;
            const itemWidth = clientWidth / (window.innerWidth >= 768 ? 5 : 3);
            const amount = direction === 'left' ? -itemWidth : itemWidth;
            scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
        }
    };

    const handleLoadMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchProducts(nextPage, true, false);
    };

    // --- CLIENT-SIDE FILTER & SORT LOGIC ---
    const filteredAndSortedProducts = useMemo(() => {
        let result = [...products];

        // 1. Filter: Availability
        if (inStockOnly) {
            result = result.filter(p => {
                const isTracked = String(p.track_quantity) === '1' || String(p.track_quantity) === 'true' || p.track_quantity === true;
                return !isTracked || (p.quantity && p.quantity > 0);
            });
        }

        // 2. Filter: Price Range
        if (priceRange.min !== '') {
            result = result.filter(p => (p.discount_price || p.mrp) >= Number(priceRange.min));
        }
        if (priceRange.max !== '') {
            result = result.filter(p => (p.discount_price || p.mrp) <= Number(priceRange.max));
        }

        // 3. Sort
        if (sortBy === 'low') {
            result.sort((a, b) => (a.discount_price || a.mrp) - (b.discount_price || b.mrp));
        } else if (sortBy === 'high') {
            result.sort((a, b) => (b.discount_price || b.mrp) - (a.discount_price || a.mrp));
        } else if (sortBy === 'newest' || sortBy === 'default') {
            // Assuming IDs or created_at can be used, or reliance on initial server order (which is newest)
            // If strictly needed: new Date(b.created_at) - new Date(a.created_at)
        }

        return result;
    }, [products, sortBy, inStockOnly, priceRange]);

    return (
        <div className="min-h-screen bg-gray-50 pb-20 w-full">
            {/* Breadcrumb */}
            <div className="bg-white border-b border-gray-100">
                <div className="container mx-auto px-4 py-3 flex items-center gap-2 text-xs md:text-sm text-gray-500">
                    <Link to="/" className="hover:text-primary"><Home size={14} /></Link>
                    <span>/</span>
                    <Link to="/shop" className="hover:text-primary">Store</Link>
                    <span>/</span>
                    <span className="font-bold text-gray-800 line-clamp-1 capitalize">{category.replace(/-/g, ' ')}</span>
                </div>
            </div>
            
            {/* Jumbotron (Unchanged) */}
            <div className="relative h-64 md:h-80 bg-gray-900 w-full overflow-visible z-50">
                <div className="absolute inset-0 bg-black/50 z-10"></div>
                <div className="absolute inset-0 overflow-hidden">
                    <img 
                        key={categoryInfo?.image_url} 
                        src={categoryInfo?.image_url || '/placeholder_banner.jpg'} 
                        alt={category}
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 hover:scale-105"
                        onError={(e) => e.target.src = '/placeholder_banner.jpg'}
                    />
                </div>
                <div className="relative z-20 container mx-auto px-4 h-full flex flex-col justify-center items-center text-center">
                    <span className="text-accent uppercase tracking-[0.2em] text-xs md:text-sm font-bold mb-3 animate-fade-in">
                        Exclusive Collection
                    </span>
                    <div className="flex items-center gap-3">
                        <h1 className="text-4xl md:text-6xl font-serif text-white mb-4 capitalize drop-shadow-lg animate-slide-up">
                            {category.replace(/-/g, ' ')}
                        </h1>
                        <div className="relative" ref={shareRef}>
                            <button
                                onClick={handleShareClick}
                                className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors text-white mb-4"
                            >
                                <Share2 size={18} />
                            </button>
                            {isShareOpen && (
                                <div className="absolute left-full ml-3 top-0 w-56 bg-white border border-gray-200 shadow-2xl rounded-xl p-3 z-[70]">
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Share</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <a onClick={() => setIsShareOpen(false)} className="text-xs font-semibold text-gray-700 border border-gray-200 rounded-lg py-2 text-center hover:bg-gray-50 flex items-center justify-center gap-1" href={shareLinks.whatsapp} target="_blank" rel="noreferrer">
                                            <MessageCircle size={14} className="text-green-500" /> WhatsApp
                                        </a>
                                        <a onClick={() => setIsShareOpen(false)} className="text-xs font-semibold text-gray-700 border border-gray-200 rounded-lg py-2 text-center hover:bg-gray-50 flex items-center justify-center gap-1" href={shareLinks.facebook} target="_blank" rel="noreferrer">
                                            <Facebook size={14} className="text-blue-600" /> Facebook
                                        </a>
                                        <a onClick={() => setIsShareOpen(false)} className="text-xs font-semibold text-gray-700 border border-gray-200 rounded-lg py-2 text-center hover:bg-gray-50 flex items-center justify-center gap-1" href={shareLinks.twitter} target="_blank" rel="noreferrer">
                                            <Twitter size={14} className="text-sky-500" /> Twitter
                                        </a>
                                        <a onClick={() => setIsShareOpen(false)} className="text-xs font-semibold text-gray-700 border border-gray-200 rounded-lg py-2 text-center hover:bg-gray-50 flex items-center justify-center gap-1" href={shareLinks.telegram} target="_blank" rel="noreferrer">
                                            <Send size={14} className="text-blue-400" /> Telegram
                                        </a>
                                    </div>
                                    <button onClick={() => { handleCopyLink(); setIsShareOpen(false); }} className="mt-3 w-full text-xs font-semibold text-primary border border-primary/20 rounded-lg py-2 hover:bg-primary/5 flex items-center justify-center gap-1">
                                        <Copy size={14} className="text-primary/80" /> Copy Link
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Toolbar - Fixed below Navbar */}
            <div className="sticky top-[64px] z-40 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm w-full transition-all duration-300">
                <div className="container mx-auto px-4 py-3">
                    <div className="flex justify-between items-center">
                        {/* Filter Toggle */}
                        <button 
                            onClick={() => setShowFilters(!showFilters)}
                            className={`flex items-center gap-2 font-medium text-sm transition-colors ${showFilters ? 'text-primary' : 'text-gray-600 hover:text-primary'}`}
                        >
                            <Filter size={18} className={showFilters ? "fill-current" : ""} /> 
                            <span>Filters</span>
                            {inStockOnly || priceRange.min || priceRange.max ? (
                                <span className="bg-accent text-primary text-[10px] px-1.5 rounded-full font-bold">!</span>
                            ) : null}
                        </button>

                        {/* Sort Dropdown */}
                        <div className="relative group">
                            <select 
                                className="appearance-none bg-transparent pl-2 pr-8 py-1 text-sm font-bold text-gray-700 focus:outline-none cursor-pointer hover:text-primary"
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                            >
                                <option value="default">Default</option>
                                <option value="newest">Newest First</option>
                                <option value="low">Price: Low to High</option>
                                <option value="high">Price: High to Low</option>
                            </select>
                            <ChevronDown size={14} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                    </div>

                    {/* Expandable Filter Panel */}
                    <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showFilters ? 'max-h-40 opacity-100 mt-3 pb-2' : 'max-h-0 opacity-0'}`}>
                        <div className="flex flex-wrap items-center gap-4 md:gap-8 pt-3 border-t border-gray-100">
                            
                            {/* Availability Toggle */}
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <div className="relative">
                                    <input 
                                        type="checkbox" 
                                        className="sr-only peer" 
                                        checked={inStockOnly}
                                        onChange={() => setInStockOnly(!inStockOnly)}
                                    />
                                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                                </div>
                                <span className="text-sm text-gray-600 font-medium">In Stock Only</span>
                            </label>

                            {/* Price Range */}
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600 font-medium">Price:</span>
                                <input 
                                    type="number" 
                                    placeholder="Min" 
                                    value={priceRange.min}
                                    onChange={(e) => setPriceRange(prev => ({ ...prev, min: e.target.value }))}
                                    className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-primary"
                                />
                                <span className="text-gray-400">-</span>
                                <input 
                                    type="number" 
                                    placeholder="Max" 
                                    value={priceRange.max}
                                    onChange={(e) => setPriceRange(prev => ({ ...prev, max: e.target.value }))}
                                    className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-primary"
                                />
                            </div>

                            {/* Clear Button */}
                            {(inStockOnly || priceRange.min || priceRange.max) && (
                                <button 
                                    onClick={() => { setInStockOnly(false); setPriceRange({ min: '', max: '' }); }}
                                    className="text-xs text-red-500 hover:text-red-700 font-bold ml-auto md:ml-0"
                                >
                                    Clear All
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Product Grid */}
            <main className="container mx-auto px-4 py-8">
                {/* [FIX 1] Check filtered list length instead of raw products */}
                {filteredAndSortedProducts.length > 0 ? (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-8">
                            {/* [FIX 2] Map over filteredAndSortedProducts */}
                            {filteredAndSortedProducts.map((product) => {
                                // 1. Calculate Out of Stock Logic
                                const isTracked = String(product.track_quantity) === '1' || String(product.track_quantity) === 'true' || product.track_quantity === true;
                                const isOutOfStock = isTracked && (product.quantity || 0) <= 0;

                                return (
                                    <div key={product.id} className="relative group">
                                        {/* 2. Apply Grayscale if OOS */}
                                        <div className={isOutOfStock ? "grayscale opacity-75 transition-all" : ""}>
                                            <ProductCard product={product} />
                                        </div>

                                        {/* 3. Out of Stock Badge Overlay */}
                                        {isOutOfStock && (
                                            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                                                <span className="bg-black/80 text-white text-xs md:text-sm font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider backdrop-blur-sm shadow-md">
                                                    Out of Stock
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        
                        {/* Load More Button (Only show if we haven't filtered everything out locally) */}
                        {hasMore && filteredAndSortedProducts.length >= PAGE_LIMIT && (
                            <div className="mt-12 text-center">
                                <button 
                                    onClick={handleLoadMore}
                                    disabled={isLoading}
                                    className="px-8 py-3 bg-white border border-gray-200 text-gray-800 rounded-full font-bold hover:bg-gray-50 transition-all shadow-sm flex items-center gap-2 mx-auto disabled:opacity-50"
                                >
                                    {isLoading ? <Loader2 className="animate-spin" size={20}/> : 'Load More Products'}
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    !isLoading && (
                        <div className="text-center py-24">
                            <SlidersHorizontal size={32} className="mx-auto text-gray-400 mb-4" />
                            <h3 className="text-xl font-bold text-gray-800 mb-2">No products found</h3>
                            <p className="text-gray-500 mb-4">Try adjusting your filters</p>
                            <button 
                                onClick={() => { setInStockOnly(false); setPriceRange({ min: '', max: '' }); }}
                                className="text-primary font-bold hover:underline"
                            >
                                Clear Filters
                            </button>
                        </div>
                    )
                )}
                
                {/* [FIX 3] Update Skeleton Loader Check */}
                {isLoading && filteredAndSortedProducts.length === 0 && (
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
                        {[...Array(4)].map((_,i) => <div key={i} className="bg-gray-200 h-64 rounded-xl"></div>)}
                     </div>
                )}
            </main>

            {/* --- EXPLORE CAROUSEL --- */}
            {otherCategories.length > 0 && (
                <section className="border-t border-gray-100 bg-white py-10 mt-8 w-full">
                    <div className="container mx-auto px-4 relative group/carousel"
                         onMouseEnter={() => setIsHovered(true)}
                         onMouseLeave={() => setIsHovered(false)}
                    >
                        <div className="flex justify-between items-end mb-6">
                            <h3 className="text-xl md:text-2xl font-serif text-gray-900">Explore Collections</h3>
                            <div className="hidden md:flex gap-2">
                                <button onClick={() => scrollCarousel('left')} className="p-2 rounded-full border hover:bg-gray-100"><ChevronLeft size={20}/></button>
                                <button onClick={() => scrollCarousel('right')} className="p-2 rounded-full border hover:bg-gray-100"><ChevronRight size={20}/></button>
                            </div>
                        </div>
                        
                        {/* Carousel Container */}
                        <div 
                            ref={scrollRef}
                            // [FIX] Added arbitrary values to hide scrollbar cross-browser
                            className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
                        >
                            {otherCategories.map((cat) => (
                                <Link
                                    key={cat.id} 
                                    to={`/shop/${encodeURIComponent(cat.name)}`}
                                    // [FIX] w-1/3 (33%) for Mobile, md:w-1/5 (20%) for Desktop
                                    className="w-1/3 md:w-1/5 min-w-[33.33%] md:min-w-[20%] snap-start cursor-pointer group flex-shrink-0 p-2 box-border"
                                >
                                    <div className="aspect-square rounded-full overflow-hidden border-2 border-transparent group-hover:border-primary transition-all p-1 bg-gray-50 mb-3 relative mx-auto max-w-[120px]">
                                        <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-gray-100 text-gray-300">
                                            {cat.image_url ? (
                                                <img 
                                                    src={cat.image_url} 
                                                    alt={cat.name} 
                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                                                />
                                            ) : (
                                                <Folder size={32} strokeWidth={1.5} />
                                            )}
                                            <div className="hidden w-full h-full absolute inset-0 items-center justify-center bg-gray-100">
                                                <Folder size={32} strokeWidth={1.5} />
                                            </div>
                                        </div>
                                    </div>
                                    <h4 className="text-center text-xs md:text-sm font-bold text-gray-700 group-hover:text-primary line-clamp-1">
                                        {cat.name}
                                    </h4>
                                </Link>
                            ))}
                        </div>

                        {/* Mobile Arrows */}
                        <button onClick={() => scrollCarousel('left')} className="md:hidden absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 p-2 rounded-full shadow-lg z-10 text-gray-600">
                            <ChevronLeft size={18}/>
                        </button>
                        <button onClick={() => scrollCarousel('right')} className="md:hidden absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 p-2 rounded-full shadow-lg z-10 text-gray-600">
                            <ChevronRight size={18}/>
                        </button>
                    </div>
                </section>
            )}
            {/* Go Up Button */}
            <button
                onClick={scrollToTop}
                className={`fixed bottom-8 right-8 z-50 p-3 rounded-full bg-primary text-white shadow-lg transition-all duration-300 transform hover:scale-110 hover:bg-primary-dark ${
                    showTopBtn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'
                }`}
                aria-label="Scroll to top"
            >
                <ArrowUp size={24} />
            </button>
        </div>
    );
}
