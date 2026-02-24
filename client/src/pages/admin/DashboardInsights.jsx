import { useEffect, useRef, useState } from 'react';
import { ArrowRight, AlertTriangle, Activity, TrendingUp, IndianRupee, Users, ShoppingBag, Target, Bell, Save, Play, Trash2 } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import dashboardIllustration from '../../assets/dashboard.svg';

const QUICK_RANGES = [
    { value: 'latest_10', label: 'Latest Orders (10)' },
    { value: 'last_7_days', label: 'Last 7 Days' },
    { value: 'last_30_days', label: 'Last 30 Days' },
    { value: 'last_90_days', label: 'Last 90 Days' },
    { value: 'custom', label: 'Custom Range' }
];

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const priorityStyles = {
    high: 'bg-red-50 text-red-700 border-red-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    low: 'bg-blue-50 text-blue-700 border-blue-200'
};
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 700;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function DashboardInsights({ onRunAction = () => {} }) {
    const toast = useToast();
    const toastRef = useRef(toast);
    const [quickRange, setQuickRange] = useState('last_30_days');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [comparisonMode, setComparisonMode] = useState('previous_period');
    const [statusFilter, setStatusFilter] = useState('all');
    const [paymentMode, setPaymentMode] = useState('all');
    const [sourceChannel, setSourceChannel] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [goals, setGoals] = useState([]);
    const [isGoalsLoading, setIsGoalsLoading] = useState(false);
    const [goalDraft, setGoalDraft] = useState({
        metricKey: 'net_sales',
        label: 'Monthly Net Sales',
        targetValue: '',
        periodType: 'monthly',
        periodStart: new Date().toISOString().slice(0, 10),
        periodEnd: ''
    });
    const [alertSettings, setAlertSettings] = useState({
        isActive: false,
        emailRecipients: '',
        whatsappRecipients: '',
        pendingOver72Threshold: 10,
        failedPayment6hThreshold: 8,
        codCancelRateThreshold: 20,
        lowStockThreshold: 5
    });
    const [isSavingAlerts, setIsSavingAlerts] = useState(false);
    const [isRunningAlerts, setIsRunningAlerts] = useState(false);

    useEffect(() => {
        toastRef.current = toast;
    }, [toast]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setIsLoading(true);
            setLoadError('');
            let lastError = null;
            for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
                try {
                    const response = await adminService.getDashboardInsights({
                        quickRange,
                        startDate: quickRange === 'custom' ? startDate : '',
                        endDate: quickRange === 'custom' ? endDate : '',
                        comparisonMode,
                        status: statusFilter,
                        paymentMode,
                        sourceChannel
                    });
                    if (!cancelled) {
                        setData(response || null);
                        setLoadError('');
                        setIsLoading(false);
                    }
                    return;
                } catch (error) {
                    lastError = error;
                    if (attempt >= MAX_RETRY_ATTEMPTS) break;
                    await wait(RETRY_DELAY_MS * attempt);
                }
            }
            if (!cancelled) {
                setData(null);
                const message = lastError?.message || 'Failed to load dashboard';
                setLoadError(message);
                toastRef.current.error(`${message} (after ${MAX_RETRY_ATTEMPTS} attempts)`);
            }
            if (!cancelled) setIsLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, [comparisonMode, endDate, paymentMode, quickRange, sourceChannel, startDate, statusFilter]);

    useEffect(() => {
        let cancelled = false;
        const loadPhaseThree = async () => {
            setIsGoalsLoading(true);
            try {
                const [goalData, alertData] = await Promise.all([
                    adminService.getDashboardGoals(),
                    adminService.getDashboardAlertSettings()
                ]);
                if (!cancelled) {
                    setGoals(Array.isArray(goalData?.goals) ? goalData.goals : []);
                    if (alertData?.settings) {
                        setAlertSettings({
                            isActive: Boolean(alertData.settings.isActive),
                            emailRecipients: alertData.settings.emailRecipients || '',
                            whatsappRecipients: alertData.settings.whatsappRecipients || '',
                            pendingOver72Threshold: Number(alertData.settings.pendingOver72Threshold || 10),
                            failedPayment6hThreshold: Number(alertData.settings.failedPayment6hThreshold || 8),
                            codCancelRateThreshold: Number(alertData.settings.codCancelRateThreshold || 20),
                            lowStockThreshold: Number(alertData.settings.lowStockThreshold || 5)
                        });
                    }
                }
            } catch (error) {
                if (!cancelled) toastRef.current.error(error?.message || 'Failed to load goals/alerts');
            } finally {
                if (!cancelled) setIsGoalsLoading(false);
            }
        };
        loadPhaseThree();
        return () => { cancelled = true; };
    }, []);

    const overview = data?.overview || {};
    const products = data?.products || {};
    const customers = data?.customers || {};
    const operators = data?.operators || {};
    const growth = data?.growth || {};
    const risk = data?.risk || {};
    const funnel = data?.funnel || {};
    const trends = Array.isArray(data?.trends) ? data.trends : [];
    const actions = Array.isArray(data?.actions) ? data.actions : [];
    const maxTrendRevenue = Math.max(1, ...trends.map((entry) => Number(entry?.revenue || 0)));
    const hasAnyInsight = Boolean(
        Number(overview.totalOrders || 0) > 0
        || Number(overview.netSales || 0) > 0
        || Number(overview.grossSales || 0) > 0
        || actions.length > 0
        || trends.some((entry) => Number(entry?.orders || 0) > 0 || Number(entry?.revenue || 0) > 0)
        || (products.topSellers || []).length > 0
        || (customers.topCustomers || []).length > 0
    );

    const cards = [
        { label: 'Net Sales', value: formatCurrency(overview.netSales), icon: IndianRupee },
        { label: 'Gross Sales', value: formatCurrency(overview.grossSales), icon: TrendingUp },
        { label: 'Orders', value: Number(overview.totalOrders || 0).toLocaleString('en-IN'), icon: ShoppingBag },
        { label: 'AOV', value: formatCurrency(overview.averageOrderValue), icon: Activity },
        { label: 'Conversion', value: `${Number(overview.conversionRate || 0).toFixed(1)}%`, icon: TrendingUp },
        { label: 'Repeat Rate', value: `${Number(overview.repeatRate || 0).toFixed(1)}%`, icon: Users }
    ];
    const comparison = overview?.comparison || null;
    const refreshGoals = async () => {
        const goalData = await adminService.getDashboardGoals();
        setGoals(Array.isArray(goalData?.goals) ? goalData.goals : []);
    };
    const handleSaveGoal = async () => {
        try {
            const payload = {
                metricKey: goalDraft.metricKey,
                label: goalDraft.label,
                targetValue: Number(goalDraft.targetValue || 0),
                periodType: goalDraft.periodType,
                periodStart: goalDraft.periodStart,
                periodEnd: goalDraft.periodType === 'custom' ? (goalDraft.periodEnd || null) : null
            };
            await adminService.saveDashboardGoal(payload);
            await refreshGoals();
            setGoalDraft((prev) => ({ ...prev, targetValue: '' }));
            toastRef.current.success('Goal saved');
        } catch (error) {
            toastRef.current.error(error?.message || 'Failed to save goal');
        }
    };
    const handleDeleteGoal = async (id) => {
        try {
            await adminService.deleteDashboardGoal(id);
            await refreshGoals();
            toastRef.current.success('Goal removed');
        } catch (error) {
            toastRef.current.error(error?.message || 'Failed to remove goal');
        }
    };
    const handleSaveAlerts = async () => {
        setIsSavingAlerts(true);
        try {
            const dataRes = await adminService.updateDashboardAlertSettings(alertSettings);
            if (dataRes?.settings) {
                setAlertSettings({
                    isActive: Boolean(dataRes.settings.isActive),
                    emailRecipients: dataRes.settings.emailRecipients || '',
                    whatsappRecipients: dataRes.settings.whatsappRecipients || '',
                    pendingOver72Threshold: Number(dataRes.settings.pendingOver72Threshold || 10),
                    failedPayment6hThreshold: Number(dataRes.settings.failedPayment6hThreshold || 8),
                    codCancelRateThreshold: Number(dataRes.settings.codCancelRateThreshold || 20),
                    lowStockThreshold: Number(dataRes.settings.lowStockThreshold || 5)
                });
            }
            toastRef.current.success('Alert settings saved');
        } catch (error) {
            toastRef.current.error(error?.message || 'Failed to save alert settings');
        } finally {
            setIsSavingAlerts(false);
        }
    };
    const handleRunAlertsNow = async () => {
        setIsRunningAlerts(true);
        try {
            const result = await adminService.runDashboardAlertsNow();
            if (Number(result?.sent || 0) > 0) {
                toastRef.current.success(`Sent ${result.sent} dashboard alerts`);
            } else {
                toastRef.current.info(result?.reason ? `No alerts sent (${result.reason})` : 'No alerts sent');
            }
        } catch (error) {
            toastRef.current.error(error?.message || 'Failed to run alerts');
        } finally {
            setIsRunningAlerts(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900">Store Intelligence</h2>
                    <p className="text-sm text-gray-500 mt-1">Sales insights, funnel health, and action priorities.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-2 w-full md:w-auto">
                    <select
                        value={quickRange}
                        onChange={(e) => setQuickRange(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                    >
                        {QUICK_RANGES.map((range) => (
                            <option key={range.value} value={range.value}>{range.label}</option>
                        ))}
                    </select>
                    {quickRange === 'custom' && (
                        <>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                            />
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                            />
                        </>
                    )}
                    <select value={comparisonMode} onChange={(e) => setComparisonMode(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
                        <option value="previous_period">Compare: Previous Period</option>
                        <option value="same_period_last_month">Compare: Last Month</option>
                    </select>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
                        <option value="all">Status: All</option>
                        <option value="pending">Status: Pending</option>
                        <option value="confirmed">Status: Confirmed</option>
                        <option value="shipped">Status: Shipped</option>
                        <option value="completed">Status: Completed</option>
                        <option value="cancelled">Status: Cancelled</option>
                        <option value="failed">Status: Failed</option>
                    </select>
                    <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
                        <option value="all">Payment: All</option>
                        <option value="razorpay">Payment: Razorpay</option>
                        <option value="cod">Payment: COD</option>
                    </select>
                    <select value={sourceChannel} onChange={(e) => setSourceChannel(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
                        <option value="all">Channel: All</option>
                        <option value="direct">Channel: Direct</option>
                        <option value="abandoned_recovery">Channel: Abandoned Recovery</option>
                    </select>
                </div>
            </div>

            {isLoading ? (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm py-16 text-center text-gray-400">Loading dashboard insights...</div>
            ) : !hasAnyInsight ? (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm py-16 px-6 text-center text-gray-400 flex flex-col items-center">
                    <img src={dashboardIllustration} alt="Dashboard" className="w-40 h-40 object-contain opacity-85" />
                    <p className="mt-4 text-lg font-semibold text-gray-700">
                        {loadError ? 'Dashboard insights are unavailable right now' : 'No dashboard insights available yet'}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                        {loadError
                            ? `Tried ${MAX_RETRY_ATTEMPTS} times. Please refresh after a moment.`
                            : 'Insights will appear once orders and activity are available.'}
                    </p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {cards.map((card) => (
                            <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-xs uppercase tracking-wide text-gray-500">{card.label}</p>
                                    <p className="text-2xl font-semibold text-gray-900 mt-1">{card.value}</p>
                                    {comparison && (card.label === 'Net Sales' || card.label === 'Orders') && (
                                        <p className="text-[11px] mt-1 text-gray-500">
                                            {card.label === 'Net Sales' ? `Δ ${comparison.netSales ?? 0}%` : `Δ ${comparison.totalOrders ?? 0}%`}
                                        </p>
                                    )}
                                </div>
                                <card.icon size={20} className="text-gray-400" />
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                            <p className="text-xs uppercase tracking-wide text-gray-500">New Customer Revenue</p>
                            <p className="text-xl font-semibold text-gray-900 mt-1">{formatCurrency(growth.newCustomerRevenue)}</p>
                            <p className="text-xs text-gray-500 mt-1">Returning: {formatCurrency(growth.returningCustomerRevenue)}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                            <p className="text-xs uppercase tracking-wide text-gray-500">Coupon Impact</p>
                            <p className="text-xl font-semibold text-gray-900 mt-1">{formatCurrency(growth.couponDiscountTotal)}</p>
                            <p className="text-xs text-gray-500 mt-1">{Number(growth.couponOrders || 0)} orders used coupons</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                            <p className="text-xs uppercase tracking-wide text-gray-500">Failed Payments (6h)</p>
                            <p className="text-xl font-semibold text-gray-900 mt-1">{Number(risk.failedPaymentsCurrent6h || 0)}</p>
                            <p className="text-xs text-gray-500 mt-1">vs prev 6h: {Number(risk.failedPaymentsSpikePct || 0)}%</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                            <p className="text-xs uppercase tracking-wide text-gray-500">Pending Aging</p>
                            <p className="text-xl font-semibold text-gray-900 mt-1">{Number(risk.pendingAging?.over72h || 0)} over 72h</p>
                            <p className="text-xs text-gray-500 mt-1">
                                24-72h: {Number(risk.pendingAging?.from24hTo72h || 0)}, &lt;24h: {Number(risk.pendingAging?.under24h || 0)}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                        <div className="xl:col-span-3 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                            <h3 className="text-base font-semibold text-gray-900">Revenue Trend</h3>
                            <div className="mt-4 space-y-2">
                                {trends.slice(-14).map((entry) => {
                                    const revenue = Number(entry?.revenue || 0);
                                    const width = Math.max(3, Math.round((revenue / maxTrendRevenue) * 100));
                                    return (
                                        <div key={entry.date} className="grid grid-cols-[90px_1fr_100px] items-center gap-3">
                                            <span className="text-xs text-gray-500">{entry.date}</span>
                                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-primary rounded-full" style={{ width: `${width}%` }} />
                                            </div>
                                            <span className="text-xs font-medium text-gray-700 text-right">{formatCurrency(revenue)}</span>
                                        </div>
                                    );
                                })}
                                {!trends.length && <p className="text-sm text-gray-500">No trend data available.</p>}
                            </div>
                        </div>

                        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                            <h3 className="text-base font-semibold text-gray-900">Order Funnel</h3>
                            <div className="mt-4 space-y-2">
                                {[
                                    ['Attempted', funnel.attempted],
                                    ['Paid', funnel.paid],
                                    ['Shipped', funnel.shipped],
                                    ['Completed', funnel.completed],
                                    ['Cancelled', funnel.cancelled],
                                    ['Refunded', funnel.refunded]
                                ].map(([label, value]) => (
                                    <div key={label} className="flex items-center justify-between py-2 border-b last:border-0 border-gray-100">
                                        <span className="text-sm text-gray-600">{label}</span>
                                        <span className="text-sm font-semibold text-gray-900">{Number(value || 0).toLocaleString('en-IN')}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                            <h3 className="text-base font-semibold text-gray-900">Top Products</h3>
                            <div className="mt-4 space-y-2">
                                {(products.topSellers || []).slice(0, 6).map((item) => (
                                    <div key={String(item.productId)} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                                        <div>
                                            <p className="text-sm font-medium text-gray-800">{item.title}</p>
                                            <p className="text-xs text-gray-500">{Number(item.unitsSold || 0)} units</p>
                                        </div>
                                        <p className="text-sm font-semibold text-gray-900">{formatCurrency(item.revenue)}</p>
                                    </div>
                                ))}
                                {!(products.topSellers || []).length && <p className="text-sm text-gray-500">No product sales in this period.</p>}
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                            <h3 className="text-base font-semibold text-gray-900">Top Customers</h3>
                            <div className="mt-4 space-y-2">
                                {(customers.topCustomers || []).slice(0, 6).map((item) => (
                                    <div key={String(item.userId)} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                                        <div>
                                            <p className="text-sm font-medium text-gray-800">{item.name}</p>
                                            <p className="text-xs text-gray-500">{Number(item.orders || 0)} orders</p>
                                        </div>
                                        <p className="text-sm font-semibold text-gray-900">{formatCurrency(item.revenue)}</p>
                                    </div>
                                ))}
                                {!(customers.topCustomers || []).length && <p className="text-sm text-gray-500">No customer activity in this period.</p>}
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                            <h3 className="text-base font-semibold text-gray-900">Channel Revenue</h3>
                            <div className="mt-4 space-y-2">
                                {(growth.channelRevenue || []).slice(0, 6).map((item) => (
                                    <div key={String(item.channel)} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                                        <div>
                                            <p className="text-sm font-medium text-gray-800">{String(item.channel || 'unknown').replace(/_/g, ' ')}</p>
                                            <p className="text-xs text-gray-500">{Number(item.orders || 0)} orders</p>
                                        </div>
                                        <p className="text-sm font-semibold text-gray-900">{formatCurrency(item.revenue)}</p>
                                    </div>
                                ))}
                                {!(growth.channelRevenue || []).length && <p className="text-sm text-gray-500">No channel data in this period.</p>}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Target size={16} /> Goal Tracking</h3>
                                <span className="text-xs text-gray-500">{isGoalsLoading ? 'Loading...' : `${goals.length} active`}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <select value={goalDraft.metricKey} onChange={(e) => setGoalDraft((prev) => ({ ...prev, metricKey: e.target.value }))} className="px-3 py-2 rounded-lg border border-gray-200 text-sm">
                                    <option value="net_sales">Net Sales</option>
                                    <option value="total_orders">Total Orders</option>
                                    <option value="conversion_rate">Conversion Rate</option>
                                    <option value="repeat_rate">Repeat Rate</option>
                                </select>
                                <input value={goalDraft.label} onChange={(e) => setGoalDraft((prev) => ({ ...prev, label: e.target.value }))} className="px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Goal label" />
                                <input type="number" value={goalDraft.targetValue} onChange={(e) => setGoalDraft((prev) => ({ ...prev, targetValue: e.target.value }))} className="px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Target value" />
                                <select value={goalDraft.periodType} onChange={(e) => setGoalDraft((prev) => ({ ...prev, periodType: e.target.value }))} className="px-3 py-2 rounded-lg border border-gray-200 text-sm">
                                    <option value="monthly">Monthly</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="daily">Daily</option>
                                    <option value="custom">Custom</option>
                                </select>
                                <input type="date" value={goalDraft.periodStart} onChange={(e) => setGoalDraft((prev) => ({ ...prev, periodStart: e.target.value }))} className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                                {goalDraft.periodType === 'custom' && (
                                    <input type="date" value={goalDraft.periodEnd} onChange={(e) => setGoalDraft((prev) => ({ ...prev, periodEnd: e.target.value }))} className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                                )}
                            </div>
                            <div className="mt-3">
                                <button type="button" onClick={handleSaveGoal} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-accent text-xs font-semibold hover:bg-primary-light">
                                    <Save size={13} /> Save Goal
                                </button>
                            </div>
                            <div className="mt-4 space-y-2">
                                {goals.map((goal) => (
                                    <div key={goal.id} className="border border-gray-200 rounded-lg p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-sm font-semibold text-gray-800">{goal.label}</p>
                                            <button type="button" onClick={() => handleDeleteGoal(goal.id)} className="p-1 rounded-md text-red-600 hover:bg-red-50">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">{goal.metricKey} | Target {Number(goal.targetValue || 0).toLocaleString('en-IN')}</p>
                                        <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, Number(goal.progressPct || 0)))}%` }} />
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">{Number(goal.currentValue || 0).toLocaleString('en-IN')} ({Number(goal.progressPct || 0)}%)</p>
                                    </div>
                                ))}
                                {!goals.length && !isGoalsLoading && <p className="text-sm text-gray-500">No goals configured yet.</p>}
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Bell size={16} /> Alerting & Operators</h3>
                            </div>
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                    <input type="checkbox" checked={alertSettings.isActive} onChange={(e) => setAlertSettings((prev) => ({ ...prev, isActive: e.target.checked }))} />
                                    Enable dashboard alerts
                                </label>
                                <input value={alertSettings.emailRecipients} onChange={(e) => setAlertSettings((prev) => ({ ...prev, emailRecipients: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Alert emails (comma separated)" />
                                <input value={alertSettings.whatsappRecipients} onChange={(e) => setAlertSettings((prev) => ({ ...prev, whatsappRecipients: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Alert WhatsApp numbers (comma separated)" />
                                <div className="grid grid-cols-2 gap-2">
                                    <input type="number" value={alertSettings.pendingOver72Threshold} onChange={(e) => setAlertSettings((prev) => ({ ...prev, pendingOver72Threshold: Number(e.target.value || 0) }))} className="px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Pending >72h threshold" />
                                    <input type="number" value={alertSettings.failedPayment6hThreshold} onChange={(e) => setAlertSettings((prev) => ({ ...prev, failedPayment6hThreshold: Number(e.target.value || 0) }))} className="px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Failed payment 6h threshold" />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <input type="number" value={alertSettings.codCancelRateThreshold} onChange={(e) => setAlertSettings((prev) => ({ ...prev, codCancelRateThreshold: Number(e.target.value || 0) }))} className="px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="COD cancel % threshold" />
                                    <input type="number" value={alertSettings.lowStockThreshold} onChange={(e) => setAlertSettings((prev) => ({ ...prev, lowStockThreshold: Number(e.target.value || 0) }))} className="px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Low stock threshold" />
                                </div>
                                <div className="flex items-center gap-2">
                                    <button type="button" onClick={handleSaveAlerts} disabled={isSavingAlerts} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50 disabled:opacity-60">
                                        <Save size={13} /> {isSavingAlerts ? 'Saving...' : 'Save Alerts'}
                                    </button>
                                    <button type="button" onClick={handleRunAlertsNow} disabled={isRunningAlerts} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-accent text-xs font-semibold hover:bg-primary-light disabled:opacity-60">
                                        <Play size={13} /> {isRunningAlerts ? 'Running...' : 'Run Alerts Now'}
                                    </button>
                                </div>
                            </div>
                            <div className="mt-5">
                                <h4 className="text-sm font-semibold text-gray-800">Operator Scorecards</h4>
                                <div className="mt-2 space-y-2">
                                    {(operators.scorecards || []).map((op) => (
                                        <div key={String(op.userId)} className="border border-gray-200 rounded-lg p-2 flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium text-gray-800">{op.name}</p>
                                                <p className="text-xs text-gray-500">
                                                    Total {Number(op.totalActions || 0)} | Shipped {Number(op.shippedUpdates || 0)} | Completed {Number(op.completedUpdates || 0)} | Cancelled {Number(op.cancelledUpdates || 0)}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                    {!(operators.scorecards || []).length && <p className="text-sm text-gray-500">No operator activity in selected range.</p>}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-semibold text-gray-900">Action Center</h3>
                            <span className="text-xs text-gray-500">Prioritized operational tasks</span>
                        </div>
                        <div className="mt-4 space-y-3">
                            {actions.map((action) => (
                                <div key={action.id} className="border border-gray-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <div>
                                        <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold border ${priorityStyles[action.priority] || priorityStyles.low}`}>
                                            {String(action.priority || 'low').toUpperCase()}
                                        </span>
                                        <p className="text-sm font-semibold text-gray-900 mt-2 flex items-center gap-2">
                                            <AlertTriangle size={14} className="text-amber-600" />
                                            {action.title}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">{action.description}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => onRunAction(action)}
                                        className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50"
                                    >
                                        Open
                                        <ArrowRight size={12} />
                                    </button>
                                </div>
                            ))}
                            {!actions.length && <p className="text-sm text-gray-500">No high-priority actions right now.</p>}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
