import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { productService } from '../services/productService';
import ProductCard from '../components/ProductCard';
import { ChevronDown, Loader2, Filter, Share2, MessageCircle, Facebook, Twitter, Send, Copy, ArrowUp, Home, LayoutGrid } from 'lucide-react';

const PAGE_LIMIT = 20;

const mergeUniqueProducts = (base = [], incoming = []) => {
    const map = new Map();
    [...base, ...incoming].forEach((item) => {
        if (!item || item.id == null) return;
        map.set(String(item.id), item);
    });
    return Array.from(map.values());
};

export default function Shop() {
    const { socket } = useSocket();
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [products, setProducts] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [sortBy, setSortBy] = useState('default');
    const [jumbotronImage, setJumbotronImage] = useState('/placeholder_banner.jpg');
    const loadingRef = useRef(false);
    const productsRef = useRef([]);
    const sentinelRef = useRef(null);
    const [showFilters, setShowFilters] = useState(false);
    const [inStockOnly, setInStockOnly] = useState(false);
    const [priceRange, setPriceRange] = useState({ min: '', max: '' });
    const [searchTerm, setSearchTerm] = useState('');
    const [isShareOpen, setIsShareOpen] = useState(false);
    const shareRef = useRef(null);
    const [showTopBtn, setShowTopBtn] = useState(false);
    const [isCategoryOpen, setIsCategoryOpen] = useState(false);
    const categoryDropdownRef = useRef(null);
    const loadedPagesRef = useRef(new Set());
    const searchPrefetchingRef = useRef(false);
    const requestKeyRef = useRef('');
    const manualRefreshTimerRef = useRef(null);
    const [isFetchingAllForSearch, setIsFetchingAllForSearch] = useState(false);

    const loadCategories = useCallback(async () => {
        try {
            const data = await productService.getCategoryStats();
            const list = Array.isArray(data) ? data : [];
            setCategories(list);
            const best = list.find(c => c.name?.toLowerCase() === 'best sellers');
            if (best?.image_url) setJumbotronImage(best.image_url);
        } catch (err) {
            console.error('Failed to load categories', err);
        }
    }, []);

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
                // fall back to panel
            }
        }
        setIsShareOpen((prev) => !prev);
    };

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

    useEffect(() => {
        if (!isCategoryOpen) return;
        const handleClickOutside = (event) => {
            if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target)) {
                setIsCategoryOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isCategoryOpen]);

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

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const fetchProducts = useCallback(async (
        currentPage,
        { append = false, skipLoading = false, force = false } = {}
    ) => {
        if (loadingRef.current && !force) return [];
        loadingRef.current = true;
        if (!append && !skipLoading) setIsLoading(true);

        const requestKey = `${selectedCategory}::${sortBy}`;
        requestKeyRef.current = requestKey;
        try {
            const categoryParam = selectedCategory === 'all' ? 'all' : selectedCategory;
            const serverSort = sortBy === 'default'
                ? (categoryParam === 'all' ? 'newest' : 'manual')
                : sortBy;
            const data = await productService.getProducts(currentPage, categoryParam, 'active', serverSort, PAGE_LIMIT);
            if (requestKeyRef.current !== requestKey) return [];

            const newItems = Array.isArray(data?.products) ? data.products : [];
            loadedPagesRef.current.add(currentPage);
            if (append) {
                setProducts(prev => mergeUniqueProducts(prev, newItems));
            } else {
                setProducts(mergeUniqueProducts([], newItems));
            }
            setPage((prev) => Math.max(prev, currentPage));
            setHasMore(newItems.length >= PAGE_LIMIT);
            return newItems;
        } catch (err) {
            console.error('Failed to load products', err);
            return [];
        } finally {
            loadingRef.current = false;
            if (!skipLoading) setIsLoading(false);
        }
    }, [selectedCategory, sortBy]);

    useEffect(() => {
        loadCategories();
    }, [loadCategories]);

    useEffect(() => {
        setPage(1);
        setHasMore(true);
        loadedPagesRef.current = new Set();
        searchPrefetchingRef.current = false;
        setIsFetchingAllForSearch(false);
        requestKeyRef.current = `${selectedCategory}::${sortBy}`;
        fetchProducts(1, { append: false, force: true });
    }, [selectedCategory, sortBy, fetchProducts]);

    useEffect(() => {
        if (!sentinelRef.current) return;
        const observer = new IntersectionObserver((entries) => {
            const entry = entries[0];
            if (entry.isIntersecting && hasMore && !loadingRef.current && !searchTerm.trim()) {
                const loaded = Array.from(loadedPagesRef.current);
                const nextPage = (loaded.length ? Math.max(...loaded) : page) + 1;
                fetchProducts(nextPage, { append: true });
            }
        }, { rootMargin: '200px' });
        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [page, hasMore, fetchProducts, searchTerm]);

    const fetchAllRemainingPages = useCallback(async () => {
        if (!hasMore || searchPrefetchingRef.current) return;
        searchPrefetchingRef.current = true;
        setIsFetchingAllForSearch(true);
        try {
            while (true) {
                const loaded = Array.from(loadedPagesRef.current);
                const nextPage = (loaded.length ? Math.max(...loaded) : 0) + 1;
                const newItems = await fetchProducts(nextPage, { append: true, skipLoading: true, force: true });
                if (newItems.length < PAGE_LIMIT) {
                    setHasMore(false);
                    break;
                }
            }
        } finally {
            searchPrefetchingRef.current = false;
            setIsFetchingAllForSearch(false);
        }
    }, [fetchProducts, hasMore]);

    useEffect(() => {
        if (!searchTerm.trim() || !hasMore) return;
        fetchAllRemainingPages();
    }, [searchTerm, hasMore, fetchAllRemainingPages]);

    const shouldItemBeVisible = useCallback((item) => {
        if (!item || item.status !== 'active') return false;
        if (selectedCategory === 'all') return true;
        const clean = selectedCategory.toLowerCase();
        return item.categories && item.categories.some(c => String(c).toLowerCase() === clean);
    }, [selectedCategory]);

    const currentServerSort = useMemo(() => (
        sortBy === 'default'
            ? (selectedCategory === 'all' ? 'newest' : 'manual')
            : sortBy
    ), [selectedCategory, sortBy]);
    const isStableSort = useMemo(() => currentServerSort === 'newest', [currentServerSort]);
    const isManualSort = useMemo(
        () => currentServerSort === 'manual' && selectedCategory !== 'all',
        [currentServerSort, selectedCategory]
    );

    useEffect(() => {
        productsRef.current = products;
    }, [products]);

    const refreshLoadedPagesInCurrentSort = useCallback(async () => {
        if (!isManualSort || loadingRef.current) return;
        loadingRef.current = true;
        try {
            const requestKey = `${selectedCategory}::${sortBy}`;
            requestKeyRef.current = requestKey;
            const loaded = Array.from(loadedPagesRef.current).sort((a, b) => a - b);
            const pagesToLoad = loaded.length ? loaded : [1];
            let merged = [];
            let lastBatchSize = PAGE_LIMIT;

            for (const pg of pagesToLoad) {
                const data = await productService.getProducts(pg, selectedCategory, 'active', currentServerSort, PAGE_LIMIT);
                if (requestKeyRef.current !== requestKey) return;
                const batch = Array.isArray(data?.products) ? data.products : [];
                merged = mergeUniqueProducts(merged, batch);
                lastBatchSize = batch.length;
            }

            setProducts(merged);
            setPage(Math.max(...pagesToLoad));
            setHasMore(lastBatchSize >= PAGE_LIMIT);
        } catch (err) {
            console.error('Failed to refresh ordered shop list', err);
        } finally {
            loadingRef.current = false;
        }
    }, [currentServerSort, isManualSort, selectedCategory, sortBy]);

    const scheduleManualRefresh = useCallback(() => {
        if (!isManualSort) return;
        if (manualRefreshTimerRef.current) clearTimeout(manualRefreshTimerRef.current);
        manualRefreshTimerRef.current = setTimeout(() => {
            refreshLoadedPagesInCurrentSort();
        }, 180);
    }, [isManualSort, refreshLoadedPagesInCurrentSort]);

    useEffect(() => {
        if (!socket) return;

        const handleCategoryRefresh = (payload = {}) => {
            if (payload.action === 'reorder') {
                productService.clearProductsCache({ category: selectedCategory === 'all' ? undefined : selectedCategory });
            }
            loadCategories();
        };

        const handleProductCreate = (product) => {
            if (!shouldItemBeVisible(product)) return;
            if (isManualSort) {
                productService.clearProductsCache({ category: selectedCategory });
                scheduleManualRefresh();
                return;
            }
            setProducts(prev => {
                if (sortBy === 'newest') return mergeUniqueProducts([product], prev);
                return mergeUniqueProducts(prev, [product]);
            });
        };

        const handleProductUpdate = (updated) => {
            const currentCategory = selectedCategory.toLowerCase();
            const incomingCategories = Array.isArray(updated?.categories) ? updated.categories : [];
            const touchesCurrentCategory = incomingCategories.some(
                (entry) => String(entry || '').toLowerCase() === currentCategory
            );
            const existsInCurrent = productsRef.current.some(
                (item) => String(item?.id || '') === String(updated?.id || '')
            );
            if (isManualSort && (touchesCurrentCategory || existsInCurrent)) {
                productService.clearProductsCache({ category: selectedCategory });
                scheduleManualRefresh();
                return;
            }
            setProducts(prev => {
                const exists = prev.find(p => p.id === updated.id);
                const isVisible = shouldItemBeVisible(updated);
                if (exists) {
                    if (!isVisible) return prev.filter(p => p.id !== updated.id);
                    return prev.map(p => p.id === updated.id ? { ...p, ...updated } : p);
                }
                if (isVisible) return mergeUniqueProducts(prev, [updated]);
                return prev;
            });
            if (isStableSort) {
                productService.patchProductInProductsCache(updated, { sorts: [currentServerSort] });
            }
        };

        const handleProductDelete = ({ id }) => {
            if (isManualSort) {
                productService.clearProductsCache({ category: selectedCategory });
            }
            setProducts(prev => prev.filter(p => p.id !== id));
        };

        const handleCategoryChange = (payload = {}) => {
            if (!payload.product) return;
            const product = payload.product;
            const name = payload.categoryName || '';
            if (selectedCategory !== 'all' && name.toLowerCase() !== selectedCategory.toLowerCase()) return;
            if (isManualSort) {
                productService.clearProductsCache({ category: selectedCategory });
                scheduleManualRefresh();
                return;
            }
            if (!shouldItemBeVisible(product)) {
                setProducts(prev => prev.filter(p => p.id !== product.id));
            } else {
                setProducts(prev => mergeUniqueProducts(prev, [product]));
            }
            productService.clearProductsCache({ category: selectedCategory === 'all' ? undefined : selectedCategory });
        };

        socket.on('refresh:categories', handleCategoryRefresh);
        socket.on('product:create', handleProductCreate);
        socket.on('product:update', handleProductUpdate);
        socket.on('product:delete', handleProductDelete);
        socket.on('product:category_change', handleCategoryChange);

        return () => {
            socket.off('refresh:categories', handleCategoryRefresh);
            socket.off('product:create', handleProductCreate);
            socket.off('product:update', handleProductUpdate);
            socket.off('product:delete', handleProductDelete);
            socket.off('product:category_change', handleCategoryChange);
            if (manualRefreshTimerRef.current) {
                clearTimeout(manualRefreshTimerRef.current);
                manualRefreshTimerRef.current = null;
            }
        };
    }, [socket, selectedCategory, sortBy, shouldItemBeVisible, loadCategories, isStableSort, currentServerSort, isManualSort, scheduleManualRefresh]);

    const categoryOptions = useMemo(() => {
        const list = categories
            .filter(c => c?.name && Number(c.product_count) > 0)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        return [{ id: 'all', name: 'All Products' }, ...list];
    }, [categories]);

    const filteredAndSortedProducts = useMemo(() => {
        let result = [...products];

        if (inStockOnly) {
            result = result.filter(p => {
                const isTracked = String(p.track_quantity) === '1' || String(p.track_quantity) === 'true' || p.track_quantity === true;
                return !isTracked || (p.quantity && p.quantity > 0);
            });
        }
        if (searchTerm.trim()) {
            const q = searchTerm.trim().toLowerCase();
            result = result.filter(p =>
                (p.title || '').toLowerCase().includes(q) ||
                (p.sku || '').toLowerCase().includes(q)
            );
        }

        if (priceRange.min !== '') {
            result = result.filter(p => (p.discount_price || p.mrp) >= Number(priceRange.min));
        }
        if (priceRange.max !== '') {
            result = result.filter(p => (p.discount_price || p.mrp) <= Number(priceRange.max));
        }

        if (sortBy === 'low') {
            result.sort((a, b) => (a.discount_price || a.mrp) - (b.discount_price || b.mrp));
        } else if (sortBy === 'high') {
            result.sort((a, b) => (b.discount_price || b.mrp) - (a.discount_price || a.mrp));
        }

        return result;
    }, [products, sortBy, inStockOnly, priceRange, searchTerm]);

    return (
        <div className="min-h-screen bg-gray-50 pb-20 w-full">
            {/* Breadcrumb */}
            <div className="bg-white border-b border-gray-100">
                <div className="container mx-auto px-4 py-3 flex items-center gap-2 text-xs md:text-sm text-gray-500">
                    <Link to="/" className="hover:text-primary"><Home size={14} /></Link>
                    <span>/</span>
                    <span className="font-bold text-gray-800">Store</span>
                </div>
            </div>

            {/* Jumbotron */}
            <div className="relative h-64 md:h-80 bg-gray-900 w-full overflow-hidden">
                <div className="absolute inset-0 bg-black/50 z-10"></div>
                <img
                    src={jumbotronImage}
                    alt="Shop Banner"
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.src = '/placeholder_banner.jpg'; }}
                />
                <div className="relative z-20 container mx-auto px-4 h-full flex flex-col justify-center items-center text-center">
                    <span className="text-accent uppercase tracking-[0.2em] text-xs md:text-sm font-bold mb-3 animate-fade-in">
                        Explore Everything
                    </span>
                    <div className="flex items-center gap-3">
                        <h1 className="text-4xl md:text-6xl font-serif text-white mb-4 drop-shadow-lg animate-slide-up">
                            Shop
                        </h1>
                        <div className="relative" ref={shareRef}>
                            <button
                                onClick={handleShareClick}
                                className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors text-white mb-4"
                            >
                                <Share2 size={18} />
                            </button>
                            {isShareOpen && (
                                <div className="absolute left-full ml-3 top-0 w-56 bg-white border border-gray-200 shadow-2xl rounded-xl p-3 z-50 text-gray-700">
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

            <div className="container mx-auto px-4 py-6 md:py-8">
                <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
                    {/* Sidebar */}
                    <aside className="bg-white rounded-2xl border border-gray-200 p-4 h-fit">
                        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-widest mb-4 hidden md:block">Categories</h3>
                        {/* Mobile dropdown */}
                        <div className="md:hidden relative" ref={categoryDropdownRef}>
                            <button
                                type="button"
                                onClick={() => setIsCategoryOpen((prev) => !prev)}
                                className="w-full flex items-center justify-between gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:border-primary shadow-sm"
                            >
                                <span className="truncate">
                                    {selectedCategory === 'all' ? 'All Products' : selectedCategory}
                                </span>
                                <ChevronDown className={`text-gray-400 transition-transform ${isCategoryOpen ? 'rotate-180' : 'rotate-0'}`} size={16} />
                            </button>
                            {isCategoryOpen && (
                                <>
                                    <button
                                        type="button"
                                        aria-label="Close categories"
                                        className="fixed inset-0 bg-black/10 backdrop-blur-[2px] z-40"
                                        onClick={() => setIsCategoryOpen(false)}
                                    />
                                    <div className="absolute left-0 right-0 mt-2 rounded-xl border border-gray-200 bg-white shadow-xl max-h-64 overflow-auto z-50 animate-in fade-in slide-in-from-top-2">
                                        {categoryOptions.map((cat) => {
                                            const value = cat.name === 'All Products' ? 'all' : cat.name;
                                            const isActive = value === selectedCategory;
                                            return (
                                                <button
                                                    key={cat.id || cat.name}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedCategory(value);
                                                        setIsCategoryOpen(false);
                                                    }}
                                                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                                                        isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-gray-700 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    {cat.name === 'All Products' ? (
                                                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                                                            <LayoutGrid size={14} className="text-primary" />
                                                        </div>
                                                    ) : (
                                                        <div className="w-6 h-6 rounded-full bg-gray-100 overflow-hidden border border-white shadow-inner">
                                                            {cat.image_url ? (
                                                                <img src={cat.image_url} alt={cat.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full bg-gray-200" />
                                                            )}
                                                        </div>
                                                    )}
                                                    <span className="truncate">{cat.name}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                        {/* Desktop list */}
                        <div className="space-y-2 hidden md:block">
                            {categoryOptions.map((cat) => (
                                <button
                                    key={cat.id || cat.name}
                                    onClick={() => setSelectedCategory(cat.name === 'All Products' ? 'all' : cat.name)}
                                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        (selectedCategory === 'all' && cat.name === 'All Products') || (selectedCategory === cat.name)
                                            ? 'bg-primary text-white'
                                            : 'text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    {cat.name === 'All Products' ? (
                                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                                            <LayoutGrid size={14} className="text-primary" />
                                        </div>
                                    ) : (
                                        <div className="w-6 h-6 rounded-full bg-gray-100 overflow-hidden border border-white shadow-inner">
                                            {cat.image_url ? (
                                                <img src={cat.image_url} alt={cat.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-gray-200" />
                                            )}
                                        </div>
                                    )}
                                    {cat.name}
                                </button>
                            ))}
                        </div>
                    </aside>

                    {/* Main */}
                    <section>
                        <div className="mb-3">
                            <h2 className="text-xl md:text-2xl font-serif text-primary">
                                {selectedCategory === 'all' ? 'All Products' : selectedCategory}
                            </h2>
                        </div>
                        <div className="sticky top-[64px] z-40 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm w-full transition-all duration-300 mb-4">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-2 py-3">
                                <div className="flex w-full items-center justify-between md:justify-end gap-4">
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
                                    <div className="relative group md:ml-auto">
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
                            </div>
                            <div className="px-2 text-xs text-gray-500">
                                {filteredAndSortedProducts.length} results
                            </div>

                            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showFilters ? 'max-h-40 opacity-100 mt-3 pb-2' : 'max-h-0 opacity-0'}`}>
                                <div className="flex flex-wrap items-center gap-4 md:gap-8 pt-3 border-t border-gray-100">
                                    {/* Search */}
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            placeholder="Search products..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-48 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-primary"
                                        />
                                    </div>
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
                                </div>
                            </div>
                        </div>

                        {isLoading && products.length === 0 ? (
                            <div className="flex justify-center py-20">
                                <Loader2 className="animate-spin text-accent w-10 h-10" />
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                                    {filteredAndSortedProducts.map((product) => (
                                        <ProductCard key={product.id} product={product} />
                                    ))}
                                </div>
                                {isFetchingAllForSearch && searchTerm.trim() && (
                                    <div className="col-span-full py-4 text-center text-sm text-gray-500">
                                        Searching across all product pages...
                                    </div>
                                )}
                                {filteredAndSortedProducts.length === 0 && !isFetchingAllForSearch && (
                                    <div className="col-span-full py-10 text-center text-gray-400">
                                        No products available.
                                    </div>
                                )}
                                <div ref={sentinelRef} className="h-10" />
                                {loadingRef.current && (
                                    <div className="flex justify-center py-6">
                                        <Loader2 className="animate-spin text-accent w-6 h-6" />
                                    </div>
                                )}
                            </>
                        )}
                    </section>
                </div>
            </div>

            {/* Back to top */}
            {showTopBtn && (
                <button
                    onClick={scrollToTop}
                    className="fixed bottom-8 right-6 z-50 p-3 rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 transition-all"
                    aria-label="Back to top"
                >
                    <ArrowUp size={18} />
                </button>
            )}
        </div>
    );
}
