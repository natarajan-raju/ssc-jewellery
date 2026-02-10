import { useEffect, useState } from 'react';
import { Package, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { orderService } from '../services/orderService';
import { useToast } from '../context/ToastContext';
import { Link, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';

const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString();
};

const formatDateTime = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
};

const STATUS_STEPS = ['confirmed', 'pending', 'shipped', 'completed'];
const normalizeStatus = (status) => {
    return status || 'confirmed';
};
const statusIndex = (status) => {
    const normalized = normalizeStatus(status);
    const idx = STATUS_STEPS.indexOf(normalized);
    return idx >= 0 ? idx : 0;
};

export default function Orders() {
    const { user, loading } = useAuth();
    const { socket } = useSocket();
    const toast = useToast();
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [duration, setDuration] = useState('all');

    useEffect(() => {
        if (!loading && !user) {
            navigate(`/login?redirect=${encodeURIComponent('/orders')}`, { replace: true });
        }
    }, [loading, user, navigate]);

    useEffect(() => {
        if (!user) return;
        const load = async () => {
            setIsLoading(true);
            try {
                const data = await orderService.getMyOrders();
                setOrders(data.orders || []);
            } catch (error) {
                toast.error(error.message || 'Failed to load orders');
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [user, toast]);

    useEffect(() => {
        if (!socket) return;
        const handleUpdate = (payload = {}) => {
            const orderId = payload.orderId;
            if (!orderId) return;
            orderService.getMyOrders().then((data) => {
                setOrders(data.orders || []);
                if (selectedOrder && String(selectedOrder.id) === String(orderId)) {
                    const updated = (data.orders || []).find(o => String(o.id) === String(orderId));
                    if (updated) setSelectedOrder(updated);
                }
            }).catch(() => {});
        };
        socket.on('order:update', handleUpdate);
        return () => socket.off('order:update', handleUpdate);
    }, [socket, selectedOrder]);

    if (!user) return null;

    return (
        <div className="min-h-screen bg-secondary">
            <div className="max-w-5xl mx-auto px-4 md:px-8 py-10 md:py-12">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-serif text-primary">My Orders</h1>
                        <p className="text-sm text-gray-500 mt-2">Track your recent purchases and delivery status.</p>
                    </div>
                    <Link to="/shop" className="text-sm font-semibold text-primary">Continue shopping</Link>
                </div>

                {isLoading ? (
                    <div className="py-16 text-center text-gray-400">Loading orders...</div>
                ) : orders.length === 0 ? (
                    <div className="py-16 text-center text-gray-400">
                        No orders yet. <Link to="/shop" className="text-primary font-semibold">Start shopping</Link>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                            <p className="text-sm text-gray-500">Filter by duration</p>
                            <select
                                value={duration}
                                onChange={(e) => setDuration(e.target.value)}
                                className="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 bg-white"
                            >
                                <option value="all">All time</option>
                                <option value="7">Last 7 days</option>
                                <option value="30">Last 30 days</option>
                                <option value="90">Last 90 days</option>
                            </select>
                        </div>
                        {orders.filter((order) => {
                            if (duration === 'all') return true;
                            const days = Number(duration);
                            const created = new Date(order.created_at);
                            if (Number.isNaN(created.getTime())) return true;
                            const cutoff = new Date();
                            cutoff.setDate(cutoff.getDate() - days);
                            return created >= cutoff;
                        }).map((order) => (
                            <div
                                key={order.id}
                                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
                            >
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                    <div>
                                        <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Order Ref</p>
                                        <p className="text-lg font-semibold text-gray-800">{order.order_ref}</p>
                                        <p className="text-sm text-gray-500 mt-1">Placed on {formatDate(order.created_at)}</p>
                                    </div>
                                    <div className="text-sm text-gray-600">
                                        <div className="flex items-center gap-2">
                                            <Package size={16} className="text-primary" />
                                            <span>{order.items?.length || 0} items</span>
                                        </div>
                                        <p className="mt-1 font-semibold text-gray-800">₹{Number(order.total || 0).toLocaleString()}</p>
                                    </div>
                                        <button
                                            onClick={() => {
                                                setSelectedOrder(order);
                                                setDetailsOpen(true);
                                            }}
                                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                                        >
                                            View Details <ChevronRight size={16} />
                                        </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {detailsOpen && selectedOrder && (
                    <div className="fixed inset-0 z-[90] flex items-stretch justify-end bg-black/40 backdrop-blur-sm">
                        <div className="bg-white w-full max-w-md h-full shadow-2xl p-6 overflow-y-auto">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xl font-semibold text-gray-900">{selectedOrder.order_ref}</h3>
                                <button onClick={() => setDetailsOpen(false)} className="text-gray-400 hover:text-gray-600">Close</button>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">Placed on {formatDate(selectedOrder.created_at)}</p>

                            <div className="mt-5">
                                <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Track Order</p>
                            {selectedOrder.status === 'cancelled' ? (
                                <div className="mt-3 text-sm font-semibold text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                                    Order cancelled
                                </div>
                            ) : (
                                    <div className="mt-3">
                                        <input
                                            type="range"
                                            min="0"
                                            max={STATUS_STEPS.length - 1}
                                            value={statusIndex(selectedOrder.status)}
                                            readOnly
                                            className="w-full accent-emerald-500"
                                        />
                                        <div className="mt-3 flex items-center justify-between gap-2">
                                        {STATUS_STEPS.map((step, idx) => {
                                            const active = idx <= statusIndex(selectedOrder.status);
                                            return (
                                                <div key={step} className="flex-1 flex flex-col items-center">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                                        active ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'
                                                    }`}>
                                                        {idx + 1}
                                                    </div>
                                                    <p className={`mt-2 text-[11px] uppercase tracking-widest ${
                                                        active ? 'text-emerald-600' : 'text-gray-400'
                                                    }`}>
                                                        {step}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="mt-5">
                                <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Status Timeline</p>
                                <div className="mt-3 space-y-2">
                                    {(selectedOrder.events || []).map((evt) => (
                                        <div key={evt.id} className="flex items-center justify-between text-sm">
                                            <span className="font-semibold text-gray-700 capitalize">{evt.status}</span>
                                            <span className="text-xs text-gray-400">{formatDateTime(evt.created_at)}</span>
                                        </div>
                                    ))}
                                    {(!selectedOrder.events || selectedOrder.events.length === 0) && (
                                        <p className="text-sm text-gray-400">No timeline data yet.</p>
                                    )}
                                </div>
                            </div>
                            <div className="mt-4 border border-gray-200 rounded-xl divide-y">
                                {(selectedOrder.items || []).map((item) => (
                                    <div key={item.id} className="flex items-center gap-3 p-4">
                                        <div className="w-12 h-12 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden">
                                            {item.image_url && <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-800 line-clamp-1">{item.title}</p>
                                            {item.variant_title && <p className="text-xs text-gray-500">{item.variant_title}</p>}
                                            <p className="text-xs text-gray-400 mt-1">Qty: {item.quantity}</p>
                                        </div>
                                        <div className="text-sm font-semibold text-gray-800">
                                            ₹{Number(item.line_total || 0).toLocaleString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 flex items-center justify-between text-sm font-semibold">
                                <span>Total</span>
                                <span>₹{Number(selectedOrder.total || 0).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
