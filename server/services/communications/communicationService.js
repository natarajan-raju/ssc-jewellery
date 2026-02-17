const { sendEmail, verifyEmailTransport } = require('./channels/emailChannel');
const {
    sendWhatsapp,
    sendOrderWhatsapp,
    sendPaymentWhatsapp,
    sendAbandonedCartWhatsapp
} = require('./channels/whatsappChannel');

const normalizeCustomer = (customer = {}) => ({
    name: String(customer?.name || 'Customer').trim(),
    email: String(customer?.email || '').trim(),
    mobile: String(customer?.mobile || '').trim()
});

const sendEmailCommunication = async ({
    to,
    subject,
    text = '',
    html = '',
    replyTo = null,
    cc = null,
    bcc = null,
    attachments = []
}) => {
    return sendEmail({ to, subject, text, html, replyTo, cc, bcc, attachments });
};

const formatCurrency = (amount) => `INR ${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (value) => {
    try {
        const d = new Date(value || Date.now());
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
        return '';
    }
};

const buildOrderLifecycleTemplate = ({
    stage = 'updated',
    customer = {},
    order = {},
    includeInvoice = false
} = {}) => {
    const recipient = normalizeCustomer(customer);
    const orderRef = order?.order_ref || order?.orderRef || order?.id || 'N/A';
    const safeStage = String(stage || 'updated').trim().toLowerCase();
    const total = formatCurrency(order?.total || 0);
    const discount = Number(order?.discount_total || 0);
    const hasDiscount = discount > 0;
    const discountLine = hasDiscount ? `You saved ${formatCurrency(discount)} on this order.` : '';
    const supportLine = 'Need help? Reply to this email and our support team will assist you.';
    const invoiceLine = includeInvoice ? 'Your invoice is attached to this email.' : '';
    const createdDate = formatDate(order?.created_at || order?.createdAt);

    const templates = {
        confirmation_discount: {
            subject: `Order Confirmed: ${orderRef} | Savings Applied`,
            text: `Hi ${recipient.name}, your order ${orderRef} is confirmed on ${createdDate}. Total: ${total}. ${discountLine} ${invoiceLine} ${supportLine}`,
            html: `<p>Hi ${recipient.name},</p><p>Your order <strong>${orderRef}</strong> is confirmed${createdDate ? ` on <strong>${createdDate}</strong>` : ''}.</p><p>Total: <strong>${total}</strong></p><p><strong>${discountLine}</strong></p>${invoiceLine ? `<p>${invoiceLine}</p>` : ''}<p>${supportLine}</p>`
        },
        confirmation_no_discount: {
            subject: `Order Confirmed: ${orderRef}`,
            text: `Hi ${recipient.name}, your order ${orderRef} is confirmed on ${createdDate}. Total: ${total}. ${invoiceLine} ${supportLine}`,
            html: `<p>Hi ${recipient.name},</p><p>Your order <strong>${orderRef}</strong> is confirmed${createdDate ? ` on <strong>${createdDate}</strong>` : ''}.</p><p>Total: <strong>${total}</strong></p>${invoiceLine ? `<p>${invoiceLine}</p>` : ''}<p>${supportLine}</p>`
        },
        pending_delay: {
            subject: `We apologize for the delay: ${orderRef}`,
            text: `Hi ${recipient.name}, we are sorry your order ${orderRef} is still pending. We are prioritizing it and will share an update shortly. ${supportLine}`,
            html: `<p>Hi ${recipient.name},</p><p>We sincerely apologize that your order <strong>${orderRef}</strong> is still pending longer than expected.</p><p>Our team is prioritizing it and we will share the next update shortly.</p><p>${supportLine}</p>`
        },
        pending: {
            subject: `Order Status Update: ${orderRef} is Pending`,
            text: `Hi ${recipient.name}, your order ${orderRef} is currently pending. We are processing it and will keep you posted. ${supportLine}`,
            html: `<p>Hi ${recipient.name},</p><p>Your order <strong>${orderRef}</strong> is currently <strong>pending</strong>.</p><p>We are processing it and will keep you posted.</p><p>${supportLine}</p>`
        },
        processing: {
            subject: `Order Status Update: ${orderRef} is Processing`,
            text: `Hi ${recipient.name}, your order ${orderRef} is now being processed. ${supportLine}`,
            html: `<p>Hi ${recipient.name},</p><p>Your order <strong>${orderRef}</strong> is now <strong>being processed</strong>.</p><p>${supportLine}</p>`
        },
        shipped: {
            subject: `Order Shipped: ${orderRef}`,
            text: `Hi ${recipient.name}, good news. Your order ${orderRef} has been shipped. ${supportLine}`,
            html: `<p>Hi ${recipient.name},</p><p>Good news. Your order <strong>${orderRef}</strong> has been <strong>shipped</strong>.</p><p>${supportLine}</p>`
        },
        delivered: {
            subject: `Order Delivered: ${orderRef}`,
            text: `Hi ${recipient.name}, your order ${orderRef} was delivered. Thank you for shopping with us.`,
            html: `<p>Hi ${recipient.name},</p><p>Your order <strong>${orderRef}</strong> was <strong>delivered</strong>.</p><p>Thank you for shopping with us.</p>`
        },
        cancelled: {
            subject: `Order Cancelled: ${orderRef}`,
            text: `Hi ${recipient.name}, your order ${orderRef} has been cancelled. ${supportLine}`,
            html: `<p>Hi ${recipient.name},</p><p>Your order <strong>${orderRef}</strong> has been <strong>cancelled</strong>.</p><p>${supportLine}</p>`
        },
        failed: {
            subject: `Order Update: ${orderRef}`,
            text: `Hi ${recipient.name}, your order ${orderRef} needs attention. Please contact support for help.`,
            html: `<p>Hi ${recipient.name},</p><p>Your order <strong>${orderRef}</strong> needs attention. Please contact support for help.</p>`
        }
    };

    if (safeStage === 'confirmed' || safeStage === 'confirmation') {
        return hasDiscount ? templates.confirmation_discount : templates.confirmation_no_discount;
    }
    return templates[safeStage] || {
        subject: `Order ${orderRef}: ${safeStage}`,
        text: `Hi ${recipient.name}, your order ${orderRef} is now ${safeStage}.`,
        html: `<p>Hi ${recipient.name},</p><p>Your order <strong>${orderRef}</strong> is now <strong>${safeStage}</strong>.</p>`
    };
};

const sendOrderLifecycleCommunication = async ({
    stage,
    customer = {},
    order = {},
    includeInvoice = false,
    invoiceAttachment = null
}) => {
    const recipient = normalizeCustomer(customer);
    const safeStage = String(stage || 'updated').trim().toLowerCase();
    const template = buildOrderLifecycleTemplate({
        stage: safeStage,
        customer: recipient,
        order,
        includeInvoice
    });

    const email = recipient.email
        ? await sendEmailCommunication({
            to: recipient.email,
            subject: template.subject,
            text: template.text,
            html: template.html,
            attachments: invoiceAttachment ? [invoiceAttachment] : []
        })
        : { ok: false, skipped: true, reason: 'missing_email' };

    const whatsapp = await sendOrderWhatsapp({
        stage: safeStage,
        customer: recipient,
        order
    });

    return { email, whatsapp };
};

const sendPaymentLifecycleCommunication = async ({
    stage,
    customer = {},
    order = {},
    payment = {}
}) => {
    const recipient = normalizeCustomer(customer);
    const orderRef = order?.order_ref || order?.orderRef || payment?.razorpayOrderId || 'N/A';
    const safeStage = String(stage || payment?.paymentStatus || 'updated').trim();
    const subject = `Payment update for ${orderRef}: ${safeStage}`;
    const text = `Hi ${recipient.name}, payment status for ${orderRef} is ${safeStage}.`;
    const html = `<p>Hi ${recipient.name},</p><p>Payment status for <strong>${orderRef}</strong> is <strong>${safeStage}</strong>.</p>`;

    const email = recipient.email
        ? await sendEmailCommunication({
            to: recipient.email,
            subject,
            text,
            html
        })
        : { ok: false, skipped: true, reason: 'missing_email' };

    const whatsapp = await sendPaymentWhatsapp({
        stage: safeStage,
        customer: recipient,
        order,
        payment
    });

    return { email, whatsapp };
};

const sendAbandonedCartRecoveryCommunication = async ({
    customer = {},
    cart = {}
}) => {
    const recipient = normalizeCustomer(customer);
    const itemCount = Number(cart?.itemCount || cart?.items?.length || 0);
    const subject = 'You left items in your cart';
    const text = `Hi ${recipient.name}, you have ${itemCount} item(s) waiting in your cart.`;
    const html = `<p>Hi ${recipient.name},</p><p>You have <strong>${itemCount}</strong> item(s) waiting in your cart.</p>`;

    const email = recipient.email
        ? await sendEmailCommunication({
            to: recipient.email,
            subject,
            text,
            html
        })
        : { ok: false, skipped: true, reason: 'missing_email' };

    const whatsapp = await sendAbandonedCartWhatsapp({
        customer: recipient,
        cart
    });

    return { email, whatsapp };
};

module.exports = {
    verifyEmailTransport,
    sendEmailCommunication,
    sendOrderLifecycleCommunication,
    sendPaymentLifecycleCommunication,
    sendAbandonedCartRecoveryCommunication,
    sendWhatsapp
};
