import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { productService } from '../services/productService';
import ProductCard from '../components/ProductCard';
import { Filter, SlidersHorizontal, Loader2, ChevronDown, Folder, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
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
    const [sortBy, setSortBy] = useState('newest');
    const [isHovered, setIsHovered] = useState(false);
    const pageRef = useRef(page);

    useEffect(() => {
        pageRef.current = page;
    }, [page]);
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
    const fetchProducts = async (currentPage, shouldAppend = false) => {
        setIsLoading(true);
        try {
            const data = await productService.getProducts(currentPage, category);
            let newItems = data.products || [];

            if (sortBy === 'low') newItems.sort((a,b) => a.price - b.price);
            if (sortBy === 'high') newItems.sort((a,b) => b.price - a.price);

            if (shouldAppend) {
                setProducts(prev => [...prev, ...newItems]);
            } else {
                setProducts(newItems);
            }
            
            setHasMore(newItems.length >= 10);
        } catch (error) {
            console.error("Store load error", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Initial Load
    useEffect(() => {
        setPage(1);
        setHasMore(true);
        fetchCategoryMetadata();
        fetchProducts(1, false);
    }, [category, sortBy]);

    // --- 3. Socket.io Sync ---
    useEffect(() => {
        if (!socket) return; // Wait for connection

        // Define handlers (so we can remove them specifically)
        const handleProductRefresh = () => {
            console.log("⚡ Live Update: Refreshing products...");
            productService.clearCache();
            const currentPage = pageRef.current || 1;
            //setPage(1);
            fetchProducts(currentPage, false);
        };

        const handleCategoryRefresh = () => {
            console.log("⚡ Live Update: Refreshing categories...");
            productService.clearCache();
            fetchCategoryMetadata();
            const currentPage = pageRef.current || 1;
            //setPage(1);
            fetchProducts(currentPage, false);
        };

        // Attach Listeners
        socket.on('refresh:products', handleProductRefresh);
        socket.on('refresh:categories', handleCategoryRefresh);

        // [CRITICAL] Cleanup: Remove listeners, DO NOT disconnect socket
        return () => {
            socket.off('refresh:products', handleProductRefresh);
            socket.off('refresh:categories', handleCategoryRefresh);
        };
    }, [socket, category, sortBy]); // Depend on 'socket'

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
        fetchProducts(nextPage, true);
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-20 overflow-x-hidden w-full">
            
            {/* Jumbotron (Unchanged) */}
            <div className="relative h-64 md:h-80 bg-gray-900 w-full overflow-hidden">
                <div className="absolute inset-0 bg-black/50 z-10"></div>
                <img 
                    key={categoryInfo?.image_url} 
                    src={categoryInfo?.image_url || '/placeholder_banner.jpg'} 
                    alt={category}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 hover:scale-105"
                    onError={(e) => e.target.src = '/placeholder_banner.jpg'}
                />
                <div className="relative z-20 container mx-auto px-4 h-full flex flex-col justify-center items-center text-center">
                    <span className="text-accent uppercase tracking-[0.2em] text-xs md:text-sm font-bold mb-3 animate-fade-in">
                        Exclusive Collection
                    </span>
                    <h1 className="text-4xl md:text-6xl font-serif text-white mb-4 capitalize drop-shadow-lg animate-slide-up">
                        {category.replace(/-/g, ' ')}
                    </h1>
                </div>
            </div>

            {/* Toolbar (Unchanged) */}
            <div className="sticky top-[74px] z-30 bg-white border-b border-gray-200 shadow-sm w-full">
                <div className="container mx-auto px-4 py-3 flex justify-between items-center">
                    <button className="flex items-center gap-2 text-gray-600 hover:text-primary font-medium text-sm">
                        <Filter size={18} /> <span>Filters</span>
                    </button>
                    <div className="relative group">
                        <select 
                            className="appearance-none bg-transparent pl-2 pr-8 py-1 text-sm font-bold text-gray-700 focus:outline-none cursor-pointer hover:text-primary"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                        >
                            <option value="newest">Newest First</option>
                            <option value="low">Price: Low to High</option>
                            <option value="high">Price: High to Low</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                </div>
            </div>

            {/* Product Grid */}
            <main className="container mx-auto px-4 py-8">
                {products.length > 0 ? (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-8">
                            {products.map((product) => (
                                <ProductCard key={product.id} product={product} />
                            ))}
                        </div>
                        {hasMore && (
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
                            <Link to="/" className="text-primary font-bold hover:underline">Return Home</Link>
                        </div>
                    )
                )}
                {isLoading && products.length === 0 && (
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
        </div>
    );
}