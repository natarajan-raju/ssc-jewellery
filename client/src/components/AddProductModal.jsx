import { useState, useEffect, useRef } from 'react';
import { X, Upload, Youtube, Image as ImageIcon, Trash2, GripVertical, CheckSquare, Square } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export default function AddProductModal({ isOpen, onClose, onConfirm, productToEdit = null }) {
    if (!isOpen) return null;

    const [activeTab, setActiveTab] = useState('details');
    const [isLoading, setIsLoading] = useState(false);
    const toast = useToast();
    
    // Form State
    const [formData, setFormData] = useState({
        title: '', subtitle: '', description: '', mrp: '', discount_price: '',
        ribbon_tag: '', sku: '', weight_kg: '', status: 'active',
        track_quantity: false, quantity: 0, track_low_stock: false, low_stock_threshold: 0
    });

    const [mediaItems, setMediaItems] = useState([]); 
    const [showYoutubeInput, setShowYoutubeInput] = useState(false);
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const fileInputRef = useRef(null);
    const [draggedItemIndex, setDraggedItemIndex] = useState(null);

    // --- POPULATE FORM ON EDIT ---
    useEffect(() => {
        if (productToEdit) {
            setFormData({
                title: productToEdit.title || '',
                subtitle: productToEdit.subtitle || '',
                description: productToEdit.description || '',
                mrp: productToEdit.mrp || '',
                discount_price: productToEdit.discount_price || '',
                ribbon_tag: productToEdit.ribbon_tag || '',
                sku: productToEdit.sku || '',
                weight_kg: productToEdit.weight_kg || '',
                status: productToEdit.status || 'active',
                track_quantity: !!productToEdit.track_quantity,
                quantity: productToEdit.quantity || 0,
                track_low_stock: !!productToEdit.track_low_stock,
                low_stock_threshold: productToEdit.low_stock_threshold || 0
            });

            if (productToEdit.media) {
                const formattedMedia = productToEdit.media.map(m => ({
                    ...m, id: Math.random().toString(36), isExisting: true
                }));
                setMediaItems(formattedMedia);
            }
        } else {
            // Reset for Add Mode
            setFormData({
                title: '', subtitle: '', description: '', mrp: '', discount_price: '',
                ribbon_tag: '', sku: '', weight_kg: '', status: 'active',
                track_quantity: false, quantity: 0, track_low_stock: false, low_stock_threshold: 0
            });
            setMediaItems([]);
        }
    }, [productToEdit, isOpen]);

    const handleChange = (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setFormData(prev => {
            const newData = { ...prev, [e.target.name]: value };
            // Reset dependent fields if main toggle is turned off
            if (e.target.name === 'track_quantity' && !value) {
                newData.track_low_stock = false;
            }
            return newData;
        });
    };

    // --- MEDIA HANDLERS (Same as before) ---
    const handleImageUpload = (e) => {
        const files = Array.from(e.target.files);
        const newMedia = files.map(file => ({
            id: Math.random().toString(36), type: 'image', file: file, url: URL.createObjectURL(file), isNew: true
        }));
        setMediaItems([...mediaItems, ...newMedia]);
    };

    const handleAddYoutube = () => {
        if (!youtubeUrl) return;
        setMediaItems([...mediaItems, {
            id: Math.random().toString(36), type: 'youtube', url: youtubeUrl, isNew: true
        }]);
        setYoutubeUrl('');
        setShowYoutubeInput(false);
    };

    const handleDragStart = (index) => setDraggedItemIndex(index);
    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (draggedItemIndex === null || draggedItemIndex === index) return;
        const newItems = [...mediaItems];
        const draggedItem = newItems[draggedItemIndex];
        newItems.splice(draggedItemIndex, 1);
        newItems.splice(index, 0, draggedItem);
        setDraggedItemIndex(index);
        setMediaItems(newItems);
    };
    const handleDragEnd = () => setDraggedItemIndex(null);

    // --- SUBMIT ---
    const handleSubmit = async () => {
        if (!formData.title || !formData.mrp) {
            toast.error("Title and MRP are required");
            return;
        }
        setIsLoading(true);
        try {
            const payload = new FormData();
            Object.keys(formData).forEach(key => payload.append(key, formData[key]));
            mediaItems.forEach(item => {
                if (item.isNew && item.type === 'image' && item.file) payload.append('images', item.file);
            });
            const newYoutubeLinks = mediaItems.filter(m => m.isNew && m.type === 'youtube').map(m => m.url);
            payload.append('youtubeLinks', JSON.stringify(newYoutubeLinks));
            const existingMedia = mediaItems.filter(m => m.isExisting).map(m => ({ type: m.type, url: m.url }));
            payload.append('existingMedia', JSON.stringify(existingMedia));

            await onConfirm(payload, productToEdit?.id);
            onClose();
        } catch (error) {
            console.error(error);
            toast.error("Failed to save product");
        } finally {
            setIsLoading(false);
        }
    };

    // Custom Checkbox Component for styling
    const Checkbox = ({ name, checked, onChange, label }) => (
        <label className="flex items-center gap-2 cursor-pointer group">
            <input type="checkbox" name={name} checked={checked} onChange={onChange} className="hidden" />
            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${checked ? 'bg-primary border-primary text-accent' : 'border-gray-300 group-hover:border-primary'}`}>
                {checked && <CheckSquare size={16} />}
            </div>
            <span className="text-sm font-bold text-gray-700 select-none">{label}</span>
        </label>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-4xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
                <div className="flex justify-between items-center p-6 border-b border-gray-100">
                    <div>
                        <h2 className="text-2xl font-serif font-bold text-gray-800">{productToEdit ? 'Edit Product' : 'Add New Product'}</h2>
                        <p className="text-sm text-gray-500">Manage listing details</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={24} className="text-gray-500" /></button>
                </div>

                <div className="flex border-b border-gray-100 px-6">
                    <button onClick={() => setActiveTab('details')} className={`py-4 px-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'details' ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}>Product Details</button>
                    <button onClick={() => setActiveTab('media')} className={`py-4 px-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'media' ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}>Media & Gallery</button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
                    {activeTab === 'details' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Basic Info */}
                            <div className="space-y-4 md:col-span-2">
                                <label className="block text-sm font-bold text-gray-700">Product Title *</label>
                                <input name="title" value={formData.title} onChange={handleChange} className="w-full p-3 rounded-xl border border-gray-200 focus:border-accent outline-none" placeholder="e.g. Traditional Gold Necklace"/>
                            </div>
                            <div className="space-y-4">
                                <label className="block text-sm font-bold text-gray-700">Subtitle</label>
                                <input name="subtitle" value={formData.subtitle} onChange={handleChange} className="w-full p-3 rounded-xl border border-gray-200 focus:border-accent outline-none" placeholder="e.g. 22k Gold - Limited Edition"/>
                            </div>
                            <div className="space-y-4">
                                <label className="block text-sm font-bold text-gray-700">Status</label>
                                <select name="status" value={formData.status} onChange={handleChange} className="w-full p-3 rounded-xl border border-gray-200 focus:border-accent outline-none bg-white">
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>
                            <div className="space-y-4 md:col-span-2">
                                <label className="block text-sm font-bold text-gray-700">Description</label>
                                <textarea name="description" value={formData.description} onChange={handleChange} rows={3} className="w-full p-3 rounded-xl border border-gray-200 focus:border-accent outline-none resize-none" />
                            </div>

                             {/* --- PRICING & SPECS ROW --- */}
                            <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-gray-700">MRP *</label>
                                    <input type="number" name="mrp" value={formData.mrp} onChange={handleChange} className="w-full p-3 rounded-xl border border-gray-200 focus:border-accent outline-none" placeholder="₹" />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-gray-700">Discount Price</label>
                                    <input type="number" name="discount_price" value={formData.discount_price} onChange={handleChange} className="w-full p-3 rounded-xl border border-gray-200 focus:border-accent outline-none" placeholder="₹" />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-gray-700">SKU</label>
                                    <input name="sku" value={formData.sku} onChange={handleChange} className="w-full p-3 rounded-xl border border-gray-200 focus:border-accent outline-none" />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-gray-700">Weight (Kg)</label>
                                    <input type="number" step="0.001" name="weight_kg" value={formData.weight_kg} onChange={handleChange} className="w-full p-3 rounded-xl border border-gray-200 focus:border-accent outline-none" placeholder="0.000" />
                                </div>
                            </div>

                            {/* --- INVENTORY LOGIC --- */}
                            <div className="md:col-span-2 p-5 bg-white rounded-xl border border-gray-100 shadow-sm space-y-4">
                                <h3 className="font-bold text-gray-800">Inventory</h3>
                                
                                {/* Main Toggle */}
                                <Checkbox name="track_quantity" checked={formData.track_quantity} onChange={handleChange} label="Track Quantity" />

                                {/* Conditional Inputs */}
                                {formData.track_quantity && (
                                    <div className="pl-6 border-l-2 border-gray-100 space-y-4 animate-in slide-in-from-left-2">
                                        <div className="w-full md:w-1/2 space-y-2">
                                            <label className="block text-sm font-bold text-gray-700">Quantity Available</label>
                                            <input type="number" min="0" name="quantity" value={formData.quantity} onChange={handleChange} className="w-full p-3 rounded-xl border border-gray-200 focus:border-accent outline-none" />
                                        </div>

                                        <Checkbox name="track_low_stock" checked={formData.track_low_stock} onChange={handleChange} label="Track Low Stock" />

                                        {formData.track_low_stock && (
                                            <div className="pl-6 border-l-2 border-gray-100 w-full md:w-1/2 space-y-2 animate-in slide-in-from-left-2">
                                                <label className="block text-sm font-bold text-gray-700">Low Stock Threshold</label>
                                                <input type="number" min="0" name="low_stock_threshold" value={formData.low_stock_threshold} onChange={handleChange} className="w-full p-3 rounded-xl border border-gray-200 focus:border-accent outline-none" />
                                                <p className="text-xs text-gray-400">Notifies when stock falls below this level.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Ribbon Tag (Bottom) */}
                            <div className="space-y-4 md:col-span-2">
                                <label className="block text-sm font-bold text-gray-700">Ribbon Tag</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-xs bg-primary text-accent px-2 py-0.5 rounded font-bold shadow-sm select-none">PREVIEW</span>
                                    <input name="ribbon_tag" value={formData.ribbon_tag} onChange={handleChange} className="w-full pl-28 p-3 rounded-xl border border-gray-200 focus:border-accent outline-none transition-all" placeholder="New Arrival, Sale, etc." />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* MEDIA TAB (Unchanged) */}
                    {activeTab === 'media' && (
                        <div className="space-y-6">
                             <div className="flex gap-4">
                                <button onClick={() => fileInputRef.current?.click()} className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-2xl hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer">
                                    <ImageIcon className="text-primary w-8 h-8 mb-2" />
                                    <span className="text-sm font-bold">Add Images</span>
                                </button>
                                <input type="file" ref={fileInputRef} hidden multiple accept="image/*" onChange={handleImageUpload} />

                                <button onClick={() => setShowYoutubeInput(true)} className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-2xl hover:border-red-500 hover:bg-red-50 transition-colors">
                                    <Youtube className="text-red-500 w-8 h-8 mb-2" />
                                    <span className="text-sm font-bold">Add Video</span>
                                </button>
                            </div>
                            
                            {showYoutubeInput && (
                                <div className="p-4 bg-white border rounded-xl flex gap-2">
                                    <input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="YouTube URL..." className="flex-1 p-2 border rounded-lg" autoFocus />
                                    <button onClick={handleAddYoutube} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold">Add</button>
                                </div>
                            )}

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {mediaItems.map((item, index) => (
                                    <div key={item.id} draggable onDragStart={() => handleDragStart(index)} onDragOver={(e) => handleDragOver(e, index)} onDragEnd={handleDragEnd} className={`relative aspect-square rounded-xl overflow-hidden border ${draggedItemIndex === index ? 'opacity-50' : 'bg-white'}`}>
                                        <button onClick={() => setMediaItems(i => i.filter(x => x.id !== item.id))} className="absolute top-1 right-1 bg-white/90 p-1 rounded-full text-red-500 z-10 hover:bg-white"><Trash2 size={14}/></button>
                                        {item.type === 'image' ? <img src={item.url} className="w-full h-full object-cover"/> : <div className="w-full h-full bg-black flex items-center justify-center"><Youtube className="text-white"/></div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 bg-white flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50">Cancel</button>
                    <button onClick={handleSubmit} disabled={isLoading} className="px-6 py-3 rounded-xl font-bold bg-primary text-accent hover:bg-primary-light flex items-center gap-2">
                        {isLoading ? 'Saving...' : (productToEdit ? 'Update Product' : 'Create Product')}
                    </button>
                </div>
            </div>
        </div>
    );
}