const Wishlist = require('../models/Wishlist');

const emitWishlistUpdate = (req, userId, productIds = []) => {
    const io = req.app.get('io');
    if (!io || !userId) return;
    io.to(`user:${userId}`).emit('wishlist:update', { productIds });
};

const getWishlist = async (req, res) => {
    try {
        const productIds = await Wishlist.getByUser(req.user.id);
        res.json({ productIds });
    } catch (error) {
        console.error('Wishlist fetch error:', error);
        res.status(500).json({ message: 'Failed to fetch wishlist' });
    }
};

const addWishlistItem = async (req, res) => {
    try {
        const productId = String(req.body?.productId || '').trim();
        if (!productId) return res.status(400).json({ message: 'productId required' });
        await Wishlist.addItem(req.user.id, productId);
        const productIds = await Wishlist.getByUser(req.user.id);
        emitWishlistUpdate(req, req.user.id, productIds);
        res.json({ productIds });
    } catch (error) {
        console.error('Wishlist add error:', error);
        res.status(500).json({ message: 'Failed to add wishlist item' });
    }
};

const removeWishlistItem = async (req, res) => {
    try {
        const productId = String(req.body?.productId || '').trim();
        if (!productId) return res.status(400).json({ message: 'productId required' });
        await Wishlist.removeItem(req.user.id, productId);
        const productIds = await Wishlist.getByUser(req.user.id);
        emitWishlistUpdate(req, req.user.id, productIds);
        res.json({ productIds });
    } catch (error) {
        console.error('Wishlist remove error:', error);
        res.status(500).json({ message: 'Failed to remove wishlist item' });
    }
};

const clearWishlist = async (req, res) => {
    try {
        await Wishlist.clearUser(req.user.id);
        emitWishlistUpdate(req, req.user.id, []);
        res.json({ productIds: [] });
    } catch (error) {
        console.error('Wishlist clear error:', error);
        res.status(500).json({ message: 'Failed to clear wishlist' });
    }
};

module.exports = {
    getWishlist,
    addWishlistItem,
    removeWishlistItem,
    clearWishlist
};
