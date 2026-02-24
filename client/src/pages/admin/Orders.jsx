import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Filter, Package, IndianRupee, Clock3, CheckCircle2, X, ArrowUpDown, Download, RefreshCw, Trash2, MessageCircle } from 'lucide-react';
import { orderService } from '../../services/orderService';
import orderWaitIllustration from '../../assets/order_wait.svg';
import { useToast } from '../../context/ToastContext';
import { useAdminCrudSync } from '../../hooks/useAdminCrudSync';
import { formatAdminDate, formatAdminDateTime } from '../../utils/dateFormat';
import Modal from '../../components/Modal';
import { useAdminKPI } from '../../context/AdminKPIContext';

const QUICK_RANGES = [
    { value: 'latest_10', label: 'Latest Orders (10)' },
    { value: 'last_7_days', label: 'Last 7 Days' },
    { value: 'last_30_days', label: 'Last 30 Days' },
    { value: 'last_90_days', label: 'Last 90 Days' },
    { value: 'custom', label: 'Custom Range' }
];

const MAX_RANGE_DAYS = 90;
const COURIER_PARTNERS = [
    'Blue Dart',
    'DTDC',
    'Delhivery',
    'India Post',
    'Ecom Express',
    'Xpressbees',
    'Shadowfax',
    'Ekart',
    'Amazon Shipping',
    'Trackon',
    'Professional Couriers',
    'Gati',
    'DHL',
    'FedEx',
    'Aramex',
    'Others'
];
const CANCELLATION_MODES = [
    { value: 'razorpay', label: 'Razorpay Refund' },
    { value: 'manual', label: 'Manual Refund' }
];
const MANUAL_REFUND_METHODS = ['Cash', 'NEFT/RTGS', 'UPI', 'Bank A/c Transfer', 'Voucher code'];

const toDateOnly = (value) => {
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const diffInDays = (startDate, endDate) => {
    if (!startDate || !endDate) return 0;
    const diff = endDate.getTime() - startDate.getTime();
    return Math.floor(diff / (24 * 60 * 60 * 1000));
};

const addDays = (value, days) => {
    const date = toDateOnly(value);
    if (!date) return '';
    const copy = new Date(date);
    copy.setDate(copy.getDate() + Number(days || 0));
    const local = new Date(copy.getTime() - copy.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
};

const getWhatsappLink = (mobile = '') => {
    const digits = String(mobile || '').replace(/\D/g, '');
    if (!digits) return '';
    const full = digits.length === 10 ? `91${digits}` : digits;
    return `https://wa.me/${full}`;
};

const buildVisiblePages = (currentPage, totalPages, windowSize = 5) => {
    const safeTotal = Math.max(1, Number(totalPages || 1));
    const safeCurrent = Math.min(safeTotal, Math.max(1, Number(currentPage || 1)));
    if (safeTotal <= windowSize) return Array.from({ length: safeTotal }, (_, idx) => idx + 1);
    const half = Math.floor(windowSize / 2);
    let start = Math.max(1, safeCurrent - half);
    let end = Math.min(safeTotal, start + windowSize - 1);
    if (end - start + 1 < windowSize) start = Math.max(1, end - windowSize + 1);
    return Array.from({ length: end - start + 1 }, (_, idx) => start + idx);
};

const getCouponDiscountSplit = (order = {}) => {
    const type = String(order?.coupon_type || '').toLowerCase();
    const couponTotal = Number(order?.coupon_discount_value || 0);
    if (couponTotal <= 0) {
        return { productDiscount: 0, shippingDiscount: 0 };
    }
    if (type === 'shipping_full' || type === 'shipping_partial') {
        return { productDiscount: 0, shippingDiscount: couponTotal };
    }
    return { productDiscount: couponTotal, shippingDiscount: 0 };
};

export default function Orders({
    focusOrderId = null,
    onFocusHandled = () => {},
    initialStatusFilter = '',
    onInitialStatusApplied = () => {},
    initialQuickRange = '',
    onInitialQuickRangeApplied = () => {},
    initialStartDate = '',
    initialEndDate = '',
    onInitialDateRangeApplied = () => {},
    initialSortBy = '',
    onInitialSortApplied = () => {},
    initialSourceChannel = '',
    onInitialSourceChannelApplied = () => {}
}) {
    const toast = useToast();
    const [orders, setOrders] = useState([]);
    const [metrics, setMetrics] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');
    const [draftStatusFilter, setDraftStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [quickRange, setQuickRange] = useState('latest_10');
    const [draftQuickRange, setDraftQuickRange] = useState('latest_10');
    const [draftStartDate, setDraftStartDate] = useState('');
    const [draftEndDate, setDraftEndDate] = useState('');
    const [sourceChannel, setSourceChannel] = useState('all');
    const startDateInputRef = useRef(null);
    const endDateInputRef = useRef(null);
    const fetchSeqRef = useRef(0);
    const [sortBy, setSortBy] = useState('newest');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [pendingStatus, setPendingStatus] = useState('');
    const [courierPartner, setCourierPartner] = useState('');
    const [courierPartnerOther, setCourierPartnerOther] = useState('');
    const [awbNumber, setAwbNumber] = useState('');
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isDetailsLoading, setIsDetailsLoading] = useState(false);
    const [detailsLastSyncedAt, setDetailsLastSyncedAt] = useState(null);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const [cancellationMode, setCancellationMode] = useState('');
    const [manualRefundAmount, setManualRefundAmount] = useState('');
    const [manualRefundMethod, setManualRefundMethod] = useState('');
    const [manualRefundRef, setManualRefundRef] = useState('');
    const [manualRefundUtr, setManualRefundUtr] = useState('');
    const [isFetchingPaymentStatus, setIsFetchingPaymentStatus] = useState(false);
    const [settlementContext, setSettlementContext] = useState({ mode: null, isTestMode: false });
    const [deletingOrderId, setDeletingOrderId] = useState(null);
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [bulkStatus, setBulkStatus] = useState('pending');
    const [isBulkUpdating, setIsBulkUpdating] = useState(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [downloadingInvoiceId, setDownloadingInvoiceId] = useState(null);
    const [selectedStatusCount, setSelectedStatusCount] = useState(0);
    const visiblePages = useMemo(() => buildVisiblePages(page, totalPages, 5), [page, totalPages]);
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        confirmText: 'Confirm',
        type: 'delete',
        action: null
    });
    const [isConfirmProcessing, setIsConfirmProcessing] = useState(false);
    const {
        orderMetricsByKey,
        registerOrderMetricsQuery,
        setOrderMetricsSnapshot,
        markOrderMetricsDirty,
        fetchOrderMetrics,
        toOrderMetricsKey
    } = useAdminKPI();
    const metricsQuery = useMemo(() => ({
        search,
        startDate,
        endDate,
        quickRange,
        sourceChannel
    }), [endDate, quickRange, search, sourceChannel, startDate]);
    const metricsKey = toOrderMetricsKey(metricsQuery);
    const sharedMetrics = orderMetricsByKey[metricsKey]?.metrics || null;
    const getPaymentMethodLabel = (order) => {
        const method = String(order?.payment_gateway || order?.paymentGateway || 'razorpay').toLowerCase();
        if (method === 'razorpay') return 'Razorpay';
        if (method === 'cod') return 'Online Payment';
        return method ? method.toUpperCase() : '—';
    };
    const getPaymentReference = (order) => order?.razorpay_payment_id || order?.razorpayPaymentId || '—';
    const getInvoiceNumber = (order) => {
        const ref = order?.order_ref || order?.orderRef || order?.id || 'N/A';
        return `INV-${ref}`;
    };
    const getPaymentStatusLabel = (order) => {
        const status = String(order?.payment_status || order?.paymentStatus || '').toLowerCase();
        if (!status) return '—';
        return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
    };
    const getTierLabel = (order) => {
        const tier = String(order?.loyalty_tier || order?.loyaltyTier || 'regular').toLowerCase();
        if (tier === 'regular') return 'Basic';
        return `${tier.charAt(0).toUpperCase()}${tier.slice(1)}`;
    };
    const getTierBadgeClasses = (order) => {
        const tier = String(order?.loyalty_tier || order?.loyaltyTier || 'regular').toLowerCase();
        if (tier === 'platinum') return 'bg-sky-100 text-sky-800';
        if (tier === 'gold') return 'bg-yellow-100 text-yellow-800';
        if (tier === 'silver') return 'bg-slate-100 text-slate-700';
        if (tier === 'bronze') return 'bg-amber-100 text-amber-800';
        return 'bg-gray-100 text-gray-600';
    };
    const isAttemptEntry = (order) => String(order?.entity_type || '').toLowerCase() === 'attempt';
    const isAbandonedRecoveryOrder = (order) => Boolean(order?.is_abandoned_recovery || order?.source_channel === 'abandoned_recovery');
    const formatRangeDate = (value) => {
        if (!value) return '—';
        return formatAdminDate(`${value}T00:00:00`);
    };
    const isFailedRow = (order) => String(order?.status || '').toLowerCase() === 'failed';
    const getRowKey = (order) => {
        if (isAttemptEntry(order)) return `attempt:${order?.attempt_id || order?.id}`;
        return `order:${order?.order_id || order?.id}`;
    };
    const isPaidPayment = (order) => String(order?.payment_status || '').toLowerCase() === 'paid';
    const canDeleteRow = (order) => !isPaidPayment(order);
    const canDownloadInvoice = (order) => {
        if (isAttemptEntry(order)) return false;
        const status = String(order?.payment_status || order?.paymentStatus || '').toLowerCase();
        return status === 'paid' || status === 'refunded';
    };
    const needsSettlementSync = (order) => {
        if (!order || isAttemptEntry(order)) return false;
        const paymentStatus = String(order?.payment_status || '').toLowerCase();
        return paymentStatus === 'paid'
            && Boolean(order?.razorpay_order_id || order?.razorpay_payment_id)
            && !order?.settlement_snapshot;
    };
    const canFetchPaymentStatus = (order) => {
        if (!order?.razorpay_order_id && !order?.razorpay_payment_id) return false;
        const paymentStatus = String(order?.payment_status || '').toLowerCase();
        if (['pending', 'created', 'attempted'].includes(paymentStatus)) return true;
        return paymentStatus === 'paid' && needsSettlementSync(order);
    };
    const getRefundAmount = (order) => Number(order?.refund_amount ?? order?.refundAmount ?? 0);
    const getRefundReference = (order) => order?.refund_reference || order?.refundReference || '';
    const getRefundVoucherCode = (order) => {
        const direct = String(order?.refund_coupon_code || '').trim();
        if (direct) return direct;
        const notes = (order?.refund_notes && typeof order.refund_notes === 'object') ? order.refund_notes : {};
        const fallback = String(
            notes?.refund_coupon_code
            || notes?.refundCouponCode
            || notes?.voucherCode
            || notes?.couponCode
            || notes?.issuedCouponCode
            || ''
        ).trim();
        return fallback;
    };
    const hasRefundInitiated = (order) => Boolean(
        getRefundReference(order)
        || String(order?.refund_status || '').trim()
        || String(order?.payment_status || '').toLowerCase() === 'refunded'
        || getRefundAmount(order) > 0
    );
    const isRefundLockedOrder = (order) => (
        String(order?.status || '').toLowerCase() === 'cancelled'
        && hasRefundInitiated(order)
    );
    const canCheckRefundStatus = (order) => {
        if (!order || isAttemptEntry(order)) return false;
        if (!hasRefundInitiated(order)) return false;
        return Boolean(order?.razorpay_order_id || order?.razorpay_payment_id);
    };
    const formatSettlementAmount = (value) => `₹${(Number(value || 0) / 100).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
    const patchOrderRow = useCallback((nextOrder) => {
        if (!nextOrder?.id) return;
        setOrders((prev) => {
            const idx = prev.findIndex((row) =>
                !isAttemptEntry(row) && String(row.order_id || row.id) === String(nextOrder.id)
            );
            if (idx >= 0) {
                const copy = [...prev];
                copy[idx] = { ...copy[idx], ...nextOrder };
                return copy;
            }
            if (page === 1) {
                return [{ ...nextOrder, entity_type: 'order', order_id: nextOrder.id }, ...prev];
            }
            return prev;
        });
    }, [page]);
    const patchAttemptRow = useCallback((attempt) => {
        if (!attempt?.id) return;
        setOrders((prev) => {
            const idx = prev.findIndex((row) => String(row.attempt_id || row.id) === String(attempt.id));
            if (idx < 0) return prev;
            const copy = [...prev];
            copy[idx] = {
                ...copy[idx],
                payment_status: attempt.status || copy[idx].payment_status,
                razorpay_payment_id: attempt.razorpay_payment_id || copy[idx].razorpay_payment_id,
                failure_reason: attempt.failure_reason || copy[idx].failure_reason
            };
            return copy;
        });
    }, []);
    const removeRow = useCallback((id, type = 'order') => {
        if (!id) return;
        setOrders((prev) => prev.filter((row) => {
            if (type === 'attempt') return String(row.attempt_id || row.id) !== String(id);
            return String(row.order_id || row.id) !== String(id);
        }));
    }, []);

    const fetchOrders = useCallback(async () => {
        const requestSeq = ++fetchSeqRef.current;
        setIsLoading(true);
        try {
            const listParams = {
                page,
                status: statusFilter,
                search,
                startDate,
                endDate,
                quickRange,
                sortBy,
                sourceChannel,
                limit: quickRange === 'latest_10' ? 10 : 12
            };
            const metricsParams = {
                page: 1,
                limit: 1,
                status: 'all',
                search,
                startDate,
                endDate,
                quickRange,
                sortBy,
                sourceChannel
            };

            const [listData, metricsData] = await Promise.all([
                orderService.getAdminOrders(listParams),
                statusFilter === 'all'
                    ? Promise.resolve(null)
                    : orderService.getAdminOrders(metricsParams)
            ]);
            if (requestSeq !== fetchSeqRef.current) return;

            setOrders(listData.orders || []);
            setSelectedStatusCount(Number(listData?.pagination?.totalOrders || 0));
            const resolvedMetrics = (statusFilter === 'all' ? listData.metrics : metricsData?.metrics) || null;
            setMetrics(resolvedMetrics);
            if (resolvedMetrics) {
                setOrderMetricsSnapshot(metricsQuery, resolvedMetrics);
            }
            setTotalPages(listData.pagination?.totalPages || 1);
        } catch (error) {
            toast.error(error.message || 'Failed to load orders');
        } finally {
            if (requestSeq === fetchSeqRef.current) {
                setIsLoading(false);
            }
        }
    }, [endDate, metricsQuery, page, quickRange, search, setOrderMetricsSnapshot, sortBy, sourceChannel, startDate, statusFilter, toast]);

    useEffect(() => {
        registerOrderMetricsQuery(metricsQuery);
        fetchOrderMetrics(metricsQuery).catch(() => {});
    }, [fetchOrderMetrics, metricsQuery, registerOrderMetricsQuery]);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    useEffect(() => {
        if (!selectedOrder) return;
        setPendingStatus(selectedOrder.status || 'confirmed');
        setCancellationMode('');
        setManualRefundAmount('');
        setManualRefundMethod('');
        setManualRefundRef('');
        setManualRefundUtr('');
        const existingCourier = String(selectedOrder.courier_partner || '').trim();
        if (existingCourier && COURIER_PARTNERS.includes(existingCourier)) {
            setCourierPartner(existingCourier);
            setCourierPartnerOther('');
        } else if (existingCourier) {
            setCourierPartner('Others');
            setCourierPartnerOther(existingCourier);
        } else {
            setCourierPartner('');
            setCourierPartnerOther('');
        }
        setAwbNumber(String(selectedOrder.awb_number || '').trim());
    }, [selectedOrder?.id, selectedOrder?.status]);

    useEffect(() => {
        const visibleKeys = new Set((orders || []).map((order) => getRowKey(order)));
        setSelectedRowKeys((prev) => prev.filter((key) => visibleKeys.has(key)));
    }, [orders]);

    const handleOrderRealtimeUpdate = useCallback((payload = {}) => {
            if (payload?.deleted && payload?.orderId) {
                removeRow(payload.orderId, 'order');
                orderService.removeAdminEntityCache({ id: payload.orderId, entityType: 'order' });
                markOrderMetricsDirty(metricsQuery);
                fetchOrderMetrics(metricsQuery, { force: true }).catch(() => {});
                return;
            }
            if (payload?.order && selectedOrder?.id && String(payload.order.id) === String(selectedOrder.id)) {
                setSelectedOrder((prev) => ({ ...prev, ...payload.order }));
            }
            if (payload?.order) {
                orderService.patchAdminOrderCache(payload.order);
                patchOrderRow(payload.order);
                markOrderMetricsDirty(metricsQuery);
                fetchOrderMetrics(metricsQuery, { force: true }).catch(() => {});
            }
        }, [fetchOrderMetrics, markOrderMetricsDirty, metricsQuery, patchOrderRow, removeRow, selectedOrder?.id]);

    useAdminCrudSync({
        'order:create': handleOrderRealtimeUpdate,
        'order:update': handleOrderRealtimeUpdate,
        'payment:update': handleOrderRealtimeUpdate
    });

    useEffect(() => {
        const timer = setTimeout(() => {
            if (search === searchInput) return;
            setSearch(searchInput);
            setPage(1);
        }, 250);
        return () => clearTimeout(timer);
    }, [search, searchInput]);

    useEffect(() => {
        const next = String(initialStatusFilter || '').trim().toLowerCase();
        if (!next || next === 'all') return;
        setDraftStatusFilter(next);
        if (statusFilter !== next) {
            setStatusFilter(next);
        }
        if (page !== 1) {
            setPage(1);
        }
        onInitialStatusApplied(next);
    }, [initialStatusFilter, onInitialStatusApplied, page, statusFilter]);

    useEffect(() => {
        const nextRange = String(initialQuickRange || '').trim().toLowerCase();
        if (!nextRange) return;
        setDraftQuickRange(nextRange);
        if (quickRange !== nextRange) {
            setQuickRange(nextRange);
        }
        if (page !== 1) {
            setPage(1);
        }
        onInitialQuickRangeApplied(nextRange);
    }, [initialQuickRange, onInitialQuickRangeApplied, page, quickRange]);

    useEffect(() => {
        const hasStart = String(initialStartDate || '').trim().length > 0;
        const hasEnd = String(initialEndDate || '').trim().length > 0;
        if (!hasStart && !hasEnd) return;
        const nextStart = hasStart ? String(initialStartDate).trim() : '';
        const nextEnd = hasEnd ? String(initialEndDate).trim() : '';
        setDraftQuickRange('custom');
        setDraftStartDate(nextStart);
        setDraftEndDate(nextEnd);
        setQuickRange('custom');
        setStartDate(nextStart);
        setEndDate(nextEnd);
        if (page !== 1) {
            setPage(1);
        }
        onInitialDateRangeApplied();
    }, [initialEndDate, initialStartDate, onInitialDateRangeApplied, page]);

    useEffect(() => {
        const nextSort = String(initialSortBy || '').trim().toLowerCase();
        if (!nextSort) return;
        setSortBy(nextSort);
        if (page !== 1) {
            setPage(1);
        }
        onInitialSortApplied(nextSort);
    }, [initialSortBy, onInitialSortApplied, page]);

    useEffect(() => {
        const nextChannel = String(initialSourceChannel || '').trim().toLowerCase();
        if (!nextChannel) return;
        setSourceChannel(nextChannel);
        if (page !== 1) {
            setPage(1);
        }
        onInitialSourceChannelApplied(nextChannel);
    }, [initialSourceChannel, onInitialSourceChannelApplied, page]);

    const handleStatusFilterChange = (nextStatus) => {
        setDraftStatusFilter(nextStatus);
        if (statusFilter !== nextStatus) {
            setStatusFilter(nextStatus);
            setPage(1);
        }
    };

    const handleApplyFilters = () => {
        const nextQuickRange = draftQuickRange;
        const nextStartDate = nextQuickRange === 'custom' ? draftStartDate : '';
        const nextEndDate = nextQuickRange === 'custom' ? draftEndDate : '';
        const start = toDateOnly(nextStartDate);
        const end = toDateOnly(nextEndDate);
        if (nextQuickRange === 'custom' && start && end) {
            const span = diffInDays(start, end);
            if (span > MAX_RANGE_DAYS) {
                toast.error(`Custom range cannot exceed ${MAX_RANGE_DAYS} days`);
                return;
            }
        }
        const hasChanges = (
            statusFilter !== draftStatusFilter ||
            quickRange !== nextQuickRange ||
            startDate !== nextStartDate ||
            endDate !== nextEndDate
        );

        setStatusFilter(draftStatusFilter);
        setQuickRange(nextQuickRange);
        setStartDate(nextStartDate);
        setEndDate(nextEndDate);

        if (page !== 1) {
            setPage(1);
            return;
        }
        if (!hasChanges) {
            fetchOrders();
        }
    };

    const toCsvCell = (value) => {
        const safe = String(value ?? '').replace(/"/g, '""');
        return `"${safe}"`;
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            let currentPage = 1;
            const batchLimit = quickRange === 'latest_10' ? 10 : 200;
            const exportRows = [];

            while (currentPage <= 100) {
                const data = await orderService.getAdminOrders({
                    page: currentPage,
                    limit: batchLimit,
                    status: statusFilter,
                    search,
                    startDate,
                    endDate,
                    quickRange,
                    sortBy,
                    sourceChannel
                });
                const pageOrders = data.orders || [];
                exportRows.push(...pageOrders);
                if (currentPage >= (data.pagination?.totalPages || 1) || pageOrders.length === 0) break;
                currentPage += 1;
            }

            if (exportRows.length === 0) {
                toast.error('No orders found for the selected filters');
                return;
            }

            const header = [
                'Order Ref',
                'Order Date',
                'Customer',
                'Mobile',
                'Member Tier',
                'Status',
                'Payment Status',
                'Payment Ref',
                'Settlement Status',
                'Settlement Date',
                'Subtotal',
                'Shipping',
                'Coupon Discount',
                'Member Discount',
                'Member Shipping Benefit',
                'Discount',
                'Total',
                'Coupon Code',
                'Source Channel'
            ].join(',');

            const lines = exportRows.map((order) => ([
                toCsvCell(order.order_ref),
                toCsvCell(formatAdminDate(order.created_at)),
                toCsvCell(order.customer_name || 'Guest'),
                toCsvCell(order.customer_mobile || ''),
                toCsvCell(getTierLabel(order)),
                toCsvCell(order.status || 'pending'),
                toCsvCell(getPaymentStatusLabel(order)),
                toCsvCell(getPaymentReference(order)),
                toCsvCell(order?.settlement_snapshot?.status || '—'),
                toCsvCell(order?.settlement_snapshot?.created_at ? formatAdminDateTime(new Date(Number(order.settlement_snapshot.created_at) * 1000).toISOString()) : '—'),
                toCsvCell(Number(order.subtotal || 0).toFixed(2)),
                toCsvCell(Number(order.shipping_fee || 0).toFixed(2)),
                toCsvCell(Number(order.coupon_discount_value || 0).toFixed(2)),
                toCsvCell(Number(order.loyalty_discount_total || 0).toFixed(2)),
                toCsvCell(Number(order.loyalty_shipping_discount_total || 0).toFixed(2)),
                toCsvCell(Number(order.discount_total || 0).toFixed(2)),
                toCsvCell(Number(order.total || 0).toFixed(2)),
                toCsvCell(order.coupon_code || ''),
                toCsvCell(order.source_channel || '')
            ].join(',')));

            const csv = [header, ...lines].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const downloadUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `orders-report-${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
            URL.revokeObjectURL(downloadUrl);
        } catch (error) {
            toast.error(error.message || 'Failed to export order report');
        } finally {
            setIsExporting(false);
        }
    };

    const handleDownloadInvoice = async (order, e = null) => {
        if (e) e.stopPropagation();
        if (!order || isAttemptEntry(order) || !canDownloadInvoice(order)) return;
        const targetId = order.order_id || order.id;
        setDownloadingInvoiceId(targetId);
        try {
            await orderService.downloadAdminInvoice(targetId);
        } catch (error) {
            toast.error(error.message || 'Unable to generate invoice');
        } finally {
            setDownloadingInvoiceId(null);
        }
    };

    const openDetails = async (order) => {
        setIsDetailsOpen(true);
        const hasSeedData = Boolean(order && !isAttemptEntry(order));
        setIsDetailsLoading(!hasSeedData);
        setSettlementContext({ mode: null, isTestMode: false });
        if (order) {
            setSelectedOrder((prev) => ({ ...(prev || {}), ...order }));
            setPendingStatus(order.status || 'confirmed');
            setDetailsLastSyncedAt(new Date().toISOString());
        }
        try {
            if (isAttemptEntry(order)) {
                const attemptOrder = {
                    ...order,
                    items: Array.isArray(order?.items) ? order.items : [],
                    events: Array.isArray(order?.events) ? order.events : []
                };
                setSelectedOrder(attemptOrder);
                setPendingStatus(attemptOrder.status || 'failed');
                setDetailsLastSyncedAt(new Date().toISOString());
                return;
            }
            const data = await orderService.getAdminOrder(order?.order_id || order?.id);
            const nextOrder = data.order || null;
            setSelectedOrder(nextOrder);
            setPendingStatus(nextOrder?.status || 'confirmed');
            setDetailsLastSyncedAt(new Date().toISOString());
            if (nextOrder && needsSettlementSync(nextOrder)) {
                try {
                    const sync = await orderService.fetchAdminPaymentStatus({
                        orderId: nextOrder.order_id || nextOrder.id,
                        attemptId: null,
                        razorpayOrderId: nextOrder.razorpay_order_id || '',
                        razorpayPaymentId: nextOrder.razorpay_payment_id || ''
                    });
                    if (sync?.order) {
                        setSelectedOrder(sync.order);
                        patchOrderRow(sync.order);
                        setDetailsLastSyncedAt(new Date().toISOString());
                    }
                    if (sync?.settlementContext) {
                        setSettlementContext(sync.settlementContext);
                    }
                } catch (error) {
                    void error;
                }
            }
        } catch (error) {
            toast.error(error.message || 'Failed to load order details');
        } finally {
            setIsDetailsLoading(false);
        }
    };

    const handleStatusUpdate = useCallback(async () => {
        if (!selectedOrder || !pendingStatus) return;
        if (pendingStatus === 'shipped') {
            const normalizedCourier = String(courierPartner || '').trim();
            const normalizedOther = String(courierPartnerOther || '').trim();
            const normalizedAwb = String(awbNumber || '').trim();
            if (!normalizedCourier) {
                toast.error('Select courier partner before marking as shipped');
                return;
            }
            if (normalizedCourier === 'Others' && !normalizedOther) {
                toast.error('Enter courier partner name');
                return;
            }
            if (!normalizedAwb) {
                toast.error('Enter AWB number before marking as shipped');
                return;
            }
        }
        const isPaid = isPaidPayment(selectedOrder);
        const refundableBase = Math.max(0, Number(selectedOrder?.total || 0) - Number(selectedOrder?.shipping_fee || 0));
        if (pendingStatus === 'cancelled' && isPaid) {
            if (!cancellationMode) {
                toast.error('Select cancellation mode before cancelling this paid order');
                return;
            }
            if (cancellationMode === 'manual') {
                const amount = Number(manualRefundAmount);
                if (!manualRefundMethod) {
                    toast.error('Select manual refund method');
                    return;
                }
                if (!Number.isFinite(amount) || amount <= 0) {
                    toast.error('Enter manual refunded amount');
                    return;
                }
                if (amount > refundableBase) {
                    toast.error(`Refund cannot exceed ₹${refundableBase.toLocaleString('en-IN')} (shipping excluded).`);
                    return;
                }
                if (manualRefundMethod === 'NEFT/RTGS' && !String(manualRefundUtr || '').trim()) {
                    toast.error('Enter UTR number for NEFT/RTGS');
                    return;
                }
                if ((manualRefundMethod === 'UPI' || manualRefundMethod === 'Bank A/c Transfer') && !String(manualRefundRef || '').trim()) {
                    toast.error(`Enter reference number for ${manualRefundMethod}`);
                    return;
                }
            }
        }
        setIsUpdatingStatus(true);
        try {
            const data = await orderService.updateAdminOrderStatus(
                selectedOrder.order_id || selectedOrder.id,
                pendingStatus,
                {
                    cancellationMode: pendingStatus === 'cancelled' ? cancellationMode : '',
                    manualRefundAmount: pendingStatus === 'cancelled' ? manualRefundAmount : '',
                    manualRefundMethod: pendingStatus === 'cancelled' ? manualRefundMethod : '',
                    manualRefundRef: pendingStatus === 'cancelled' ? manualRefundRef : '',
                    manualRefundUtr: pendingStatus === 'cancelled' ? manualRefundUtr : '',
                    courierPartner,
                    courierPartnerOther,
                    awbNumber
                }
            );
            if (data?.order) {
                setSelectedOrder(data.order);
                patchOrderRow(data.order);
                markOrderMetricsDirty(metricsQuery);
                fetchOrderMetrics(metricsQuery, { force: true }).catch(() => {});
                if (pendingStatus === 'cancelled' && cancellationMode === 'razorpay' && data?.refund?.id) {
                    toast.success(`Order cancelled and refund initiated (${data.refund.id})`);
                } else if (pendingStatus === 'cancelled' && cancellationMode === 'manual') {
                    toast.success('Order cancelled and manual refund details recorded');
                } else {
                    toast.success('Order status updated');
                }
            }
        } catch (error) {
            toast.error(error.message || 'Failed to update status');
        } finally {
            setIsUpdatingStatus(false);
        }
    }, [awbNumber, cancellationMode, courierPartner, courierPartnerOther, fetchOrderMetrics, manualRefundAmount, manualRefundMethod, manualRefundRef, manualRefundUtr, markOrderMetricsDirty, metricsQuery, patchOrderRow, pendingStatus, selectedOrder, toast]);

    const handleFetchPaymentStatus = async ({ reason = 'payment' } = {}) => {
        if (!selectedOrder) return;
        setIsFetchingPaymentStatus(true);
        try {
            const data = await orderService.fetchAdminPaymentStatus({
                orderId: isAttemptEntry(selectedOrder) ? null : (selectedOrder.order_id || selectedOrder.id),
                attemptId: selectedOrder.attempt_id || null,
                razorpayOrderId: selectedOrder.razorpay_order_id || '',
                razorpayPaymentId: selectedOrder.razorpay_payment_id || ''
            });

            if (data?.order) {
                setSelectedOrder(data.order);
                patchOrderRow(data.order);
                setDetailsLastSyncedAt(new Date().toISOString());
            } else if (data?.attempt) {
                patchAttemptRow(data.attempt);
                setSelectedOrder((prev) => ({
                    ...(prev || {}),
                    payment_status: data.attempt.status || prev?.payment_status || '',
                    razorpay_payment_id: data.attempt.razorpay_payment_id || prev?.razorpay_payment_id || '',
                    failure_reason: data.attempt.failure_reason || prev?.failure_reason || ''
                }));
                setDetailsLastSyncedAt(new Date().toISOString());
            } else if (data?.paymentStatus) {
                setSelectedOrder((prev) => ({ ...(prev || {}), payment_status: data.paymentStatus }));
                setDetailsLastSyncedAt(new Date().toISOString());
            }
            if (data?.settlementContext) {
                setSettlementContext(data.settlementContext);
            }
            if (reason === 'refund') {
                toast.success(`Refund status synced: ${data?.order?.refund_status || data?.paymentStatus || 'updated'}`);
            } else {
                toast.success(`Payment status synced: ${data?.paymentStatus || 'updated'}`);
            }
        } catch (error) {
            toast.error(error.message || (reason === 'refund' ? 'Failed to fetch refund status' : 'Failed to fetch payment status'));
        } finally {
            setIsFetchingPaymentStatus(false);
        }
    };

    useEffect(() => {
        if (!focusOrderId) return;
        if (isLoading) return;
        const hit = (orders || []).find((row) => !isAttemptEntry(row) && String(row.order_id || row.id) === String(focusOrderId));
        if (hit) {
            openDetails(hit);
            onFocusHandled();
            return;
        }
        const loadDirect = async () => {
            try {
                setIsDetailsOpen(true);
                setIsDetailsLoading(true);
                const data = await orderService.getAdminOrder(focusOrderId);
                const target = data?.order || null;
                if (target) {
                    setSelectedOrder(target);
                    setPendingStatus(target.status || 'confirmed');
                    setDetailsLastSyncedAt(new Date().toISOString());
                    setSettlementContext({ mode: null, isTestMode: false });
                }
            } catch (error) {
                toast.error(error.message || 'Failed to open focused order');
            } finally {
                setIsDetailsLoading(false);
                onFocusHandled();
            }
        };
        loadDirect();
    }, [focusOrderId, isLoading, onFocusHandled, orders, toast]);

    const handleDeleteOrder = async (e, order) => {
        e.stopPropagation();
        if (!order || !canDeleteRow(order)) return;
        const targetId = isAttemptEntry(order)
            ? (order.attempt_id || order.id)
            : (order.order_id || order.id);
        if (!targetId) return;
        setConfirmModal({
            isOpen: true,
            type: 'delete',
            title: 'Delete Order',
            message: `Delete order ${order.order_ref || targetId}? This cannot be undone.`,
            confirmText: 'Delete',
            action: { type: 'delete_single', order }
        });
    };

    const toggleRowSelection = (order, checked) => {
        const key = getRowKey(order);
        setSelectedRowKeys((prev) => {
            if (checked) return prev.includes(key) ? prev : [...prev, key];
            return prev.filter((item) => item !== key);
        });
    };

    const toggleSelectAll = (checked) => {
        if (!checked) {
            setSelectedRowKeys([]);
            return;
        }
        setSelectedRowKeys((orders || []).map((order) => getRowKey(order)));
    };

    const selectedRows = useMemo(() => {
        const selectedSet = new Set(selectedRowKeys);
        return (orders || []).filter((order) => selectedSet.has(getRowKey(order)));
    }, [orders, selectedRowKeys]);

    const allOnPageSelected = useMemo(() => {
        if (!orders.length) return false;
        const selectedSet = new Set(selectedRowKeys);
        return orders.every((order) => selectedSet.has(getRowKey(order)));
    }, [orders, selectedRowKeys]);

    const selectedOrderRows = useMemo(
        () => selectedRows.filter((row) => !isAttemptEntry(row)),
        [selectedRows]
    );

    const selectedDeletableRows = useMemo(
        () => selectedRows.filter((row) => canDeleteRow(row)),
        [selectedRows]
    );

    const selectedNonDeletableCount = useMemo(
        () => Math.max(0, selectedRows.length - selectedDeletableRows.length),
        [selectedRows, selectedDeletableRows]
    );

    const handleBulkStatusUpdate = async () => {
        if (!bulkStatus || selectedOrderRows.length === 0) return;
        setConfirmModal({
            isOpen: true,
            type: 'default',
            title: 'Update Selected Orders',
            message: `Update status to "${bulkStatus}" for ${selectedOrderRows.length} selected order(s)?`,
            confirmText: 'Update',
            action: { type: 'bulk_status_update' }
        });
    };

    const handleBulkDelete = async () => {
        if (selectedDeletableRows.length === 0) return;
        setConfirmModal({
            isOpen: true,
            type: 'delete',
            title: 'Delete Selected Rows',
            message: `Delete ${selectedDeletableRows.length} selected row(s)? This cannot be undone.`,
            confirmText: 'Delete Selected',
            action: { type: 'bulk_delete' }
        });
    };

    const handleConfirmModalClose = () => {
        if (isConfirmProcessing) return;
        setConfirmModal((prev) => ({ ...prev, isOpen: false, action: null }));
    };

    const handleConfirmAction = async () => {
        const actionType = confirmModal?.action?.type;
        if (!actionType) {
            handleConfirmModalClose();
            return;
        }

        setIsConfirmProcessing(true);
        try {
            if (actionType === 'delete_single') {
                const row = confirmModal.action.order;
                const targetId = isAttemptEntry(row) ? (row.attempt_id || row.id) : (row.order_id || row.id);
                setDeletingOrderId(targetId);
                if (isAttemptEntry(row)) {
                    await orderService.deleteAdminPaymentAttempt(targetId);
                    removeRow(targetId, 'attempt');
                } else {
                    await orderService.deleteAdminOrder(targetId);
                    removeRow(targetId, 'order');
                }
                if (selectedOrder && String(selectedOrder.id || selectedOrder.order_id || selectedOrder.attempt_id) === String(targetId)) {
                    setIsDetailsOpen(false);
                    setSelectedOrder(null);
                }
                markOrderMetricsDirty(metricsQuery);
                fetchOrderMetrics(metricsQuery, { force: true }).catch(() => {});
                toast.success('Order deleted');
            } else if (actionType === 'bulk_status_update') {
                setIsBulkUpdating(true);
                const results = await Promise.all(
                    selectedOrderRows.map((row) => orderService.updateAdminOrderStatus(row.order_id || row.id, bulkStatus))
                );
                results.forEach((res) => {
                    if (res?.order) patchOrderRow(res.order);
                });
                setSelectedRowKeys([]);
                markOrderMetricsDirty(metricsQuery);
                fetchOrderMetrics(metricsQuery, { force: true }).catch(() => {});
                toast.success('Bulk status update completed');
            } else if (actionType === 'bulk_delete') {
                setIsBulkDeleting(true);
                await Promise.all(
                    selectedDeletableRows.map((row) => {
                        if (isAttemptEntry(row)) {
                            return orderService.deleteAdminPaymentAttempt(row.attempt_id || row.id);
                        }
                        return orderService.deleteAdminOrder(row.order_id || row.id);
                    })
                );
                selectedDeletableRows.forEach((row) => {
                    if (isAttemptEntry(row)) {
                        removeRow(row.attempt_id || row.id, 'attempt');
                    } else {
                        removeRow(row.order_id || row.id, 'order');
                    }
                });
                setSelectedRowKeys([]);
                if (isDetailsOpen) {
                    const selectedKeysSet = new Set(selectedDeletableRows.map((row) => String(row.id || row.order_id || row.attempt_id)));
                    const openedKey = String(selectedOrder?.id || selectedOrder?.order_id || selectedOrder?.attempt_id || '');
                    if (selectedKeysSet.has(openedKey)) {
                        setIsDetailsOpen(false);
                        setSelectedOrder(null);
                    }
                }
                markOrderMetricsDirty(metricsQuery);
                fetchOrderMetrics(metricsQuery, { force: true }).catch(() => {});
                toast.success('Selected rows deleted');
            }
        } catch (error) {
            toast.error(error.message || 'Action failed');
        } finally {
            setDeletingOrderId(null);
            setIsBulkUpdating(false);
            setIsBulkDeleting(false);
            setIsConfirmProcessing(false);
            setConfirmModal((prev) => ({ ...prev, isOpen: false, action: null }));
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
    const getPendingDurationLabel = (createdAt) => {
        if (!createdAt) return '';
        const created = new Date(createdAt);
        if (Number.isNaN(created.getTime())) return '';
        const now = new Date();
        const diffMs = Math.max(0, now.getTime() - created.getTime());
        const hourMs = 60 * 60 * 1000;
        const dayMs = 24 * hourMs;
        const weekMs = 7 * dayMs;
        const monthMs = 30 * dayMs;

        if (diffMs < dayMs) {
            const hours = Math.max(1, Math.floor(diffMs / hourMs));
            return `${hours}h pending`;
        }
        if (diffMs < weekMs) {
            const days = Math.floor(diffMs / dayMs);
            return `${days}d pending`;
        }
        if (diffMs < monthMs) {
            const weeks = Math.floor(diffMs / weekMs);
            return `${weeks}w pending`;
        }
        const months = Math.floor(diffMs / monthMs);
        return `${months}mo pending`;
    };

    const effectiveMetrics = sharedMetrics || metrics;
    const dynamicStatusLabel = useMemo(() => {
        const value = String(statusFilter || '').trim().toLowerCase();
        if (!value || value === 'all' || value === 'pending' || value === 'confirmed') return 'Confirmed';
        return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
    }, [statusFilter]);
    const dynamicStatusValue = useMemo(() => {
        const value = String(statusFilter || '').trim().toLowerCase();
        if (!value || value === 'all' || value === 'pending' || value === 'confirmed') {
            return effectiveMetrics?.confirmedOrders || 0;
        }
        return selectedStatusCount;
    }, [effectiveMetrics?.confirmedOrders, selectedStatusCount, statusFilter]);
    const cards = useMemo(() => ([
        { label: 'Total Orders', value: effectiveMetrics?.totalOrders || 0, icon: Package, color: 'text-blue-600 bg-blue-50 border-blue-100' },
        { label: 'Total Revenue', value: `₹${Number(effectiveMetrics?.totalRevenue || 0).toLocaleString()}`, icon: IndianRupee, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
        { label: 'Pending', value: effectiveMetrics?.pendingOrders || 0, icon: Clock3, color: 'text-amber-600 bg-amber-50 border-amber-100' },
        { label: dynamicStatusLabel, value: dynamicStatusValue, icon: CheckCircle2, color: 'text-purple-600 bg-purple-50 border-purple-100' }
    ]), [dynamicStatusLabel, dynamicStatusValue, effectiveMetrics]);

    return (
        <div className="animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-serif text-primary font-bold">Orders</h1>
                    <p className="text-gray-500 text-sm mt-1">Track sales, payments, and order status.</p>
                </div>
                <div className="w-full">
                    <div className="flex flex-col md:flex-row md:flex-nowrap md:items-center gap-2 w-full md:w-auto">
                    <div className="relative w-full md:w-auto order-1">
                        <Filter className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                        <select
                            value={draftQuickRange}
                            onChange={(e) => {
                                const next = e.target.value;
                                setDraftQuickRange(next);
                                if (next !== 'custom') {
                                    setDraftStartDate('');
                                    setDraftEndDate('');
                                }
                            }}
                            className="w-full md:w-auto pl-10 pr-8 py-3 bg-white rounded-xl border border-gray-200 shadow-sm focus:border-accent outline-none appearance-none cursor-pointer"
                        >
                            {QUICK_RANGES.map((range) => (
                                <option key={range.value} value={range.value}>{range.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 order-2 md:order-2 w-full md:w-auto">
                        <input
                            ref={startDateInputRef}
                            type="date"
                            value={draftStartDate}
                            min={draftEndDate ? addDays(draftEndDate, -MAX_RANGE_DAYS) : undefined}
                            max={draftEndDate || undefined}
                            onChange={(e) => setDraftStartDate(e.target.value)}
                            className="sr-only"
                        />
                        <button
                            type="button"
                            onClick={() => {
                                if (draftQuickRange !== 'custom') return;
                                if (startDateInputRef.current?.showPicker) startDateInputRef.current.showPicker();
                                else startDateInputRef.current?.click();
                            }}
                            disabled={draftQuickRange !== 'custom'}
                            className="px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm text-sm text-gray-600 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-left whitespace-nowrap min-w-[170px]"
                        >
                            {draftStartDate ? formatRangeDate(draftStartDate) : 'Start Date'}
                        </button>
                        <input ref={endDateInputRef} type="date" value={draftEndDate} min={draftStartDate || undefined} max={draftStartDate ? addDays(draftStartDate, MAX_RANGE_DAYS) : undefined} onChange={(e) => setDraftEndDate(e.target.value)} className="sr-only" />
                        <button
                            type="button"
                            onClick={() => {
                                if (draftQuickRange !== 'custom') return;
                                if (endDateInputRef.current?.showPicker) endDateInputRef.current.showPicker();
                                else endDateInputRef.current?.click();
                            }}
                            disabled={draftQuickRange !== 'custom'}
                            className="px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm text-sm text-gray-600 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-left whitespace-nowrap min-w-[170px]"
                        >
                            {draftEndDate ? formatRangeDate(draftEndDate) : 'End Date'}
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={handleExport}
                        disabled={isExporting || isLoading}
                        className="w-full md:w-auto px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-700 font-semibold hover:bg-gray-50 disabled:opacity-60 inline-flex items-center justify-center gap-2 order-3 md:order-3"
                    >
                        <Download size={16} />
                        {isExporting ? 'Exporting...' : 'Export Report'}
                    </button>
                    <div className="relative w-full md:w-auto order-4 md:order-4">
                        <button
                            type="button"
                            onClick={handleApplyFilters}
                            className="w-full md:w-auto px-4 py-3 rounded-xl bg-primary text-accent font-semibold shadow-lg shadow-primary/20 hover:bg-primary-light"
                        >
                            Apply Filters
                        </button>
                    </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                {cards.map((card) => (
                    <div key={card.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${card.color}`}>
                            <card.icon size={20} />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">{card.label}</p>
                            <p className="text-lg font-bold text-gray-800">{card.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                        {selectedRowKeys.length > 0 && (
                            <div className="flex flex-wrap md:flex-nowrap items-center gap-2">
                                <span className="text-xs text-gray-500 whitespace-nowrap">{selectedRowKeys.length} selected</span>
                                <select
                                    value={bulkStatus}
                                    onChange={(e) => setBulkStatus(e.target.value)}
                                    className="px-2 py-1.5 rounded-md border border-gray-200 text-xs bg-white min-w-[120px]"
                                >
                                    <option value="pending">Pending</option>
                                    <option value="completed">Completed</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                                <button
                                    type="button"
                                    onClick={handleBulkStatusUpdate}
                                    disabled={isBulkUpdating || selectedOrderRows.length === 0}
                                    className="px-3 py-1.5 rounded-md border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                >
                                    {isBulkUpdating ? 'Updating...' : 'Update Status'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleBulkDelete}
                                    disabled={isBulkDeleting || selectedDeletableRows.length === 0}
                                    className="px-3 py-1.5 rounded-md border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                                >
                                    {isBulkDeleting ? 'Deleting...' : 'Delete Selected'}
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col md:flex-row md:items-center gap-2 w-full xl:w-auto">
                        <div className="relative w-full md:w-auto order-1">
                            <Filter className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" />
                            <select
                                value={draftStatusFilter}
                                onChange={(e) => handleStatusFilterChange(e.target.value)}
                                className="w-full md:w-auto pl-9 pr-7 py-2 bg-white rounded-lg border border-gray-200 text-sm focus:border-accent outline-none appearance-none cursor-pointer"
                            >
                                <option value="all">All Status</option>
                                <option value="confirmed">Confirmed</option>
                                <option value="pending">Pending</option>
                                <option value="shipped">Shipped</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                                <option value="failed">Failed</option>
                            </select>
                        </div>
                        <div className="relative w-full md:w-auto order-2 md:order-3">
                            <ArrowUpDown className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" />
                            <select
                                value={sortBy}
                                onChange={(e) => {
                                    setSortBy(e.target.value);
                                    setPage(1);
                                }}
                                className="w-full md:w-auto pl-9 pr-7 py-2 bg-white rounded-lg border border-gray-200 text-sm focus:border-accent outline-none appearance-none cursor-pointer"
                            >
                                <option value="newest">Newest First</option>
                                <option value="oldest">Oldest First</option>
                                <option value="amount_high">Amount: High to Low</option>
                                <option value="amount_low">Amount: Low to High</option>
                                <option value="priority">Fulfillment Priority (Tier)</option>
                            </select>
                        </div>
                        <div className="relative w-full md:w-auto order-3 md:order-2">
                            <Search className="absolute left-3 top-3 text-gray-400 w-4 h-4" />
                            <input
                                placeholder="Search order / customer"
                                className="w-full md:w-64 pl-9 pr-3 py-2.5 bg-white rounded-lg border border-gray-200 text-sm focus:border-accent outline-none"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
                {selectedNonDeletableCount > 0 && (
                    <div className="px-6 pb-3">
                        <span className="inline-flex text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                            {selectedNonDeletableCount} selected are paid and cannot be deleted
                        </span>
                    </div>
                )}
                {isLoading ? (
                    <div className="py-16 text-center text-gray-400">Loading orders...</div>
                ) : orders.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 flex flex-col items-center gap-4">
                        <img src={orderWaitIllustration} alt="No orders" className="w-40 h-40 object-contain opacity-85" />
                        <div>
                            <p className="text-gray-700 font-semibold">No orders available for the selected filters</p>
                            <p className="text-sm text-gray-500 mt-1">Try adjusting status, search, or date range.</p>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="hidden md:block">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-10">
                                            <input
                                                type="checkbox"
                                                checked={allOnPageSelected}
                                                onChange={(e) => toggleSelectAll(e.target.checked)}
                                                className="rounded border-gray-300 text-primary focus:ring-primary"
                                            />
                                        </th>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Order Ref</th>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Total</th>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Payment</th>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {orders.map((order) => {
                                        const pendingDurationLabel = order.status === 'pending'
                                            ? getPendingDurationLabel(order.created_at)
                                            : '';
                                        return (
                                        <tr
                                            key={order.id}
                                            onClick={() => openDetails(order)}
                                            className={`transition-colors cursor-pointer ${isFailedRow(order) ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-gray-50/50'}`}
                                        >
                                            <td className="px-4 py-4">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedRowKeys.includes(getRowKey(order))}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onChange={(e) => toggleRowSelection(order, e.target.checked)}
                                                    className="rounded border-gray-300 text-primary focus:ring-primary"
                                                />
                                            </td>
                                            <td className="px-6 py-4 text-sm font-semibold text-gray-800">
                                                <div className="flex items-center gap-2">
                                                    <span>{order.order_ref}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-700">
                                                <div className="font-medium">{order.customer_name || 'Guest'}</div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-xs text-gray-400">{order.customer_mobile || '—'}</span>
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${getTierBadgeClasses(order)}`}>
                                                        {getTierLabel(order)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600">{formatAdminDate(order.created_at)}</td>
                                            <td className="px-6 py-4 text-sm font-semibold text-gray-800">₹{Number(order.total || 0).toLocaleString()}</td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                                    String(order.payment_status || '').toLowerCase() === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                                                    ['failed', 'expired'].includes(String(order.payment_status || '').toLowerCase()) ? 'bg-red-100 text-red-700' :
                                                    ['pending', 'created', 'attempted'].includes(String(order.payment_status || '').toLowerCase()) ? 'bg-amber-50 text-amber-700' :
                                                    'bg-gray-100 text-gray-600'
                                                }`}>
                                                    {getPaymentStatusLabel(order)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                                        order.status === 'confirmed' ? 'bg-blue-50 text-blue-700' :
                                                        order.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                                                        order.status === 'shipped' ? 'bg-indigo-50 text-indigo-700' :
                                                        order.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                                                        order.status === 'failed' ? 'bg-red-100 text-red-700' :
                                                        'bg-gray-100 text-gray-600'
                                                    }`}>
                                                        {order.status || 'pending'}
                                                    </span>
                                                    {!!pendingDurationLabel && (
                                                        <span className="text-[10px] uppercase tracking-widest font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                                                            {pendingDurationLabel}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="inline-flex items-center gap-2">
                                                    {getWhatsappLink(order.customer_mobile) && (
                                                        <a
                                                            href={getWhatsappLink(order.customer_mobile)}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                                            title="Contact customer on WhatsApp"
                                                        >
                                                            <MessageCircle size={14} />
                                                        </a>
                                                    )}
                                                    {canDownloadInvoice(order) && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleDownloadInvoice(order, e)}
                                                            disabled={downloadingInvoiceId === (order.order_id || order.id)}
                                                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                                                            title="Download invoice"
                                                        >
                                                            <Download size={14} />
                                                        </button>
                                                    )}
                                                    {canDeleteRow(order) && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleDeleteOrder(e, order)}
                                                            disabled={deletingOrderId === (isAttemptEntry(order) ? (order.attempt_id || order.id) : (order.order_id || order.id))}
                                                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
                                                            title="Delete order"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );})}
                                </tbody>
                            </table>
                        </div>

                        <div className="md:hidden divide-y divide-gray-100">
                            {orders.map((order) => (
                                <div
                                    key={order.id}
                                    onClick={() => openDetails(order)}
                                    className={`w-full text-left p-4 transition-colors ${isFailedRow(order) ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-gray-50'}`}
                                >
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="inline-flex items-center gap-2 text-[11px] text-gray-500 font-semibold">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedRowKeys.includes(getRowKey(order))}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onChange={(e) => toggleRowSelection(order, e.target.checked)}
                                                    className="rounded border-gray-300 text-primary focus:ring-primary"
                                                />
                                                Select
                                            </label>
                                            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Order</p>
                                            <p className="text-sm font-semibold text-gray-800">{order.order_ref}</p>
                                            <p className="text-xs text-gray-500">{formatAdminDate(order.created_at)}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium text-gray-700">{order.customer_name || 'Guest'}</p>
                                            <div className="flex items-center gap-2">
                                                <p className="text-xs text-gray-400">{order.customer_mobile || '—'}</p>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${getTierBadgeClasses(order)}`}>
                                                    {getTierLabel(order)}
                                                </span>
                                            </div>
                                            <p className="text-sm font-semibold text-gray-800">₹{Number(order.total || 0).toLocaleString()}</p>
                                            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mt-1">Payment</p>
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                                String(order.payment_status || '').toLowerCase() === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                                                ['failed', 'expired'].includes(String(order.payment_status || '').toLowerCase()) ? 'bg-red-100 text-red-700' :
                                                ['pending', 'created', 'attempted'].includes(String(order.payment_status || '').toLowerCase()) ? 'bg-amber-50 text-amber-700' :
                                                'bg-gray-100 text-gray-600'
                                            }`}>
                                                {getPaymentStatusLabel(order)}
                                            </span>
                                            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mt-1">Order Status</p>
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                                order.status === 'confirmed' ? 'bg-blue-50 text-blue-700' :
                                                order.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                                                order.status === 'shipped' ? 'bg-indigo-50 text-indigo-700' :
                                                order.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                                                order.status === 'failed' ? 'bg-red-100 text-red-700' :
                                                'bg-gray-100 text-gray-600'
                                            }`}>
                                                {order.status || 'pending'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex items-center justify-end gap-2 flex-wrap">
                                        {getWhatsappLink(order.customer_mobile) && (
                                            <a
                                                href={getWhatsappLink(order.customer_mobile)}
                                                target="_blank"
                                                rel="noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                                title="Contact customer on WhatsApp"
                                            >
                                                <MessageCircle size={14} />
                                            </a>
                                        )}
                                        {canDownloadInvoice(order) && (
                                            <button
                                                type="button"
                                                onClick={(e) => handleDownloadInvoice(order, e)}
                                                disabled={downloadingInvoiceId === (order.order_id || order.id)}
                                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                                                title="Download invoice"
                                            >
                                                <Download size={14} />
                                            </button>
                                        )}
                                        {canDeleteRow(order) && (
                                            <button
                                                type="button"
                                                onClick={(e) => handleDeleteOrder(e, order)}
                                                disabled={deletingOrderId === (isAttemptEntry(order) ? (order.attempt_id || order.id) : (order.order_id || order.id))}
                                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
                                                title="Delete order"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
                <div className="px-6 py-4 border-t border-gray-100">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <p className="text-xs text-gray-400 text-center md:text-left">Page {page} of {totalPages}</p>
                        <div className="flex items-center gap-3 md:justify-end">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="flex-1 md:flex-none md:w-28 px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Previous
                            </button>
                            {visiblePages.map((pageNo) => (
                                <button
                                    key={pageNo}
                                    onClick={() => setPage(pageNo)}
                                    className={`px-3 py-2 rounded-lg border text-sm font-semibold ${
                                        pageNo === page
                                            ? 'border-primary bg-primary text-accent'
                                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                    }`}
                                >
                                    {pageNo}
                                </button>
                            ))}
                            <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="flex-1 md:flex-none md:w-28 px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {isDetailsOpen && createPortal(
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
                        {!selectedOrder ? (
                            <div className="py-16 text-center text-gray-400">Loading order details...</div>
                        ) : (
                            <>
                                {isDetailsLoading && (
                                    <div className="mb-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 inline-flex items-center gap-1">
                                        Refreshing latest details...
                                    </div>
                                )}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">{selectedOrder.order_ref}</h3>
                                        <p className="text-sm text-gray-500 mt-1">Placed on {formatAdminDate(selectedOrder.created_at)}</p>
                                        <p className="text-xs text-gray-500 mt-1">Invoice No: <span className="font-mono">{getInvoiceNumber(selectedOrder)}</span></p>
                                        {detailsLastSyncedAt && (
                                            <p className="text-[11px] text-gray-400 mt-1">
                                                Last synced: {formatAdminDateTime(detailsLastSyncedAt)}
                                            </p>
                                        )}
                                    </div>
                                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                                        selectedOrder.status === 'confirmed' ? 'text-blue-700 bg-blue-50' :
                                        selectedOrder.status === 'pending' ? 'text-amber-700 bg-amber-50' :
                                        selectedOrder.status === 'shipped' ? 'text-indigo-700 bg-indigo-50' :
                                        selectedOrder.status === 'completed' ? 'text-emerald-700 bg-emerald-50' :
                                        selectedOrder.status === 'failed' ? 'text-red-700 bg-red-100' :
                                        'text-gray-600 bg-gray-100'
                                    }`}>
                                        {selectedOrder.status || 'confirmed'}
                                    </span>
                                </div>
                                <div className="mt-3">
                                    <p className="text-sm font-semibold text-gray-800 truncate">{selectedOrder.customer_name || 'Guest'}</p>
                                    <p className="text-xs text-gray-500">{selectedOrder.customer_mobile || 'No mobile number'}</p>
                                </div>
                                {!isAttemptEntry(selectedOrder) && (
                                    <div className="mt-3 flex justify-end">
                                        <div className="inline-flex items-center gap-2 flex-wrap justify-end">
                                            {getWhatsappLink(selectedOrder.customer_mobile) && (
                                                <a
                                                    href={getWhatsappLink(selectedOrder.customer_mobile)}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                                    title="Contact customer on WhatsApp"
                                                >
                                                    <MessageCircle size={16} />
                                                </a>
                                            )}
                                            {canDownloadInvoice(selectedOrder) && (
                                            <button
                                                type="button"
                                                onClick={(e) => handleDownloadInvoice(selectedOrder, e)}
                                                disabled={downloadingInvoiceId === (selectedOrder.order_id || selectedOrder.id)}
                                                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 disabled:opacity-60"
                                            >
                                                <Download size={14} />
                                                {downloadingInvoiceId === (selectedOrder.order_id || selectedOrder.id) ? 'Generating...' : 'Download Invoice'}
                                            </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {!isAttemptEntry(selectedOrder) && !isRefundLockedOrder(selectedOrder) && (
                                <div className="mt-4">
                                    <label className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Update Status</label>
                                    <select
                                        value={pendingStatus || selectedOrder.status || 'confirmed'}
                                        onChange={(e) => setPendingStatus(e.target.value)}
                                        disabled={isUpdatingStatus}
                                        className="mt-2 w-full px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm focus:border-accent outline-none"
                                    >
                                        <option value="pending">Pending</option>
                                        <option value="shipped">Shipped</option>
                                        <option value="completed">Completed</option>
                                        <option value="cancelled">Cancelled</option>
                                    </select>
                                    {pendingStatus === 'shipped' && (
                                        <div className="mt-3 grid grid-cols-1 gap-3">
                                            <div>
                                                <label className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Courier Partner</label>
                                                <select
                                                    value={courierPartner}
                                                    onChange={(e) => setCourierPartner(e.target.value)}
                                                    disabled={isUpdatingStatus}
                                                    className="mt-2 w-full px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm focus:border-accent outline-none"
                                                >
                                                    <option value="">Select courier partner</option>
                                                    {COURIER_PARTNERS.map((partner) => (
                                                        <option key={partner} value={partner}>{partner}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            {courierPartner === 'Others' && (
                                                <div>
                                                    <label className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Courier Partner Name</label>
                                                    <input
                                                        type="text"
                                                        value={courierPartnerOther}
                                                        onChange={(e) => setCourierPartnerOther(e.target.value)}
                                                        disabled={isUpdatingStatus}
                                                        placeholder="Enter courier partner name"
                                                        className="mt-2 w-full px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm focus:border-accent outline-none"
                                                    />
                                                </div>
                                            )}
                                            <div>
                                                <label className="text-xs uppercase tracking-widest text-gray-400 font-semibold">AWB Number</label>
                                                <input
                                                    type="text"
                                                    value={awbNumber}
                                                    onChange={(e) => setAwbNumber(e.target.value)}
                                                    disabled={isUpdatingStatus}
                                                    placeholder="Enter AWB number"
                                                    className="mt-2 w-full px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm focus:border-accent outline-none"
                                                />
                                            </div>
                                        </div>
                                    )}
                                    {pendingStatus === 'cancelled' && isPaidPayment(selectedOrder) && (
                                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-3">
                                            <p className="text-xs text-amber-800 font-semibold">
                                                Shipping charge is non-refundable. Maximum refundable amount: ₹{Math.max(0, Number(selectedOrder?.total || 0) - Number(selectedOrder?.shipping_fee || 0)).toLocaleString('en-IN')}
                                            </p>
                                            <div>
                                                <label className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Cancellation Mode</label>
                                                <select
                                                    value={cancellationMode}
                                                    onChange={(e) => setCancellationMode(e.target.value)}
                                                    disabled={isUpdatingStatus}
                                                    className="mt-2 w-full px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm focus:border-accent outline-none"
                                                >
                                                    <option value="">Select cancellation mode</option>
                                                    {CANCELLATION_MODES.map((mode) => (
                                                        <option key={mode.value} value={mode.value}>{mode.label}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {cancellationMode === 'manual' && (
                                                <div className="grid grid-cols-1 gap-3">
                                                    <div>
                                                        <label className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Refunded Amount</label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={manualRefundAmount}
                                                            onChange={(e) => setManualRefundAmount(e.target.value)}
                                                            disabled={isUpdatingStatus}
                                                            placeholder="Enter refunded amount"
                                                            className="mt-2 w-full px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm focus:border-accent outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Refund Method</label>
                                                        <select
                                                            value={manualRefundMethod}
                                                            onChange={(e) => setManualRefundMethod(e.target.value)}
                                                            disabled={isUpdatingStatus}
                                                            className="mt-2 w-full px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm focus:border-accent outline-none"
                                                        >
                                                            <option value="">Select refund method</option>
                                                            {MANUAL_REFUND_METHODS.map((method) => (
                                                                <option key={method} value={method}>{method}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    {(manualRefundMethod === 'UPI' || manualRefundMethod === 'Bank A/c Transfer') && (
                                                        <div>
                                                            <label className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Reference Number</label>
                                                            <input
                                                                type="text"
                                                                value={manualRefundRef}
                                                                onChange={(e) => setManualRefundRef(e.target.value)}
                                                                disabled={isUpdatingStatus}
                                                                placeholder="Enter reference number"
                                                                className="mt-2 w-full px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm focus:border-accent outline-none"
                                                            />
                                                        </div>
                                                    )}
                                                    {manualRefundMethod === 'NEFT/RTGS' && (
                                                        <div>
                                                            <label className="text-xs uppercase tracking-widest text-gray-500 font-semibold">UTR Number</label>
                                                            <input
                                                                type="text"
                                                                value={manualRefundUtr}
                                                                onChange={(e) => setManualRefundUtr(e.target.value)}
                                                                disabled={isUpdatingStatus}
                                                                placeholder="Enter UTR number"
                                                                className="mt-2 w-full px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm focus:border-accent outline-none"
                                                            />
                                                        </div>
                                                    )}
                                                    {manualRefundMethod === 'Voucher code' && (
                                                        <p className="text-xs text-amber-700">
                                                            A customer-specific coupon will be auto-generated with 180 days validity after cancellation.
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleStatusUpdate}
                                        disabled={
                                            isUpdatingStatus ||
                                            !selectedOrder ||
                                            !pendingStatus ||
                                            pendingStatus === (selectedOrder.status || 'confirmed')
                                        }
                                        className="mt-3 w-full px-4 py-3 rounded-xl bg-primary text-accent font-semibold shadow-lg shadow-primary/20 hover:bg-primary-light disabled:opacity-60"
                                    >
                                        {isUpdatingStatus ? 'Updating...' : 'Update Status'}
                                    </button>
                                </div>
                                )}
                                {!isAttemptEntry(selectedOrder) && isRefundLockedOrder(selectedOrder) && (
                                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                                        Refund has been initiated for this cancelled order. Status changes are locked.
                                    </div>
                                )}

                                <div className="mt-5 grid grid-cols-1 gap-4">
                                    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                                        <p className="text-xs text-gray-400 font-semibold uppercase">Shipping Address</p>
                                        <p className="text-sm text-gray-700 mt-2">{formatAddress(selectedOrder.shipping_address)}</p>
                                    </div>
                                    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                                        <p className="text-xs text-gray-400 font-semibold uppercase">Billing Address</p>
                                        <p className="text-sm text-gray-700 mt-2">{formatAddress(selectedOrder.billing_address)}</p>
                                    </div>
                                    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                                        <p className="text-xs text-gray-400 font-semibold uppercase">Payment Details</p>
                                        <div className="mt-2 space-y-1 text-sm text-gray-700">
                                            <p><span className="text-gray-500">Method:</span> {getPaymentMethodLabel(selectedOrder)}</p>
                                            <p><span className="text-gray-500">Status:</span> {getPaymentStatusLabel(selectedOrder)}</p>
                                            <p><span className="text-gray-500">Reference:</span> <span className="font-mono text-xs">{getPaymentReference(selectedOrder)}</span></p>
                                            <p><span className="text-gray-500">Invoice No:</span> <span className="font-mono text-xs">{getInvoiceNumber(selectedOrder)}</span></p>
                                            {selectedOrder?.courier_partner && (
                                                <p><span className="text-gray-500">Courier:</span> {selectedOrder.courier_partner}</p>
                                            )}
                                            {selectedOrder?.awb_number && (
                                                <p><span className="text-gray-500">AWB:</span> <span className="font-mono text-xs">{selectedOrder.awb_number}</span></p>
                                            )}
                                            {selectedOrder?.failure_reason && (
                                                <p><span className="text-gray-500">Failure:</span> {selectedOrder.failure_reason}</p>
                                            )}
                                            {hasRefundInitiated(selectedOrder) && (
                                                <>
                                                    <p><span className="text-gray-500">Refund Amount:</span> {getRefundAmount(selectedOrder) > 0 ? `₹${getRefundAmount(selectedOrder).toLocaleString()}` : '—'}</p>
                                                    <p><span className="text-gray-500">Refund Ref:</span> <span className="font-mono text-xs">{getRefundReference(selectedOrder) || '—'}</span></p>
                                                    <p><span className="text-gray-500">Refund Status:</span> {String(selectedOrder?.refund_status || '').trim() || '—'}</p>
                                                    <p><span className="text-gray-500">Refund Mode:</span> {selectedOrder?.refund_mode || '—'}</p>
                                                    <p><span className="text-gray-500">Refund Method:</span> {selectedOrder?.refund_method || '—'}</p>
                                                    <p><span className="text-gray-500">Manual Ref:</span> <span className="font-mono text-xs">{selectedOrder?.manual_refund_ref || '—'}</span></p>
                                                    <p><span className="text-gray-500">Manual UTR:</span> <span className="font-mono text-xs">{selectedOrder?.manual_refund_utr || '—'}</span></p>
                                                    <p><span className="text-gray-500">Refund Voucher:</span> <span className="font-mono text-xs">{getRefundVoucherCode(selectedOrder) || '—'}</span></p>
                                                    <p><span className="text-gray-500">Non-refundable Shipping:</span> ₹{Number(selectedOrder?.refund_notes?.nonRefundableShippingFee ?? selectedOrder?.shipping_fee ?? 0).toLocaleString('en-IN')}</p>
                                                </>
                                            )}
                                            {String(selectedOrder?.payment_gateway || '').toLowerCase() === 'razorpay' && (
                                                <p className="text-xs text-amber-700 mt-2">
                                                    EMI refund reversals are controlled by the customer&apos;s issuing bank timeline. Shipping charge is non-refundable.
                                                </p>
                                            )}
                                            {selectedOrder.status === 'pending' && (
                                                <p><span className="text-gray-500">Pending For:</span> {getPendingDurationLabel(selectedOrder.created_at)}</p>
                                            )}
                                            {canFetchPaymentStatus(selectedOrder) && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleFetchPaymentStatus({ reason: 'payment' })}
                                                    disabled={isFetchingPaymentStatus}
                                                    className="mt-2 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 disabled:opacity-60"
                                                >
                                                    <RefreshCw size={14} className={isFetchingPaymentStatus ? 'animate-spin' : ''} />
                                                    {isFetchingPaymentStatus ? 'Syncing...' : 'Sync Payment / Settlement'}
                                                </button>
                                            )}
                                            {canCheckRefundStatus(selectedOrder) && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleFetchPaymentStatus({ reason: 'refund' })}
                                                    disabled={isFetchingPaymentStatus}
                                                    className="mt-2 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 text-xs font-semibold hover:bg-blue-100 disabled:opacity-60"
                                                >
                                                    <RefreshCw size={14} className={isFetchingPaymentStatus ? 'animate-spin' : ''} />
                                                    {isFetchingPaymentStatus ? 'Checking...' : 'Check Refund Status'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {!isAttemptEntry(selectedOrder) && (
                                        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                                            <p className="text-xs text-gray-400 font-semibold uppercase">Settlement Details</p>
                                            {selectedOrder?.settlement_snapshot ? (
                                                <div className="mt-2 space-y-1 text-sm text-gray-700">
                                                    <p><span className="text-gray-500">Settlement ID:</span> <span className="font-mono text-xs">{selectedOrder.settlement_snapshot.id || selectedOrder.settlement_id || '—'}</span></p>
                                                    <p><span className="text-gray-500">Status:</span> {selectedOrder.settlement_snapshot.status || '—'}</p>
                                                    <p><span className="text-gray-500">Settlement Amount:</span> {formatSettlementAmount(selectedOrder.settlement_snapshot.amount)}</p>
                                                    <p><span className="text-gray-500">Charges (Fees):</span> {formatSettlementAmount(selectedOrder.settlement_snapshot.fees)}</p>
                                                    <p><span className="text-gray-500">Tax:</span> {formatSettlementAmount(selectedOrder.settlement_snapshot.tax)}</p>
                                                    <p><span className="text-gray-500">Net Credited:</span> {formatSettlementAmount(
                                                        selectedOrder.settlement_snapshot.net_amount
                                                        ?? (Number(selectedOrder.settlement_snapshot.amount || 0) - Number(selectedOrder.settlement_snapshot.fees || 0) - Number(selectedOrder.settlement_snapshot.tax || 0))
                                                    )}</p>
                                                    <p><span className="text-gray-500">UTR:</span> <span className="font-mono text-xs">{selectedOrder.settlement_snapshot.utr || '—'}</span></p>
                                                    <p><span className="text-gray-500">Created At:</span> {selectedOrder.settlement_snapshot.created_at ? formatAdminDateTime(new Date(Number(selectedOrder.settlement_snapshot.created_at) * 1000).toISOString()) : '—'}</p>
                                                </div>
                                            ) : (
                                                <div className="mt-2 space-y-1">
                                                    <p className="text-sm text-gray-500">
                                                        Settlement info is not available yet for this payment.
                                                    </p>
                                                    {settlementContext?.isTestMode && (
                                                        <p className="text-xs text-amber-700">
                                                            Razorpay is in test mode. Settlement records are usually not generated in test mode.
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {!isAttemptEntry(selectedOrder) && (
                                        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                                            <p className="text-xs text-gray-400 font-semibold uppercase">Promotion</p>
                                            <div className="mt-2 space-y-1 text-sm text-gray-700">
                                                {(() => {
                                                    const couponSplit = getCouponDiscountSplit(selectedOrder);
                                                    const memberProductDiscount = Number(selectedOrder.loyalty_discount_total || 0);
                                                    const memberShippingDiscount = Number(selectedOrder.loyalty_shipping_discount_total || 0);
                                                    const hasMemberBenefit = memberProductDiscount > 0 || memberShippingDiscount > 0;
                                                    return (
                                                        <>
                                                <p><span className="text-gray-500">Membership Tier:</span> {getTierLabel(selectedOrder)}</p>
                                                <p><span className="text-gray-500">Coupon:</span> {selectedOrder.coupon_code || '—'}</p>
                                                <p><span className="text-gray-500">Type:</span> {selectedOrder.coupon_type || '—'}</p>
                                                <p><span className="text-gray-500">Coupon Discount:</span> ₹{Number(selectedOrder.coupon_discount_value || 0).toLocaleString()}</p>
                                                <p><span className="text-gray-500">Coupon Product Discount:</span> ₹{couponSplit.productDiscount.toLocaleString()}</p>
                                                <p><span className="text-gray-500">Coupon Shipping Discount:</span> ₹{couponSplit.shippingDiscount.toLocaleString()}</p>
                                                <p><span className="text-gray-500">Member Product Discount:</span> ₹{memberProductDiscount.toLocaleString()}</p>
                                                <p><span className="text-gray-500">Member Shipping Discount:</span> ₹{memberShippingDiscount.toLocaleString()}</p>
                                                {!hasMemberBenefit && Number(selectedOrder.coupon_discount_value || 0) > 0 && (
                                                    <p className="text-xs text-emerald-700">
                                                        Discount is fully from coupon benefits. No membership perk applied.
                                                    </p>
                                                )}
                                                <p><span className="text-gray-500">Total Discount:</span> ₹{Number(selectedOrder.discount_total || 0).toLocaleString()}</p>
                                                <p><span className="text-gray-500">Source:</span> {isAbandonedRecoveryOrder(selectedOrder) ? 'Abandoned cart recovery' : (selectedOrder.source_channel || 'checkout')}</p>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-5 border border-gray-200 rounded-xl overflow-hidden">
                                    <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase">Items</div>
                                    <div className="divide-y divide-gray-100">
                                        {(selectedOrder.items || []).map((item) => {
                                            const snapshot = item?.item_snapshot && typeof item.item_snapshot === 'object' ? item.item_snapshot : null;
                                            const quantity = Number(item.quantity ?? snapshot?.quantity ?? 0);
                                            const unitPrice = Number(item.price ?? snapshot?.unitPrice ?? 0);
                                            const lineTotal = Number(item.line_total ?? snapshot?.lineTotal ?? (unitPrice * quantity));
                                            return (
                                                <div key={item.id} className="flex items-center gap-4 p-4">
                                                    <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden border border-gray-200">
                                                        {item.image_url && <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold text-gray-800 line-clamp-1">{item.title}</p>
                                                        {item.variant_title && <p className="text-xs text-gray-500">{item.variant_title}</p>}
                                                        <p className="text-xs text-gray-400 mt-1">
                                                            ₹{unitPrice.toLocaleString()} x {quantity}
                                                        </p>
                                                    </div>
                                                    <div className="text-right text-sm font-semibold text-gray-800">
                                                        ₹{lineTotal.toLocaleString()}
                                                    </div>
                                                </div>
                                            );
                                        })}
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
                                        <span className="text-gray-500">Total Discount</span>
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
                                                <span className="text-xs text-gray-400">{formatAdminDateTime(evt.created_at)}</span>
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
                </div>,
                document.body
            )}
            <Modal
                isOpen={confirmModal.isOpen}
                onClose={handleConfirmModalClose}
                title={confirmModal.title}
                message={confirmModal.message}
                type={confirmModal.type}
                confirmText={confirmModal.confirmText}
                onConfirm={handleConfirmAction}
                isLoading={isConfirmProcessing}
            />
        </div>
    );
}
