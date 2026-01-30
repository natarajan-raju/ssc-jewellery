import { useState, useEffect } from 'react';
// import { cmsService } from '../../services/cmsService';
import { useCms } from '../../hooks/useCms';
import { UploadCloud, Trash2, GripVertical, Save, Plus, Loader2, Image as ImageIcon } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/Modal';

export default function HeroCMS() {
    const [slides, setSlides] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState(null);
    const toast = useToast();
    const { getSlides, createSlide, deleteSlide, reorderSlides } = useCms();
    // Form State
    const [newSlide, setNewSlide] = useState({ title: '', subtitle: '', link: '' });
    const [selectedFile, setSelectedFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [modalConfig, setModalConfig] = useState({ 
    isOpen: false, type: 'delete', title: '', message: '', targetId: null 
    });
    useEffect(() => { loadSlides(); }, []);

    const loadSlides = async () => {
        try {
            const data = await getSlides(true); // true = admin mode
            setSlides(data);
        } catch (error) {
            toast.error("Failed to load slides");
        } finally {
            setIsLoading(false);
        }
    };

    // --- HANDLERS ---
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!selectedFile) return toast.error("Please select an image");

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('image', selectedFile);
            formData.append('title', newSlide.title);
            formData.append('subtitle', newSlide.subtitle);
            formData.append('link', newSlide.link);

            await createSlide(formData);
            toast.success("Slide added successfully");
            
            // Reset Form
            setNewSlide({ title: '', subtitle: '', link: '' });
            setSelectedFile(null);
            setPreviewUrl(null);
            loadSlides();
        } catch (error) {
            toast.error("Upload failed");
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Delete this slide?")) return;
        try {
            await deleteSlide(id);
            setSlides(prev => prev.filter(s => s.id !== id));
            toast.success("Slide deleted");
        } catch (error) {
            toast.error("Delete failed");
        }
    };
    // 1. Open the modal (replaces the old immediate delete call)
    const openDeleteModal = (id) => {
        setModalConfig({
            isOpen: true,
            type: 'delete',
            title: 'Delete Slide?',
            message: 'Are you sure you want to remove this slide from the carousel?',
            targetId: id
        });
    };

    // 2. The actual API call (executes when user clicks "Delete" in modal)
    const handleConfirmDelete = async () => {
        try {
            await deleteSlide(modalConfig.targetId);
            setSlides(prev => prev.filter(s => s.id !== modalConfig.targetId));
            toast.success("Slide deleted");
        } catch (error) {
            toast.error("Delete failed");
        } finally {
            setModalConfig({ ...modalConfig, isOpen: false });
        }
    };

    // --- DRAG & DROP ---
    const handleDragStart = (index) => setDraggedIndex(index);
    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;
        const newOrder = [...slides];
        const item = newOrder[draggedIndex];
        newOrder.splice(draggedIndex, 1);
        newOrder.splice(index, 0, item);
        setDraggedIndex(index);
        setSlides(newOrder);
    };
    const handleDragEnd = async () => {
        setDraggedIndex(null);
        try {
            const ids = slides.map(s => s.id);
            await reorderSlides(ids);
            // toast.success("Order saved"); // Silent save
        } catch (error) {
            toast.error("Failed to save order");
        }
    };

    return (
        <div className="animate-fade-in space-y-8 max-w-5xl mx-auto">
            <Modal 
                isOpen={modalConfig.isOpen}
                onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
                onConfirm={handleConfirmDelete}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                confirmText="Delete"
            />
            
            {/* HEADER */}
            <div>
                <h1 className="text-3xl font-serif font-bold text-gray-800">Hero Carousel</h1>
                <p className="text-gray-500 mt-1">Manage homepage banner slides (Desktop Only)</p>
            </div>

            {/* UPLOAD SECTION */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                    <Plus size={20} className="text-primary"/> Add New Slide
                </h3>
                
                <form onSubmit={handleUpload} className="flex flex-col md:flex-row gap-6">
                    {/* Image Input */}
                    <div className="w-full md:w-1/3">
                        <label className="cursor-pointer group relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-xl hover:bg-gray-50 hover:border-primary transition-all">
                            {previewUrl ? (
                                <img src={previewUrl} className="w-full h-full object-cover rounded-xl" />
                            ) : (
                                <div className="text-center p-4">
                                    <UploadCloud className="w-10 h-10 text-gray-400 mb-2 mx-auto group-hover:text-primary" />
                                    <span className="text-sm text-gray-500 font-medium">Click to upload image</span>
                                    <span className="text-xs text-gray-400 block mt-1">(1920x1080 recommended)</span>
                                </div>
                            )}
                            <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                        </label>
                    </div>

                    {/* Text Inputs */}
                    <div className="flex-1 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input 
                                placeholder="Main Title (e.g. Artisanal Excellence)" 
                                className="input-field"
                                value={newSlide.title}
                                onChange={e => setNewSlide({...newSlide, title: e.target.value})}
                            />
                            <input 
                                placeholder="Subtitle (e.g. Handmade with Love)" 
                                className="input-field"
                                value={newSlide.subtitle}
                                onChange={e => setNewSlide({...newSlide, subtitle: e.target.value})}
                            />
                        </div>
                        <input 
                            placeholder="Button Link (e.g. /shop/necklaces)" 
                            className="input-field"
                            value={newSlide.link}
                            onChange={e => setNewSlide({...newSlide, link: e.target.value})}
                        />
                        
                        <div className="pt-2 flex justify-end">
                            <button 
                                type="submit" 
                                disabled={isUploading || !selectedFile}
                                className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isUploading ? <Loader2 className="animate-spin"/> : <Save size={18} />}
                                Save Slide
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            {/* SLIDES LIST */}
            <div className="space-y-4">
                <h3 className="font-bold text-gray-700">Current Slides (Drag to Reorder)</h3>
                
                {isLoading ? (
                    <div className="py-10 text-center"><Loader2 className="animate-spin mx-auto text-primary" /></div>
                ) : slides.length === 0 ? (
                    <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-400">
                        No slides yet. Upload one above!
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {slides.map((slide, index) => (
                            <div 
                                key={slide.id}
                                draggable
                                onDragStart={() => handleDragStart(index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDragEnd={handleDragEnd}
                                className={`bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4 group transition-all
                                ${draggedIndex === index ? 'opacity-50 border-accent scale-[0.99]' : 'hover:shadow-md'}`}
                            >
                                <div className="cursor-grab text-gray-400 hover:text-gray-600 p-2">
                                    <GripVertical size={20} />
                                </div>
                                
                                <div className="w-32 h-20 bg-gray-100 rounded-lg overflow-hidden shrink-0 border border-gray-100">
                                    <img src={slide.image_url} className="w-full h-full object-cover" />
                                </div>

                                <div className="flex-1">
                                    <h4 className="font-bold text-gray-800">{slide.title || <span className="text-gray-400 italic">No Title</span>}</h4>
                                    <p className="text-sm text-gray-500">{slide.subtitle}</p>
                                    {slide.link && <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full mt-1 inline-block">{slide.link}</span>}
                                </div>

                                <button 
                                    onClick={() => openDeleteModal(slide.id)}
                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    <Trash2 size={20} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}