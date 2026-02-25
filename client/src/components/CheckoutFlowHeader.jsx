import { CheckCircle2, ChevronRight, CreditCard, ShoppingBag, UserRound, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CheckoutFlowHeader({ state = 'checkout' }) {
    const normalized = String(state || 'checkout').toLowerCase();
    const isFailed = normalized === 'failed';
    const progressWidth = normalized === 'cart'
        ? 'w-1/4'
        : normalized === 'checkout'
            ? 'w-1/2'
            : normalized === 'payment'
                ? 'w-3/4'
                : 'w-full';
    const doneLabel = isFailed ? 'Failed' : 'Done';
    const DoneIcon = isFailed ? XCircle : CheckCircle2;

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 text-sm text-gray-500">
                <Link to="/cart" className="font-semibold text-primary inline-flex items-center gap-1.5"><ShoppingBag size={14} /> Shopping Cart</Link>
                <ChevronRight size={14} />
                <span className="font-semibold text-primary inline-flex items-center gap-1.5"><UserRound size={14} /> Contact Information</span>
                <ChevronRight size={14} />
                <span className="inline-flex items-center gap-1.5"><CreditCard size={14} /> Payment Method</span>
                <ChevronRight size={14} />
                <span className={`inline-flex items-center gap-1.5 ${isFailed ? 'text-red-600' : ''}`}><DoneIcon size={14} /> Confirmation</span>
            </div>
            <div className="mt-4 relative">
                <div className="h-1 rounded-full bg-gray-100" />
                <div className={`absolute top-0 left-0 h-1 rounded-full ${isFailed ? 'bg-red-500' : 'bg-primary'} ${progressWidth}`} />
                <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                    <span className={`font-semibold inline-flex items-center gap-1 ${normalized !== 'cart' ? 'text-primary' : ''}`}><ShoppingBag size={12} /> Cart</span>
                    <span className={`font-semibold inline-flex items-center gap-1 ${normalized !== 'cart' ? 'text-primary' : ''}`}><UserRound size={12} /> Checkout</span>
                    <span className={`font-semibold inline-flex items-center gap-1 ${normalized === 'payment' || normalized === 'confirmation' || normalized === 'failed' ? 'text-primary' : ''}`}><CreditCard size={12} /> Payment</span>
                    <span className={`font-semibold inline-flex items-center gap-1 ${normalized === 'confirmation' ? 'text-primary' : isFailed ? 'text-red-600' : ''}`}><DoneIcon size={12} /> {doneLabel}</span>
                </div>
            </div>
        </div>
    );
}
