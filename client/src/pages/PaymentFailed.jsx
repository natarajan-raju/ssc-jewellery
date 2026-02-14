import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { orderService } from '../services/orderService';
import { useToast } from '../context/ToastContext';

export default function PaymentFailed() {
    const toast = useToast();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const reason = searchParams.get('reason') || 'Payment failed. Please try again.';
    const attemptId = searchParams.get('attemptId') || '';
    const [isRetrying, setIsRetrying] = useState(false);

    const handleRetry = async () => {
        if (isRetrying) return;
        setIsRetrying(true);
        try {
            await orderService.retryRazorpayOrder({ attemptId: attemptId || undefined });
            toast.success('New payment session created. Redirecting to checkout...');
            navigate('/checkout');
        } catch (error) {
            toast.error(error?.message || 'Unable to retry payment');
        } finally {
            setIsRetrying(false);
        }
    };

    return (
        <div className="min-h-screen bg-secondary flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm max-w-lg w-full p-8 text-center">
                <h1 className="text-2xl font-serif text-primary">Payment Failed</h1>
                <p className="text-sm text-red-600 mt-3">{reason}</p>
                <p className="text-xs text-gray-500 mt-4">
                    If your payment session expired, create a fresh payment and retry checkout.
                </p>
                <div className="mt-6 flex items-center justify-center gap-3">
                    <button
                        type="button"
                        onClick={handleRetry}
                        disabled={isRetrying}
                        className="px-4 py-2 rounded-xl bg-primary text-accent font-semibold disabled:opacity-60"
                    >
                        {isRetrying ? 'Retrying...' : 'Retry Payment'}
                    </button>
                    <Link to="/orders" className="px-4 py-2 rounded-xl border border-gray-200 text-gray-700 font-semibold">
                        Go to Orders
                    </Link>
                </div>
            </div>
        </div>
    );
}
