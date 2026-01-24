import { Link } from 'react-router-dom';

export default function Home() {
    return (
        <div className="space-y-16 pb-16">
            
            {/* --- HERO SECTION --- */}
            <section className="relative h-[80vh] flex items-center justify-center bg-primary overflow-hidden">
                {/* Background Pattern (Optional) */}
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

            {/* --- FEATURED SECTION (Placeholder) --- */}
            <section className="container mx-auto px-4">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-serif text-primary">Featured Categories</h2>
                    <p className="text-gray-500">Curated selections just for you</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Placeholder Cards */}
                    {[1, 2, 3].map((item) => (
                        <div key={item} className="h-64 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center text-gray-400">
                            Category Preview {item}
                        </div>
                    ))}
                </div>
            </section>

        </div>
    );
}