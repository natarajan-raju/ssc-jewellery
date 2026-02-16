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
    bcc = null
}) => {
    return sendEmail({ to, subject, text, html, replyTo, cc, bcc });
};

const sendOrderLifecycleCommunication = async ({
    stage,
    customer = {},
    order = {}
}) => {
    const recipient = normalizeCustomer(customer);
    const orderRef = order?.order_ref || order?.orderRef || 'N/A';
    const safeStage = String(stage || 'updated').trim();
    const subject = `Order ${orderRef}: ${safeStage}`;
    const text = `Hi ${recipient.name}, your order ${orderRef} is now ${safeStage}.`;
    const html = `<p>Hi ${recipient.name},</p><p>Your order <strong>${orderRef}</strong> is now <strong>${safeStage}</strong>.</p>`;

    const email = recipient.email
        ? await sendEmailCommunication({
            to: recipient.email,
            subject,
            text,
            html
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
