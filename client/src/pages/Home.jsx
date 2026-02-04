import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCms } from '../hooks/useCms'; // [CHANGE] Import Hook
import { productService } from '../services/productService';
import { ArrowRight, ChevronLeft, ChevronRight, Folder, Truck, PenTool, ShieldCheck, Gem, Headphones, Check } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
// import { io } from 'socket.io-client';
// --- 1. STATIC HERO COMPONENT (Default) ---
const StaticHero = () => (
    <section className="relative h-[80vh] flex items-center justify-center bg-primary overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-100 to-transparent"></div>
        
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto space-y-6">
            <span className="text-accent text-sm md:text-base font-bold tracking-widest uppercase animate-slide-in">
                Artisanal Excellence
            </span>
            <h1 className="text-5xl md:text-7xl font-serif text-white leading-tight">
                Handmade with <span className="text-gold">Love</span> & Heritage
            </h1>
            <p className="text-gray-300 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
                Discover our exclusive collection of handcrafted treasures, made using traditional techniques passed down through generations.
            </p>
            <div className="flex flex-col md:flex-row gap-4 justify-center pt-8">
                <Link to="/shop" className="btn-primary">
                    Shop Collections
                </Link>
                <Link to="/about" className="px-6 py-3 rounded-lg font-semibold text-white border border-white/20 hover:bg-white/10 transition-all">
                    Our Story
                </Link>
            </div>
        </div>
    </section>
);

// --- 2. DYNAMIC CAROUSEL COMPONENT ---
const CarouselHero = ({ slides }) => {
    const [currentSlide, setCurrentSlide] = useState(0);

    // Auto-Slide Logic
    useEffect(() => {
        if (slides.length <= 1) return;
        const interval = setInterval(() => {
            setCurrentSlide(prev => (prev === slides.length - 1 ? 0 : prev + 1));
        }, 5000); 
        return () => clearInterval(interval);
    }, [slides.length]);

    const nextSlide = () => setCurrentSlide(prev => (prev === slides.length - 1 ? 0 : prev + 1));
    const prevSlide = () => setCurrentSlide(prev => (prev === 0 ? slides.length - 1 : prev - 1));

    return (
        <section className="relative h-[85vh] overflow-hidden bg-primary group">
            {slides.map((slide, index) => (
                <div 
                    key={slide.id}
                    className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${index === currentSlide ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
                >
                    {/* Image Layer */}
                    <div className="absolute inset-0">
                        <img 
                            src={slide.image_url} 
                            alt={slide.title} 
                            className="w-full h-full object-cover transition-transform duration-[8000ms] ease-linear scale-105 group-hover:scale-110" 
                        />
                        {/* [OPTION 1] FULL BLACK MASK */}
                        <div className="absolute inset-0 bg-black/50"></div>
                    </div>

                    {/* Content Layer */}
                    <div className="relative h-full flex items-center justify-center text-center px-4">
                        <div className={`max-w-4xl mx-auto space-y-6 transition-all duration-1000 transform drop-shadow-2xl shadow-black/20 ${index === currentSlide ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
                            
                            {slide.subtitle && (
                                <span className="text-accent text-sm md:text-base font-bold tracking-[0.2em] uppercase block mb-2">
                                    {slide.subtitle}
                                </span>
                            )}
                            
                            {slide.title && (
                                <h1 className="text-4xl md:text-7xl font-serif text-white leading-tight drop-shadow-lg">
                                    {slide.title}
                                </h1>
                            )}

                            {slide.link && (
                                <div className="pt-8 flex items-center justify-center">
                                    <Link to={slide.link} className="btn-primary w-[65%] px-8 py-4 text-lg shadow-xl shadow-accent/20">
                                        Explore Collection
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ))}

            {/* Navigation Buttons */}
            {slides.length > 1 && (
                <>
                    <button onClick={prevSlide} className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100">
                        <ChevronLeft size={32} />
                    </button>
                    <button onClick={nextSlide} className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100">
                        <ChevronRight size={32} />
                    </button>
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex gap-3">
                        {slides.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrentSlide(idx)}
                                className={`w-3 h-3 rounded-full transition-all duration-300 ${idx === currentSlide ? 'bg-accent w-8' : 'bg-white/50 hover:bg-white'}`}
                            />
                        ))}
                    </div>
                </>
            )}
        </section>
    );
};

// --- 3. MAIN PAGE COMPONENT ---
export default function Home() {
    const { socket } = useSocket();
    const navigate = useNavigate();
    const [slides, setSlides] = useState([]);
    const [categories, setCategories] = useState([]);
    const [isLoadingHero, setIsLoadingHero] = useState(true);
    const [isLoadingCats, setIsLoadingCats] = useState(true);
    const { getSlides } = useCms();

    // [FIX] Moved fetchHero out to component scope for Promise.all
    const fetchHero = async () => {
        try {
            const data = await getSlides(false); // false = public
            setSlides(data);
        } catch (err) {
            console.error("Hero load failed", err);
        } finally {
            setIsLoadingHero(false);
        }
    };

    // 2. [NEW] Fetch Categories
    // We will wrap this in a function so we can call it later from the Socket listener
    const fetchCategories = async () => {
        try {
            const data = await productService.getCategoryStats();
            // [FIX] Filter out Best Sellers & New Arrivals from the Featured Grid
            const filtered = data.filter(c => !['Best Sellers', 'New Arrivals'].includes(c.name) && c.product_count > 0);
            setCategories(filtered);
        } catch (err) {
            console.error("Category load failed", err);
        } finally {
            setIsLoadingCats(false);
        }
    };

    // [FIX] Unified Parallel Data Loading
    useEffect(() => {
        const loadInitialData = async () => {
            // Start both requests in parallel
            await Promise.all([
                fetchHero(),
                fetchCategories()
            ]);
        };
        loadInitialData();
    }, [getSlides]);


    // 3. [NEW] Initial Load + Real-Time Sync
    useEffect(() => {
        // A. Load initially
        // fetchCategories();

        if (!socket) return;

        // B. Define Handler
        const handleCategoryRefresh = (payload) => {
            console.log("⚡ Syncing categories from Admin update...");
            productService.clearCache(); 
            fetchCategories();
        };

        // C. Listen
        socket.on('refresh:categories', handleCategoryRefresh);

        // D. Cleanup (Remove Listener ONLY)
        return () => {
            socket.off('refresh:categories', handleCategoryRefresh);
        };
    }, [socket]); // Depend on socket

    // [NEW] Mouse Move Logic for Info Section
    const infoSectionRef = useRef(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e) => {
        if (!infoSectionRef.current) return;
        const rect = infoSectionRef.current.getBoundingClientRect();
        setMousePos({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
    };

    return (
        <div className="space-y-16 pb-16">
            
            {/* HERO SECTION: Conditional Render */}
            {!isLoadingHero && slides.length > 0 ? (
                <CarouselHero slides={slides} />
            ) : (
                <StaticHero />
            )}

            {/* --- FEATURED CATEGORIES --- */}
            <section className="container mx-auto px-4">
                <div className="text-center mb-10">
                    <h2 className="text-3xl font-serif text-primary">Featured Categories</h2>
                    <p className="text-gray-500 mt-2">Explore our wide range of handcrafted collections</p>
                </div>
                
                {isLoadingCats ? (
                    // Skeleton Loader
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-40 bg-gray-100 rounded-2xl animate-pulse"></div>
                        ))}
                    </div>
                ) : (
                    // [UPDATED] Responsive Grid for 15+ items
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                        {categories.map((cat) => (
                            <Link 
                                key={cat.id} 
                                to={`/shop/${encodeURIComponent(cat.name)}`}
                                className="group cursor-pointer relative flex flex-col items-center text-center gap-3 p-4 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-xl hover:border-accent/30 transition-all duration-300 hover:-translate-y-1"
                            >
                                {/* Image Container */}
                                <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-gray-50 overflow-hidden border-2 border-white shadow-inner group-hover:scale-105 transition-transform duration-500 relative">
                                    {cat.image_url ? (
                                        <img 
                                            src={cat.image_url} 
                                            alt={cat.name} 
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-primary/20">
                                            <Folder size={32} />
                                        </div>
                                    )}
                                    {/* Overlay on Hover */}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-full"></div>
                                </div>

                                {/* Text Info */}
                                <div>
                                    <h3 className="font-bold text-gray-800 group-hover:text-primary transition-colors line-clamp-2 min-h-[3rem]">
                                        {cat.name}
                                    </h3>
                                    <p className="text-xs text-gray-400 mt-1 font-medium">
                                        {cat.product_count} items
                                    </p>
                                </div>
                            </Link>
                        ))}
                        
                        {/* Fallback if no categories */}
                        {categories.length === 0 && (
                            <div className="col-span-full py-10 text-center text-gray-400">
                                No categories available yet.
                            </div>
                        )}
                    </div>
                )}
            </section>

            {/* --- INFO DISPLAY GRID (Interactive Hover Effect) --- */}
            <section 
                ref={infoSectionRef}
                onMouseMove={handleMouseMove}
                className="relative py-16 overflow-hidden bg-gray-900"
            >
                {/* 1. Base Dark Background */}
                <div className="absolute inset-0 bg-[#111827] z-0"></div>

                {/* 2. Mouse Follower Gradient (Gold/Red Glow) */}
                <div 
                    className="absolute inset-0 z-0 transition-opacity duration-300 pointer-events-none"
                    style={{
                        background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(63, 19, 6, 0.5), transparent 40%)`
                    }}
                ></div>

                {/* Content Container */}
                <div className="container mx-auto px-4 relative z-10">
                    
                   {/* [NEW] Header with Logo & Title */}
                    <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-12 animate-fade-in">
                        <img 
                            src="../src/assets/logo_light.webp" 
                            alt="Logo" 
                            // [FIX] Increased mobile size to w-24 (96px) for better visibility
                            className="w-24 h-24 md:w-28 md:h-28 object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                        />
                        <h2 className="text-3xl md:text-4xl font-serif text-white text-center md:text-left">
                            Why Customers Trust us?
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
                        
                        {/* 1. Delivery */}
                        <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-6 rounded-2xl flex flex-col items-center text-center hover-glow group cursor-default max-w-xs mx-auto w-full transition-colors hover:bg-white/10 relative overflow-hidden">
                            {/* [NEW] Green Tick on Hover */}
                            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 p-1.5 bg-green-500/20 rounded-full">
                                <Check size={16} className="text-green-400" strokeWidth={3} />
                            </div>
                            
                            <div className="w-14 h-14 bg-primary/30 rounded-full flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
                                <Truck size={28} className="text-accent group-hover:scale-110 transition-transform duration-300" />
                            </div>
                            <h3 className="text-white font-bold text-lg mb-2">Pan India Delivery</h3>
                            <p className="text-gray-400 text-sm">Fast shipping across all pin codes</p>
                        </div>

                        {/* 2. Custom Designs */}
                        <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-6 rounded-2xl flex flex-col items-center text-center hover-glow group cursor-default max-w-xs mx-auto w-full transition-colors hover:bg-white/10 relative overflow-hidden">
                             {/* [NEW] Green Tick on Hover */}
                             <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 p-1.5 bg-green-500/20 rounded-full">
                                <Check size={16} className="text-green-400" strokeWidth={3} />
                            </div>

                            <div className="w-14 h-14 bg-primary/30 rounded-full flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
                                <PenTool size={28} className="text-accent group-hover:scale-110 transition-transform duration-300" />
                            </div>
                            <h3 className="text-white font-bold text-lg mb-2">Customized Designs</h3>
                            <p className="text-gray-400 text-sm">Tailored to your specific preference</p>
                        </div>

                        {/* 3. Warranty */}
                        <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-6 rounded-2xl flex flex-col items-center text-center hover-glow group cursor-default max-w-xs mx-auto w-full transition-colors hover:bg-white/10 relative overflow-hidden">
                             {/* [NEW] Green Tick on Hover */}
                             <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 p-1.5 bg-green-500/20 rounded-full">
                                <Check size={16} className="text-green-400" strokeWidth={3} />
                            </div>

                            <div className="w-14 h-14 bg-primary/30 rounded-full flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
                                <ShieldCheck size={28} className="text-accent group-hover:scale-110 transition-transform duration-300" />
                            </div>
                            <h3 className="text-white font-bold text-lg mb-2">12 Months Warranty</h3>
                            <p className="text-gray-400 text-sm">Upto 12 months polish warranty</p>
                        </div>

                        {/* 4. Material Quality */}
                        <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-6 rounded-2xl flex flex-col items-center text-center hover-glow group cursor-default max-w-xs mx-auto w-full transition-colors hover:bg-white/10 relative overflow-hidden">
                             {/* [NEW] Green Tick on Hover */}
                             <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 p-1.5 bg-green-500/20 rounded-full">
                                <Check size={16} className="text-green-400" strokeWidth={3} />
                            </div>

                            <div className="w-14 h-14 bg-primary/30 rounded-full flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
                                <Gem size={28} className="text-accent group-hover:scale-110 transition-transform duration-300" />
                            </div>
                            <h3 className="text-white font-bold text-lg mb-2">Premium Quality</h3>
                            <p className="text-gray-400 text-sm">High Quality Brass, Copper & Mixed Alloys</p>
                        </div>

                        {/* 5. Support */}
                        <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-6 rounded-2xl flex flex-col items-center text-center hover-glow group cursor-default max-w-xs mx-auto w-full transition-colors hover:bg-white/10 relative overflow-hidden">
                             {/* [NEW] Green Tick on Hover */}
                             <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 p-1.5 bg-green-500/20 rounded-full">
                                <Check size={16} className="text-green-400" strokeWidth={3} />
                            </div>

                            <div className="w-14 h-14 bg-primary/30 rounded-full flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
                                <Headphones size={28} className="text-accent group-hover:scale-110 transition-transform duration-300" />
                            </div>
                            <h3 className="text-white font-bold text-lg mb-2">Premium Support</h3>
                            <p className="text-gray-400 text-sm">Dedicated assistance for all your queries</p>
                        </div>

                    </div>
{/* [NEW] About Us Button */}
                    <div className="mt-12 text-center">
                        <Link 
                            to="/about"
                            // [FIX] Changed shadow to 'shadow-accent/50' (Gold) so it is visible against the dark background.
                            // This matches the Hero button's glow style.
                            className="inline-flex items-center gap-2 px-8 py-3 rounded-lg font-bold bg-white hover:bg-gray-100 text-primary hover:text-primary transition-all duration-300 transform hover:-translate-y-1 shadow-xl shadow-accent/40 hover:shadow-accent/10 mx-auto"
                        >
                            About Us <ArrowRight size={18} />
                        </Link>
                    </div>

                </div>
            </section>
        </div>
    );
}