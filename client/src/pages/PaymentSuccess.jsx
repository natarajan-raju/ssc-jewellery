import { Link, useSearchParams } from 'react-router-dom';

export default function PaymentSuccess() {
    const [searchParams] = useSearchParams();
    const orderId = searchParams.get('orderId');

    return (
        <div className="min-h-screen bg-secondary flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm max-w-lg w-full p-8 text-center">
                <h1 className="text-2xl font-serif text-primary">Payment Successful</h1>
                <p className="text-sm text-gray-600 mt-3">
                    Your payment was completed successfully and the order has been created.
                </p>
                {orderId && (
                    <p className="text-xs text-gray-500 mt-4">
                        Order ID: <span className="font-mono">{orderId}</span>
                    </p>
                )}
                <div className="mt-6 flex items-center justify-center gap-3">
                    <Link to="/orders" className="px-4 py-2 rounded-xl bg-primary text-accent font-semibold">
                        View Orders
                    </Link>
                    <Link to="/shop" className="px-4 py-2 rounded-xl border border-gray-200 text-gray-700 font-semibold">
                        Continue Shopping
                    </Link>
                </div>
            </div>
        </div>
    );
}
