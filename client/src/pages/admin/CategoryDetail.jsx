import { useState, useEffect, useRef } from 'react';
import { productService } from '../../services/productService';
import { ArrowLeft, Save, GripVertical, Trash2, Plus, X, Search, Check, Loader2, Edit3 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
// Add Modal to imports
import Modal from '../../components/Modal';
import CategoryModal from '../../components/CategoryModal';
export default function CategoryDetail({ categoryId, onBack }) {
    const [category, setCategory] = useState(null);
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditingName, setIsEditingName] = useState(false);
    const [newName, setNewName] = useState('');
    
    // Assign Modal State
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [allProducts, setAllProducts] = useState([]); // For search
    const [assignSearch, setAssignSearch] = useState('');
    // Custom Modal State
    const [modalConfig, setModalConfig] = useState({ 
        isOpen: false, type: 'delete', title: '', message: '', confirmText: '', targetId: null 
    });
    const [showEditModal, setShowEditModal] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState(null);
    const toast = useToast();

    useEffect(() => {
        loadData();
    }, [categoryId]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const data = await productService.getCategoryDetails(categoryId);
            setCategory(data);
            setProducts(data.products || []);
            setNewName(data.name);
        } catch (error) {
            toast.error("Failed to load category details");
        } finally {
            setIsLoading(false);
        }
    };

    // [NEW] Handle Category Update (Name + Image)
    const handleUpdateCategory = async (name, imageFile) => {
        setIsActionLoading(true);
        try {
            const formData = new FormData();
            formData.append('name', name);
            if (imageFile) formData.append('image', imageFile);

            await productService.updateCategory(categoryId, formData);
            
            // Refresh local data
            setCategory(prev => ({ 
                ...prev, 
                name: name,
                image_url: imageFile ? URL.createObjectURL(imageFile) : prev.image_url 
            }));
            
            toast.success("Category updated");
            setShowEditModal(false);
            productService.clearCache();
        } catch (error) {
            toast.error("Update failed");
        } finally {
            setIsActionLoading(false);
        }
    };

    // --- RENAME CATEGORY ---
    const handleRename = async () => {
        if (!newName.trim()) return;
        try {
            await productService.updateCategory(categoryId, newName);
            setCategory(prev => ({ ...prev, name: newName }));
            setIsEditingName(false);
            toast.success("Category renamed");
            productService.clearCache(); // Clear cache to refresh global lists
        } catch (error) {
            toast.error("Failed to rename");
        }
    };

    // --- DRAG AND DROP HANDLERS ---
    const handleDragStart = (index) => {
        setDraggedIndex(index);
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;
        
        // Reorder locally
        const newProducts = [...products];
        const draggedItem = newProducts[draggedIndex];
        newProducts.splice(draggedIndex, 1);
        newProducts.splice(index, 0, draggedItem);
        
        setDraggedIndex(index);
        setProducts(newProducts);
    };

    const handleDragEnd = async () => {
        setDraggedIndex(null);
        // Save new order to backend
        try {
            const productIds = products.map(p => p.id);
            await productService.reorderCategory(categoryId, productIds);
            // toast.success("Order saved"); // Optional: Silent save is better UX
        } catch (error) {
            toast.error("Failed to save order");
        }
    };

   // A. Open Remove Modal
    const openRemoveModal = (product) => {
        setModalConfig({
            isOpen: true,
            type: 'delete',
            title: 'Remove Product?',
            message: `Are you sure you want to remove "${product.title}" from this category?`,
            confirmText: 'Remove',
            targetId: product.id
        });
    };

    // B. Handle Confirmation (Actual Logic)
    const handleModalConfirm = async () => {
        setIsActionLoading(true);
        try {
            if (modalConfig.type === 'delete') {
                // Call API
                await productService.manageCategoryProduct(categoryId, modalConfig.targetId, 'remove');
                
                // Update UI State
                setProducts(prev => prev.filter(p => p.id !== modalConfig.targetId));
                toast.success("Product removed");
                
                // Sync Cache
                productService.clearCache();
            }
            // Close Modal
            setModalConfig({ ...modalConfig, isOpen: false });
        } catch (error) {
            toast.error("Failed to remove product");
        } finally {
            setIsActionLoading(false);
        }
    };

    // --- ASSIGN PRODUCT ---
    const handleAssign = async (product) => {
        try {
            await productService.manageCategoryProduct(categoryId, product.id, 'add');
            toast.success("Product added");
            
            // [NEW] Clear cache so Product List updates
            productService.clearCache();
            
            loadData(); 
            setIsAssignModalOpen(false);
        } catch (error) {
            toast.error("Failed to add product");
        }
    };

    // --- ASSIGN PRODUCT ---
    const openAssignModal = async () => {
        setIsAssignModalOpen(true);
        // Fetch all products to search (Simple approach for now)
        const res = await productService.getProducts(1, 'all', 'active'); // Fetch page 1 or implement a specific search API
        // For better UX, you might want a specific 'searchProducts' API endpoint
        setAllProducts(res.products || []); 
    };
   

    if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-accent w-10 h-10" /></div>;

    return (
        <div className="animate-fade-in space-y-6">
            {/* 1. Render Custom Modal */}
            {/* [NEW] Edit Modal */}
            <CategoryModal 
                isOpen={showEditModal}
                onClose={() => setShowEditModal(false)}
                onConfirm={handleUpdateCategory}
                isLoading={isActionLoading}
                initialData={category} // Pre-fill data
            />
            <Modal 
                isOpen={modalConfig.isOpen}
                onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
                onConfirm={handleModalConfirm}
                title={modalConfig.title}
                message={modalConfig.message}
                confirmText={modalConfig.confirmText}
                type={modalConfig.type}
                isLoading={isActionLoading}
            />
            {/* --- HEADER --- */}
            <div className="flex items-center gap-4 border-b border-gray-200 pb-4">
                <button onClick={onBack} className="p-2 hover:bg-white rounded-lg text-gray-500 transition-colors">
                    <ArrowLeft size={24} />
                </button>
                
                <div className="flex-1 flex items-center gap-4">
                    {/* [NEW] Header Image */}
                    <div className="w-16 h-16 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden shrink-0">
                        {category?.image_url && <img src={category.image_url} className="w-full h-full object-cover" />}
                    </div>
                    
                    <div>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Category</p>
                        <div className="flex items-center gap-3 group">
                            <h1 className="text-3xl font-serif font-bold text-gray-800">{category?.name}</h1>
                            <button 
                                onClick={() => setShowEditModal(true)}
                                className="p-1.5 rounded-lg bg-gray-50 text-gray-400 hover:text-primary hover:bg-white border border-transparent hover:border-gray-200 transition-all"
                            >
                                <Edit3 size={16} />
                            </button>
                        </div>
                    </div>
                </div>
                
                <button onClick={openAssignModal} className="bg-white border border-gray-200 text-primary font-bold px-4 py-2 rounded-lg flex items-center gap-2 hover:border-primary transition-colors">
                    <Plus size={18} /> Assign products
                </button>
            </div>

            {/* --- PRODUCT GRID (DRAG & DROP) --- */}
            <div className="space-y-4">
                <p className="text-sm text-gray-500">
                    Use drag & drop to change the order of products. Changes are saved automatically.
                </p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {products.map((product, index) => (
                        <div 
                            key={product.id}
                            draggable
                            onDragStart={() => handleDragStart(index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                            className={`bg-white rounded-xl border border-gray-200 p-3 shadow-sm flex flex-col gap-3 group transition-all 
                            ${draggedIndex === index ? 'opacity-50 scale-95 border-accent' : 'hover:shadow-md'}`}
                        >
                            <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden">
                                {product.media && product.media[0] ? (
                                    <img src={product.media[0].url} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-300">No Image</div>
                                )}
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                    onClick={() => openRemoveModal(product)} // <--- CHANGED THIS
                                    className="p-1.5 bg-white text-red-500 rounded-md shadow-sm hover:bg-red-50"
                                    title="Remove from category"
                                >
                                    <Trash2 size={14} />
                                </button>
                                </div>
                                <div className="absolute top-2 left-2 cursor-grab active:cursor-grabbing p-1 bg-white/80 rounded backdrop-blur-sm text-gray-500">
                                    <GripVertical size={14} />
                                </div>
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-800 text-sm line-clamp-1">{product.title}</h4>
                                <p className="text-xs text-gray-500">{product.sku}</p>
                            </div>
                        </div>
                    ))}
                    {products.length === 0 && (
                        <div className="col-span-full py-12 text-center bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-400">
                            No products in this category yet.
                        </div>
                    )}
                </div>
            </div>

            {/* --- ASSIGN MODAL --- */}
            {isAssignModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl p-6 space-y-4 animate-in zoom-in-95">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold font-serif text-gray-800">Assign Products</h3>
                            <button onClick={() => setIsAssignModalOpen(false)}><X size={20} className="text-gray-400" /></button>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-3 top-3 text-gray-400 w-4 h-4" />
                            <input 
                                value={assignSearch} 
                                onChange={e => setAssignSearch(e.target.value)}
                                placeholder="Search products..." 
                                className="w-full pl-9 p-2 rounded-lg border border-gray-200 outline-none focus:border-accent"
                                autoFocus
                            />
                        </div>
                        <div className="max-h-60 overflow-y-auto space-y-1">
                            {allProducts
                                .filter(p => !products.some(exist => exist.id === p.id)) // Exclude already assigned
                                .filter(p => p.title.toLowerCase().includes(assignSearch.toLowerCase()))
                                .map(product => (
                                    <button 
                                        key={product.id} 
                                        onClick={() => handleAssign(product)}
                                        className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors text-left"
                                    >
                                        <div className="w-10 h-10 bg-gray-100 rounded overflow-hidden">
                                            {product.media && product.media[0] && <img src={product.media[0].url} className="w-full h-full object-cover" />}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-gray-800 line-clamp-1">{product.title}</p>
                                            <p className="text-xs text-gray-500">{product.sku}</p>
                                        </div>
                                        <Plus size={16} className="text-gray-400" />
                                    </button>
                                ))
                            }
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Helper Icon
function PencilIcon(props) {
    return (
        <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
    );
}