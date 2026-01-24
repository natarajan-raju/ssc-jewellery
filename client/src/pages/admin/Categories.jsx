import { useState, useEffect } from 'react';
import { productService } from '../../services/productService';
import { Plus, Search, Folder, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/Modal'; 
import CategoryDetail from './CategoryDetail'; // We will create this next

export default function Categories() {
    const [view, setView] = useState('list'); // 'list' or 'detail'
    const [selectedCategoryId, setSelectedCategoryId] = useState(null);
    
    const [categories, setCategories] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    // 2. Add Modal State (Copied pattern from Customers.jsx)
    const [modalConfig, setModalConfig] = useState({ 
        isOpen: false, type: 'default', title: '', message: '', targetId: null 
    });
    const [isActionLoading, setIsActionLoading] = useState(false);
    const toast = useToast();

    // Load Stats
    useEffect(() => {
        if (view === 'list') loadCategories();
    }, [view]);

    const loadCategories = async () => {
        setIsLoading(true);
        try {
            const data = await productService.getCategoryStats();
            setCategories(data);
        } catch (error) {
            toast.error("Failed to load categories");
        } finally {
            setIsLoading(false);
        }
    };

    // --- HANDLERS ---
    
    // A. Open Create Modal
    const openCreateModal = () => {
        setModalConfig({
            isOpen: true,
            type: 'create', // Changed from 'input' to 'create'
            title: 'Create Category',
            message: 'Enter the name for the new category:',
            confirmText: 'Create Category', // [NEW] Custom Button Text
            targetId: null
        });
    };

   // B. Open Delete Modal
    const openDeleteModal = (e, category) => {
        e.stopPropagation();
        setModalConfig({
            isOpen: true,
            type: 'delete',
            title: 'Delete Category?',
            message: `Are you sure you want to delete "${category.name}"? Products inside will be untagged, not deleted.`,
            confirmText: 'Delete', // [NEW] Overrides "Delete User"
            targetId: category.id
        });
    };

    // C. Confirm Action (Called by Modal)
    const handleModalConfirm = async (inputValue) => {
        setIsActionLoading(true);
        try {
            if (modalConfig.type === 'input' || modalConfig.type === 'create') {
                if (!inputValue || !inputValue.trim()) {
                    toast.error("Category name required");
                    setIsActionLoading(false); return;
                }
                await productService.createCategory(inputValue);
                toast.success("Category created");
                loadCategories(); // Refresh list
            } 
            else if (modalConfig.type === 'delete') {
                await productService.deleteCategory(modalConfig.targetId);
                toast.success("Category deleted");
                loadCategories(); // Refresh list
            }
            setModalConfig({ ...modalConfig, isOpen: false });
        } catch (error) {
            toast.error(error.message || "Action failed");
        } finally {
            setIsActionLoading(false);
        }
    };

    const openCategory = (id) => {
        setSelectedCategoryId(id);
        setView('detail');
    };

    // --- VIEW SWITCHER ---
    if (view === 'detail') {
        return <CategoryDetail categoryId={selectedCategoryId} onBack={() => setView('list')} />;
    }

    // --- LIST VIEW ---
    const filtered = categories.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="animate-fade-in space-y-6">
            {/* 1. Render Custom Modal */}
            <Modal 
                isOpen={modalConfig.isOpen}
                onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
                onConfirm={handleModalConfirm}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                isLoading={isActionLoading}
            />
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-serif font-bold text-gray-800">Categories</h1>
                    <p className="text-gray-500 text-sm mt-1">Manage product organization</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                        <input 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search categories..." 
                            className="pl-10 pr-4 py-3 bg-white rounded-xl border border-gray-200 shadow-sm focus:border-accent outline-none w-64"
                        />
                    </div>
                    <button 
                        onClick={openCreateModal} 
                        className="bg-primary hover:bg-primary-light text-accent px-4 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-all"
                    >
                        <Plus size={20} strokeWidth={3} /> 
                        <span>New</span>
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20"><Loader2 className="animate-spin text-accent w-10 h-10" /></div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(cat => (
                        <div 
                            key={cat.id} 
                            onClick={() => openCategory(cat.id)}
                            className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-accent transition-all cursor-pointer group"
                        >
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-gray-50 rounded-lg text-primary group-hover:bg-accent group-hover:text-primary transition-colors">
                                        <Folder size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-800 text-lg">{cat.name}</h3>
                                        <p className="text-sm text-gray-500">{cat.product_count} products</p>
                                    </div>
                                </div>
                                {/* 3. Delete Button (Stops propagation to avoid opening detail) */}
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={(e) => openDeleteModal(e, cat)}
                                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Delete Category"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                    <ChevronRight className="text-gray-300 group-hover:text-primary" />
                                </div>
                            </div>
                        </div>
                    ))}
                    {filtered.length === 0 && (
                        <div className="col-span-full text-center py-10 text-gray-400">
                            No categories found. Add tags to products to create them.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}