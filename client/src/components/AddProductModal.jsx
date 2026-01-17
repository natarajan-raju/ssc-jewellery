import { useState, useEffect, useRef } from 'react';
import { X, Upload, Youtube, Image as ImageIcon, Trash2, GripVertical, CheckSquare, Plus, Pencil, Square } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export default function AddProductModal({ isOpen, onClose, onConfirm, productToEdit = null }) {
    // --- 1. HOOKS FIRST ---
    const [activeTab, setActiveTab] = useState('details');
    const [isLoading, setIsLoading] = useState(false);
    const toast = useToast();
    
    // Main Form State
    const [formData, setFormData] = useState({
        title: '', subtitle: '', description: '', mrp: '', discount_price: '',
        ribbon_tag: '', sku: '', weight_kg: '', status: 'active',
        track_quantity: false, quantity: 0, track_low_stock: false, low_stock_threshold: 0
    });

    const [mediaItems, setMediaItems] = useState([]); 
    
    // Additional Info State
    const [additionalInfo, setAdditionalInfo] = useState([]); 
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [infoForm, setInfoForm] = useState({ id: null, title: '', description: '' });
    const [draggedInfoIndex, setDraggedInfoIndex] = useState(null);

    // Options & Variants State
    const [options, setOptions] = useState([]); 
    const [variants, setVariants] = useState([]); 
    const [isOptionModalOpen, setIsOptionModalOpen] = useState(false);
    const [optionForm, setOptionForm] = useState({ id: null, name: '', values: [], inputValue: '' }); 
    const [draggedValueIndex, setDraggedValueIndex] = useState(null);

    // Media & Variant Images State
    const [showYoutubeInput, setShowYoutubeInput] = useState(false);
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const fileInputRef = useRef(null);
    const [draggedItemIndex, setDraggedItemIndex] = useState(null);
    const [isImagePickerOpen, setIsImagePickerOpen] = useState(false);
    const [currentVariantIndex, setCurrentVariantIndex] = useState(null);

    // --- 2. EFFECT: POPULATE ON EDIT ---
    useEffect(() => {
        if (isOpen && productToEdit) {
            // Helper to safely convert DB values (1, "1", true) to boolean
            const toBool = (val) => String(val) === '1' || String(val) === 'true' || val === true;

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
                // Fix: Correctly read boolean from DB
                track_quantity: toBool(productToEdit.track_quantity),
                quantity: productToEdit.quantity !== null ? productToEdit.quantity : 0,
                track_low_stock: toBool(productToEdit.track_low_stock),
                low_stock_threshold: productToEdit.low_stock_threshold || 0
            });
            
            if (productToEdit.media) {
                setMediaItems(productToEdit.media.map(m => ({ ...m, id: Math.random().toString(36), isExisting: true })));
            }
            
            setAdditionalInfo(productToEdit.additional_info || []);
            setOptions(productToEdit.options || []);
            
            if (productToEdit.variants && productToEdit.variants.length > 0) {
                setVariants(productToEdit.variants.map(v => ({
                    ...v, 
                    title: v.variant_title,
                    price: v.price !== null ? v.price : '', 
                    discount_price: v.discount_price !== null ? v.discount_price : '', 
                    sku: v.sku !== null ? v.sku : '',
                    weight_kg: v.weight_kg !== null ? v.weight_kg : '',
                    quantity: v.quantity !== null ? v.quantity : 0,
                    track_quantity: toBool(v.track_quantity),
                    track_low_stock: toBool(v.track_low_stock),
                    low_stock_threshold: v.low_stock_threshold || 0,
                    image_url: v.image_url || ''
                })));
            }
        } else if (isOpen) {
            // Reset for Add Mode
            setFormData({
                title: '', subtitle: '', description: '', mrp: '', discount_price: '', ribbon_tag: '', sku: '',
                weight_kg: '', status: 'active', track_quantity: false, quantity: 0, track_low_stock: false, low_stock_threshold: 0
            });
            setMediaItems([]); setAdditionalInfo([]); setOptions([]); setVariants([]);
        }
    }, [productToEdit, isOpen]);

    // --- 3. RETURN NULL IF CLOSED ---
    if (!isOpen) return null;

    // --- HANDLERS ---
    const handleChange = (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setFormData(prev => {
            let newValue = value;
            if (e.target.type === 'number' && Number(value) < 0) newValue = 0;
            const newData = { ...prev, [e.target.name]: newValue };
            if (e.target.name === 'track_quantity' && !value) newData.track_low_stock = false;
            return newData;
        });
    };

    const handleOptionValueDragStart = (index) => setDraggedValueIndex(index);
    const handleOptionValueDragOver = (e, index) => {
        e.preventDefault();
        if (draggedValueIndex === null || draggedValueIndex === index) return;
        const newValues = [...optionForm.values];
        const item = newValues[draggedValueIndex];
        newValues.splice(draggedValueIndex, 1);
        newValues.splice(index, 0, item);
        setDraggedValueIndex(index);
        setOptionForm(prev => ({ ...prev, values: newValues }));
    };
    const handleOptionValueDragEnd = () => setDraggedValueIndex(null);

    const handleAddOptionValue = (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const val = optionForm.inputValue.trim();
            if (val && !optionForm.values.includes(val)) {
                setOptionForm(prev => ({ ...prev, values: [...prev.values, val], inputValue: '' }));
            }
        }
    };

    const removeOptionValue = (val) => {
        setOptionForm(prev => ({ ...prev, values: prev.values.filter(v => v !== val) }));
    };

    const generateVariants = (currentOptions) => {
        if (currentOptions.length === 0) {
            setVariants([]); return;
        }
        const cartesian = (args) => args.reduce((a, b) => a.flatMap(d => b.map(e => [d, e].flat())));
        const valueArrays = currentOptions.map(o => o.values);
        const combinations = currentOptions.length === 1 ? valueArrays[0].map(v => [v]) : cartesian(valueArrays);

        const newVariants = combinations.map(combo => {
            const title = combo.join(' / ');
            const existing = variants.find(v => v.title === title);
            return existing || {
                title, 
                price: formData.mrp || '', 
                discount_price: formData.discount_price || '',
                sku: '', 
                weight_kg: formData.weight_kg || '', 
                quantity: 0,
                track_quantity: formData.track_quantity,
                track_low_stock: formData.track_low_stock,
                low_stock_threshold: 0,
                image_url: ''
            };
        });
        setVariants(newVariants);
    };

    const saveOption = () => {
        if (!optionForm.name || optionForm.values.length === 0) return toast.error("Name and values required");
        const newOpt = { id: optionForm.id || Date.now().toString(), name: optionForm.name, values: optionForm.values };
        const newOptions = optionForm.id ? options.map(o => o.id === o.id ? newOpt : o) : [...options, newOpt];
        setOptions(newOptions);
        generateVariants(newOptions);
        setIsOptionModalOpen(false);
    };

    const deleteOption = (id) => {
        const newOptions = options.filter(o => o.id !== id);
        setOptions(newOptions);
        generateVariants(newOptions);
    };

    const updateVariant = (idx, field, val) => {
        const updated = [...variants];
        let newValue = val;
        if (['price', 'discount_price', 'quantity', 'low_stock_threshold'].includes(field)) {
            if (Number(val) < 0) newValue = 0;
        }
        updated[idx][field] = newValue;
        setVariants(updated);
    };

    const pickVariantImage = (url) => {
        updateVariant(currentVariantIndex, 'image_url', url);
        setIsImagePickerOpen(false);
    };

    const openInfoModal = (item = null) => {
        setInfoForm(item ? { id: item.id, title: item.title, description: item.description } : { id: null, title: '', description: '' });
        setIsInfoModalOpen(true);
    };

    const saveInfoSection = () => {
        if (!infoForm.title) return toast.error("Title is required");
        const newItem = { ...infoForm, id: infoForm.id || Date.now().toString() };
        setAdditionalInfo(prev => infoForm.id ? prev.map(i => i.id === newItem.id ? newItem : i) : [...prev, newItem]);
        setIsInfoModalOpen(false);
    };

    const deleteInfoSection = (id) => setAdditionalInfo(prev => prev.filter(i => i.id !== id));

    const handleInfoDragStart = (index) => setDraggedInfoIndex(index);
    const handleInfoDragOver = (e, index) => {
        e.preventDefault();
        if (draggedInfoIndex === null || draggedInfoIndex === index) return;
        const newItems = [...additionalInfo];
        const item = newItems[draggedInfoIndex];
        newItems.splice(draggedInfoIndex, 1);
        newItems.splice(index, 0, item);
        setDraggedInfoIndex(index);
        setAdditionalInfo(newItems);
    };

    const handleImageUpload = (e) => {
        const files = Array.from(e.target.files);
        setMediaItems(prev => [...prev, ...files.map(file => ({
            id: Math.random().toString(36), type: 'image', file, url: URL.createObjectURL(file), isNew: true
        }))]);
    };

    const handleAddYoutube = () => {
        if (!youtubeUrl) return;
        setMediaItems(prev => [...prev, { id: Math.random().toString(36), type: 'youtube', url: youtubeUrl, isNew: true }]);
        setYoutubeUrl(''); setShowYoutubeInput(false);
    };

    const handleDragStart = (index) => setDraggedItemIndex(index);
    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (draggedItemIndex === null || draggedItemIndex === index) return;
        const newItems = [...mediaItems];
        const item = newItems[draggedItemIndex];
        newItems.splice(draggedItemIndex, 1);
        newItems.splice(index, 0, item);
        setDraggedItemIndex(index);
        setMediaItems(newItems);
    };

    // --- SUBMIT ---
    const handleSubmit = async () => {
        if (!formData.title) return toast.error("Title required");
        if (options.length === 0 && !formData.mrp) return toast.error("MRP is required");

        setIsLoading(true);
        try {
            const payload = new FormData();
            
            // FIX: Convert booleans to 'true'/'false' strings
            // This ensures backend check (val === 'true') works correctly.
            Object.keys(formData).forEach(key => {
                const value = formData[key];
                if (typeof value === 'boolean') {
                    payload.append(key, value ? 'true' : 'false'); 
                } else {
                    payload.append(key, value);
                }
            });
            
            mediaItems.forEach(item => {
                if (item.isNew && item.type === 'image' && item.file) payload.append('images', item.file);
            });
            const newYoutube = mediaItems.filter(m => m.isNew && m.type === 'youtube').map(m => m.url);
            payload.append('youtubeLinks', JSON.stringify(newYoutube));
            const existing = mediaItems.filter(m => m.isExisting).map(m => ({ type: m.type, url: m.url }));
            payload.append('existingMedia', JSON.stringify(existing));

            payload.append('additional_info', JSON.stringify(additionalInfo));
            payload.append('options', JSON.stringify(options));
            
            // FIX: Only send variants if options exist.
            // Also ensure 1/0 or true/false consistency for variants if needed.
            // Assuming variants use 1/0 in backend loop:
            const cleanVariants = (options.length > 0 ? variants : []).map(v => ({
                ...v,
                price: v.price || 0,
                discount_price: v.discount_price || 0,
                track_quantity: formData.track_quantity ? 1 : 0,
                track_low_stock: formData.track_low_stock ? 1 : 0,
                quantity: formData.track_quantity ? (v.quantity || 0) : 0,
                low_stock_threshold: formData.track_low_stock ? (v.low_stock_threshold || 0) : 0
            }));
            
            payload.append('variants', JSON.stringify(cleanVariants));

            await onConfirm(payload, productToEdit?.id);
            onClose();
        } catch (error) {
            console.error(error);
            toast.error("Failed to save product");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 relative">
                
                {/* --- HEADER --- */}
                <div className="flex justify-between items-center p-6 border-b border-gray-100">
                    <div>
                        <h2 className="text-2xl font-serif font-bold text-gray-800">{productToEdit ? 'Edit Product' : 'Add New Product'}</h2>
                        <p className="text-sm text-gray-500">Manage listing & variants</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={24} className="text-gray-500" /></button>
                </div>

                <div className="flex border-b border-gray-100 px-6">
                    <button onClick={() => setActiveTab('details')} className={`py-4 px-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'details' ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}>Product Details</button>
                    <button onClick={() => setActiveTab('media')} className={`py-4 px-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'media' ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}>Media & Gallery</button>
                </div>

                {/* --- CONTENT --- */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
                    {activeTab === 'details' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                                    <textarea name="description" value={formData.description} onChange={handleChange} rows={3} className="w-full p-3 rounded-xl border border-gray-200 focus:border-accent outline-none resize-none" placeholder="Detailed product description..." />
                                </div>
                            </div>

                            {/* --- OPTIONS SECTION --- */}
                            <div className="p-5 bg-white rounded-xl border border-gray-100 shadow-sm space-y-4">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="font-bold text-gray-800">Options</h3>
                                        <p className="text-xs text-gray-500">Add options like Size or Color to create variants.</p>
                                    </div>
                                    <button onClick={() => { setOptionForm({id:null, name:'', values:[], inputValue:''}); setIsOptionModalOpen(true); }} className="text-primary text-sm font-bold flex items-center gap-1 hover:underline bg-primary/10 px-3 py-2 rounded-lg transition-colors">
                                        <Plus size={16}/> Add Option
                                    </button>
                                </div>
                                {options.map(opt => (
                                    <div key={opt.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 animate-in fade-in">
                                        <div>
                                            <span className="font-bold text-gray-800">{opt.name}:</span>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {opt.values.map((v, i) => <span key={i} className="text-xs bg-white border border-gray-200 px-2 py-1 rounded-md text-gray-600">{v}</span>)}
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => { setOptionForm({id:opt.id, name:opt.name, values:opt.values, inputValue:''}); setIsOptionModalOpen(true); }} className="p-2 hover:bg-white rounded text-gray-400 hover:text-primary transition-colors"><Pencil size={16}/></button>
                                            <button onClick={() => deleteOption(opt.id)} className="p-2 hover:bg-white rounded text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* --- CONDITIONAL: VARIANTS OR DEFAULT PRICING --- */}
                            {options.length > 0 ? (
                                <div className="p-5 bg-white rounded-xl border border-gray-100 shadow-sm space-y-4 overflow-x-auto animate-in fade-in">
                                    <div className="flex justify-between items-end">
                                        <h3 className="font-bold text-gray-800">Variants Preview & Pricing</h3>
                                        
                                        {/* GLOBAL INVENTORY CONTROLS */}
                                        <div className="flex gap-4">
                                            <Checkbox 
                                                name="track_quantity" 
                                                checked={formData.track_quantity} 
                                                onChange={handleChange} 
                                                label="Track Stock" 
                                            />
                                            {formData.track_quantity && (
                                                <Checkbox 
                                                    name="track_low_stock" 
                                                    checked={formData.track_low_stock} 
                                                    onChange={handleChange} 
                                                    label="Low Stock Alert" 
                                                />
                                            )}
                                        </div>
                                    </div>

                                    <table className="w-full text-left text-sm">
                                        <thead>
                                            <tr className="border-b text-gray-500">
                                                <th className="pb-3 pl-2">Variant</th>
                                                <th className="pb-3">Image</th>
                                                <th className="pb-3">Price *</th>
                                                <th className="pb-3">Discount</th>
                                                {formData.track_quantity ? <th className="pb-3">Qty</th> : null}
                                                {formData.track_low_stock ? <th className="pb-3">Low Limit</th> : null}
                                                <th className="pb-3">SKU</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {variants.map((v, i) => (
                                                <tr key={i} className="hover:bg-gray-50 transition-colors">
                                                    <td className="py-3 pl-2 font-medium">{v.title}</td>
                                                    <td className="py-3">
                                                        <button onClick={() => { setCurrentVariantIndex(i); setIsImagePickerOpen(true); }} className="w-10 h-10 bg-gray-100 rounded border flex items-center justify-center hover:border-primary overflow-hidden relative group">
                                                            {v.image_url ? <img src={v.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={16} className="text-gray-400 group-hover:text-primary"/>}
                                                        </button>
                                                    </td>
                                                    <td className="py-3">
                                                        <input type="number" min="0" value={v.price} onChange={(e) => updateVariant(i, 'price', e.target.value)} className="w-24 p-2 border border-gray-200 rounded-lg focus:border-accent outline-none" placeholder="₹ MRP" />
                                                    </td>
                                                    <td className="py-3">
                                                        <input type="number" min="0" value={v.discount_price} onChange={(e) => updateVariant(i, 'discount_price', e.target.value)} className="w-24 p-2 border border-gray-200 rounded-lg focus:border-accent outline-none" placeholder="₹ Sale" />
                                                    </td>
                                                    {formData.track_quantity ? (
                                                        <td className="py-3">
                                                            <input type="number" min="0" value={v.quantity} onChange={(e) => updateVariant(i, 'quantity', e.target.value)} className="w-20 p-2 border border-gray-200 rounded-lg focus:border-accent outline-none" placeholder="0" />
                                                        </td>
                                                    ) : null}
                                                    {formData.track_low_stock ? (
                                                        <td className="py-3">
                                                            <input type="number" min="0" value={v.low_stock_threshold} onChange={(e) => updateVariant(i, 'low_stock_threshold', e.target.value)} className="w-20 p-2 border border-gray-200 rounded-lg focus:border-accent outline-none" placeholder="0" />
                                                        </td>
                                                    ) : null}
                                                    <td className="py-3">
                                                        <input value={v.sku} onChange={(e) => updateVariant(i, 'sku', e.target.value)} className="w-28 p-2 border border-gray-200 rounded-lg focus:border-accent outline-none" placeholder="SKU" />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <>
                                    {/* DEFAULT PRICING */}
                                    <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-white rounded-xl border border-gray-100 shadow-sm animate-in fade-in">
                                        <div className="space-y-2">
                                            <label className="block text-sm font-bold text-gray-700">MRP *</label>
                                            <input type="number" min="0" name="mrp" value={formData.mrp} onChange={handleChange} className="w-full p-3 rounded-xl border border-gray-200 focus:border-accent outline-none" placeholder="₹" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="block text-sm font-bold text-gray-700">Discount Price</label>
                                            <input type="number" min="0" name="discount_price" value={formData.discount_price} onChange={handleChange} className="w-full p-3 rounded-xl border border-gray-200 focus:border-accent outline-none" placeholder="₹" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="block text-sm font-bold text-gray-700">SKU</label>
                                            <input name="sku" value={formData.sku} onChange={handleChange} className="w-full p-3 rounded-xl border border-gray-200 focus:border-accent outline-none" placeholder="e.g. NK-001" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="block text-sm font-bold text-gray-700">Weight (Kg)</label>
                                            <input type="number" min="0" step="0.001" name="weight_kg" value={formData.weight_kg} onChange={handleChange} className="w-full p-3 rounded-xl border border-gray-200 focus:border-accent outline-none" placeholder="0.000" />
                                        </div>
                                    </div>
                                    
                                    {/* INVENTORY */}
                                    <div className="md:col-span-2 p-5 bg-white rounded-xl border border-gray-100 shadow-sm space-y-4 animate-in fade-in">
                                        <h3 className="font-bold text-gray-800">Inventory</h3>
                                        
                                        <Checkbox name="track_quantity" checked={formData.track_quantity} onChange={handleChange} label="Track Quantity" />

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
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* --- RIBBON TAG --- */}
                            <div className="space-y-4 md:col-span-2">
                                <label className="block text-sm font-bold text-gray-700">Ribbon Tag</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-xs bg-primary text-accent px-2 py-0.5 rounded font-bold shadow-sm select-none">PREVIEW</span>
                                    <input name="ribbon_tag" value={formData.ribbon_tag} onChange={handleChange} className="w-full pl-28 p-3 rounded-xl border border-gray-200 focus:border-accent outline-none transition-all" placeholder="New Arrival, Sale, etc." />
                                </div>
                            </div>

                            {/* --- ADDITIONAL INFO --- */}
                            <div className="md:col-span-2 p-5 bg-white rounded-xl border border-gray-100 shadow-sm space-y-4">
                                <h3 className="font-bold text-gray-800">Additional info sections</h3>
                                <div className="space-y-2">
                                    {additionalInfo.map((item, index) => (
                                        <div key={item.id} draggable onDragStart={() => handleInfoDragStart(index)} onDragOver={(e) => handleInfoDragOver(e, index)} onDragEnd={() => setDraggedInfoIndex(null)} className={`flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 group ${draggedInfoIndex === index ? 'opacity-50' : ''}`}>
                                            <div className="mt-1 text-gray-400 cursor-grab"><GripVertical size={16} /></div>
                                            <div className="flex-1">
                                                <h4 className="text-sm font-bold text-gray-800">{item.title}</h4>
                                                <p className="text-xs text-gray-500 line-clamp-1">{item.description}</p>
                                            </div>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => openInfoModal(item)} className="p-1.5 hover:bg-white rounded-lg text-gray-500 hover:text-primary"><Pencil size={14} /></button>
                                                <button onClick={() => deleteInfoSection(item.id)} className="p-1.5 hover:bg-white rounded-lg text-gray-500 hover:text-red-500"><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={() => openInfoModal()} className="flex items-center gap-2 text-primary font-bold text-sm hover:underline"><Plus size={16} /> Add info section</button>
                            </div>
                        </div>
                    )}

                    {/* MEDIA TAB */}
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
                                    <div key={item.id} draggable onDragStart={() => setDraggedItemIndex(index)} onDragOver={(e) => handleDragOver(e, index)} onDragEnd={() => setDraggedItemIndex(null)} className={`relative aspect-square rounded-xl overflow-hidden border ${draggedItemIndex === index ? 'opacity-50' : 'bg-white'}`}>
                                        <button onClick={() => setMediaItems(i => i.filter(x => x.id !== item.id))} className="absolute top-1 right-1 bg-white/90 p-1 rounded-full text-red-500 z-10 hover:bg-white"><Trash2 size={14}/></button>
                                        {item.type === 'image' ? <img src={item.url} className="w-full h-full object-cover"/> : <div className="w-full h-full bg-black flex items-center justify-center"><Youtube className="text-white"/></div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* FOOTER */}
                <div className="p-6 border-t border-gray-100 bg-white flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50">Cancel</button>
                    <button onClick={handleSubmit} disabled={isLoading} className="px-6 py-3 rounded-xl font-bold bg-primary text-accent hover:bg-primary-light flex items-center gap-2">
                        {isLoading ? 'Saving...' : (productToEdit ? 'Update Product' : 'Create Product')}
                    </button>
                </div>

                {/* MODALS: OPTION, INFO, IMAGES (Keep existing content) */}
                {isOptionModalOpen && (
                    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 animate-in fade-in backdrop-blur-sm">
                        <div className="bg-white p-6 rounded-2xl w-full max-w-md space-y-5 shadow-xl">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold font-serif text-xl text-gray-800">Add Option</h3>
                                <button onClick={() => setIsOptionModalOpen(false)}><X size={20} className="text-gray-400"/></button>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">Option Name</label>
                                <input value={optionForm.name} onChange={e => setOptionForm({...optionForm, name: e.target.value})} placeholder="e.g. Size, Color" className="w-full p-3 border border-gray-200 rounded-xl focus:border-accent outline-none"/>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">Selections</label>
                                <p className="text-xs text-gray-500">Type and press Enter. Drag to reorder.</p>
                                <div className="w-full p-2 border border-gray-200 rounded-xl focus-within:border-accent bg-white flex flex-wrap gap-2 items-center min-h-[50px]">
                                    {optionForm.values.map((val, i) => (
                                        <div key={i} draggable onDragStart={() => handleOptionValueDragStart(i)} onDragOver={(e) => handleOptionValueDragOver(e, i)} onDragEnd={handleOptionValueDragEnd} className="flex items-center gap-1 bg-gray-100 border px-2 py-1 rounded-lg text-sm font-medium cursor-grab active:cursor-grabbing">
                                            <GripVertical size={12} className="text-gray-400"/> {val}
                                            <button onClick={() => removeOptionValue(val)} className="ml-1 text-gray-400 hover:text-red-500"><X size={14}/></button>
                                        </div>
                                    ))}
                                    <input value={optionForm.inputValue} onChange={e => setOptionForm({...optionForm, inputValue: e.target.value})} onKeyDown={handleAddOptionValue} placeholder="Type selection..." className="flex-1 p-1 outline-none bg-transparent min-w-[100px]"/>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-3">
                                <button onClick={() => setIsOptionModalOpen(false)} className="px-4 py-2 rounded-xl font-bold text-gray-500 hover:bg-gray-50">Cancel</button>
                                <button onClick={saveOption} className="px-4 py-2 bg-primary text-accent rounded-xl font-bold hover:bg-primary-light">Save</button>
                            </div>
                        </div>
                    </div>
                )}

                {isInfoModalOpen && (
                    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 animate-in fade-in backdrop-blur-sm">
                        <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl p-6 space-y-4 animate-in zoom-in-95">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-bold font-serif text-gray-800">{infoForm.id ? 'Edit Info Section' : 'Add Info Section'}</h3>
                                <button onClick={() => setIsInfoModalOpen(false)}><X size={20} className="text-gray-400" /></button>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">Title *</label>
                                <input value={infoForm.title} onChange={(e) => setInfoForm({...infoForm, title: e.target.value})} className="w-full p-3 rounded-xl border border-gray-200 focus:border-accent outline-none" placeholder="e.g. Care Instructions" autoFocus />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">Description</label>
                                <textarea value={infoForm.description} onChange={(e) => setInfoForm({...infoForm, description: e.target.value})} rows={4} className="w-full p-3 rounded-xl border border-gray-200 focus:border-accent outline-none resize-none" placeholder="Enter details..." />
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => setIsInfoModalOpen(false)} className="px-4 py-2 rounded-lg font-bold text-gray-500 hover:bg-gray-50">Cancel</button>
                                <button onClick={saveInfoSection} className="px-4 py-2 rounded-lg font-bold bg-primary text-accent hover:bg-primary-light">Save</button>
                            </div>
                        </div>
                    </div>
                )}

                {isImagePickerOpen && (
                    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 animate-in fade-in">
                        <div className="bg-white p-6 rounded-xl w-full max-w-lg space-y-4 shadow-xl">
                            <h3 className="font-bold text-lg">Select Variant Image</h3>
                            <div className="grid grid-cols-4 gap-2 max-h-[300px] overflow-y-auto">
                                {mediaItems.filter(m => m.type === 'image').map((m, i) => (
                                    <button key={i} onClick={() => pickVariantImage(m.url)} className="aspect-square rounded overflow-hidden border hover:border-accent">
                                        <img src={m.url} className="w-full h-full object-cover"/>
                                    </button>
                                ))}
                            </div>
                            <button onClick={() => setIsImagePickerOpen(false)} className="w-full py-2 bg-gray-100 rounded font-bold">Cancel</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// --------------------------------------------------------
// MOVED COMPONENT OUTSIDE
// --------------------------------------------------------
function Checkbox({ name, checked, onChange, label }) {
    return (
        <label className="flex items-center gap-2 cursor-pointer group select-none">
            <input type="checkbox" name={name} checked={checked} onChange={onChange} className="hidden" />
            <div className={`transition-colors ${checked ? 'text-primary' : 'text-gray-300 group-hover:text-primary'}`}>
                {checked ? <CheckSquare size={18} /> : <Square size={18} />}
            </div>
            {label && <span className="text-sm font-bold text-gray-700">{label}</span>}
        </label>
    );
}