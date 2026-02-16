// Placeholder channel until vendor integration is finalized.
const sendWhatsapp = async (_payload = {}) => {
    return {
        ok: true,
        provider: 'stub',
        queued: false
    };
};

const sendOrderWhatsapp = async (payload = {}) => sendWhatsapp(payload);
const sendPaymentWhatsapp = async (payload = {}) => sendWhatsapp(payload);
const sendAbandonedCartWhatsapp = async (payload = {}) => sendWhatsapp(payload);

module.exports = {
    sendWhatsapp,
    sendOrderWhatsapp,
    sendPaymentWhatsapp,
    sendAbandonedCartWhatsapp
};
