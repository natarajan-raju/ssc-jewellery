const db = require('../config/db');

const normalizeZone = (row) => {
    if (!row) return row;
    let states = [];
    try {
        states = row.states ? JSON.parse(row.states) : [];
    } catch {
        states = [];
    }
    return {
        id: row.id,
        name: row.name,
        states
    };
};

class Shipping {
    static async getAll() {
        const [zones] = await db.execute('SELECT * FROM shipping_zones ORDER BY created_at DESC');
        const [options] = await db.execute('SELECT * FROM shipping_options ORDER BY created_at ASC');
        const mappedZones = zones.map(normalizeZone);
        const optionsByZone = options.reduce((acc, opt) => {
            acc[opt.zone_id] = acc[opt.zone_id] || [];
            acc[opt.zone_id].push({
                id: opt.id,
                name: opt.name,
                rate: Number(opt.rate),
                conditionType: opt.condition_type,
                min: opt.min_value,
                max: opt.max_value
            });
            return acc;
        }, {});
        return mappedZones.map(zone => ({
            ...zone,
            options: optionsByZone[zone.id] || []
        }));
    }

    static async createZone({ name, states = [], options = [] }) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const [result] = await connection.execute(
                'INSERT INTO shipping_zones (name, states) VALUES (?, ?)',
                [name, JSON.stringify(states || [])]
            );
            const zoneId = result.insertId;

            if (options.length) {
                const values = options.map(opt => ([
                    zoneId,
                    opt.name,
                    Number(opt.rate || 0),
                    opt.conditionType || 'price',
                    opt.min || null,
                    opt.max || null
                ]));
                await connection.query(
                    'INSERT INTO shipping_options (zone_id, name, rate, condition_type, min_value, max_value) VALUES ?',
                    [values]
                );
            }
            await connection.commit();
            return zoneId;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async updateZone(zoneId, { name, states = [], options = [] }) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            await connection.execute(
                'UPDATE shipping_zones SET name = ?, states = ? WHERE id = ?',
                [name, JSON.stringify(states || []), zoneId]
            );
            await connection.execute('DELETE FROM shipping_options WHERE zone_id = ?', [zoneId]);
            if (options.length) {
                const values = options.map(opt => ([
                    zoneId,
                    opt.name,
                    Number(opt.rate || 0),
                    opt.conditionType || 'price',
                    opt.min || null,
                    opt.max || null
                ]));
                await connection.query(
                    'INSERT INTO shipping_options (zone_id, name, rate, condition_type, min_value, max_value) VALUES ?',
                    [values]
                );
            }
            await connection.commit();
            return zoneId;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async deleteZone(zoneId) {
        await db.execute('DELETE FROM shipping_zones WHERE id = ?', [zoneId]);
        return true;
    }
}

module.exports = Shipping;
