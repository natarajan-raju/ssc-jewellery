const toText = (value = '') => String(value == null ? '' : value).trim();
const normalize = (value = '') => toText(value).replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
const WORKFLOW_TEMPLATE_NAMES = {
    generic: normalize(process.env.WHATSAPP_TEMPLATE_GENERIC || '') || 'generic',
    default: normalize(process.env.WHATSAPP_TEMPLATE_DEFAULT || '') || 'generic',
    login_otp: normalize(process.env.WHATSAPP_TEMPLATE_LOGIN_OTP || '') || 'login_otp',
    order: normalize(process.env.WHATSAPP_TEMPLATE_ORDER || '') || 'order',
    payment: normalize(process.env.WHATSAPP_TEMPLATE_PAYMENT || '') || 'payment',
    abandoned_cart_recovery: normalize(process.env.WHATSAPP_TEMPLATE_ABANDONED_CART || '') || 'abandoned_cart_recovery',
    dashboard_alert: normalize(process.env.WHATSAPP_TEMPLATE_DASHBOARD_ALERT || '') || 'dashboard_alert',
    coupon_issue: normalize(process.env.WHATSAPP_TEMPLATE_COUPON_ISSUE || '') || 'coupon_issue'
};

const fallbackName = (payload = {}) => (
    normalize(
        payload?.name
        || payload?.customer?.name
        || 'Customer'
    ) || 'Customer'
);

const toAmountLabel = (value = 0) => `INR ${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
})}`;

const buildGenericContent = (payload = {}) => ({
    params: Array.isArray(payload?.params) ? payload.params : [],
    message: normalize(payload?.message || '') || 'SSC Jewellery update from support team.',
    name: fallbackName(payload)
});

const buildLoginOtpContent = (payload = {}) => {
    const otp = normalize(payload?.data?.otp || payload?.otp || '');
    const name = fallbackName(payload);
    return {
        // Template "Otp" expects a single variable: {{1}} = OTP code.
        params: [otp || '000000'],
        message: normalize(payload?.message || '') || `${otp || '000000'} is your verification code`,
        name
    };
};

const buildOrderContent = (payload = {}) => {
    const order = payload?.order || {};
    const customer = payload?.customer || {};
    const name = normalize(customer?.name || payload?.name || 'Customer') || 'Customer';
    const orderRef = normalize(order?.order_ref || order?.orderRef || order?.id || 'N/A');
    const stage = normalize(payload?.stage || 'updated');
    const total = toAmountLabel(order?.total || 0);
    return {
        params: [name, orderRef, stage, total],
        message: normalize(payload?.message || '') || `Order ${orderRef} is ${stage}. Total ${total}.`,
        name
    };
};

const buildPaymentContent = (payload = {}) => {
    const customer = payload?.customer || {};
    const order = payload?.order || {};
    const payment = payload?.payment || {};
    const name = normalize(customer?.name || payload?.name || 'Customer') || 'Customer';
    const orderRef = normalize(order?.order_ref || order?.orderRef || payment?.razorpayOrderId || order?.id || 'N/A');
    const stage = normalize(payload?.stage || payment?.paymentStatus || 'updated');
    return {
        params: [name, orderRef, stage],
        message: normalize(payload?.message || '') || `Payment update for order ${orderRef}: ${stage}.`,
        name
    };
};

const buildAbandonedCartContent = (payload = {}) => {
    const customer = payload?.customer || {};
    const cart = payload?.cart || {};
    const name = normalize(customer?.name || payload?.name || 'Customer') || 'Customer';
    const cartRef = normalize(cart?.journeyId || cart?.id || payload?.journeyId || 'N/A');
    const itemCount = Math.max(0, Number(cart?.itemCount ?? payload?.itemCount ?? 0));
    const discountCode = normalize(payload?.discountCode || cart?.discountCode || '');
    const checkoutLink = normalize(payload?.checkoutLink || payload?.paymentLink || '');
    return {
        params: [name, `${itemCount}`, cartRef, discountCode, checkoutLink].filter(Boolean),
        message: normalize(payload?.message || '') || `You still have ${itemCount} item(s) in your cart. ${discountCode ? `Code: ${discountCode}. ` : ''}${checkoutLink ? `Checkout: ${checkoutLink}` : ''}`.trim(),
        name,
        urlParam: checkoutLink || ''
    };
};

const buildDashboardAlertContent = (payload = {}) => {
    const message = normalize(payload?.message || 'SSC dashboard alert.');
    return {
        params: [message],
        message,
        name: fallbackName(payload)
    };
};

const buildCouponIssueContent = (payload = {}) => {
    const user = payload?.user || {};
    const coupon = payload?.coupon || {};
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
    const name = normalize(user?.name || payload?.name || 'Customer') || 'Customer';
    const storeName = normalize(data.storeName || payload?.storeName || payload?.brandName || 'SSC Jewellery') || 'SSC Jewellery';
    const code = normalize(coupon?.code || data.couponCode || payload?.couponCode || '');
    const offer = normalize(data.discount || payload?.offerText || '');
    const validUntil = normalize(data.validUntil || payload?.validUntil || '');
    const shopUrl = normalize(data.shopUrl || payload?.shopUrl || payload?.urlParam || 'https://sscjewellery.com/');
    return {
        params: [storeName, code, offer, validUntil, shopUrl].filter(Boolean),
        message: normalize(payload?.message || '') || `Hello, good news! A special coupon has been issued for you on ${storeName}. Coupon: ${code || 'N/A'} | Discount: ${offer || 'Special offer'} | Valid Until: ${validUntil || 'Limited period'} | Shop: ${shopUrl}`.trim(),
        name,
        urlParam: shopUrl
    };
};

const WORKFLOW_BUILDERS = {
    generic: buildGenericContent,
    default: buildGenericContent,
    login_otp: buildLoginOtpContent,
    order: buildOrderContent,
    payment: buildPaymentContent,
    abandoned_cart_recovery: buildAbandonedCartContent,
    dashboard_alert: buildDashboardAlertContent,
    coupon_issue: buildCouponIssueContent
};

const resolveWorkflowContent = ({ workflow = 'generic', payload = {} } = {}) => {
    const key = normalize(workflow).toLowerCase() || 'generic';
    const builder = WORKFLOW_BUILDERS[key] || WORKFLOW_BUILDERS.generic;
    const built = builder(payload || {}) || {};
    return {
        ...built,
        template: normalize(payload?.template || payload?.templateName || built.template || WORKFLOW_TEMPLATE_NAMES[key] || WORKFLOW_TEMPLATE_NAMES.generic)
    };
};

module.exports = {
    resolveWorkflowContent
};
