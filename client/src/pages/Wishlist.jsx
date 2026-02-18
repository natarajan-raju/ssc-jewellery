import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';
import { productService } from '../services/productService';
import { useSocket } from '../context/SocketContext';
import ProductCard from '../components/ProductCard';
import wishlistIllustration from '../assets/wishlist.svg';

export default function Wishlist() {
    const { user, loading } = useAuth();
    const { wishlist, loading: wishlistLoading } = useWishlist();
    const { socket } = useSocket();
    const navigate = useNavigate();
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            navigate('/login?redirect=%2Fwishlist', { replace: true });
        }
        if (!loading && user && user.role === 'admin') {
            navigate('/admin/dashboard', { replace: true });
        }
    }, [loading, navigate, user]);

    useEffect(() => {
        let cancelled = false;

        const loadWishlistProducts = async () => {
            if (!wishlist.length) {
                setProducts([]);
                return;
            }

            setIsLoading(true);
            try {
                const responses = await Promise.all(
                    wishlist.map((productId) => productService.getProduct(productId).catch(() => null))
                );
                if (!cancelled) {
                    setProducts(responses.filter(Boolean));
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        loadWishlistProducts();
        return () => {
            cancelled = true;
        };
    }, [wishlist]);

    useEffect(() => {
        if (!socket) return;

        const handleProductUpdate = (updated = {}) => {
            const updatedId = String(updated?.id || '').trim();
            if (!updatedId) return;
            setProducts((prev) => prev.map((item) => (
                String(item?.id || '').trim() === updatedId ? { ...item, ...updated } : item
            )));
        };

        const handleProductDelete = ({ id } = {}) => {
            const deletedId = String(id || '').trim();
            if (!deletedId) return;
            setProducts((prev) => prev.filter((item) => String(item?.id || '').trim() !== deletedId));
        };

        socket.on('product:update', handleProductUpdate);
        socket.on('product:delete', handleProductDelete);

        return () => {
            socket.off('product:update', handleProductUpdate);
            socket.off('product:delete', handleProductDelete);
        };
    }, [socket]);

    if (!user) return null;

    return (
        <div className="min-h-screen bg-secondary">
            <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 md:py-12">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                            <Heart size={20} />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-serif text-primary">My Wishlist</h1>
                            <p className="text-sm text-gray-500 mt-0.5">{wishlist.length} saved items</p>
                        </div>
                    </div>
                </div>

                {isLoading || wishlistLoading ? (
                    <div className="mt-8 text-sm text-gray-500">Loading wishlist...</div>
                ) : products.length === 0 ? (
                    <div className="mt-8 bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
                        <img
                            src={wishlistIllustration}
                            alt="Wishlist empty"
                            className="mx-auto w-40 md:w-48"
                        />
                        <p className="text-lg font-semibold text-gray-800 mt-5">Your wishlist is empty</p>
                        <p className="text-sm text-gray-500 mt-2">Discover beautiful picks and add your favorites for later.</p>
                        <Link
                            to="/shop"
                            className="inline-flex items-center justify-center rounded-xl border border-gray-200 text-primary font-semibold px-5 py-2.5 hover:bg-primary/5 transition-colors mt-5"
                        >
                            Shop Now
                        </Link>
                    </div>
                ) : (
                    <div className="mt-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                        {products.map((product) => (
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
