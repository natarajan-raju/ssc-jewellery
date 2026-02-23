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
}) => sendEmail({ to, subject, text, html, replyTo, cc, bcc, attachments });

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

const hashSeed = (input = '') => {
    const value = String(input || '');
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
};

const pickVariant = (variants = [], seed = '') => {
    const list = Array.isArray(variants) ? variants : [];
    if (!list.length) return '';
    return list[hashSeed(seed) % list.length];
};

const stripHtml = (value = '') => String(value).replace(/<[^>]+>/g, '');

const buildRichMail = ({ greeting, subject, bodyBlocks = [], actionItems = [], assurance, closing }) => {
    const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:20px;color:#111827;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
                <tr>
                    <td style="padding:22px;font-size:15px;line-height:1.6;">
                        <p style="margin:0 0 12px;">${greeting}</p>
                        ${bodyBlocks.map((item) => `<p style="margin:0 0 12px;">${item}</p>`).join('')}
                        ${actionItems.length ? `<p style="margin:0 0 8px;"><strong>Recommended next steps:</strong></p><ol style="margin:0 0 12px 18px;padding:0;">${actionItems.map((item) => `<li>${item}</li>`).join('')}</ol>` : ''}
                        ${assurance ? `<p style="margin:0 0 12px;">${assurance}</p>` : ''}
                        <p style="margin:0;white-space:pre-line;">${closing}</p>
                    </td>
                </tr>
            </table>
        </div>
    `;

    const text = [
        greeting,
        '',
        ...bodyBlocks.map(stripHtml),
        actionItems.length ? '' : null,
        actionItems.length ? 'Recommended next steps:' : null,
        ...actionItems.map((item, idx) => `${idx + 1}. ${item}`),
        assurance ? '' : null,
        assurance || null,
        '',
        closing
    ].filter(Boolean).join('\n');

    return { subject, html, text };
};

const COMMON_GREETINGS = [
    'Dear {name},',
    'Hello {name},',
    'Hi {name},',
    'Greetings {name},',
    'Dear Valued Customer {name},',
    'Hello {name}, thank you for choosing SSC Jewellery,',
    'Hi {name}, this is an update from SSC Jewellery,',
    'Dear {name}, please find your latest order communication below,',
    'Hello {name}, we are writing with an important update,',
    '{name}, we appreciate your trust in SSC Jewellery.'
];

const COMMON_CLOSINGS = [
    'Regards,\nSSC Jewellery Support Team',
    'Warm regards,\nSSC Jewellery Operations Team',
    'Sincerely,\nSSC Jewellery Customer Care',
    'Best regards,\nSSC Jewellery Administration',
    'Thank you,\nSSC Jewellery Team',
    'Kind regards,\nSSC Jewellery Service Desk',
    'With thanks,\nSSC Jewellery Support',
    'Respectfully,\nSSC Jewellery Customer Success Team',
    'Yours faithfully,\nSSC Jewellery Help Desk',
    'Thank you for shopping with SSC Jewellery,\nCustomer Experience Team'
];

const buildOrderLifecycleTemplate = ({ stage = 'updated', customer = {}, order = {}, includeInvoice = false } = {}) => {
    const recipient = normalizeCustomer(customer);
    const orderRef = order?.order_ref || order?.orderRef || order?.id || 'N/A';
    const safeStage = String(stage || 'updated').trim().toLowerCase();
    const stageKey = (safeStage === 'confirmed' || safeStage === 'confirmation')
        ? (Number(order?.discount_total || 0) > 0 ? 'confirmation_discount' : 'confirmation_no_discount')
        : safeStage;
    const seed = `${stageKey}|${orderRef}|${recipient.email || recipient.mobile || recipient.name}`;

    const subjects = {
        confirmation_discount: Array.from({ length: 10 }, (_, i) => `Order Confirmed: ${orderRef} | Savings Applied (${i + 1}/10)`),
        confirmation_no_discount: Array.from({ length: 10 }, (_, i) => `Order Confirmed: ${orderRef} (${i + 1}/10)`),
        pending_delay: Array.from({ length: 10 }, (_, i) => `Delay update for order ${orderRef} (${i + 1}/10)`),
        pending: Array.from({ length: 10 }, (_, i) => `Order ${orderRef} is pending (${i + 1}/10)`),
        processing: Array.from({ length: 10 }, (_, i) => `Order ${orderRef} is processing (${i + 1}/10)`),
        shipped: Array.from({ length: 10 }, (_, i) => `Order ${orderRef} has shipped (${i + 1}/10)`),
        shipped_followup: Array.from({ length: 10 }, (_, i) => `A quick delivery check for order ${orderRef} (${i + 1}/10)`),
        completed: Array.from({ length: 10 }, (_, i) => `Thank you for choosing SSC Jewellery (${orderRef}) (${i + 1}/10)`),
        delivered: Array.from({ length: 10 }, (_, i) => `Order ${orderRef} delivered (${i + 1}/10)`),
        cancelled: Array.from({ length: 10 }, (_, i) => `Order ${orderRef} cancelled (${i + 1}/10)`),
        failed: Array.from({ length: 10 }, (_, i) => `Order ${orderRef} needs attention (${i + 1}/10)`)
    };

    const total = formatCurrency(order?.total || 0);
    const createdDate = formatDate(order?.created_at || order?.createdAt);
    const discount = Number(order?.discount_total || 0);
    const invoiceLine = includeInvoice ? 'Your invoice is attached with this communication for your records.' : '';

    const stageSummary = {
        confirmation_discount: `Your order <strong>${orderRef}</strong> has been confirmed${createdDate ? ` on <strong>${createdDate}</strong>` : ''}. You saved <strong>${formatCurrency(discount)}</strong>.`,
        confirmation_no_discount: `Your order <strong>${orderRef}</strong> has been confirmed${createdDate ? ` on <strong>${createdDate}</strong>` : ''}.`,
        pending_delay: `Your order <strong>${orderRef}</strong> is delayed. Our team has escalated this and is prioritizing fulfillment.`,
        pending: `Your order <strong>${orderRef}</strong> is currently pending and queued for processing.`,
        processing: `Your order <strong>${orderRef}</strong> is now under active processing by our fulfillment team.`,
        shipped: `Your order <strong>${orderRef}</strong> has been dispatched and is in transit.`,
        shipped_followup: `Your order <strong>${orderRef}</strong> is marked as shipped. We hope it has reached you safely.`,
        completed: `Thank you for shopping with us. We are grateful for your trust in SSC Jewellery.`,
        delivered: `Your order <strong>${orderRef}</strong> has been delivered successfully.`,
        cancelled: `Your order <strong>${orderRef}</strong> has been cancelled in our system.`,
        failed: `Your order <strong>${orderRef}</strong> requires your attention before we can proceed.`
    };

    const actionItemsByStage = {
        confirmation_discount: ['Review your order details in your account.', 'Keep this email for future reference.', 'Reply to this email if any correction is needed.'],
        confirmation_no_discount: ['Review your order details in your account.', 'Keep this email for future reference.', 'Reply to this email if any correction is needed.'],
        pending_delay: ['No action is needed right now.', 'Reply if the delivery is time-sensitive.', 'Our administration team will send the next update shortly.'],
        pending: ['No action is needed from your side.', 'Keep your contact details reachable.', 'Reply if you need to update shipping details.'],
        processing: ['No action is required at this stage.', 'We will notify you at dispatch.', 'Contact us if you need urgent delivery advice.'],
        shipped: ['Track your order from your account page.', 'Keep delivery phone accessible.', 'Reply for support if tracking appears delayed.'],
        shipped_followup: ['Please confirm receipt using the link shared below.', 'Reply if you need any assistance from our support team.', 'We will update the order status as soon as you confirm receipt.'],
        completed: ['Enjoy your purchase and keep this email for your records.', 'Reply if you need support with product or service.', 'We would love to serve you again soon.'],
        delivered: ['Please verify package contents after delivery.', 'Reach us immediately if there is any issue.', 'Share your experience with our team.'],
        cancelled: ['Review cancellation details in your account.', 'Reply if cancellation was not expected.', 'Place a new order anytime if needed.'],
        failed: ['Reply to this email for immediate support.', 'Recheck payment/order details in your account.', 'Our team will guide you through quick resolution.']
    };

    const assuranceByStage = [
        'Need help? Reply to this email and our support team will assist you.',
        'Our administration team is monitoring this order and will keep you updated.',
        'If anything looks incorrect, respond to this email with your order reference.',
        'Your satisfaction is our priority, and support is available whenever you need it.',
        'We are committed to transparent, proactive communication for your order.',
        'Thank you for your patience and trust in SSC Jewellery.',
        'For urgent concerns, mention your order reference in your reply.',
        'Our team is available to support product, payment, and delivery questions.',
        'You can count on us for timely and clear status updates.',
        'We appreciate your business and remain available for assistance.'
    ];

    const subject = pickVariant(subjects[stageKey] || [`Order ${orderRef}: ${stageKey}`], `${seed}|subject`);
    const greeting = pickVariant(COMMON_GREETINGS, `${seed}|greeting`).replaceAll('{name}', recipient.name);
    const closing = pickVariant(COMMON_CLOSINGS, `${seed}|closing`);
    const assurance = pickVariant(assuranceByStage, `${seed}|assurance`);

    const courierPartner = String(order?.courier_partner || '').trim();
    const awbNumber = String(order?.awb_number || '').trim();
    const deliveryConfirmationUrl = String(order?.delivery_confirmation_url || '').trim();
    const shipmentInfoLine = (stageKey === 'shipped' || stageKey === 'shipped_followup')
        ? [
            courierPartner ? `Courier partner: <strong>${courierPartner}</strong>` : null,
            awbNumber ? `AWB number: <strong>${awbNumber}</strong>` : null
        ].filter(Boolean).join(' | ')
        : '';
    const deliveryConfirmLine = stageKey === 'shipped_followup' && deliveryConfirmationUrl
        ? `Please confirm once you receive your parcel: <a href="${deliveryConfirmationUrl}" target="_blank" rel="noreferrer">${deliveryConfirmationUrl}</a>`
        : '';

    const orderRefLine = `Order reference: <strong>${orderRef}</strong>${createdDate && stageKey !== 'completed' ? ` | Date: <strong>${createdDate}</strong>` : ''}`;

    const bodyBlocks = [
        stageSummary[stageKey] || `Your order <strong>${orderRef}</strong> status is <strong>${stageKey}</strong>.`,
        orderRefLine,
        `Order value: <strong>${total}</strong>`,
        shipmentInfoLine || null,
        deliveryConfirmLine || null,
        invoiceLine || null
    ].filter(Boolean);

    return buildRichMail({
        greeting,
        subject,
        bodyBlocks,
        actionItems: actionItemsByStage[stageKey] || ['Reply to this email if you need support.'],
        assurance,
        closing
    });
};

const sendOrderLifecycleCommunication = async ({ stage, customer = {}, order = {}, includeInvoice = false, invoiceAttachment = null }) => {
    const recipient = normalizeCustomer(customer);
    const safeStage = String(stage || 'updated').trim().toLowerCase();
    const template = buildOrderLifecycleTemplate({ stage: safeStage, customer: recipient, order, includeInvoice });

    const email = recipient.email
        ? await sendEmailCommunication({
            to: recipient.email,
            subject: template.subject,
            text: template.text,
            html: template.html,
            attachments: invoiceAttachment ? [invoiceAttachment] : []
        })
        : { ok: false, skipped: true, reason: 'missing_email' };

    const whatsapp = await sendOrderWhatsapp({ stage: safeStage, customer: recipient, order });
    return { email, whatsapp };
};

const sendPaymentLifecycleCommunication = async ({ stage, customer = {}, order = {}, payment = {} }) => {
    const recipient = normalizeCustomer(customer);
    const orderRef = order?.order_ref || order?.orderRef || payment?.razorpayOrderId || 'N/A';
    const safeStage = String(stage || payment?.paymentStatus || 'updated').trim();
    const seed = `${orderRef}|${safeStage}|${recipient.email || recipient.mobile || recipient.name}`;

    const subject = pickVariant(Array.from({ length: 10 }, (_, i) => `Payment update for ${orderRef}: ${safeStage} (${i + 1}/10)`), `${seed}|subject`);
    const greeting = pickVariant(COMMON_GREETINGS, `${seed}|greeting`).replaceAll('{name}', recipient.name);
    const closing = pickVariant(COMMON_CLOSINGS, `${seed}|closing`);
    const assurance = pickVariant([
        'Our billing team is available to assist if you need clarification.',
        'Please keep this email for your payment records.',
        'If this status appears incorrect, reply and we will verify promptly.',
        'Our administration team will continue monitoring reconciliation.',
        'For urgent billing support, reply to this email with your order reference.',
        'We are committed to accurate and timely payment updates.',
        'Your transaction security remains our priority.',
        'You can contact us anytime for payment support.',
        'We appreciate your patience while payment processing completes.',
        'Support is one reply away if anything needs correction.'
    ], `${seed}|assurance`);

    const template = buildRichMail({
        greeting,
        subject,
        bodyBlocks: [
            `Payment status for order <strong>${orderRef}</strong> is currently <strong>${safeStage}</strong>.`,
            'Please review this update and retain it for your records.',
            'If this does not match your expected payment state, let us know immediately.'
        ],
        actionItems: [
            'Check latest order and payment status in your account.',
            'Keep transaction references handy if you contact support.',
            'Reply to this email for direct billing assistance.'
        ],
        assurance,
        closing
    });

    const email = recipient.email
        ? await sendEmailCommunication({ to: recipient.email, subject: template.subject, text: template.text, html: template.html })
        : { ok: false, skipped: true, reason: 'missing_email' };

    const whatsapp = await sendPaymentWhatsapp({ stage: safeStage, customer: recipient, order, payment });
    return { email, whatsapp };
};

const sendAbandonedCartRecoveryCommunication = async ({ customer = {}, cart = {} }) => {
    const recipient = normalizeCustomer(customer);
    const itemCount = Number(cart?.itemCount || cart?.items?.length || 0);
    const seed = `${recipient.email || recipient.mobile || recipient.name}|${itemCount}`;

    const subject = pickVariant(Array.from({ length: 10 }, (_, i) => `Your saved cart is waiting (${itemCount} item${itemCount === 1 ? '' : 's'}) (${i + 1}/10)`), `${seed}|subject`);
    const greeting = pickVariant(COMMON_GREETINGS, `${seed}|greeting`).replaceAll('{name}', recipient.name);
    const closing = pickVariant(COMMON_CLOSINGS, `${seed}|closing`);
    const assurance = pickVariant([
        'Our team can help with product, pricing, or checkout questions.',
        'Need help finalizing your cart? Reply and we will assist.',
        'Your saved items are available for a limited recovery window.',
        'Support is available for any payment or delivery concern.',
        'We can help compare alternatives before checkout if needed.',
        'Reply to this email for immediate assistance.',
        'Your shopping convenience is important to us.',
        'We are here to help you complete checkout confidently.',
        'Our administration team can assist if you face any issue.',
        'Thank you for considering SSC Jewellery for your purchase.'
    ], `${seed}|assurance`);

    const template = buildRichMail({
        greeting,
        subject,
        bodyBlocks: [
            `You currently have <strong>${itemCount}</strong> item(s) waiting in your cart.`,
            'We preserved your selections so you can complete checkout quickly.',
            'Completing soon helps avoid inventory or pricing changes on popular items.'
        ],
        actionItems: [
            'Open your cart and review saved items.',
            'Proceed to checkout when ready.',
            'Reply for product or payment support.'
        ],
        assurance,
        closing
    });

    const email = recipient.email
        ? await sendEmailCommunication({ to: recipient.email, subject: template.subject, text: template.text, html: template.html })
        : { ok: false, skipped: true, reason: 'missing_email' };

    const whatsapp = await sendAbandonedCartWhatsapp({ customer: recipient, cart });
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
