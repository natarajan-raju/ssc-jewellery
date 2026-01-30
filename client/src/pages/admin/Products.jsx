import { useEffect, useState } from 'react';
import { productService } from '../../services/productService';
import { 
    Loader2, Search, Plus, Package, 
    ChevronLeft, ChevronRight, Edit3, Trash2, Eye, EyeOff, Filter,
    Infinity as InfinityIcon, AlertTriangle, X
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import AddProductModal from '../../components/AddProductModal';

export default function Products({ onNavigate }) {
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Pagination & Filters
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [categories, setCategories] = useState([]); // <--- New State

    // Modals State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [productToDelete, setProductToDelete] = useState(null); // For Delete Confirmation
    const toast = useToast();

    // --- FETCH CATEGORIES FOR FILTER ---
    useEffect(() => {
        productService.getCategories()
            .then(data => setCategories(data))
            .catch(err => console.error("Failed to load categories", err));
    }, []);

    // --- DATA LOADING ---
    useEffect(() => {
        loadProducts();
    }, [page, filterCategory, filterStatus]);

    const loadProducts = async () => {
        setIsLoading(true);
        try {
            const data = await productService.getProducts(page, filterCategory, filterStatus);
            setProducts(data.products || []);
            setTotalPages(data.totalPages || 1);
        } catch (error) {
            toast.error("Failed to load products");
        } finally {
            setIsLoading(false);
        }
    };

    // --- HANDLERS ---
    const handleSaveProduct = async (formData, id) => {
        try {
            if (id) {
                await productService.updateProduct(id, formData);
                toast.success("Product updated successfully!");
            } else {
                await productService.createProduct(formData);
                toast.success("Product created successfully!");
            }
            productService.clearCache();
            loadProducts();
        } catch (error) {
            throw error;
        }
    };

    // Open Delete Confirmation Modal
    const initiateDelete = (product) => {
        setProductToDelete(product);
    };

    // Confirm Delete Action
    const confirmDelete = async () => {
        if (!productToDelete) return;
        try {
            await productService.deleteProduct(productToDelete.id);
            toast.success(`"${productToDelete.title}" has been deleted.`);
            productService.clearCache();
            loadProducts();
        } catch (error) {
            toast.error("Failed to delete product.");
        } finally {
            setProductToDelete(null); // Close modal
        }
    };

    const openEditModal = (product) => {
        setEditingProduct(product);
        setIsAddModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsAddModalOpen(false);
        setEditingProduct(null);
    };

    // --- SEARCH FILTER ---
    const filteredProducts = products.filter(p => 
        p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="animate-fade-in space-y-6 relative">
            {/* --- ADD/EDIT MODAL --- */}
            <AddProductModal 
                isOpen={isAddModalOpen} 
                onClose={handleCloseModal} 
                onConfirm={handleSaveProduct}
                productToEdit={editingProduct}
            />

            {/* --- DELETE CONFIRMATION MODAL --- */}
            {productToDelete && (
                 <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
                     <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 animate-in zoom-in-95">
                         <div className="flex items-center gap-4 mb-4">
                             <div className="p-3 bg-red-100 text-red-600 rounded-full">
                                 <AlertTriangle size={24} />
                             </div>
                             <div>
                                 <h3 className="text-lg font-bold text-gray-800">Delete Product?</h3>
                                 <p className="text-sm text-gray-500">This action cannot be undone.</p>
                             </div>
                         </div>
                         <p className="text-gray-600 mb-6">
                             Are you sure you want to delete <span className="font-bold">"{productToDelete.title}"</span>?
                         </p>
                         <div className="flex justify-end gap-3">
                             <button onClick={() => setProductToDelete(null)} className="px-4 py-2 rounded-xl font-bold text-gray-500 hover:bg-gray-50">Cancel</button>
                             <button onClick={confirmDelete} className="px-4 py-2 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700">Delete</button>
                         </div>
                     </div>
                 </div>
            )}

            {/* --- HEADER & ACTIONS --- */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-serif font-bold text-gray-800">Products</h1>
                    <p className="text-gray-500 text-sm mt-1">Manage your catalogue</p>
                </div>
                
                <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                    <div className="relative hidden md:block">
                        <Filter className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                        <select 
                            value={filterStatus}
                            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                            className="pl-10 pr-8 py-3 bg-white rounded-xl border border-gray-200 shadow-sm focus:border-accent outline-none appearance-none cursor-pointer"
                        >
                            <option value="all">All Status</option>
                            <option value="active">Active</option>
                            <option value="inactive">Hidden</option>
                        </select>
                    </div>
                    {/* [NEW] Mobile-Only Category Link */}
                    <div className="relative flex-1 md:hidden">
                        <button 
                            onClick={() => onNavigate('categories')}
                            className="md:hidden text-xs w-full font-bold text-accent-deep bg-accent/10 pl-10 pr-8 py-3 rounded-lg border border-accent/20 active:scale-95 transition-transform"
                        >
                            Manage Categories →
                        </button>
                    </div>
                    {/* --- CATEGORY FILTER --- */}
                    <div className="relative flex-1 md:w-64">
                        <Filter className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                        <select 
                            value={filterCategory}
                            onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
                            className="w-full pl-10 pr-8 py-3 bg-white rounded-xl border border-gray-200 shadow-sm focus:border-accent outline-none appearance-none cursor-pointer md:max-w-[200px]"
                        >
                            <option value="all">All Categories</option>
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>

                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                        <input 
                            placeholder="Search products..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-gray-200 shadow-sm focus:border-accent outline-none"
                        />
                    </div>
                    <button 
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-primary hover:bg-primary-light text-accent font-bold px-6 py-3 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                        <Plus size={20} strokeWidth={3} />
                        <span className="whitespace-nowrap">Add Product</span>
                    </button>
                </div>
            </div>

            {/* --- LIST VIEW --- */}
            {isLoading ? (
                <div className="flex justify-center py-20"><Loader2 className="animate-spin text-accent w-10 h-10" /></div>
            ) : products.length > 0 ? (
                <>
                    {/* 1. MOBILE LIST (Card View) */}
                    <div className="grid grid-cols-1 gap-4 md:hidden">
                        {filteredProducts.map(product => {
                            // --- 1. CALCULATE PRICE DISPLAY (Same as Desktop) ---
                            let priceDisplay;
                            if (product.variants && product.variants.length > 1) { // FIX: Only range if >1 variant
                                const prices = product.variants.map(v => Number(v.discount_price || v.price || 0));
                                const minPrice = Math.min(...prices);
                                const maxPrice = Math.max(...prices);
                                priceDisplay = minPrice === maxPrice 
                                    ? `₹${minPrice}` 
                                    : `₹${minPrice} - ₹${maxPrice}`;
                            } else {
                                priceDisplay = `₹${product.discount_price || product.mrp}`;
                            }

                            // --- 2. INACTIVE STATUS VISUALS ---
                            const isInactive = product.status !== 'active';
                            const cardClasses = isInactive 
                                ? "p-4 bg-gray-50 rounded-xl shadow-sm border border-gray-100 flex gap-4 grayscale opacity-80" 
                                : "p-4 bg-white rounded-xl shadow-sm border border-gray-100 flex gap-4";

                            // --- 3. ROBUST TRACKING CHECK ---
                            const isTracked = String(product.track_quantity) === '1' || String(product.track_quantity) === 'true' || product.track_quantity === true;

                            return (
                                <div key={product.id} className={cardClasses}>
                                    {/* Image */}
                                    <div className="w-20 h-24 rounded-lg bg-gray-100 overflow-hidden shrink-0 relative border border-gray-200">
                                        {product.media && product.media.find(m => m.type === 'image') ? (
                                            <img src={product.media.find(m => m.type === 'image').url} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-300"><Package size={20}/></div>
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 flex flex-col justify-between">
                                        <div>
                                            <div className="flex justify-between items-start">
                                                <h3 className="font-bold text-gray-800 line-clamp-1 mr-2">{product.title}</h3>
                                                {/* Status Badge */}
                                                {isInactive ? (
                                                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-600 uppercase tracking-wide">Hidden</span>
                                                ) : (
                                                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 uppercase tracking-wide">Active</span>
                                                )}
                                            </div>
                                            
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-primary font-bold">{priceDisplay}</span>
                                            </div>
                                            
                                            {/* Stock Summary */}
                                            {isTracked && (
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {product.variants?.length > 0 
                                                        ? `${product.variants.reduce((acc, v) => {
                                                            const vTracked = String(v.track_quantity) === '1' || String(v.track_quantity) === 'true' || v.track_quantity === true;
                                                            return acc + (vTracked ? Number(v.quantity || 0) : 0);
                                                        }, 0)} units`
                                                        : `${product.quantity || 0} units`
                                                    }
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex justify-end gap-2 mt-2">
                                            <button onClick={() => openEditModal(product)} className="p-2 bg-gray-50 rounded-lg text-gray-600 hover:text-accent-deep"><Edit3 size={16}/></button>
                                            <button onClick={() => initiateDelete(product)} className="p-2 bg-red-50 rounded-lg text-red-500 hover:bg-red-100"><Trash2 size={16}/></button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* 2. DESKTOP LIST (Table View) */}
                    <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Product</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Price</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Stock</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredProducts.map((product) => {
                                    // --- 1. ROBUST PRICE DISPLAY ---
                                    let priceDisplay;
                                    if (product.variants && product.variants.length > 1) { // FIX: Only range if >1 variant
                                        const prices = product.variants.map(v => Number(v.discount_price || v.price || 0));
                                        const minPrice = Math.min(...prices);
                                        const maxPrice = Math.max(...prices);
                                        priceDisplay = minPrice === maxPrice 
                                            ? `₹${minPrice}` 
                                            : `₹${minPrice} - ₹${maxPrice}`;
                                    } else {
                                        priceDisplay = `₹${product.discount_price || product.mrp}`;
                                    }

                                    // --- 2. ROBUST TRACKING CHECK ---
                                    const isTracked = String(product.track_quantity) === '1' || String(product.track_quantity) === 'true' || product.track_quantity === true;

                                    // --- 3. STOCK DISPLAY LOGIC ---
                                    let stockDisplay;
                                    if (product.variants && product.variants.length > 0) {
                                        const isAnyVariantTracked = product.variants.some(v => String(v.track_quantity) === '1' || String(v.track_quantity) === 'true' || v.track_quantity === true);
                                        
                                        if (isAnyVariantTracked) {
                                            const totalStock = product.variants.reduce((sum, v) => {
                                                const vTracked = String(v.track_quantity) === '1' || String(v.track_quantity) === 'true' || v.track_quantity === true;
                                                return sum + (vTracked ? (Number(v.quantity) || 0) : 0);
                                            }, 0);
                                            stockDisplay = (
                                                <div className="text-sm font-medium text-gray-600">
                                                    {totalStock} units <span className="text-xs text-gray-400">(Total)</span>
                                                </div>
                                            );
                                        } else {
                                            stockDisplay = (
                                                <div className="flex items-center gap-1 text-gray-400">
                                                    <InfinityIcon size={18} /> <span className="text-xs">Unlimited</span>
                                                </div>
                                            );
                                        }
                                    } else {
                                        // Single Product
                                        stockDisplay = isTracked ? (
                                            <div className={`text-sm font-medium ${product.quantity <= (product.low_stock_threshold || 0) ? 'text-red-500' : 'text-gray-600'}`}>
                                                {product.quantity} units
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1 text-gray-400">
                                                <InfinityIcon size={18} /> <span className="text-xs">Untracked</span>
                                            </div>
                                        );
                                    }

                                    // --- 4. ROW CLASSES (Grayscale) ---
                                    const isInactive = product.status !== 'active';
                                    const rowClasses = isInactive 
                                        ? "hover:bg-gray-50/50 transition-colors group grayscale opacity-75 bg-gray-50" 
                                        : "hover:bg-gray-50/50 transition-colors group";

                                    return (
                                        <tr key={product.id} className={rowClasses}>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden shrink-0 border border-gray-200">
                                                        {product.media && product.media.find(m => m.type === 'image') ? (
                                                            <img src={product.media.find(m => m.type === 'image').url} className="w-full h-full object-cover" alt="" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-gray-300"><Package size={20}/></div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-gray-800 text-sm">{product.title}</h3>
                                                        <p className="text-xs text-gray-500 line-clamp-1 max-w-[200px]">{product.sku || 'No SKU'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-gray-900">{priceDisplay}</span>
                                                </div>
                                            </td>
                                            
                                            <td className="px-6 py-4">
                                                {stockDisplay}
                                            </td>
                                            
                                            <td className="px-6 py-4">
                                                {product.status === 'active' ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"><Eye size={12}/> Active</span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"><EyeOff size={12}/> Hidden</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2 opacity-100 ">
                                                    <button onClick={() => openEditModal(product)} className="p-2 text-gray-400 hover:text-accent-deep hover:bg-amber-50 rounded-lg transition-colors"><Edit3 size={18} /></button>
                                                    <button onClick={() => initiateDelete(product)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    
                     {/* --- PAGINATION --- */}
                     {products.length > 0 && (
                        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-6 border-t border-gray-200 mt-4">
                            <p className="text-sm text-gray-500 font-medium order-2 md:order-1">
                                Page <span className="text-primary font-bold">{page}</span> of {totalPages}
                            </p>
                            <div className="flex gap-3 order-1 md:order-2">
                                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-white disabled:opacity-50 text-sm font-bold bg-gray-50">
                                    <ChevronLeft size={18} /> Prev
                                </button>
                                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-white disabled:opacity-50 text-sm font-bold bg-gray-50">
                                    Next <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    )}
                </>
            ) : (// --- EMPTY STATE ILLUSTRATION ---
                <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
                    <img 
                        src="/product_add.svg" 
                        alt="No products" 
                        className="w-48 h-48 md:w-64 md:h-64 mb-6 opacity-90"
                    />
                    <h3 className="text-xl font-bold text-gray-800 mb-2">No products yet</h3>
                    <p className="text-gray-500 text-center max-w-md mb-6">
                        Get started by adding your first product to the inventory.
                    </p>
                    <button 
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-primary hover:bg-primary-light text-accent font-bold px-6 py-3 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                        <Plus size={20} strokeWidth={3} />
                        <span>Add First Product</span>
                    </button>
                </div>)}
        </div>
    );
}