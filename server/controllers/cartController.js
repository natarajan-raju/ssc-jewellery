const Cart = require('../models/Cart');

const getCart = async (req, res) => {
    try {
        const items = await Cart.getByUser(req.user.id);
        res.json({ items });
    } catch (error) {
        console.error('Cart fetch error:', error);
        res.status(500).json({ message: 'Failed to fetch cart' });
    }
};

const addCartItem = async (req, res) => {
    try {
        const { productId, variantId, quantity } = req.body || {};
        if (!productId) return res.status(400).json({ message: 'productId required' });
        await Cart.addItem(req.user.id, productId, variantId, quantity);
        const items = await Cart.getByUser(req.user.id);
        res.json({ items });
    } catch (error) {
        console.error('Cart add error:', error);
        res.status(500).json({ message: 'Failed to add item' });
    }
};

const updateCartItem = async (req, res) => {
    try {
        const { productId, variantId, quantity } = req.body || {};
        if (!productId) return res.status(400).json({ message: 'productId required' });
        await Cart.setItemQuantity(req.user.id, productId, variantId, quantity);
        const items = await Cart.getByUser(req.user.id);
        res.json({ items });
    } catch (error) {
        console.error('Cart update error:', error);
        res.status(500).json({ message: 'Failed to update item' });
    }
};

const removeCartItem = async (req, res) => {
    try {
        const { productId, variantId } = req.body || {};
        if (!productId) return res.status(400).json({ message: 'productId required' });
        await Cart.removeItem(req.user.id, productId, variantId);
        const items = await Cart.getByUser(req.user.id);
        res.json({ items });
    } catch (error) {
        console.error('Cart remove error:', error);
        res.status(500).json({ message: 'Failed to remove item' });
    }
};

const clearCart = async (req, res) => {
    try {
        await Cart.clearUser(req.user.id);
        res.json({ items: [] });
    } catch (error) {
        console.error('Cart clear error:', error);
        res.status(500).json({ message: 'Failed to clear cart' });
    }
};

const bulkAddCart = async (req, res) => {
    try {
        const { items } = req.body || {};
        await Cart.bulkAdd(req.user.id, items || []);
        const updated = await Cart.getByUser(req.user.id);
        res.json({ items: updated });
    } catch (error) {
        console.error('Cart bulk error:', error);
        res.status(500).json({ message: 'Failed to merge cart' });
    }
};

module.exports = { getCart, addCartItem, updateCartItem, removeCartItem, clearCart, bulkAddCart };
