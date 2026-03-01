import { useState, useEffect, useRef } from 'react';
// import { cmsService } from '../../services/cmsService';
import { useCms } from '../../hooks/useCms';
import { UploadCloud, Trash2, GripVertical, Save, Plus, Loader2, Image as ImageIcon, ChevronDown, Sparkles, AlertTriangle, CheckCircle2, PanelBottom, Pencil } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAdminCrudSync } from '../../hooks/useAdminCrudSync';
import Modal from '../../components/Modal';
import { productService } from '../../services/productService';

function AccordionSection({
    id,
    title,
    subtitle = '',
    icon: Icon = ImageIcon,
    openCmsSection,
    setOpenCmsSection,
    isAutopilotEnabled = false,
    sectionHasContent,
    children
}) {
    const isOpen = openCmsSection === id;
    const hasContent = sectionHasContent(id);
    const toggleSection = () => {
        const currentY = window.scrollY;
        setOpenCmsSection((prev) => (prev === id ? '' : id));
        requestAnimationFrame(() => {
            window.scrollTo({ top: currentY, behavior: 'auto' });
        });
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <button
                type="button"
                onClick={toggleSection}
                className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left"
            >
                <div>
                    <h3 className="font-bold text-gray-700 flex items-center gap-2">
                        <span>{title}</span>
                        {id === 'featured-category' && isAutopilotEnabled && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-green-100 text-green-700 border border-green-200">
                                Auto
                            </span>
                        )}
                    </h3>
                    {!!subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
                </div>
                <div className="flex items-center gap-3">
                    {hasContent ? (
                        <CheckCircle2 size={20} className="text-green-500" />
                    ) : (
                        <AlertTriangle size={20} className="text-amber-500" />
                    )}
                    <Icon size={32} className="text-slate-200" />
                    <ChevronDown size={18} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </button>
            {isOpen && (
                <div className="px-6 pb-6 border-t border-gray-100 pt-4">
                    {children}
                </div>
            )}
        </div>
    );
}

export default function HeroCMS() {
    const [slides, setSlides] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [isBannerUpdating, setIsBannerUpdating] = useState(false);
    const [isSecondaryBannerUpdating, setIsSecondaryBannerUpdating] = useState(false);
    const [isTertiaryBannerUpdating, setIsTertiaryBannerUpdating] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState(null);
    const toast = useToast();
    const { 
        getSlides, getHeroTexts, getBanner, getSecondaryBanner, getTertiaryBanner, getFeaturedCategory, getAutopilotConfig,
        createSlide, updateBanner, updateSecondaryBanner, updateTertiaryBanner, updateFeaturedCategory, updateAutopilotConfig,
        getCarouselCards, createCarouselCard, updateCarouselCard, deleteCarouselCard,
        createHeroText, updateHeroText, deleteHeroText, reorderHeroTexts,
        deleteSlide, reorderSlides 
    } = useCms();
    // Form State
    const [newSlide, setNewSlide] = useState({ title: '', subtitle: '', link: '' });
    const [selectedFile, setSelectedFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [bannerData, setBannerData] = useState(null);
    const [bannerFile, setBannerFile] = useState(null);
    const [bannerPreview, setBannerPreview] = useState(null);
    const [bannerLink, setBannerLink] = useState('');
    const [secondaryBannerData, setSecondaryBannerData] = useState(null);
    const [secondaryBannerFile, setSecondaryBannerFile] = useState(null);
    const [secondaryBannerPreview, setSecondaryBannerPreview] = useState(null);
    const [secondaryBannerLink, setSecondaryBannerLink] = useState('');
    const [tertiaryBannerData, setTertiaryBannerData] = useState(null);
    const [tertiaryBannerFile, setTertiaryBannerFile] = useState(null);
    const [tertiaryBannerPreview, setTertiaryBannerPreview] = useState(null);
    const [tertiaryBannerLink, setTertiaryBannerLink] = useState('');
    const [isAutopilotEnabled, setIsAutopilotEnabled] = useState(false);
    const [isAutopilotSaving, setIsAutopilotSaving] = useState(false);
    const [featuredCategories, setFeaturedCategories] = useState([]);
    const [isFeaturedLoading, setIsFeaturedLoading] = useState(false);
    const [featuredConfig, setFeaturedConfig] = useState(null);
    const [featuredCategoryId, setFeaturedCategoryId] = useState('');
    const [featuredTitle, setFeaturedTitle] = useState('');
    const [featuredSubtitle, setFeaturedSubtitle] = useState('');
    const [heroTexts, setHeroTexts] = useState([]);
    const [heroTextInput, setHeroTextInput] = useState('');
    const [isHeroTextLoading, setIsHeroTextLoading] = useState(false);
    const [draggedTextIndex, setDraggedTextIndex] = useState(null);
    const [carouselCards, setCarouselCards] = useState([]);
    const [isCarouselLoading, setIsCarouselLoading] = useState(false);
    const [isCarouselSaving, setIsCarouselSaving] = useState(false);
    const [carouselProducts, setCarouselProducts] = useState([]);
    const [carouselCategories, setCarouselCategories] = useState([]);
    const [editingCarouselCardId, setEditingCarouselCardId] = useState(null);
    const [carouselForm, setCarouselForm] = useState({
        title: '',
        description: '',
        sourceType: 'manual',
        sourceId: '',
        imageUrl: '',
        buttonLabel: '',
        buttonLink: '',
        status: 'active',
        displayOrder: ''
    });
    const [openCmsSection, setOpenCmsSection] = useState('hero-carousel');
    const bannerLinkDirtyRef = useRef(false);
    const secondaryBannerLinkDirtyRef = useRef(false);
    const tertiaryBannerLinkDirtyRef = useRef(false);
    const featuredDraftDirtyRef = useRef(false);
const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    type: 'delete',
    title: '',
    message: '',
    targetId: null,
    targetKind: 'slide'
    });
    useEffect(() => { 
        loadSlides(); 
        loadHeroTexts();
        loadBanner();
        loadSecondaryBanner();
        loadTertiaryBanner();
        loadFeaturedConfig();
        loadFeaturedCategories();
        loadCarouselCards();
        loadCarouselSources();
        loadAutopilotConfig();
    }, []);

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

    const loadHeroTexts = async () => {
        try {
            const data = await getHeroTexts(true);
            setHeroTexts(Array.isArray(data) ? data : []);
        } catch (error) {
            toast.error("Failed to load hero texts");
        }
    };

    const loadBanner = async () => {
        try {
            const data = await getBanner(true);
            setBannerData(data);
            if (!bannerLinkDirtyRef.current) {
                setBannerLink(data?.link || '');
            }
            setBannerPreview(data?.image_url || null);
        } catch (error) {
            toast.error("Failed to load banner");
        }
    };

    const loadSecondaryBanner = async () => {
        try {
            const data = await getSecondaryBanner(true);
            setSecondaryBannerData(data);
            if (!secondaryBannerLinkDirtyRef.current) {
                setSecondaryBannerLink(data?.link || '');
            }
            setSecondaryBannerPreview(data?.image_url || null);
        } catch (error) {
            toast.error("Failed to load secondary banner");
        }
    };

    const loadTertiaryBanner = async () => {
        try {
            const data = await getTertiaryBanner(true);
            setTertiaryBannerData(data);
            if (!tertiaryBannerLinkDirtyRef.current) {
                setTertiaryBannerLink(data?.link || '');
            }
            setTertiaryBannerPreview(data?.image_url || null);
        } catch (error) {
            toast.error("Failed to load home banner 3");
        }
    };

    const loadAutopilotConfig = async () => {
        try {
            const data = await getAutopilotConfig();
            setIsAutopilotEnabled(Boolean(data?.is_enabled));
        } catch (error) {
            toast.error("Failed to load autopilot settings");
        }
    };

    const loadFeaturedConfig = async () => {
        try {
            const data = await getFeaturedCategory(true);
            setFeaturedConfig(data);
            if (!featuredDraftDirtyRef.current) {
                setFeaturedCategoryId(data?.category_id ? String(data.category_id) : '');
                setFeaturedTitle(data?.title || '');
                setFeaturedSubtitle(data?.subtitle || '');
            }
        } catch (error) {
            toast.error("Failed to load featured category");
        }
    };

    const loadFeaturedCategories = async () => {
        setIsFeaturedLoading(true);
        try {
            const data = await productService.getCategoryStats(true);
            setFeaturedCategories(Array.isArray(data) ? data : []);
        } catch (error) {
            toast.error("Failed to load categories");
        } finally {
            setIsFeaturedLoading(false);
        }
    };

    const loadCarouselCards = async () => {
        setIsCarouselLoading(true);
        try {
            const data = await getCarouselCards(true);
            setCarouselCards(Array.isArray(data) ? data : []);
        } catch (error) {
            toast.error("Failed to load carousel cards");
        } finally {
            setIsCarouselLoading(false);
        }
    };

    const loadCarouselSources = async () => {
        try {
            const [productRes, categoryRes] = await Promise.all([
                productService.getProducts(1, 'all', 'all', 'newest', 250),
                productService.getCategoryStats(true)
            ]);
            setCarouselProducts(Array.isArray(productRes?.products) ? productRes.products : []);
            setCarouselCategories(Array.isArray(categoryRes) ? categoryRes : []);
        } catch (error) {
            toast.error("Failed to load product/category sources");
        }
    };

    useAdminCrudSync({
        'cms:hero_update': () => loadSlides(),
        'cms:texts_update': () => loadHeroTexts(),
        'cms:banner_update': () => loadBanner(),
        'cms:banner_secondary_update': () => loadSecondaryBanner(),
        'cms:banner_tertiary_update': () => loadTertiaryBanner(),
        'cms:featured_category_update': () => {
            loadFeaturedConfig();
            loadFeaturedCategories();
        },
        'cms:carousel_cards_update': () => {
            loadCarouselCards();
            loadCarouselSources();
        },
        'cms:autopilot_update': () => loadAutopilotConfig(),
        'refresh:categories': () => {
            loadFeaturedConfig();
            loadFeaturedCategories();
            loadCarouselSources();
        }
    });

    // --- HANDLERS ---
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };
    const handleImageDrop = (event, fileSetter, previewSetter) => {
        event.preventDefault();
        const file = event.dataTransfer?.files?.[0];
        if (!file || !String(file.type || '').startsWith('image/')) {
            toast.error('Please drop an image file');
            return;
        }
        fileSetter(file);
        previewSetter(URL.createObjectURL(file));
    };

    const handleBannerFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setBannerFile(file);
            setBannerPreview(URL.createObjectURL(file));
        }
    };

    const handleSecondaryBannerFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSecondaryBannerFile(file);
            setSecondaryBannerPreview(URL.createObjectURL(file));
        }
    };

    const handleTertiaryBannerFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setTertiaryBannerFile(file);
            setTertiaryBannerPreview(URL.createObjectURL(file));
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

    const handleBannerUpdate = async (e) => {
        e.preventDefault();
        setIsBannerUpdating(true);
        try {
            const formData = new FormData();
            if (bannerFile) {
                formData.append('image', bannerFile);
            }
            formData.append('link', bannerLink);
            await updateBanner(formData);
            toast.success("Banner updated");
            setBannerFile(null);
            bannerLinkDirtyRef.current = false;
            await loadBanner();
        } catch (error) {
            toast.error("Banner update failed");
        } finally {
            setIsBannerUpdating(false);
        }
    };

    const handleSecondaryBannerUpdate = async (e) => {
        e.preventDefault();
        setIsSecondaryBannerUpdating(true);
        try {
            const formData = new FormData();
            if (secondaryBannerFile) {
                formData.append('image', secondaryBannerFile);
            }
            formData.append('link', secondaryBannerLink);
            await updateSecondaryBanner(formData);
            toast.success("Secondary banner updated");
            setSecondaryBannerFile(null);
            secondaryBannerLinkDirtyRef.current = false;
            await loadSecondaryBanner();
        } catch (error) {
            toast.error("Secondary banner update failed");
        } finally {
            setIsSecondaryBannerUpdating(false);
        }
    };

    const handleTertiaryBannerUpdate = async (e) => {
        e.preventDefault();
        setIsTertiaryBannerUpdating(true);
        try {
            const formData = new FormData();
            if (tertiaryBannerFile) {
                formData.append('image', tertiaryBannerFile);
            }
            formData.append('link', tertiaryBannerLink);
            await updateTertiaryBanner(formData);
            toast.success("Home banner 3 updated");
            setTertiaryBannerFile(null);
            tertiaryBannerLinkDirtyRef.current = false;
            await loadTertiaryBanner();
        } catch (error) {
            toast.error("Home banner 3 update failed");
        } finally {
            setIsTertiaryBannerUpdating(false);
        }
    };
    const handleRemoveBannerImage = async () => {
        setIsBannerUpdating(true);
        try {
            const formData = new FormData();
            formData.append('link', bannerLink || '');
            formData.append('removeImage', 'true');
            await updateBanner(formData);
            setBannerFile(null);
            setBannerPreview(null);
            toast.success('Banner image removed');
            bannerLinkDirtyRef.current = false;
            await loadBanner();
        } catch (error) {
            toast.error('Failed to remove banner image');
        } finally {
            setIsBannerUpdating(false);
        }
    };

    const handleRemoveSecondaryBannerImage = async () => {
        setIsSecondaryBannerUpdating(true);
        try {
            const formData = new FormData();
            formData.append('link', secondaryBannerLink || '');
            formData.append('removeImage', 'true');
            await updateSecondaryBanner(formData);
            setSecondaryBannerFile(null);
            setSecondaryBannerPreview(null);
            toast.success('Secondary banner image removed');
            secondaryBannerLinkDirtyRef.current = false;
            await loadSecondaryBanner();
        } catch (error) {
            toast.error('Failed to remove secondary banner image');
        } finally {
            setIsSecondaryBannerUpdating(false);
        }
    };

    const handleRemoveTertiaryBannerImage = async () => {
        setIsTertiaryBannerUpdating(true);
        try {
            const formData = new FormData();
            formData.append('link', tertiaryBannerLink || '');
            formData.append('removeImage', 'true');
            await updateTertiaryBanner(formData);
            setTertiaryBannerFile(null);
            setTertiaryBannerPreview(null);
            toast.success('Home banner 3 image removed');
            tertiaryBannerLinkDirtyRef.current = false;
            await loadTertiaryBanner();
        } catch (error) {
            toast.error('Failed to remove home banner 3 image');
        } finally {
            setIsTertiaryBannerUpdating(false);
        }
    };

    const handleAutopilotSave = async () => {
        setIsAutopilotSaving(true);
        try {
            await updateAutopilotConfig({ is_enabled: isAutopilotEnabled });
            toast.success('Autopilot settings updated');
            await loadAutopilotConfig();
        } catch (error) {
            toast.error('Failed to update autopilot settings');
        } finally {
            setIsAutopilotSaving(false);
        }
    };

    const handleAutopilotToggle = (checked) => {
        const currentY = window.scrollY;
        setIsAutopilotEnabled(Boolean(checked));
        requestAnimationFrame(() => {
            window.scrollTo({ top: currentY, behavior: 'auto' });
        });
    };

    const handleHeroTextAdd = async (e) => {
        e.preventDefault();
        const text = heroTextInput.trim();
        if (!text) return toast.error("Enter text");
        setIsHeroTextLoading(true);
        try {
            await createHeroText({ text });
            setHeroTextInput('');
            await loadHeroTexts();
            toast.success("Text added");
        } catch (error) {
            toast.error("Failed to add text");
        } finally {
            setIsHeroTextLoading(false);
        }
    };

    const handleHeroTextUpdate = async (id, text) => {
        setIsHeroTextLoading(true);
        try {
            await updateHeroText(id, { text });
            await loadHeroTexts();
            toast.success("Text updated");
        } catch (error) {
            toast.error("Failed to update text");
        } finally {
            setIsHeroTextLoading(false);
        }
    };

    const handleHeroTextDelete = async (id) => {
        setIsHeroTextLoading(true);
        try {
            await deleteHeroText(id);
            await loadHeroTexts();
            toast.success("Text deleted");
        } catch (error) {
            toast.error("Failed to delete text");
        } finally {
            setIsHeroTextLoading(false);
        }
    };

    const handleHeroTextDragStart = (index) => setDraggedTextIndex(index);
    const handleHeroTextDragOver = (e, index) => {
        e.preventDefault();
        if (draggedTextIndex === null || draggedTextIndex === index) return;
        const next = [...heroTexts];
        const item = next[draggedTextIndex];
        next.splice(draggedTextIndex, 1);
        next.splice(index, 0, item);
        setDraggedTextIndex(index);
        setHeroTexts(next);
    };
    const handleHeroTextDragEnd = async () => {
        setDraggedTextIndex(null);
        try {
            const ids = heroTexts.map(t => t.id);
            await reorderHeroTexts(ids);
        } catch (error) {
            toast.error("Failed to save order");
        }
    };

    const handleFeaturedCategorySave = async (e) => {
        e.preventDefault();
        if (!featuredCategoryId) {
            toast.error("Select a category");
            return;
        }
        setIsFeaturedLoading(true);
        try {
            await updateFeaturedCategory({
                categoryId: Number(featuredCategoryId),
                title: featuredTitle,
                subtitle: featuredSubtitle
            });
            toast.success("Featured category updated");
            featuredDraftDirtyRef.current = false;
            await loadFeaturedConfig();
        } catch (error) {
            toast.error("Featured category update failed");
        } finally {
            setIsFeaturedLoading(false);
        }
    };

    const openDeleteModal = (id) => {
        setModalConfig({
            isOpen: true,
            type: 'delete',
            title: 'Delete Slide?',
            message: 'Are you sure you want to remove this slide from the carousel?',
            targetId: id,
            targetKind: 'slide'
        });
    };

    const openDeleteCarouselModal = (id) => {
        setModalConfig({
            isOpen: true,
            type: 'delete',
            title: 'Delete Carousel Card?',
            message: 'Are you sure you want to remove this carousel card?',
            targetId: id,
            targetKind: 'carousel'
        });
    };

    const handleConfirmDelete = async () => {
        try {
            if (modalConfig.targetKind === 'carousel') {
                await deleteCarouselCard(modalConfig.targetId);
                setCarouselCards((prev) => prev.filter((card) => String(card.id) !== String(modalConfig.targetId)));
                if (editingCarouselCardId && String(editingCarouselCardId) === String(modalConfig.targetId)) {
                    resetCarouselForm();
                }
                toast.success("Carousel card deleted");
            } else {
                await deleteSlide(modalConfig.targetId);
                setSlides(prev => prev.filter(s => s.id !== modalConfig.targetId));
                toast.success("Slide deleted");
            }
        } catch (error) {
            toast.error("Delete failed");
        } finally {
            setModalConfig({
                isOpen: false,
                type: 'delete',
                title: '',
                message: '',
                targetId: null,
                targetKind: 'slide'
            });
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

    const resetCarouselForm = () => {
        setEditingCarouselCardId(null);
        setCarouselForm({
            title: '',
            description: '',
            sourceType: 'manual',
            sourceId: '',
            imageUrl: '',
            buttonLabel: '',
            buttonLink: '',
            status: 'active',
            displayOrder: ''
        });
    };

    const handleCarouselFormSubmit = async (e) => {
        e.preventDefault();
        if ((carouselForm.sourceType === 'product' || carouselForm.sourceType === 'category') && !carouselForm.sourceId) {
            toast.error("Select a source");
            return;
        }
        if (carouselForm.sourceType === 'manual' && !carouselForm.imageUrl.trim()) {
            toast.error("Image URL is required for manual cards");
            return;
        }
        setIsCarouselSaving(true);
        try {
            const payload = {
                title: carouselForm.title.trim(),
                description: carouselForm.description.trim(),
                sourceType: carouselForm.sourceType,
                sourceId: carouselForm.sourceId || null,
                imageUrl: carouselForm.sourceType === 'manual' ? carouselForm.imageUrl.trim() : '',
                buttonLabel: carouselForm.buttonLabel.trim(),
                buttonLink: carouselForm.buttonLink.trim(),
                status: carouselForm.status,
                displayOrder: carouselForm.displayOrder === '' ? null : Number(carouselForm.displayOrder)
            };
            if (editingCarouselCardId) {
                await updateCarouselCard(editingCarouselCardId, payload);
                toast.success("Carousel card updated");
            } else {
                await createCarouselCard(payload);
                toast.success("Carousel card created");
            }
            resetCarouselForm();
            await loadCarouselCards();
        } catch (error) {
            toast.error("Failed to save carousel card");
        } finally {
            setIsCarouselSaving(false);
        }
    };

    const handleEditCarouselCard = (card) => {
        setEditingCarouselCardId(card.id);
        setCarouselForm({
            title: card.title || '',
            description: card.description || '',
            sourceType: card.source_type || 'manual',
            sourceId: card.source_id ? String(card.source_id) : '',
            imageUrl: card.image_url || '',
            buttonLabel: card.button_label || '',
            buttonLink: card.button_link || '',
            status: card.status || 'active',
            displayOrder: Number.isFinite(Number(card.display_order)) ? String(card.display_order) : ''
        });
        setOpenCmsSection('bottom-carousel');
    };

    const sectionHasContent = (id) => {
        if (id === 'hero-carousel') return slides.length > 0;
        if (id === 'hero-texts') return heroTexts.length > 0;
        if (id === 'home-banner-1') return Boolean(bannerData?.image_url && bannerData.image_url !== '/placeholder_banner.jpg');
        if (id === 'home-banner-2') return Boolean(secondaryBannerData?.image_url && secondaryBannerData.image_url !== '/placeholder_banner.jpg');
        if (id === 'home-banner-3') return Boolean(tertiaryBannerData?.image_url && tertiaryBannerData.image_url !== '/placeholder_banner.jpg');
        if (id === 'featured-category') return Boolean(featuredCategoryId);
        if (id === 'bottom-carousel') return carouselCards.length > 0;
        return false;
    };

    return (
        <div className="animate-fade-in space-y-8 max-w-5xl mx-auto">
            <Modal 
                isOpen={modalConfig.isOpen}
                onClose={() => setModalConfig({
                    isOpen: false,
                    type: 'delete',
                    title: '',
                    message: '',
                    targetId: null,
                    targetKind: 'slide'
                })}
                onConfirm={handleConfirmDelete}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                confirmText="Delete"
            />
            
            {/* HEADER */}
            <div>
                <h1 className="text-2xl md:text-3xl font-serif text-primary font-bold">CMS Settings</h1>
                <p className="text-gray-500 text-sm mt-1">Manage homepage content blocks and promotional assets.</p>
            </div>

            <AccordionSection
                id="hero-carousel"
                title="Hero Carousel"
                subtitle="Manage slides and their order"
                icon={ImageIcon}
                openCmsSection={openCmsSection}
                setOpenCmsSection={setOpenCmsSection}
                sectionHasContent={sectionHasContent}
                isAutopilotEnabled={isAutopilotEnabled}
            >
                <div className="space-y-6">
                    <div className="bg-white p-4 rounded-xl border border-gray-200">
                        <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                            <Plus size={20} className="text-primary"/> Add New Slide
                        </h3>
                        <form onSubmit={handleUpload} className="flex flex-col md:flex-row gap-6">
                            <div className="w-full md:w-1/3">
                                <label
                                    className="cursor-pointer group relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-xl hover:bg-gray-50 hover:border-primary transition-all"
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => handleImageDrop(e, setSelectedFile, setPreviewUrl)}
                                >
                                    {previewUrl ? (
                                        <img src={previewUrl} className="w-full h-full object-cover rounded-xl" />
                                    ) : (
                                        <div className="text-center p-4">
                                            <UploadCloud className="w-10 h-10 text-gray-400 mb-2 mx-auto group-hover:text-primary" />
                                            <span className="text-sm text-gray-500 font-medium">Click to upload image</span>
                                            <span className="text-xs text-gray-400 block mt-1">(1920x1080 recommended, or drag & drop)</span>
                                        </div>
                                    )}
                                    <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                                </label>
                            </div>
                            <div className="flex-1 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <input
                                        placeholder="Main Title (e.g. Artisanal Excellence)"
                                        className="input-field"
                                        value={newSlide.title}
                                        onChange={e => setNewSlide({ ...newSlide, title: e.target.value })}
                                    />
                                    <input
                                        placeholder="Subtitle (e.g. Handmade with Love)"
                                        className="input-field"
                                        value={newSlide.subtitle}
                                        onChange={e => setNewSlide({ ...newSlide, subtitle: e.target.value })}
                                    />
                                </div>
                                <input
                                    placeholder="Button Link (e.g. /shop/necklaces)"
                                    className="input-field"
                                    value={newSlide.link}
                                    onChange={e => setNewSlide({ ...newSlide, link: e.target.value })}
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
                                            type="button"
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
            </AccordionSection>

            {/* HERO TEXTS SECTION */}
            <AccordionSection
                id="hero-texts"
                title="Hero Text Carousel"
                subtitle="Short single-line highlights shown above the hero."
                icon={Sparkles}
                openCmsSection={openCmsSection}
                setOpenCmsSection={setOpenCmsSection}
                sectionHasContent={sectionHasContent}
            >
                <form onSubmit={handleHeroTextAdd} className="flex flex-col md:flex-row gap-3">
                    <input
                        placeholder="Add new text..."
                        className="input-field flex-1"
                        value={heroTextInput}
                        onChange={(e) => setHeroTextInput(e.target.value)}
                    />
                    <button
                        type="submit"
                        disabled={isHeroTextLoading}
                        className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isHeroTextLoading ? <Loader2 className="animate-spin"/> : <Plus size={18} />}
                        Add Text
                    </button>
                </form>
                {heroTexts.length === 0 ? (
                    <div className="text-sm text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4 text-center">
                        No texts yet. Add one above.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {heroTexts.map((item, index) => (
                            <div
                                key={item.id}
                                draggable
                                onDragStart={() => handleHeroTextDragStart(index)}
                                onDragOver={(e) => handleHeroTextDragOver(e, index)}
                                onDragEnd={handleHeroTextDragEnd}
                                className={`flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3 ${
                                    draggedTextIndex === index ? 'opacity-50 border-accent' : 'hover:bg-white'
                                }`}
                            >
                                <div className="cursor-grab text-gray-400 hover:text-gray-600">
                                    <GripVertical size={18} />
                                </div>
                                <input
                                    defaultValue={item.text}
                                    className="flex-1 bg-transparent outline-none text-sm text-gray-700"
                                    onBlur={(e) => {
                                        const nextText = e.target.value.trim();
                                        if (nextText && nextText !== item.text) {
                                            handleHeroTextUpdate(item.id, nextText);
                                        }
                                    }}
                                />
                                <button
                                    onClick={() => handleHeroTextDelete(item.id)}
                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    type="button"
                                    title="Delete text"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </AccordionSection>

            {/* HOME BANNER SECTION */}
            <AccordionSection
                id="home-banner-1"
                title="Home Banner (16:9)"
                icon={ImageIcon}
                openCmsSection={openCmsSection}
                setOpenCmsSection={setOpenCmsSection}
                sectionHasContent={sectionHasContent}
            >
                <form onSubmit={handleBannerUpdate} className="flex flex-col md:flex-row gap-6">
                    <div className="w-full md:w-1/3">
                        <label
                            className="cursor-pointer group relative flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-xl hover:bg-gray-50 hover:border-primary transition-all"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleImageDrop(e, setBannerFile, setBannerPreview)}
                        >
                            {bannerPreview ? (
                                <img src={bannerPreview} className="w-full h-full object-cover rounded-xl" />
                            ) : (
                                <div className="text-center p-4">
                                    <UploadCloud className="w-10 h-10 text-gray-400 mb-2 mx-auto group-hover:text-primary" />
                                    <span className="text-sm text-gray-500 font-medium">Click to upload banner</span>
                                    <span className="text-xs text-gray-400 block mt-1">(16:9 recommended, or drag & drop)</span>
                                </div>
                            )}
                            <input type="file" className="hidden" accept="image/*" onChange={handleBannerFileChange} />
                        </label>
                    </div>
                    <div className="flex-1 space-y-4">
                        <input 
                            placeholder="Banner Link (e.g. /shop/best-sellers)" 
                            className="input-field"
                            value={bannerLink}
                            onChange={e => {
                                bannerLinkDirtyRef.current = true;
                                setBannerLink(e.target.value);
                            }}
                        />
                        <div className="pt-2 flex justify-end">
                            <button
                                type="button"
                                disabled={isBannerUpdating || !bannerData?.image_url}
                                onClick={handleRemoveBannerImage}
                                className="mr-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Remove Image
                            </button>
                            <button 
                                type="submit" 
                                disabled={isBannerUpdating}
                                className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isBannerUpdating ? <Loader2 className="animate-spin"/> : <Save size={18} />}
                                Save Banner
                            </button>
                        </div>
                        {bannerData?.image_url && (
                            <p className="text-xs text-gray-400">Current image: {bannerData.image_url}</p>
                        )}
                    </div>
                </form>
            </AccordionSection>

            {/* SECONDARY HOME BANNER SECTION */}
            <AccordionSection
                id="home-banner-2"
                title="Home Banner 2 (16:9)"
                icon={ImageIcon}
                openCmsSection={openCmsSection}
                setOpenCmsSection={setOpenCmsSection}
                sectionHasContent={sectionHasContent}
            >
                <form onSubmit={handleSecondaryBannerUpdate} className="flex flex-col md:flex-row gap-6">
                    <div className="w-full md:w-1/3">
                        <label
                            className="cursor-pointer group relative flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-xl hover:bg-gray-50 hover:border-primary transition-all"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleImageDrop(e, setSecondaryBannerFile, setSecondaryBannerPreview)}
                        >
                            {secondaryBannerPreview ? (
                                <img src={secondaryBannerPreview} className="w-full h-full object-cover rounded-xl" />
                            ) : (
                                <div className="text-center p-4">
                                    <UploadCloud className="w-10 h-10 text-gray-400 mb-2 mx-auto group-hover:text-primary" />
                                    <span className="text-sm text-gray-500 font-medium">Click to upload banner</span>
                                    <span className="text-xs text-gray-400 block mt-1">(16:9 recommended, or drag & drop)</span>
                                </div>
                            )}
                            <input type="file" className="hidden" accept="image/*" onChange={handleSecondaryBannerFileChange} />
                        </label>
                    </div>
                    <div className="flex-1 space-y-4">
                        <input 
                            placeholder="Banner Link (e.g. /shop/new-arrivals)" 
                            className="input-field"
                            value={secondaryBannerLink}
                            onChange={e => {
                                secondaryBannerLinkDirtyRef.current = true;
                                setSecondaryBannerLink(e.target.value);
                            }}
                        />
                        <div className="pt-2 flex justify-end">
                            <button
                                type="button"
                                disabled={isSecondaryBannerUpdating || !secondaryBannerData?.image_url}
                                onClick={handleRemoveSecondaryBannerImage}
                                className="mr-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Remove Image
                            </button>
                            <button 
                                type="submit" 
                                disabled={isSecondaryBannerUpdating}
                                className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSecondaryBannerUpdating ? <Loader2 className="animate-spin"/> : <Save size={18} />}
                                Save Banner
                            </button>
                        </div>
                        {secondaryBannerData?.image_url && (
                            <p className="text-xs text-gray-400">Current image: {secondaryBannerData.image_url}</p>
                        )}
                    </div>
                </form>
            </AccordionSection>

            <AccordionSection
                id="home-banner-3"
                title="Home Banner 3 (16:9)"
                icon={ImageIcon}
                openCmsSection={openCmsSection}
                setOpenCmsSection={setOpenCmsSection}
                sectionHasContent={sectionHasContent}
            >
                <form onSubmit={handleTertiaryBannerUpdate} className="flex flex-col md:flex-row gap-6">
                    <div className="w-full md:w-1/3">
                        <label
                            className="cursor-pointer group relative flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-xl hover:bg-gray-50 hover:border-primary transition-all"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleImageDrop(e, setTertiaryBannerFile, setTertiaryBannerPreview)}
                        >
                            {tertiaryBannerPreview ? (
                                <img src={tertiaryBannerPreview} className="w-full h-full object-cover rounded-xl" />
                            ) : (
                                <div className="text-center p-4">
                                    <UploadCloud className="w-10 h-10 text-gray-400 mb-2 mx-auto group-hover:text-primary" />
                                    <span className="text-sm text-gray-500 font-medium">Click to upload banner</span>
                                    <span className="text-xs text-gray-400 block mt-1">(16:9 recommended, or drag & drop)</span>
                                </div>
                            )}
                            <input type="file" className="hidden" accept="image/*" onChange={handleTertiaryBannerFileChange} />
                        </label>
                    </div>
                    <div className="flex-1 space-y-4">
                        <input
                            placeholder="Banner Link (e.g. /shop/offers)"
                            className="input-field"
                            value={tertiaryBannerLink}
                            onChange={e => {
                                tertiaryBannerLinkDirtyRef.current = true;
                                setTertiaryBannerLink(e.target.value);
                            }}
                        />
                        <div className="pt-2 flex justify-end">
                            <button
                                type="button"
                                disabled={isTertiaryBannerUpdating || !tertiaryBannerData?.image_url}
                                onClick={handleRemoveTertiaryBannerImage}
                                className="mr-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Remove Image
                            </button>
                            <button
                                type="submit"
                                disabled={isTertiaryBannerUpdating}
                                className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isTertiaryBannerUpdating ? <Loader2 className="animate-spin"/> : <Save size={18} />}
                                Save Banner
                            </button>
                        </div>
                        {tertiaryBannerData?.image_url && (
                            <p className="text-xs text-gray-400">Current image: {tertiaryBannerData.image_url}</p>
                        )}
                    </div>
                </form>
            </AccordionSection>

            <AccordionSection
                id="bottom-carousel"
                title="Bottom Carousel Cards"
                subtitle="Swiggy-style card slider shown before footer on home page."
                icon={PanelBottom}
                openCmsSection={openCmsSection}
                setOpenCmsSection={setOpenCmsSection}
                sectionHasContent={sectionHasContent}
            >
                <div className="space-y-5">
                    <form onSubmit={handleCarouselFormSubmit} className="space-y-4 bg-white border border-gray-200 rounded-xl p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input
                                className="input-field"
                                placeholder="Card title"
                                value={carouselForm.title}
                                onChange={(e) => setCarouselForm((prev) => ({ ...prev, title: e.target.value }))}
                            />
                            <input
                                className="input-field"
                                placeholder="Button label (optional)"
                                value={carouselForm.buttonLabel}
                                onChange={(e) => setCarouselForm((prev) => ({ ...prev, buttonLabel: e.target.value }))}
                            />
                        </div>
                        <textarea
                            className="input-field min-h-[90px]"
                            placeholder="Description"
                            value={carouselForm.description}
                            onChange={(e) => setCarouselForm((prev) => ({ ...prev, description: e.target.value }))}
                        />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <select
                                className="input-field"
                                value={carouselForm.sourceType}
                                onChange={(e) => setCarouselForm((prev) => ({
                                    ...prev,
                                    sourceType: e.target.value,
                                    sourceId: '',
                                    imageUrl: e.target.value === 'manual' ? prev.imageUrl : ''
                                }))}
                            >
                                <option value="manual">Manual image</option>
                                <option value="product">Product image</option>
                                <option value="category">Category image</option>
                            </select>
                            {carouselForm.sourceType === 'product' && (
                                <select
                                    className="input-field md:col-span-2"
                                    value={carouselForm.sourceId}
                                    onChange={(e) => setCarouselForm((prev) => ({ ...prev, sourceId: e.target.value }))}
                                >
                                    <option value="">Select Product...</option>
                                    {carouselProducts.map((product) => (
                                        <option key={product.id} value={product.id}>
                                            {product.title}
                                        </option>
                                    ))}
                                </select>
                            )}
                            {carouselForm.sourceType === 'category' && (
                                <select
                                    className="input-field md:col-span-2"
                                    value={carouselForm.sourceId}
                                    onChange={(e) => setCarouselForm((prev) => ({ ...prev, sourceId: e.target.value }))}
                                >
                                    <option value="">Select Category...</option>
                                    {carouselCategories.map((category) => (
                                        <option key={category.id} value={category.id}>
                                            {category.name}
                                        </option>
                                    ))}
                                </select>
                            )}
                            {carouselForm.sourceType === 'manual' && (
                                <>
                                    <input
                                        className="input-field md:col-span-2"
                                        placeholder="Manual image URL"
                                        value={carouselForm.imageUrl}
                                        onChange={(e) => setCarouselForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
                                    />
                                </>
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <input
                                className="input-field md:col-span-2"
                                placeholder="Button link (e.g. /shop or https://...)"
                                value={carouselForm.buttonLink}
                                onChange={(e) => setCarouselForm((prev) => ({ ...prev, buttonLink: e.target.value }))}
                            />
                            <input
                                className="input-field"
                                type="number"
                                min="0"
                                placeholder="Display order"
                                value={carouselForm.displayOrder}
                                onChange={(e) => setCarouselForm((prev) => ({ ...prev, displayOrder: e.target.value }))}
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <select
                                className="input-field"
                                value={carouselForm.status}
                                onChange={(e) => setCarouselForm((prev) => ({ ...prev, status: e.target.value }))}
                            >
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                            <div className="md:col-span-2 flex md:justify-end gap-2">
                                {editingCarouselCardId && (
                                    <button
                                        type="button"
                                        onClick={resetCarouselForm}
                                        className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50"
                                    >
                                        Cancel edit
                                    </button>
                                )}
                                <button
                                    type="submit"
                                    disabled={isCarouselSaving}
                                    className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isCarouselSaving ? <Loader2 className="animate-spin"/> : <Save size={18} />}
                                    {editingCarouselCardId ? 'Update Card' : 'Create Card'}
                                </button>
                            </div>
                        </div>
                    </form>

                    {isCarouselLoading ? (
                        <div className="py-10 text-center"><Loader2 className="animate-spin mx-auto text-primary" /></div>
                    ) : carouselCards.length === 0 ? (
                        <div className="text-sm text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4 text-center">
                            No carousel cards yet. Add one above.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {carouselCards.map((card) => (
                                <div key={card.id} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
                                    <div className="w-24 h-16 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 shrink-0">
                                        {card.resolved_image_url || card.image_url ? (
                                            <img src={card.resolved_image_url || card.image_url} alt={card.title} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">No image</div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-800 truncate">{card.title}</p>
                                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                                            {String(card.source_type || 'manual').toUpperCase()}
                                            {card.source_id ? ` • ${card.source_id}` : ''}
                                            {card.button_link ? ` • ${card.button_link}` : ''}
                                        </p>
                                    </div>
                                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full border ${card.status === 'active' ? 'text-green-700 bg-green-50 border-green-200' : 'text-gray-600 bg-gray-100 border-gray-200'}`}>
                                        {card.status}
                                    </span>
                                    <button
                                        type="button"
                                        className="p-2 text-gray-500 hover:text-primary hover:bg-gray-100 rounded-lg"
                                        onClick={() => handleEditCarouselCard(card)}
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                        onClick={() => openDeleteCarouselModal(card.id)}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </AccordionSection>

            {/* FEATURED CATEGORY SECTION */}
            <AccordionSection
                id="featured-category"
                title="Featured Category Section"
                icon={Save}
                openCmsSection={openCmsSection}
                setOpenCmsSection={setOpenCmsSection}
                sectionHasContent={sectionHasContent}
                isAutopilotEnabled={isAutopilotEnabled}
            >
                <div className="space-y-4">
                    <label
                        className="flex items-center justify-between bg-gray-50 rounded-xl border border-gray-200 px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div>
                            <p className="text-sm font-semibold text-gray-700">Enable Auto Pilot</p>
                            <p className="text-xs text-gray-500 mt-1">
                                Auto-rotates weekly and prioritizes categories the customer has not purchased from.
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            className="h-5 w-5 accent-primary"
                            checked={isAutopilotEnabled}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleAutopilotToggle(e.target.checked)}
                        />
                    </label>
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={handleAutopilotSave}
                            disabled={isAutopilotSaving}
                            className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isAutopilotSaving ? <Loader2 className="animate-spin"/> : <Save size={18} />}
                            Save Auto Pilot
                        </button>
                    </div>
                    <form
                        onSubmit={handleFeaturedCategorySave}
                        className={`space-y-4 transition-all ${isAutopilotEnabled ? 'opacity-60' : ''}`}
                    >
                        <div className={`space-y-4 ${isAutopilotEnabled ? 'pointer-events-none blur-[1px]' : ''}`}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <select
                                    value={featuredCategoryId}
                                    onChange={(e) => {
                                        featuredDraftDirtyRef.current = true;
                                        const nextId = e.target.value;
                                        setFeaturedCategoryId(nextId);
                                        if (!featuredTitle) {
                                            const found = featuredCategories.find(c => String(c.id) === String(nextId));
                                            if (found?.name) setFeaturedTitle(found.name);
                                        }
                                    }}
                                    className="input-field"
                                >
                                    <option value="">Select Category...</option>
                                    {featuredCategories.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.name}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    placeholder="Title (defaults to category name)"
                                    className="input-field"
                                    value={featuredTitle}
                                    onChange={(e) => {
                                        featuredDraftDirtyRef.current = true;
                                        setFeaturedTitle(e.target.value);
                                    }}
                                />
                            </div>
                            <input
                                placeholder="Subtitle"
                                className="input-field"
                                value={featuredSubtitle}
                                onChange={(e) => {
                                    featuredDraftDirtyRef.current = true;
                                    setFeaturedSubtitle(e.target.value);
                                }}
                            />
                        </div>
                        {isAutopilotEnabled && (
                            <p className="text-xs text-gray-500">
                                Disable Auto Pilot to manually edit featured category fields.
                            </p>
                        )}
                        <div className="pt-2 flex justify-end">
                            <button
                                type="submit"
                                disabled={isFeaturedLoading || isAutopilotEnabled}
                                className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isFeaturedLoading ? <Loader2 className="animate-spin"/> : <Save size={18} />}
                                Save Featured Section
                            </button>
                        </div>
                    </form>
                </div>
            </AccordionSection>

            {/* Legacy autopilot section intentionally merged into featured-category accordion */}
        </div>
    );
}
