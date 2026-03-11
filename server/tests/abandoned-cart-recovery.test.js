const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../config/db');
const AbandonedCart = require('../models/AbandonedCart');
const Cart = require('../models/Cart');
const User = require('../models/User');
const communicationService = require('../services/communications/communicationService');
const { withPatched, requireFresh } = require('./testUtils');

test('AbandonedCart.upsertCampaign keeps email enabled when both channels are disabled', async () => {
    let insertParams = null;
    await withPatched(AbandonedCart, {
        getCampaign: async () => ({ id: 1 }),
        realignActiveJourneySchedules: async () => {}
    }, async () => {
        await withPatched(db, {
            execute: async (query, params = []) => {
                const sql = String(query);
                if (sql.includes('SELECT * FROM abandoned_cart_campaigns WHERE id = 1 LIMIT 1')) {
                    return [[]];
                }
                if (sql.includes('INSERT INTO abandoned_cart_campaigns')) {
                    insertParams = params;
                    return [{ affectedRows: 1 }];
                }
                throw new Error(`Unexpected SQL in test: ${sql.slice(0, 80)}`);
            }
        }, async () => {
            await AbandonedCart.upsertCampaign({
                maxAttempts: 2,
                attemptDelaysMinutes: [30, 60],
                discountLadderPercent: [0, 5],
                sendEmail: false,
                sendWhatsapp: false
            });
        });
    });

    assert.ok(insertParams, 'campaign upsert should execute INSERT');
    assert.equal(insertParams[8], 1, 'send_email must default back to enabled');
    assert.equal(insertParams[9], 0, 'send_whatsapp should remain disabled');
});

test('AbandonedCart.getDueJourneys query enforces active customer filter', async () => {
    let dueSql = '';
    await withPatched(AbandonedCart, {
        closeExpiredJourneys: async () => 0,
        closeActiveJourneysWithEmptyCarts: async () => 0
    }, async () => {
        await withPatched(db, {
            execute: async (query) => {
                const sql = String(query);
                if (sql.includes('FROM abandoned_cart_journeys j') && sql.includes('next_attempt_at <= DATE_ADD')) {
                    dueSql = sql;
                }
                return [[]];
            }
        }, async () => {
            await AbandonedCart.getDueJourneys({ limit: 5 });
        });
    });

    assert.match(dueSql, /COALESCE\(u\.is_active,\s*0\)\s*=\s*1/);
});

test('AbandonedCart.listJourneysAdvanced keeps total and row filtering aligned in SQL', async () => {
    const queries = [];
    await withPatched(AbandonedCart, {
        getCampaign: async () => ({ inactivityMinutes: 30 })
    }, async () => {
        await withPatched(db, {
            execute: async (query) => {
                const sql = String(query);
                queries.push(sql);
                if (sql.includes('SELECT COUNT(*) as total')) {
                    return [[{ total: 1 }]];
                }
                if (sql.includes('SELECT j.*, u.name as customer_name')) {
                    return [[{
                        id: 42,
                        status: 'active',
                        last_attempt_no: 0,
                        last_activity_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        created_at: new Date().toISOString(),
                        cart_snapshot_json: '[]'
                    }]];
                }
                return [[]];
            }
        }, async () => {
            const result = await AbandonedCart.listJourneysAdvanced({ limit: 10, offset: 0 });
            assert.equal(result.total, 1);
            assert.equal(result.journeys.length, 1);
        });
    });

    const countSql = queries.find((sql) => sql.includes('SELECT COUNT(*) as total')) || '';
    const listSql = queries.find((sql) => sql.includes('SELECT j.*, u.name as customer_name')) || '';
    assert.match(countSql, /COALESCE\(u\.is_active,\s*0\)\s*=\s*1/);
    assert.match(listSql, /j\.last_attempt_no > 0/);
});

test('processDueAbandonedCartRecoveries cancels inactive customer before sending any channel', async () => {
    let sendEmailCalls = 0;
    let closePayload = null;

    await withPatched(communicationService, {
        sendEmailCommunication: async () => {
            sendEmailCalls += 1;
            return { ok: true };
        },
        sendWhatsapp: async () => ({ ok: true })
    }, async () => {
        await withPatched(AbandonedCart, {
            getCampaign: async () => ({
                enabled: true,
                maxAttempts: 4,
                attemptDelaysMinutes: [30, 360, 1440, 2880],
                discountLadderPercent: [0, 0, 5, 10],
                maxDiscountPercent: 25,
                minDiscountCartSubunits: 0,
                sendEmail: true,
                sendWhatsapp: false,
                sendPaymentLink: false,
                reminderEnable: true
            }),
            getDueJourneys: async () => ([{
                id: 7,
                user_id: 'u-inactive',
                status: 'active',
                last_attempt_no: 0,
                currency: 'INR',
                created_at: new Date().toISOString()
            }]),
            hasRecoveredOrderSinceJourney: async () => null,
            updateJourneySnapshot: async () => 1,
            closeActiveJourneyByUser: async (payload) => {
                closePayload = payload;
                return 1;
            }
        }, async () => {
            await withPatched(Cart, {
                getByUser: async () => ([{ quantity: 1, price: 1200 }])
            }, async () => {
                await withPatched(User, {
                    findById: async () => ({ id: 'u-inactive', role: 'customer', isActive: false })
                }, async () => {
                    const recoveryService = requireFresh('../services/abandonedCartRecoveryService');
                    const result = await recoveryService.processDueAbandonedCartRecoveries({ limit: 5 });
                    assert.equal(result.ok, true);
                    assert.equal(result.stats.cancelled, 1);
                    assert.equal(result.stats.sent, 0);
                });
            });
        });
    });

    assert.equal(sendEmailCalls, 0, 'inactive users must not receive abandoned-cart emails');
    assert.deepEqual(closePayload, {
        userId: 'u-inactive',
        status: 'cancelled',
        reason: 'customer_inactive'
    });
});
