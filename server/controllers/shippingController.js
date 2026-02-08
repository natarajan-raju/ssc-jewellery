const Shipping = require('../models/Shipping');

const emitUpdate = async (io) => {
    if (!io) return;
    const zones = await Shipping.getAll();
    io.emit('shipping:update', { zones });
};

const getZones = async (req, res) => {
    try {
        const zones = await Shipping.getAll();
        res.json({ zones });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch shipping zones' });
    }
};

const createZone = async (req, res) => {
    try {
        const { name, states, options } = req.body;
        if (!name) return res.status(400).json({ message: 'Zone name required' });
        const zoneId = await Shipping.createZone({ name, states, options });
        const zones = await Shipping.getAll();
        const io = req.app.get('io');
        await emitUpdate(io);
        res.status(201).json({ zoneId, zones });
    } catch (error) {
        res.status(500).json({ message: 'Failed to create zone' });
    }
};

const updateZone = async (req, res) => {
    try {
        const { name, states, options } = req.body;
        const zoneId = req.params.id;
        await Shipping.updateZone(zoneId, { name, states, options });
        const zones = await Shipping.getAll();
        const io = req.app.get('io');
        await emitUpdate(io);
        res.json({ zones });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update zone' });
    }
};

const deleteZone = async (req, res) => {
    try {
        await Shipping.deleteZone(req.params.id);
        const zones = await Shipping.getAll();
        const io = req.app.get('io');
        await emitUpdate(io);
        res.json({ zones });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete zone' });
    }
};

module.exports = { getZones, createZone, updateZone, deleteZone };
