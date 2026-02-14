let RazorpayLib = null;

const createRazorpayClient = () => {
    const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
    const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();

    if (!keyId || !keySecret) {
        throw new Error('Razorpay API keys are missing in server environment');
    }

    if (!RazorpayLib) {
        // Lazy require keeps boot working even before dependency install.
        // Endpoint will still fail with a clear error if package is missing.
        // eslint-disable-next-line global-require
        RazorpayLib = require('razorpay');
    }

    return new RazorpayLib({
        key_id: keyId,
        key_secret: keySecret
    });
};

module.exports = { createRazorpayClient };
