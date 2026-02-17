import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Filter, RefreshCw, Search, Settings2, X } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { formatAdminDateTime } from '../../utils/dateFormat';
import { useAdminKPI } from '../../context/AdminKPIContext';
import { useSocket } from '../../context/SocketContext';

const journeyStatusOptions = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'recovered', label: 'Recovered' },
    { value: 'expired', label: 'Expired' },
    { value: 'cancelled', label: 'Cancelled' }
];

const sortOptions = [
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
    { value: 'highest_value', label: 'Highest Cart Value' },
    { value: 'lowest_value', label: 'Lowest Cart Value' },
    { value: 'next_due', label: 'Next Due' }
];

const numberArrayInput = (value) => {
    if (Array.isArray(value)) return value.join(',');
    return '';
};

const parseIntegerCsv = (value, { min = 0, fieldLabel = 'Field' } = {}) => {
    const raw = String(value || '').trim();
    if (!raw) return { values: [], error: `${fieldLabel} is required` };
    const parts = raw.split(',').map((part) => part.trim());
    if (parts.some((part) => !part.length)) {
        return { values: [], error: `${fieldLabel} has an empty value. Use comma-separated numbers only.` };
    }
    const values = [];
    for (const part of parts) {
        if (!/^-?\d+$/.test(part)) {
            return { values: [], error: `${fieldLabel} contains invalid value "${part}"` };
        }
        const num = Number(part);
        if (!Number.isFinite(num) || num < min) {
            return { values: [], error: `${fieldLabel} values must be integers >= ${min}` };
        }
        values.push(num);
    }
    return { values, error: null };
};

const statusClass = (status) => {
    const key = String(status || '').toLowerCase();
    if (key === 'recovered') return 'bg-emerald-50 text-emerald-700';
    if (key === 'active') return 'bg-blue-50 text-blue-700';
    if (key === 'expired') return 'bg-amber-50 text-amber-700';
    if (key === 'cancelled') return 'bg-gray-100 text-gray-600';
    return 'bg-gray-100 text-gray-600';
};
const inr = (value) => `₹${Number(value || 0).toLocaleString()}`;
const JOURNEY_PAGE_SIZE = 20;
const MAX_CAMPAIGN_ATTEMPTS = 6;
const RECOVERY_WINDOW_BUFFER_HOURS = 2;
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

const isJourneyReadyForList = (journey, inactivityMinutes) => {
    if (!journey) return false;
    const status = String(journey.status || '').toLowerCase();
    if (status !== 'active') return true;
    if (Number(journey.last_attempt_no || 0) > 0) return true;
    const minutes = Math.max(1, Number(inactivityMinutes || 30));
    const lastActivityRaw = journey.last_activity_at || journey.updated_at || journey.created_at;
    const lastActivity = lastActivityRaw ? new Date(lastActivityRaw) : null;
    if (!lastActivity || Number.isNaN(lastActivity.getTime())) return true;
    return (Date.now() - lastActivity.getTime()) >= minutes * 60 * 1000;
};

export default function AbandonedCarts() {
    const toast = useToast();
    const { socket } = useSocket();
    const {
        abandonedInsightsByKey,
        registerAbandonedInsightsRange,
        setAbandonedInsightsSnapshot,
        markAbandonedInsightsDirty,
        fetchAbandonedInsights,
        toAbandonedInsightsKey
    } = useAdminKPI();
    const [campaignDraft, setCampaignDraft] = useState(null);
    const [insights, setInsights] = useState(null);
    const [journeys, setJourneys] = useState([]);
    const [journeyTotal, setJourneyTotal] = useState(0);
    const [status, setStatus] = useState('all');
    const [sortBy, setSortBy] = useState('newest');
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [page, setPage] = useState(1);
    const [rangeDays, setRangeDays] = useState(30);
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingCampaign, setIsSavingCampaign] = useState(false);
    const [isProcessingNow, setIsProcessingNow] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [selectedTimeline, setSelectedTimeline] = useState(null);
    const [isTimelineLoading, setIsTimelineLoading] = useState(false);
    const [attemptDelaysInput, setAttemptDelaysInput] = useState('');
    const [discountLadderInput, setDiscountLadderInput] = useState('');
    const realtimeRefreshTimerRef = useRef(null);
    const insightsKey = toAbandonedInsightsKey(rangeDays);
    const sharedInsights = abandonedInsightsByKey[insightsKey]?.insights || null;

    const loadCampaign = useCallback(async () => {
        const data = await adminService.getAbandonedCartCampaign();
        const nextCampaign = data.campaign || null;
        setCampaignDraft(nextCampaign);
        setAttemptDelaysInput(numberArrayInput(nextCampaign?.attemptDelaysMinutes));
        setDiscountLadderInput(numberArrayInput(nextCampaign?.discountLadderPercent));
    }, []);

    const loadInsights = useCallback(async () => {
        const data = await adminService.getAbandonedCartInsights(rangeDays);
        const resolvedInsights = data.insights || null;
        setInsights(resolvedInsights);
        if (resolvedInsights) {
            setAbandonedInsightsSnapshot(rangeDays, resolvedInsights);
        }
    }, [rangeDays, setAbandonedInsightsSnapshot]);

    const loadJourneys = useCallback(async () => {
        const data = await adminService.getAbandonedCartJourneys({
            status,
            sortBy,
            search,
            limit: JOURNEY_PAGE_SIZE,
            offset: (Math.max(1, Number(page || 1)) - 1) * JOURNEY_PAGE_SIZE
        });
        setJourneys(data.journeys || []);
        setJourneyTotal(Number(data.total || 0));
    }, [page, search, sortBy, status]);

    const loadAll = useCallback(async () => {
        setIsLoading(true);
        try {
            await Promise.all([loadCampaign(), loadInsights(), loadJourneys()]);
        } catch (error) {
            toast.error(error.message || 'Failed to load abandoned cart data');
        } finally {
            setIsLoading(false);
        }
    }, [loadCampaign, loadInsights, loadJourneys, toast]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    useEffect(() => {
        registerAbandonedInsightsRange(rangeDays);
        fetchAbandonedInsights(rangeDays).catch(() => {});
    }, [fetchAbandonedInsights, rangeDays, registerAbandonedInsightsRange]);

    useEffect(() => {
        if (isLoading) return;
        loadJourneys().catch(() => {});
    }, [status, sortBy, search, page, isLoading, loadJourneys]);

    useEffect(() => {
        if (isLoading) return;
        loadInsights().catch(() => {});
    }, [rangeDays, isLoading, loadInsights]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (search === searchInput) return;
            setSearch(searchInput);
        }, 250);
        return () => clearTimeout(timer);
    }, [search, searchInput]);

    useEffect(() => {
        setPage(1);
    }, [status, sortBy, search]);

    const cards = useMemo(() => {
        const effectiveInsights = sharedInsights || insights;
        const totals = effectiveInsights?.totals || {};
        return [
            { label: 'Total Journeys', value: Number(totals.totalJourneys || 0) },
            { label: 'Recovered', value: Number(totals.recoveredJourneys || 0) },
            { label: 'Recovery Rate', value: `${Number(totals.recoveryRate || 0).toFixed(2)}%` },
            { label: 'Recovered Value', value: inr(totals.recoveredValue || 0) }
        ];
    }, [insights, sharedInsights]);

    const totalPages = useMemo(
        () => Math.max(1, Math.ceil(Number(journeyTotal || 0) / JOURNEY_PAGE_SIZE)),
        [journeyTotal]
    );
    const visiblePages = useMemo(() => buildVisiblePages(page, totalPages, 5), [page, totalPages]);

    useEffect(() => {
        setPage((prev) => Math.min(Math.max(1, Number(prev || 1)), totalPages));
    }, [totalPages]);

    const handleCampaignField = (key, value) => {
        setCampaignDraft((prev) => ({ ...(prev || {}), [key]: value }));
    };

    const campaignValidation = useMemo(() => {
        if (!campaignDraft) return { isValid: false, errors: {}, parsed: null };
        const errors = {};

        const maxAttempts = Number(campaignDraft.maxAttempts);
        const inactivityMinutes = Number(campaignDraft.inactivityMinutes);
        const recoveryWindowHours = Number(campaignDraft.recoveryWindowHours);
        const maxDiscountPercent = Number(campaignDraft.maxDiscountPercent);
        const minDiscountCartValue = Number(campaignDraft.minDiscountCartValue);

        if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
            errors.maxAttempts = 'Max attempts must be an integer >= 1';
        } else if (maxAttempts > MAX_CAMPAIGN_ATTEMPTS) {
            errors.maxAttempts = `Max attempts cannot exceed ${MAX_CAMPAIGN_ATTEMPTS}`;
        }
        if (!Number.isInteger(inactivityMinutes) || inactivityMinutes < 1) {
            errors.inactivityMinutes = 'Inactivity must be an integer >= 1';
        }
        if (!Number.isInteger(recoveryWindowHours) || recoveryWindowHours < 1) {
            errors.recoveryWindowHours = 'Recovery window must be an integer >= 1';
        }
        if (!Number.isInteger(maxDiscountPercent) || maxDiscountPercent < 0) {
            errors.maxDiscountPercent = 'Max discount must be an integer >= 0';
        }
        if (!Number.isFinite(minDiscountCartValue) || minDiscountCartValue < 0) {
            errors.minDiscountCartValue = 'Minimum cart value must be a number >= 0';
        }

        let minRecommendedRecoveryWindowHours = null;
        let effectiveRecoveryWindowHours = recoveryWindowHours;

        const attemptDelays = parseIntegerCsv(attemptDelaysInput, {
            min: 1,
            fieldLabel: 'Attempt delays'
        });
        if (attemptDelays.error) {
            errors.attemptDelaysMinutes = attemptDelays.error;
        } else if (Number.isInteger(maxAttempts) && maxAttempts > 0 && attemptDelays.values.length !== maxAttempts) {
            errors.attemptDelaysMinutes = `Expected ${maxAttempts} values to match max attempts`;
        } else if (!errors.maxAttempts) {
            const totalDelayMinutes = attemptDelays.values.reduce((sum, value) => sum + Number(value || 0), 0);
            minRecommendedRecoveryWindowHours = Math.max(1, Math.ceil(totalDelayMinutes / 60) + RECOVERY_WINDOW_BUFFER_HOURS);
            if (!errors.recoveryWindowHours) {
                effectiveRecoveryWindowHours = Math.max(recoveryWindowHours, minRecommendedRecoveryWindowHours);
            }
        }

        const discountLadder = parseIntegerCsv(discountLadderInput, {
            min: 0,
            fieldLabel: 'Discount ladder'
        });
        if (discountLadder.error) {
            errors.discountLadderPercent = discountLadder.error;
        } else if (Number.isInteger(maxAttempts) && maxAttempts > 0 && discountLadder.values.length !== maxAttempts) {
            errors.discountLadderPercent = `Expected ${maxAttempts} values to match max attempts`;
        } else if (
            !errors.maxDiscountPercent
            && discountLadder.values.some((value) => value > maxDiscountPercent)
        ) {
            errors.discountLadderPercent = 'Discount ladder values cannot exceed max discount';
        }

        return {
            isValid: Object.keys(errors).length === 0,
            errors,
            parsed: {
                maxAttempts,
                inactivityMinutes,
                recoveryWindowHours: effectiveRecoveryWindowHours,
                maxDiscountPercent,
                minDiscountCartValue,
                attemptDelaysMinutes: attemptDelays.values,
                discountLadderPercent: discountLadder.values
            },
            minRecommendedRecoveryWindowHours
        };
    }, [attemptDelaysInput, campaignDraft, discountLadderInput]);

    const handleSaveCampaign = async () => {
        if (!campaignDraft) return;
        if (!campaignValidation.isValid) {
            const firstError = Object.values(campaignValidation.errors)[0];
            toast.error(firstError || 'Please fix campaign field errors');
            return false;
        }
        setIsSavingCampaign(true);
        try {
            const parsed = campaignValidation.parsed;
            const payload = {
                enabled: Boolean(campaignDraft.enabled),
                inactivityMinutes: parsed.inactivityMinutes,
                maxAttempts: parsed.maxAttempts,
                attemptDelaysMinutes: parsed.attemptDelaysMinutes,
                discountLadderPercent: parsed.discountLadderPercent,
                maxDiscountPercent: parsed.maxDiscountPercent,
                minDiscountCartValue: parsed.minDiscountCartValue,
                recoveryWindowHours: parsed.recoveryWindowHours,
                sendEmail: Boolean(campaignDraft.sendEmail),
                sendWhatsapp: Boolean(campaignDraft.sendWhatsapp),
                sendPaymentLink: Boolean(campaignDraft.sendPaymentLink),
                reminderEnable: Boolean(campaignDraft.reminderEnable)
            };
            const data = await adminService.updateAbandonedCartCampaign(payload);
            const nextCampaign = data.campaign || null;
            setCampaignDraft(nextCampaign);
            setAttemptDelaysInput(numberArrayInput(nextCampaign?.attemptDelaysMinutes));
            setDiscountLadderInput(numberArrayInput(nextCampaign?.discountLadderPercent));
            adminService.invalidateAbandonedCache();
            await Promise.all([loadJourneys(), loadInsights()]);
            markAbandonedInsightsDirty(rangeDays);
            fetchAbandonedInsights(rangeDays, { force: true }).catch(() => {});
            toast.success('Campaign settings updated');
            return true;
        } catch (error) {
            toast.error(error.message || 'Failed to update campaign settings');
            return false;
        } finally {
            setIsSavingCampaign(false);
        }
    };

    const handleProcessNow = async () => {
        setIsProcessingNow(true);
        try {
            const data = await adminService.processAbandonedCartRecoveries(50);
            const due = Number(data?.stats?.due || 0);
            const sent = Number(data?.stats?.sent || 0);
            const skipped = Number(data?.stats?.skipped || 0);
            const failed = Number(data?.stats?.failed || 0);
            const recovered = Number(data?.stats?.recovered || 0);
            const cancelled = Number(data?.stats?.cancelled || 0);
            const expired = Number(data?.stats?.expired || 0);
            const failedReasons = data?.stats?.failedReasons || {};
            const topFailure = Object.entries(failedReasons)
                .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))[0];

            toast.success(`Recovery run: due ${due}, sent ${sent}, skipped ${skipped}, failed ${failed}, recovered ${recovered}, cancelled ${cancelled}, expired ${expired}`);
            if (failed > 0 && topFailure) {
                toast.error(`Top failure (${topFailure[1]}): ${topFailure[0]}`);
            }
            markAbandonedInsightsDirty(rangeDays);
            fetchAbandonedInsights(rangeDays, { force: true }).catch(() => {});
            await Promise.all([loadJourneys(), loadInsights()]);
        } catch (error) {
            toast.error(error.message || 'Failed to process abandoned carts');
        } finally {
            setIsProcessingNow(false);
        }
    };

    const openTimeline = useCallback(async (journeyId) => {
        if (!journeyId) return;
        setIsTimelineLoading(true);
        setSelectedTimeline({ journey: { id: journeyId }, attempts: [], discounts: [] });
        try {
            const data = await adminService.getAbandonedCartJourneyTimeline(journeyId);
            setSelectedTimeline(data || null);
        } catch (error) {
            toast.error(error.message || 'Failed to load timeline');
        } finally {
            setIsTimelineLoading(false);
        }
    }, [toast]);

    const closeTimeline = () => setSelectedTimeline(null);

    useEffect(() => {
        if (!socket) return undefined;
        const scheduleRealtimeRefresh = () => {
            if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
            realtimeRefreshTimerRef.current = setTimeout(() => {
                adminService.invalidateAbandonedCache();
                markAbandonedInsightsDirty(rangeDays);
                fetchAbandonedInsights(rangeDays, { force: true }).catch(() => {});
                loadJourneys().catch(() => {});
                if (selectedTimeline?.journey?.id) {
                    openTimeline(selectedTimeline.journey.id);
                }
            }, 120);
        };
        const handleAbandonedUpdate = (payload = {}) => {
            if (payload?.journey?.id) {
                const nextJourney = {
                    ...payload.journey,
                    computed_last_activity_at:
                        payload.journey.computed_last_activity_at
                        || payload.journey.last_activity_at
                        || payload.journey.updated_at
                        || payload.ts
                        || null
                };
                const shouldShow = isJourneyReadyForList(nextJourney, campaignDraft?.inactivityMinutes);
                setJourneys((prev) => {
                    const rows = Array.isArray(prev) ? prev : [];
                    const idx = rows.findIndex((row) => String(row.id) === String(nextJourney.id));
                    if (!shouldShow) {
                        if (idx < 0) return rows;
                        const next = rows.filter((row) => String(row.id) !== String(nextJourney.id));
                        return next;
                    }
                    if (idx >= 0) {
                        const copy = [...rows];
                        copy[idx] = {
                            ...copy[idx],
                            ...nextJourney,
                            computed_last_activity_at:
                                nextJourney.computed_last_activity_at
                                || nextJourney.last_activity_at
                                || nextJourney.updated_at
                                || copy[idx].computed_last_activity_at
                        };
                        return copy;
                    }
                    // New journey created from live customer cart updates.
                    return [{ ...nextJourney }, ...rows];
                });
            }
            scheduleRealtimeRefresh();
        };
        const handleOrderOrPaymentUpdate = () => scheduleRealtimeRefresh();

        socket.on('abandoned_cart:update', handleAbandonedUpdate);
        socket.on('abandoned_cart:journey:update', handleAbandonedUpdate);
        socket.on('abandoned_cart:recovered', handleAbandonedUpdate);
        socket.on('order:create', handleOrderOrPaymentUpdate);
        socket.on('order:update', handleOrderOrPaymentUpdate);
        socket.on('payment:update', handleOrderOrPaymentUpdate);
        return () => {
            if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
            socket.off('abandoned_cart:update', handleAbandonedUpdate);
            socket.off('abandoned_cart:journey:update', handleAbandonedUpdate);
            socket.off('abandoned_cart:recovered', handleAbandonedUpdate);
            socket.off('order:create', handleOrderOrPaymentUpdate);
            socket.off('order:update', handleOrderOrPaymentUpdate);
            socket.off('payment:update', handleOrderOrPaymentUpdate);
        };
    }, [
        fetchAbandonedInsights,
        loadJourneys,
        markAbandonedInsightsDirty,
        openTimeline,
        rangeDays,
        campaignDraft?.inactivityMinutes,
        selectedTimeline?.journey?.id,
        socket
    ]);

    useEffect(() => {
        // Safety reconcile in case any socket message is missed.
        const timer = setInterval(() => {
            adminService.invalidateAbandonedCache();
            markAbandonedInsightsDirty(rangeDays);
            fetchAbandonedInsights(rangeDays, { force: true }).catch(() => {});
            loadJourneys().catch(() => {});
            if (selectedTimeline?.journey?.id) {
                openTimeline(selectedTimeline.journey.id);
            }
        }, 15000);
        return () => clearInterval(timer);
    }, [
        fetchAbandonedInsights,
        loadJourneys,
        markAbandonedInsightsDirty,
        openTimeline,
        rangeDays,
        selectedTimeline?.journey?.id
    ]);

    const renderCampaignSettingsForm = () => (
        !campaignDraft ? (
            <div className="text-sm text-gray-400">Loading settings...</div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm text-gray-600">Inactivity (minutes)
                    <input type="number" value={campaignDraft.inactivityMinutes || 30} onChange={(e) => handleCampaignField('inactivityMinutes', e.target.value)} className={`mt-1 w-full px-3 py-2 border rounded-lg ${campaignValidation.errors.inactivityMinutes ? 'border-red-300' : 'border-gray-200'}`} />
                    {campaignValidation.errors.inactivityMinutes && <p className="mt-1 text-xs text-red-600">{campaignValidation.errors.inactivityMinutes}</p>}
                </label>
                <label className="text-sm text-gray-600">Max attempts
                    <input type="number" min="1" max={MAX_CAMPAIGN_ATTEMPTS} value={campaignDraft.maxAttempts || 4} onChange={(e) => handleCampaignField('maxAttempts', e.target.value)} className={`mt-1 w-full px-3 py-2 border rounded-lg ${campaignValidation.errors.maxAttempts ? 'border-red-300' : 'border-gray-200'}`} />
                    {campaignValidation.errors.maxAttempts && <p className="mt-1 text-xs text-red-600">{campaignValidation.errors.maxAttempts}</p>}
                </label>
                <label className="text-sm text-gray-600">Attempt delays (minutes)
                    <input type="text" value={attemptDelaysInput} onChange={(e) => setAttemptDelaysInput(e.target.value)} className={`mt-1 w-full px-3 py-2 border rounded-lg ${campaignValidation.errors.attemptDelaysMinutes ? 'border-red-300' : 'border-gray-200'}`} placeholder="30, 360, 1440" />
                    {campaignValidation.errors.attemptDelaysMinutes && <p className="mt-1 text-xs text-red-600">{campaignValidation.errors.attemptDelaysMinutes}</p>}
                </label>
                <label className="text-sm text-gray-600">Discount ladder (%)
                    <input type="text" value={discountLadderInput} onChange={(e) => setDiscountLadderInput(e.target.value)} className={`mt-1 w-full px-3 py-2 border rounded-lg ${campaignValidation.errors.discountLadderPercent ? 'border-red-300' : 'border-gray-200'}`} placeholder="0, 0, 5, 10" />
                    {campaignValidation.errors.discountLadderPercent && <p className="mt-1 text-xs text-red-600">{campaignValidation.errors.discountLadderPercent}</p>}
                </label>
                <label className="text-sm text-gray-600">Max discount (%)
                    <input type="number" value={campaignDraft.maxDiscountPercent || 25} onChange={(e) => handleCampaignField('maxDiscountPercent', e.target.value)} className={`mt-1 w-full px-3 py-2 border rounded-lg ${campaignValidation.errors.maxDiscountPercent ? 'border-red-300' : 'border-gray-200'}`} />
                    {campaignValidation.errors.maxDiscountPercent && <p className="mt-1 text-xs text-red-600">{campaignValidation.errors.maxDiscountPercent}</p>}
                </label>
                <label className="text-sm text-gray-600">Min cart value for discount (₹)
                    <input type="number" min="0" step="1" value={campaignDraft.minDiscountCartValue ?? 0} onChange={(e) => handleCampaignField('minDiscountCartValue', e.target.value)} className={`mt-1 w-full px-3 py-2 border rounded-lg ${campaignValidation.errors.minDiscountCartValue ? 'border-red-300' : 'border-gray-200'}`} />
                    {campaignValidation.errors.minDiscountCartValue && <p className="mt-1 text-xs text-red-600">{campaignValidation.errors.minDiscountCartValue}</p>}
                </label>
                <label className="text-sm text-gray-600">Recovery window (hours)
                    <input type="number" value={campaignDraft.recoveryWindowHours || 72} onChange={(e) => handleCampaignField('recoveryWindowHours', e.target.value)} className={`mt-1 w-full px-3 py-2 border rounded-lg ${campaignValidation.errors.recoveryWindowHours ? 'border-red-300' : 'border-gray-200'}`} />
                    {campaignValidation.errors.recoveryWindowHours && <p className="mt-1 text-xs text-red-600">{campaignValidation.errors.recoveryWindowHours}</p>}
                    {!campaignValidation.errors.recoveryWindowHours
                        && Number.isFinite(campaignValidation.minRecommendedRecoveryWindowHours)
                        && Number(campaignDraft.recoveryWindowHours || 0) < Number(campaignValidation.minRecommendedRecoveryWindowHours || 0) && (
                        <p className="mt-1 text-xs text-amber-700">
                            Will auto-extend to {campaignValidation.minRecommendedRecoveryWindowHours}h based on configured delays (includes {RECOVERY_WINDOW_BUFFER_HOURS}h buffer).
                        </p>
                    )}
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={Boolean(campaignDraft.enabled)} onChange={(e) => handleCampaignField('enabled', e.target.checked)} /> Enabled</label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={Boolean(campaignDraft.sendEmail)} onChange={(e) => handleCampaignField('sendEmail', e.target.checked)} /> Email</label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={Boolean(campaignDraft.sendWhatsapp)} onChange={(e) => handleCampaignField('sendWhatsapp', e.target.checked)} /> WhatsApp</label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={Boolean(campaignDraft.sendPaymentLink)} onChange={(e) => handleCampaignField('sendPaymentLink', e.target.checked)} /> Payment Link</label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={Boolean(campaignDraft.reminderEnable)} onChange={(e) => handleCampaignField('reminderEnable', e.target.checked)} /> Razorpay Reminders</label>
            </div>
        )
    );

    return (
        <div className="animate-fade-in space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-serif text-primary font-bold">Abandoned Cart Recovery</h1>
                    <p className="text-sm text-gray-500 mt-1">Campaign settings, recovery insights, journeys and timelines.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setIsSettingsOpen(true)}
                        className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                        title="Campaign settings"
                    >
                        <Settings2 size={18} />
                    </button>
                    <select
                        value={rangeDays}
                        onChange={(e) => setRangeDays(Number(e.target.value || 30))}
                        className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                    >
                        <option value={7}>Last 7 days</option>
                        <option value={30}>Last 30 days</option>
                        <option value={90}>Last 90 days</option>
                    </select>
                    <button
                        type="button"
                        onClick={handleProcessNow}
                        disabled={isProcessingNow}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-accent text-sm font-semibold hover:bg-primary-light disabled:opacity-60"
                    >
                        <RefreshCw size={14} className={isProcessingNow ? 'animate-spin' : ''} />
                        {isProcessingNow ? 'Processing...' : 'Run Recovery Now'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {cards.map((card) => (
                    <div key={card.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">{card.label}</p>
                        <p className="text-xl font-bold text-gray-800 mt-1">{card.value}</p>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center gap-2 md:justify-between">
                    <p className="text-sm text-gray-500">Journeys ({journeyTotal})</p>
                    <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                        <div className="relative">
                            <Filter className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                            <select value={status} onChange={(e) => setStatus(e.target.value)} className="pl-9 pr-7 py-2 rounded-lg border border-gray-200 bg-white text-sm w-full md:w-auto">
                                {journeyStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </div>
                        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm w-full md:w-auto">
                            {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm w-full md:w-64" placeholder="Search customer / id" />
                        </div>
                    </div>
                </div>

                {isLoading ? (
                    <div className="py-14 text-center text-gray-400">Loading abandoned cart journeys...</div>
                ) : journeys.length === 0 ? (
                    <div className="py-14 text-center text-gray-400">No journeys found.</div>
                ) : (
                    <>
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="px-5 py-3 text-xs uppercase tracking-wider text-gray-500">Journey</th>
                                    <th className="px-5 py-3 text-xs uppercase tracking-wider text-gray-500">Customer</th>
                                    <th className="px-5 py-3 text-xs uppercase tracking-wider text-gray-500">Cart Value</th>
                                    <th className="px-5 py-3 text-xs uppercase tracking-wider text-gray-500">Status</th>
                                    <th className="px-5 py-3 text-xs uppercase tracking-wider text-gray-500">Attempts</th>
                                    <th className="px-5 py-3 text-xs uppercase tracking-wider text-gray-500">Last Activity</th>
                                    <th className="px-5 py-3 text-xs uppercase tracking-wider text-gray-500">Next Attempt</th>
                                    <th className="px-5 py-3 text-xs uppercase tracking-wider text-gray-500 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {journeys.map((journey) => (
                                    <tr key={journey.id}>
                                        <td className="px-5 py-3 text-sm font-semibold text-gray-800">#{journey.id}</td>
                                        <td className="px-5 py-3 text-sm text-gray-700">
                                            <p className="font-medium">{journey.customer_name || 'Guest'}</p>
                                            <p className="text-xs text-gray-400">{journey.customer_email || journey.customer_mobile || '—'}</p>
                                        </td>
                                        <td className="px-5 py-3 text-sm text-gray-700">{inr((Number(journey.cart_total_subunits || 0) / 100))}</td>
                                        <td className="px-5 py-3 text-sm">
                                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass(journey.status)}`}>{journey.status}</span>
                                            {journey.recovered_order_ref && (
                                                <p className="text-[11px] text-emerald-700 mt-1">Recovered by {journey.recovered_order_ref}</p>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-sm text-gray-700">{Number(journey.last_attempt_no || 0)}</td>
                                        <td className="px-5 py-3 text-xs text-gray-500">{formatAdminDateTime(journey.computed_last_activity_at || journey.last_activity_at || journey.updated_at)}</td>
                                        <td className="px-5 py-3 text-xs text-gray-500">
                                            {journey.next_attempt_at ? (
                                                <div>
                                                    <p>#{Number(journey.last_attempt_no || 0) + 1}</p>
                                                    <p>{formatAdminDateTime(journey.next_attempt_at)}</p>
                                                </div>
                                            ) : '—'}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <button type="button" onClick={() => openTimeline(journey.id)} className="px-3 py-1.5 rounded-md border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50">Timeline</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="md:hidden divide-y divide-gray-100">
                        {journeys.map((journey) => (
                            <div key={journey.id} className="p-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Journey</p>
                                        <p className="text-sm font-semibold text-gray-800">#{journey.id}</p>
                                        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mt-1">Customer</p>
                                        <p className="text-sm font-medium text-gray-700">{journey.customer_name || 'Guest'}</p>
                                        <p className="text-xs text-gray-400">{journey.customer_email || journey.customer_mobile || '—'}</p>
                                        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mt-1">Cart Value</p>
                                        <p className="text-sm font-semibold text-gray-800">{inr((Number(journey.cart_total_subunits || 0) / 100))}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Status</p>
                                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass(journey.status)}`}>{journey.status}</span>
                                        {!!journey.recovered_order_ref && (
                                            <p className="text-[11px] text-emerald-700">Recovered by {journey.recovered_order_ref}</p>
                                        )}
                                        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mt-1">Attempts</p>
                                        <p className="text-sm text-gray-700">{Number(journey.last_attempt_no || 0)}</p>
                                        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mt-1">Last Activity</p>
                                        <p className="text-xs text-gray-500">{formatAdminDateTime(journey.computed_last_activity_at || journey.last_activity_at || journey.updated_at)}</p>
                                        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mt-1">Next Attempt</p>
                                        <p className="text-xs text-gray-500">{journey.next_attempt_at ? `#${Number(journey.last_attempt_no || 0) + 1} · ${formatAdminDateTime(journey.next_attempt_at)}` : '—'}</p>
                                    </div>
                                </div>
                                <div className="mt-3 flex justify-end">
                                    <button type="button" onClick={() => openTimeline(journey.id)} className="px-3 py-1.5 rounded-md border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50">Timeline</button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
                        <p className="text-xs text-gray-500">
                            Page {page} of {totalPages}
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                                disabled={page <= 1}
                                className="px-3 py-1.5 rounded-md border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Previous
                            </button>
                            {visiblePages.map((pageNo) => (
                                <button
                                    key={pageNo}
                                    type="button"
                                    onClick={() => setPage(pageNo)}
                                    className={`px-3 py-1.5 rounded-md border text-xs font-semibold ${
                                        pageNo === page
                                            ? 'border-primary bg-primary text-accent'
                                            : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    {pageNo}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                                disabled={page >= totalPages}
                                className="px-3 py-1.5 rounded-md border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                    </>
                )}
            </div>

            {isSettingsOpen && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl border border-gray-200 shadow-2xl p-5">
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <h3 className="text-lg font-semibold text-gray-800">Campaign Settings</h3>
                            <button type="button" onClick={() => setIsSettingsOpen(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                                <X size={16} />
                            </button>
                        </div>
                        {renderCampaignSettingsForm()}
                        <div className="mt-5 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setIsSettingsOpen(false)}
                                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    const ok = await handleSaveCampaign();
                                    if (ok) setIsSettingsOpen(false);
                                }}
                                disabled={isSavingCampaign || !campaignDraft || !campaignValidation.isValid}
                                className="px-4 py-2 rounded-lg bg-primary text-accent text-sm font-semibold hover:bg-primary-light disabled:opacity-60"
                            >
                                {isSavingCampaign ? 'Saving...' : 'Save Settings'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedTimeline && (
                <div className="fixed inset-0 z-[80] flex items-stretch justify-end bg-black/40">
                    <div className="bg-white w-full max-w-xl h-full overflow-y-auto p-6 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-gray-800">Journey Timeline #{selectedTimeline?.journey?.id}</h3>
                            <button type="button" onClick={closeTimeline} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><X size={16} /></button>
                        </div>

                        {isTimelineLoading ? (
                            <div className="py-14 text-center text-gray-400">Loading timeline...</div>
                        ) : (
                            <div className="space-y-5 mt-4">
                                <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                                    <p className="text-xs text-gray-500 uppercase">Journey Status</p>
                                    <p className="text-sm font-semibold text-gray-800 mt-1">{selectedTimeline?.journey?.status}</p>
                                    {selectedTimeline?.journey?.recovery_reason && (
                                        <p className="text-xs text-gray-500 mt-1">Reason: {selectedTimeline?.journey?.recovery_reason}</p>
                                    )}
                                    <p className="text-xs text-gray-500 mt-2">
                                        Next attempt: {selectedTimeline?.journey?.next_attempt_at
                                            ? `#${Number(selectedTimeline?.journey?.last_attempt_no || 0) + 1} · ${formatAdminDateTime(selectedTimeline.journey.next_attempt_at)}`
                                            : '—'}
                                    </p>
                                    {!!(selectedTimeline?.attempts || []).length && (
                                        <>
                                            {(() => {
                                                const attempts = selectedTimeline?.attempts || [];
                                                const latestAttempt = attempts[attempts.length - 1];
                                                const paymentId = latestAttempt?.response_json?.paymentId || null;
                                                return (
                                                    <div className="mt-2 text-xs text-gray-500 space-y-1">
                                                        <p>Payment Link ID: {latestAttempt?.payment_link_id || '—'}</p>
                                                        <p>Payment ID: {paymentId || '—'}</p>
                                                        <p>Attempt Status: {latestAttempt?.status || '—'}</p>
                                                    </div>
                                                );
                                            })()}
                                        </>
                                    )}
                                </div>

                                <div>
                                    <p className="text-xs text-gray-500 uppercase mb-2">Attempts</p>
                                    <div className="space-y-3">
                                        {(selectedTimeline?.attempts || []).map((attempt) => (
                                            <div key={attempt.id} className="border border-gray-200 rounded-xl p-3">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm font-semibold text-gray-800">Attempt #{attempt.attempt_no}</p>
                                                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${attempt.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : attempt.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{attempt.status}</span>
                                                </div>
                                                <p className="text-xs text-gray-500 mt-1">Channels: {(attempt.channels_json || []).join(', ') || '—'}</p>
                                                {attempt.discount_code && <p className="text-xs text-gray-500">Discount: {attempt.discount_code} ({attempt.discount_percent || 0}%)</p>}
                                                <p className="text-xs text-gray-500">Payment Link ID: {attempt.payment_link_id || '—'}</p>
                                                <p className="text-xs text-gray-500">Payment ID: {attempt.response_json?.paymentId || '—'}</p>
                                                {attempt.payment_link_url && <a className="text-xs text-primary" href={attempt.payment_link_url} target="_blank" rel="noreferrer">Open payment link</a>}
                                                <p className="text-xs text-gray-400 mt-1">{formatAdminDateTime(attempt.created_at)}</p>
                                            </div>
                                        ))}
                                        {(selectedTimeline?.attempts || []).length === 0 && (
                                            <p className="text-sm text-gray-400">No attempts yet.</p>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <p className="text-xs text-gray-500 uppercase mb-2">Discounts</p>
                                    <div className="space-y-2">
                                        {(selectedTimeline?.discounts || []).map((discount) => (
                                            <div key={discount.id} className="border border-gray-200 rounded-lg p-3 text-sm text-gray-700">
                                                <p className="font-semibold">{discount.code}</p>
                                                <p className="text-xs text-gray-500">{discount.discount_percent || 0}% · {discount.status}</p>
                                            </div>
                                        ))}
                                        {(selectedTimeline?.discounts || []).length === 0 && (
                                            <p className="text-sm text-gray-400">No discounts issued.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
