const Order = require('../models/Order');

const createOrderFromCheckout = async (req, res) => {
    try {
        const userId = req.user.id;
        const { billingAddress, shippingAddress } = req.body || {};

        const order = await Order.createFromCart(userId, { billingAddress, shippingAddress });
        const io = req.app.get('io');
        if (io) {
            io.emit('order:create', { order });
            io.to(`user:${userId}`).emit('order:update', { orderId: order.id, status: order.status || 'confirmed', order });
        }
        res.status(201).json({ order });
    } catch (error) {
        res.status(400).json({ message: error.message || 'Failed to place order' });
    }
};

const getAdminOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const status = req.query.status || 'all';
        const search = req.query.search || '';
        const startDate = req.query.startDate || '';
        const endDate = req.query.endDate || '';
        const result = await Order.getPaginated({ page, limit, status, search, startDate, endDate });
        const metrics = await Order.getMetrics();
        res.json({ orders: result.orders, pagination: { currentPage: page, totalPages: result.totalPages, totalOrders: result.total }, metrics });
    } catch (error) {
        res.status(500).json({ message: 'Failed to load orders' });
    }
};

const getAdminOrderById = async (req, res) => {
    try {
        const order = await Order.getById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        res.json({ order });
    } catch (error) {
        res.status(500).json({ message: 'Failed to load order' });
    }
};

const getMyOrders = async (req, res) => {
    try {
        const orders = await Order.getByUser(req.user.id);
        res.json({ orders });
    } catch (error) {
        res.status(500).json({ message: 'Failed to load orders' });
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body || {};
        await Order.updateStatus(req.params.id, status);
        const order = await Order.getById(req.params.id);
        const io = req.app.get('io');
        if (io) {
            io.emit('order:update', { orderId: req.params.id, status, order });
            if (order?.user_id) {
                io.to(`user:${order.user_id}`).emit('order:update', { orderId: req.params.id, status, order });
            }
        }
        res.json({ order });
    } catch (error) {
        res.status(400).json({ message: error.message || 'Failed to update order' });
    }
};

module.exports = { createOrderFromCheckout, getAdminOrders, getAdminOrderById, getMyOrders, updateOrderStatus };
