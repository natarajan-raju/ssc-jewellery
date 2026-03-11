const getSocketRoomsForUser = ({ userId = null, role = '' } = {}) => {
    const rooms = [];
    const normalizedUserId = String(userId || '').trim();
    const normalizedRole = String(role || '').trim().toLowerCase();
    if (normalizedUserId) {
        rooms.push(`user:${normalizedUserId}`);
    }
    if (normalizedRole === 'admin' || normalizedRole === 'staff') {
        rooms.push('admin');
    }
    return rooms;
};

const emitToOrderAudiences = (io, order = null, eventName = '', payload = {}) => {
    if (!io || !order || !eventName) return;
    io.to('admin').emit(eventName, payload);
    if (order?.user_id) {
        io.to(`user:${order.user_id}`).emit(eventName, payload);
    }
};

module.exports = {
    getSocketRoomsForUser,
    emitToOrderAudiences
};
