import { useEffect, useState } from 'react';
import { productService } from '../../services/productService';
import { 
    Loader2, Search, Plus, Package, 
    ChevronLeft, ChevronRight, Edit3, Trash2, Eye, EyeOff, Filter,
    Infinity as InfinityIcon, AlertTriangle, X
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import AddProductModal from '../../components/AddProductModal';

export default function Products() {
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Pagination & Filters
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    // Modals State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [productToDelete, setProductToDelete] = useState(null); // For Delete Confirmation
    const toast = useToast();

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

            {/* --- DELETE CONFIRMATION MODAL (Custom UI) --- */}
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
            ) : (
                <>
                    {/* 1. MOBILE LIST (Card View) */}
                    <div className="grid grid-cols-1 gap-4 md:hidden">
                        {filteredProducts.map(product => (
                            <div key={product.id} className="p-4 bg-white rounded-xl shadow-sm border border-gray-100 flex gap-4">
                                <div className="w-20 h-24 rounded-lg bg-gray-100 overflow-hidden shrink-0 relative border border-gray-200">
                                    {product.media && product.media.find(m => m.type === 'image') ? (
                                        <img src={product.media.find(m => m.type === 'image').url} className="w-full h-full object-cover" alt="" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-300"><Package size={20}/></div>
                                    )}
                                </div>
                                <div className="flex-1 flex flex-col justify-between">
                                    <div>
                                        <h3 className="font-bold text-gray-800 line-clamp-1">{product.title}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-primary font-bold">₹{product.discount_price || product.mrp}</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2 mt-2">
                                        <button onClick={() => openEditModal(product)} className="p-2 bg-gray-50 rounded-lg text-gray-600 hover:text-accent-deep"><Edit3 size={16}/></button>
                                        <button onClick={() => initiateDelete(product)} className="p-2 bg-red-50 rounded-lg text-red-500 hover:bg-red-100"><Trash2 size={16}/></button>
                                    </div>
                                </div>
                            </div>
                        ))}
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
                                {filteredProducts.map((product) => (
                                    <tr key={product.id} className="hover:bg-gray-50/50 transition-colors group">
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
                                                <span className="font-bold text-gray-900">₹{product.discount_price || product.mrp}</span>
                                            </div>
                                        </td>
                                        
                                        {/* --- UPDATED STOCK COLUMN --- */}
                                        <td className="px-6 py-4">
                                            {product.track_quantity ? (
                                                <div className={`text-sm font-medium ${product.quantity <= (product.low_stock_threshold || 0) ? 'text-red-500' : 'text-gray-600'}`}>
                                                    {product.quantity} units
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1 text-gray-400">
                                                    <InfinityIcon size={18} />
                                                    <span className="text-xs">Untracked</span>
                                                </div>
                                            )}
                                        </td>
                                        
                                        <td className="px-6 py-4">
                                            {product.status === 'active' ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"><Eye size={12}/> Active</span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"><EyeOff size={12}/> Hidden</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => openEditModal(product)} className="p-2 text-gray-400 hover:text-accent-deep hover:bg-amber-50 rounded-lg transition-colors"><Edit3 size={18} /></button>
                                                <button onClick={() => initiateDelete(product)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
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
            )}
        </div>
    );
}