import { useEffect, useMemo, useState } from 'react';
import { Search, Filter, Package, IndianRupee, Clock3, CheckCircle2, X } from 'lucide-react';
import { orderService } from '../../services/orderService';
import { useToast } from '../../context/ToastContext';
import { useSocket } from '../../context/SocketContext';

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

export default function Orders() {
    const toast = useToast();
    const { socket } = useSocket();
    const [orders, setOrders] = useState([]);
    const [metrics, setMetrics] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isDetailsLoading, setIsDetailsLoading] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

    const fetchOrders = async () => {
        setIsLoading(true);
        try {
            const data = await orderService.getAdminOrders({ page, status: statusFilter, search, startDate, endDate, limit: 12 });
            setOrders(data.orders || []);
            setMetrics(data.metrics || null);
            setTotalPages(data.pagination?.totalPages || 1);
        } catch (error) {
            toast.error(error.message || 'Failed to load orders');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
    }, [page, statusFilter]);

    useEffect(() => {
        if (!socket) return;
        const handleUpdate = () => {
            orderService.clearAdminCache();
            fetchOrders();
        };
        socket.on('order:create', handleUpdate);
        socket.on('order:update', handleUpdate);
        return () => {
            socket.off('order:create', handleUpdate);
            socket.off('order:update', handleUpdate);
        };
    }, [socket]);

    const handleSearch = (e) => {
        e.preventDefault();
        setPage(1);
        fetchOrders();
    };

    const openDetails = async (orderId) => {
        setIsDetailsOpen(true);
        setIsDetailsLoading(true);
        try {
            const data = await orderService.getAdminOrder(orderId);
            setSelectedOrder(data.order || null);
        } catch (error) {
            toast.error(error.message || 'Failed to load order details');
        } finally {
            setIsDetailsLoading(false);
        }
    };

    const handleStatusUpdate = async (status) => {
        if (!selectedOrder || !status) return;
        setIsUpdatingStatus(true);
        try {
            const data = await orderService.updateAdminOrderStatus(selectedOrder.id, status);
            if (data?.order) {
                setSelectedOrder(data.order);
                await fetchOrders();
                toast.success('Order status updated');
            }
        } catch (error) {
            toast.error(error.message || 'Failed to update status');
        } finally {
            setIsUpdatingStatus(false);
        }
    };

    const formatAddress = (address) => {
        if (!address) return '—';
        if (typeof address === 'string') {
            try {
                const parsed = JSON.parse(address);
                return [parsed.line1, parsed.city, parsed.state, parsed.zip].filter(Boolean).join(', ') || '—';
            } catch {
                return address;
            }
        }
        return [address.line1, address.city, address.state, address.zip].filter(Boolean).join(', ') || '—';
    };

    const cards = useMemo(() => ([
        { label: 'Total Orders', value: metrics?.totalOrders || 0, icon: Package, color: 'text-blue-600 bg-blue-50 border-blue-100' },
        { label: 'Total Revenue', value: `₹${Number(metrics?.totalRevenue || 0).toLocaleString()}`, icon: IndianRupee, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
        { label: 'Pending', value: metrics?.pendingOrders || 0, icon: Clock3, color: 'text-amber-600 bg-amber-50 border-amber-100' },
        { label: 'Confirmed', value: metrics?.confirmedOrders || 0, icon: CheckCircle2, color: 'text-purple-600 bg-purple-50 border-purple-100' }
    ]), [metrics]);

    return (
        <div className="animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-serif text-primary font-bold">Orders</h1>
                    <p className="text-gray-500 text-sm mt-1">Track sales, payments, and order status.</p>
                </div>
                <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                    <div className="relative">
                        <Filter className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                        <select
                            value={statusFilter}
                            onChange={(e) => {
                                setStatusFilter(e.target.value);
                                setPage(1);
                            }}
                            className="pl-10 pr-8 py-3 bg-white rounded-xl border border-gray-200 shadow-sm focus:border-accent outline-none appearance-none cursor-pointer"
                        >
                            <option value="all">All Status</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="pending">Pending</option>
                            <option value="shipped">Shipped</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>
                    <div className="relative flex-1 md:w-64 lg:w-80">
                        <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                        <input
                            placeholder="Search order / customer"
                            className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-gray-200 shadow-sm focus:border-accent outline-none"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm text-sm text-gray-600"
                    />
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm text-sm text-gray-600"
                    />
                    <button
                        type="submit"
                        className="px-4 py-3 rounded-xl bg-primary text-accent font-semibold shadow-lg shadow-primary/20 hover:bg-primary-light"
                    >
                        Search
                    </button>
                </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                {cards.map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${color}`}>
                            <Icon size={20} />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">{label}</p>
                            <p className="text-lg font-bold text-gray-800">{value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">Recent Orders</h3>
                    <p className="text-xs text-gray-400">Page {page} of {totalPages}</p>
                </div>
                {isLoading ? (
                    <div className="py-16 text-center text-gray-400">Loading orders...</div>
                ) : orders.length === 0 ? (
                    <div className="py-16 text-center text-gray-400">No orders found.</div>
                ) : (
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Order Ref</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Total</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {orders.map((order) => {
                                const createdAt = order.created_at ? new Date(order.created_at) : null;
                                const isStale = createdAt && !Number.isNaN(createdAt.getTime())
                                    ? (['confirmed', 'pending'].includes(order.status) && createdAt.toDateString() !== new Date().toDateString())
                                    : false;
                                return (
                                <tr key={order.id} onClick={() => openDetails(order.id)} className="hover:bg-gray-50/50 transition-colors cursor-pointer">
                                    <td className="px-6 py-4 text-sm font-semibold text-gray-800">{order.order_ref}</td>
                                    <td className="px-6 py-4 text-sm text-gray-700">
                                        <div className="font-medium">{order.customer_name || 'Guest'}</div>
                                        <div className="text-xs text-gray-400">{order.customer_mobile || '—'}</div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(order.created_at)}</td>
                                    <td className="px-6 py-4 text-sm font-semibold text-gray-800">₹{Number(order.total || 0).toLocaleString()}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                                order.status === 'confirmed' ? 'bg-blue-50 text-blue-700' :
                                                order.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                                                order.status === 'shipped' ? 'bg-indigo-50 text-indigo-700' :
                                                order.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                                                'bg-gray-100 text-gray-600'
                                            }`}>
                                                {order.status || 'pending'}
                                            </span>
                                            {isStale && (
                                                <span className="text-[10px] uppercase tracking-widest font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                                                    SLA
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );})}
                        </tbody>
                    </table>
                )}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
            </div>

            {isDetailsOpen && (
                <div className="fixed inset-0 z-[70] flex items-stretch justify-end bg-black/40 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-xl h-full shadow-2xl p-6 overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-semibold text-gray-900">Order Details</h3>
                            <button
                                onClick={() => setIsDetailsOpen(false)}
                                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        {isDetailsLoading || !selectedOrder ? (
                            <div className="py-16 text-center text-gray-400">Loading order details...</div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">{selectedOrder.order_ref}</h3>
                                        <p className="text-sm text-gray-500 mt-1">Placed on {formatDate(selectedOrder.created_at)}</p>
                                    </div>
                                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
                                        {selectedOrder.status || 'confirmed'}
                                    </span>
                                </div>

                                <div className="mt-4">
                                    <label className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Update Status</label>
                                    <select
                                        value={selectedOrder.status || 'confirmed'}
                                        onChange={(e) => handleStatusUpdate(e.target.value)}
                                        disabled={isUpdatingStatus}
                                        className="mt-2 w-full px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm focus:border-accent outline-none"
                                    >
                                        <option value="pending">Pending</option>
                                        <option value="confirmed">Confirmed</option>
                                        <option value="shipped">Shipped</option>
                                        <option value="completed">Completed</option>
                                        <option value="cancelled">Cancelled</option>
                                    </select>
                                </div>

                                <div className="mt-5 grid grid-cols-1 gap-4">
                                    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                                        <p className="text-xs text-gray-400 font-semibold uppercase">Shipping Address</p>
                                        <p className="text-sm text-gray-700 mt-2">{formatAddress(selectedOrder.shipping_address)}</p>
                                    </div>
                                    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                                        <p className="text-xs text-gray-400 font-semibold uppercase">Billing Address</p>
                                        <p className="text-sm text-gray-700 mt-2">{formatAddress(selectedOrder.billing_address)}</p>
                                    </div>
                                </div>

                                <div className="mt-5 border border-gray-200 rounded-xl overflow-hidden">
                                    <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase">Items</div>
                                    <div className="divide-y divide-gray-100">
                                        {(selectedOrder.items || []).map((item) => (
                                            <div key={item.id} className="flex items-center gap-4 p-4">
                                                <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden border border-gray-200">
                                                    {item.image_url && <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-gray-800 line-clamp-1">{item.title}</p>
                                                    {item.variant_title && <p className="text-xs text-gray-500">{item.variant_title}</p>}
                                                    <p className="text-xs text-gray-400 mt-1">Qty: {item.quantity}</p>
                                                </div>
                                                <div className="text-right text-sm font-semibold text-gray-800">
                                                    ₹{Number(item.line_total || 0).toLocaleString()}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-500">Subtotal</span>
                                        <span className="font-semibold text-gray-800">₹{Number(selectedOrder.subtotal || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-500">Shipping</span>
                                        <span className="font-semibold text-gray-800">₹{Number(selectedOrder.shipping_fee || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-500">Discount</span>
                                        <span className="font-semibold text-gray-800">₹{Number(selectedOrder.discount_total || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-base font-semibold">
                                        <span>Total</span>
                                        <span>₹{Number(selectedOrder.total || 0).toLocaleString()}</span>
                                    </div>
                                </div>

                                <div className="mt-6">
                                    <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Status Timeline</p>
                                    <div className="mt-3 space-y-3">
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
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
