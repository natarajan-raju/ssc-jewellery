const mysql = require('mysql2/promise');

// 1. REMOVED dotenv config (It is handled in server/index.js now)

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, // 2. FIXED: Changed DB_PASSWORD to DB_PASS
    database: process.env.DB_NAME,
    dateStrings: true,
    timezone: 'Z',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --- AUTOMATIC TABLE CREATION ---
const initDB = async () => {
    // 3. REMOVED "Skip if Local" block. 
    // We want this to run on Remote SQL (Dev) and Production alike.

    let connection;
    try {
        connection = await pool.getConnection();
        console.log(`✅ Connected to DB: ${process.env.DB_NAME} on ${process.env.DB_HOST}`);

        // 1. Create OTP Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS otps (
                id INT AUTO_INCREMENT PRIMARY KEY,
                mobile VARCHAR(15) NOT NULL,
                otp VARCHAR(10) NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Create Users Table (UPDATED SCHEMA)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(50) PRIMARY KEY, -- 4. FIXED: Changed INT to VARCHAR for "lr6x2z..." IDs
                name VARCHAR(100),
                email VARCHAR(100) UNIQUE,
                mobile VARCHAR(15) UNIQUE,
                password VARCHAR(255),
                dob DATE,
                dob_locked TINYINT(1) DEFAULT 0,
                birthday_offer_claimed_year INT DEFAULT NULL,
                address TEXT,
                billing_address TEXT,
                profile_image TEXT,
                role VARCHAR(20) DEFAULT 'customer', -- Updated default to match logic
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        try {
            await connection.query('ALTER TABLE users ADD COLUMN billing_address TEXT');
        } catch {}
        try {
            await connection.query('ALTER TABLE users ADD COLUMN profile_image TEXT');
        } catch {}
        try {
            await connection.query('ALTER TABLE users ADD COLUMN dob DATE');
        } catch {}
        try {
            await connection.query('ALTER TABLE users ADD COLUMN dob_locked TINYINT(1) DEFAULT 0');
        } catch {}
        try {
            await connection.query('ALTER TABLE users ADD COLUMN birthday_offer_claimed_year INT DEFAULT NULL');
        } catch {}

        // 3. PRODUCTS TABLE (Added 'options' column)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS products (
                id VARCHAR(50) PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                subtitle VARCHAR(255),
                description TEXT,
                ribbon_tag VARCHAR(50), 
                media JSON,
                categories JSON,
                related_products JSON,
                additional_info JSON,
                options JSON,          -- [NEW] Stores definitions e.g. [{name: 'Size', values: ['S', 'M']}]
                mrp DECIMAL(10, 2) NOT NULL,
                discount_price DECIMAL(10, 2),
                sku VARCHAR(50),
                weight_kg DECIMAL(6, 3),
                track_quantity TINYINT(1) DEFAULT 0,
                quantity INT DEFAULT 0,
                track_low_stock TINYINT(1) DEFAULT 0,
                low_stock_threshold INT DEFAULT 0,
                status VARCHAR(20) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // 3.1 CART ITEMS TABLE (User Cart Persistence)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS cart_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                product_id VARCHAR(50) NOT NULL,
                variant_id VARCHAR(50) NOT NULL DEFAULT '',
                quantity INT NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_cart (user_id, product_id, variant_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )
        `);

        // 4. [NEW] PRODUCT VARIANTS TABLE
        await connection.query(`
            CREATE TABLE IF NOT EXISTS product_variants (
                id VARCHAR(50) PRIMARY KEY,
                product_id VARCHAR(50) NOT NULL,
                variant_title VARCHAR(255), -- e.g. "Small / Red"
                variant_options JSON,       -- e.g. {"Size": "Small", "Color": "Red"}
                price DECIMAL(10, 2) NOT NULL,
                discount_price DECIMAL(10, 2),
                sku VARCHAR(50),
                weight_kg DECIMAL(6, 3),
                quantity INT DEFAULT 0,
                track_quantity TINYINT(1) DEFAULT 0,
                track_low_stock TINYINT(1) DEFAULT 0,
                low_stock_threshold INT DEFAULT 0,
                image_url TEXT,             -- Specific image for this variant
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )
        `);

        // 5. [NEW] CATEGORIES TABLE
        await connection.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                image_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS shipping_zones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                states JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // 8. ORDERS TABLE
        await connection.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_ref VARCHAR(30) UNIQUE,
                user_id VARCHAR(50) NOT NULL,
                status VARCHAR(20) DEFAULT 'confirmed',
                payment_status VARCHAR(20) DEFAULT 'created',
                payment_gateway VARCHAR(30) DEFAULT 'razorpay',
                razorpay_order_id VARCHAR(64),
                razorpay_payment_id VARCHAR(64),
                razorpay_signature VARCHAR(255),
                refund_reference VARCHAR(64),
                refund_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
                refund_status VARCHAR(20),
                coupon_code VARCHAR(40),
                coupon_type VARCHAR(30),
                coupon_discount_value DECIMAL(10, 2) NOT NULL DEFAULT 0,
                coupon_meta JSON,
                loyalty_tier VARCHAR(20) DEFAULT 'regular',
                loyalty_discount_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
                loyalty_shipping_discount_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
                loyalty_meta JSON,
                source_channel VARCHAR(30),
                is_abandoned_recovery TINYINT(1) NOT NULL DEFAULT 0,
                abandoned_journey_id BIGINT NULL,
                subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
                shipping_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
                discount_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
                total DECIMAL(10, 2) NOT NULL DEFAULT 0,
                currency VARCHAR(10) DEFAULT 'INR',
                billing_address JSON,
                shipping_address JSON,
                company_snapshot JSON,
                settlement_id VARCHAR(64),
                settlement_snapshot JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        try {
            await connection.query("ALTER TABLE orders ADD COLUMN payment_gateway VARCHAR(30) DEFAULT 'razorpay'");
        } catch {}
        try {
            await connection.query("ALTER TABLE orders ALTER COLUMN payment_gateway SET DEFAULT 'razorpay'");
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD COLUMN razorpay_order_id VARCHAR(64)');
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD COLUMN razorpay_payment_id VARCHAR(64)');
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD COLUMN razorpay_signature VARCHAR(255)');
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD COLUMN refund_reference VARCHAR(64)');
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD COLUMN refund_amount DECIMAL(10, 2) NOT NULL DEFAULT 0');
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD COLUMN refund_status VARCHAR(20)');
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD COLUMN coupon_code VARCHAR(40)');
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD COLUMN coupon_type VARCHAR(30)');
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD COLUMN coupon_discount_value DECIMAL(10, 2) NOT NULL DEFAULT 0');
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD COLUMN coupon_meta JSON');
        } catch {}
        try {
            await connection.query("ALTER TABLE orders ADD COLUMN loyalty_tier VARCHAR(20) DEFAULT 'regular'");
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD COLUMN loyalty_discount_total DECIMAL(10, 2) NOT NULL DEFAULT 0');
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD COLUMN loyalty_shipping_discount_total DECIMAL(10, 2) NOT NULL DEFAULT 0');
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD COLUMN loyalty_meta JSON');
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD COLUMN source_channel VARCHAR(30)');
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD COLUMN is_abandoned_recovery TINYINT(1) NOT NULL DEFAULT 0');
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD COLUMN abandoned_journey_id BIGINT NULL');
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD COLUMN company_snapshot JSON');
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD COLUMN settlement_id VARCHAR(64)');
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD COLUMN settlement_snapshot JSON');
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD INDEX idx_orders_settlement_id (settlement_id)');
        } catch {}
        try {
            await connection.query('ALTER TABLE orders ADD INDEX idx_orders_user_created_payment (user_id, created_at, payment_status)');
        } catch {}

        await connection.query(`
            CREATE TABLE IF NOT EXISTS payment_attempts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                razorpay_order_id VARCHAR(64) NOT NULL UNIQUE,
                amount_subunits INT NOT NULL,
                currency VARCHAR(10) NOT NULL DEFAULT 'INR',
                status VARCHAR(20) NOT NULL DEFAULT 'created',
                expires_at TIMESTAMP NULL DEFAULT NULL,
                verify_started_at TIMESTAMP NULL DEFAULT NULL,
                billing_address JSON,
                shipping_address JSON,
                notes JSON,
                razorpay_payment_id VARCHAR(64),
                razorpay_signature VARCHAR(255),
                failure_reason VARCHAR(500),
                local_order_id INT NULL,
                verified_at TIMESTAMP NULL DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (local_order_id) REFERENCES orders(id) ON DELETE SET NULL
            )
        `);
        try {
            await connection.query('ALTER TABLE payment_attempts ADD COLUMN billing_address JSON');
        } catch {}
        try {
            await connection.query('ALTER TABLE payment_attempts ADD COLUMN shipping_address JSON');
        } catch {}
        try {
            await connection.query('ALTER TABLE payment_attempts ADD COLUMN notes JSON');
        } catch {}
        try {
            await connection.query('ALTER TABLE payment_attempts ADD COLUMN razorpay_payment_id VARCHAR(64)');
        } catch {}
        try {
            await connection.query('ALTER TABLE payment_attempts ADD COLUMN razorpay_signature VARCHAR(255)');
        } catch {}
        try {
            await connection.query('ALTER TABLE payment_attempts ADD COLUMN failure_reason VARCHAR(500)');
        } catch {}
        try {
            await connection.query('ALTER TABLE payment_attempts ADD COLUMN local_order_id INT NULL');
        } catch {}
        try {
            await connection.query('ALTER TABLE payment_attempts ADD COLUMN verified_at TIMESTAMP NULL DEFAULT NULL');
        } catch {}
        try {
            await connection.query('ALTER TABLE payment_attempts ADD COLUMN expires_at TIMESTAMP NULL DEFAULT NULL');
        } catch {}
        try {
            await connection.query('ALTER TABLE payment_attempts ADD COLUMN verify_started_at TIMESTAMP NULL DEFAULT NULL');
        } catch {}
        try {
            await connection.query('ALTER TABLE payment_attempts ADD UNIQUE KEY uniq_payment_attempt_local_order (local_order_id)');
        } catch {}
        try {
            await connection.query('ALTER TABLE payment_attempts ADD UNIQUE KEY uniq_payment_attempt_payment_id (razorpay_payment_id)');
        } catch {}

        await connection.query(`
            CREATE TABLE IF NOT EXISTS payment_item_reservations (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                attempt_id INT NOT NULL,
                user_id VARCHAR(50) NOT NULL,
                product_id VARCHAR(50) NOT NULL,
                variant_id VARCHAR(50) NOT NULL DEFAULT '',
                quantity INT NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'reserved',
                expires_at TIMESTAMP NULL DEFAULT NULL,
                released_reason VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (attempt_id) REFERENCES payment_attempts(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        try {
            await connection.query('ALTER TABLE payment_item_reservations ADD COLUMN expires_at TIMESTAMP NULL DEFAULT NULL');
        } catch {}
        try {
            await connection.query('ALTER TABLE payment_item_reservations ADD COLUMN released_reason VARCHAR(100)');
        } catch {}
        try {
            await connection.query('ALTER TABLE payment_item_reservations ADD INDEX idx_res_attempt_status (attempt_id, status)');
        } catch {}
        try {
            await connection.query('ALTER TABLE payment_item_reservations ADD INDEX idx_res_product (product_id, variant_id)');
        } catch {}

        await connection.query(`
            CREATE TABLE IF NOT EXISTS razorpay_webhook_events (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                event_id VARCHAR(120) NOT NULL UNIQUE,
                event_type VARCHAR(80) NOT NULL,
                signature VARCHAR(255),
                status VARCHAR(20) NOT NULL DEFAULT 'received',
                process_note VARCHAR(500),
                payload_raw LONGTEXT,
                payload_json JSON,
                received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                processed_at TIMESTAMP NULL DEFAULT NULL
            )
        `);
        try {
            await connection.query('ALTER TABLE razorpay_webhook_events ADD COLUMN process_note VARCHAR(500)');
        } catch {}
        try {
            await connection.query('ALTER TABLE razorpay_webhook_events ADD COLUMN payload_raw LONGTEXT');
        } catch {}
        try {
            await connection.query('ALTER TABLE razorpay_webhook_events ADD COLUMN payload_json JSON');
        } catch {}
        try {
            await connection.query('ALTER TABLE razorpay_webhook_events ADD COLUMN processed_at TIMESTAMP NULL DEFAULT NULL');
        } catch {}

        await connection.query(`
            CREATE TABLE IF NOT EXISTS abandoned_cart_campaigns (
                id INT PRIMARY KEY,
                enabled TINYINT(1) NOT NULL DEFAULT 1,
                inactivity_minutes INT NOT NULL DEFAULT 30,
                max_attempts INT NOT NULL DEFAULT 4,
                attempt_delays_json JSON,
                discount_ladder_json JSON,
                max_discount_percent INT NOT NULL DEFAULT 25,
                min_discount_cart_subunits INT NOT NULL DEFAULT 0,
                recovery_window_hours INT NOT NULL DEFAULT 72,
                send_email TINYINT(1) NOT NULL DEFAULT 1,
                send_whatsapp TINYINT(1) NOT NULL DEFAULT 1,
                send_payment_link TINYINT(1) NOT NULL DEFAULT 1,
                reminder_enable TINYINT(1) NOT NULL DEFAULT 1,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        try {
            await connection.query('ALTER TABLE abandoned_cart_campaigns ADD COLUMN min_discount_cart_subunits INT NOT NULL DEFAULT 0');
        } catch {}

        await connection.query(`
            CREATE TABLE IF NOT EXISTS abandoned_cart_journeys (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'active',
                cart_item_count INT NOT NULL DEFAULT 0,
                cart_total_subunits INT NOT NULL DEFAULT 0,
                currency VARCHAR(10) NOT NULL DEFAULT 'INR',
                cart_snapshot_json JSON,
                last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_attempt_no INT NOT NULL DEFAULT 0,
                next_attempt_at TIMESTAMP NULL DEFAULT NULL,
                expires_at TIMESTAMP NULL DEFAULT NULL,
                recovered_order_id INT NULL,
                recovered_at TIMESTAMP NULL DEFAULT NULL,
                recovery_reason VARCHAR(200),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_acj_user_status (user_id, status),
                INDEX idx_acj_due (status, next_attempt_at),
                INDEX idx_acj_user_status_created (user_id, status, created_at),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (recovered_order_id) REFERENCES orders(id) ON DELETE SET NULL
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS abandoned_cart_candidates (
                user_id VARCHAR(50) PRIMARY KEY,
                cart_item_count INT NOT NULL DEFAULT 0,
                cart_total_subunits INT NOT NULL DEFAULT 0,
                currency VARCHAR(10) NOT NULL DEFAULT 'INR',
                last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_acc_last_activity (last_activity_at),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        try {
            await connection.query('ALTER TABLE abandoned_cart_journeys ADD INDEX idx_acj_user_status_created (user_id, status, created_at)');
        } catch {}

        await connection.query(`
            CREATE TABLE IF NOT EXISTS abandoned_cart_attempts (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                journey_id BIGINT NOT NULL,
                attempt_no INT NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'queued',
                channels_json JSON,
                discount_code VARCHAR(40),
                discount_percent INT DEFAULT 0,
                payment_link_id VARCHAR(64),
                payment_link_url TEXT,
                payload_json JSON,
                response_json JSON,
                error_message VARCHAR(500),
                scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sent_at TIMESTAMP NULL DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_ac_attempt (journey_id, attempt_no),
                FOREIGN KEY (journey_id) REFERENCES abandoned_cart_journeys(id) ON DELETE CASCADE
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS abandoned_cart_discounts (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                journey_id BIGINT NOT NULL,
                user_id VARCHAR(50) NOT NULL,
                attempt_no INT NOT NULL,
                code VARCHAR(40) NOT NULL UNIQUE,
                discount_type VARCHAR(20) NOT NULL DEFAULT 'percent',
                discount_percent INT DEFAULT 0,
                discount_value_subunits INT DEFAULT NULL,
                max_discount_subunits INT DEFAULT NULL,
                min_cart_subunits INT DEFAULT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'active',
                expires_at TIMESTAMP NULL DEFAULT NULL,
                redeemed_order_id INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_acd_user_status (user_id, status),
                FOREIGN KEY (journey_id) REFERENCES abandoned_cart_journeys(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (redeemed_order_id) REFERENCES orders(id) ON DELETE SET NULL
            )
        `);

        await connection.execute(
            `INSERT INTO abandoned_cart_campaigns
                (id, enabled, inactivity_minutes, max_attempts, attempt_delays_json, discount_ladder_json, max_discount_percent, min_discount_cart_subunits, recovery_window_hours, send_email, send_whatsapp, send_payment_link, reminder_enable)
             VALUES (1, 1, 30, 4, ?, ?, 25, 0, 72, 1, 1, 1, 1)
             ON DUPLICATE KEY UPDATE id = id`,
            [JSON.stringify([30, 360, 1440, 2880]), JSON.stringify([0, 0, 5, 10])]
        );

        // 9. ORDER ITEMS TABLE
        await connection.query(`
            CREATE TABLE IF NOT EXISTS order_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                product_id VARCHAR(50) NOT NULL,
                variant_id VARCHAR(50) NOT NULL DEFAULT '',
                title VARCHAR(255),
                variant_title VARCHAR(255),
                quantity INT NOT NULL DEFAULT 1,
                price DECIMAL(10, 2) NOT NULL DEFAULT 0,
                line_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
                image_url TEXT,
                sku VARCHAR(50),
                item_snapshot JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
            )
        `);
        try {
            await connection.query('ALTER TABLE order_items ADD COLUMN item_snapshot JSON');
        } catch {}

        // 10. ORDER STATUS EVENTS (Timeline)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS order_status_events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                status VARCHAR(20) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS shipping_options (
                id INT AUTO_INCREMENT PRIMARY KEY,
                zone_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                rate DECIMAL(10,2) NOT NULL DEFAULT 0,
                condition_type VARCHAR(20) DEFAULT 'price',
                min_value DECIMAL(10,2) DEFAULT NULL,
                max_value DECIMAL(10,2) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (zone_id) REFERENCES shipping_zones(id) ON DELETE CASCADE
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS wishlist_items (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                product_id VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_user_product_wishlist (user_id, product_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS user_loyalty (
                user_id VARCHAR(50) PRIMARY KEY,
                tier VARCHAR(20) NOT NULL DEFAULT 'regular',
                evaluated_at TIMESTAMP NULL DEFAULT NULL,
                spend_30d DECIMAL(12,2) NOT NULL DEFAULT 0,
                spend_60d DECIMAL(12,2) NOT NULL DEFAULT 0,
                spend_90d DECIMAL(12,2) NOT NULL DEFAULT 0,
                spend_365d DECIMAL(12,2) NOT NULL DEFAULT 0,
                progress_json JSON,
                benefits_json JSON,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS user_loyalty_history (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                previous_tier VARCHAR(20) NOT NULL DEFAULT 'regular',
                new_tier VARCHAR(20) NOT NULL DEFAULT 'regular',
                reason VARCHAR(60) NOT NULL DEFAULT 'monthly_reassessment',
                meta_json JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_loyalty_history_user_date (user_id, created_at)
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS loyalty_tier_config (
                tier VARCHAR(20) PRIMARY KEY,
                label VARCHAR(40) NOT NULL,
                color VARCHAR(20) NOT NULL DEFAULT '#4B5563',
                threshold DECIMAL(12,2) NOT NULL DEFAULT 0,
                window_days INT NOT NULL DEFAULT 30,
                extra_discount_pct DECIMAL(8,2) NOT NULL DEFAULT 0,
                shipping_discount_pct DECIMAL(8,2) NOT NULL DEFAULT 0,
                birthday_discount_pct DECIMAL(8,2) NOT NULL DEFAULT 10,
                abandoned_cart_boost_pct DECIMAL(8,2) NOT NULL DEFAULT 0,
                priority_weight INT NOT NULL DEFAULT 0,
                shipping_priority VARCHAR(30) NOT NULL DEFAULT 'standard',
                benefits_json JSON,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        try {
            await connection.query('ALTER TABLE loyalty_tier_config ADD COLUMN birthday_discount_pct DECIMAL(8,2) NOT NULL DEFAULT 10');
        } catch {}
        await connection.execute(
            `INSERT INTO loyalty_tier_config
                (tier, label, color, threshold, window_days, extra_discount_pct, shipping_discount_pct, birthday_discount_pct, abandoned_cart_boost_pct, priority_weight, shipping_priority, benefits_json, is_active)
             VALUES
                ('regular', 'Basic', '#4B5563', 0, 30, 0, 0, 10, 0, 0, 'standard', JSON_ARRAY('Standard pricing','Standard shipping','Progress tracking to next tier'), 1),
                ('bronze', 'Bronze', '#CD7F32', 5000, 30, 1, 5, 10, 2, 1, 'standard_plus', JSON_ARRAY('1% extra member discount','5% shipping fee discount','Priority support queue'), 1),
                ('silver', 'Silver', '#9CA3AF', 10000, 60, 2, 10, 10, 4, 2, 'high', JSON_ARRAY('2% extra member discount','10% shipping fee discount','High priority dispatch queue'), 1),
                ('gold', 'Gold', '#D4AF37', 25000, 90, 3, 15, 10, 6, 3, 'higher', JSON_ARRAY('3% extra member discount','15% shipping fee discount','Faster dispatch + premium support'), 1),
                ('platinum', 'Platinum', '#60A5FA', 100000, 365, 5, 25, 10, 10, 4, 'highest', JSON_ARRAY('5% extra member discount','25% shipping fee discount','Top priority dispatch + premium concierge'), 1)
             ON DUPLICATE KEY UPDATE tier = tier`
        );

        await connection.query(`
            CREATE TABLE IF NOT EXISTS coupons (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(40) NOT NULL UNIQUE,
                name VARCHAR(120) NOT NULL,
                description VARCHAR(255),
                source_type VARCHAR(30) NOT NULL DEFAULT 'admin',
                scope_type VARCHAR(30) NOT NULL DEFAULT 'generic',
                discount_type VARCHAR(20) NOT NULL DEFAULT 'percent',
                discount_value DECIMAL(10,2) NOT NULL DEFAULT 0,
                max_discount_subunits BIGINT NULL,
                min_cart_subunits BIGINT NOT NULL DEFAULT 0,
                tier_scope VARCHAR(20) NULL,
                category_scope_json JSON,
                starts_at DATETIME NULL,
                expires_at DATETIME NULL,
                usage_limit_total INT NULL,
                usage_limit_per_user INT NOT NULL DEFAULT 1,
                metadata_json JSON,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_by VARCHAR(50) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_coupons_source (source_type),
                INDEX idx_coupons_scope (scope_type),
                INDEX idx_coupons_active_dates (is_active, starts_at, expires_at)
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS coupon_user_targets (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                coupon_id BIGINT NOT NULL,
                user_id VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_coupon_user (coupon_id, user_id),
                INDEX idx_coupon_user_user (user_id),
                FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS coupon_redemptions (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                coupon_id BIGINT NOT NULL,
                user_id VARCHAR(50) NOT NULL,
                order_id BIGINT NULL,
                redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                year_key INT NULL,
                INDEX idx_coupon_redemptions_coupon (coupon_id),
                INDEX idx_coupon_redemptions_user (user_id),
                UNIQUE KEY uniq_coupon_order (coupon_id, order_id),
                FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // 6. [NEW] PRODUCT_CATEGORIES (Junction Table)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS product_categories (
                product_id VARCHAR(50) NOT NULL,
                category_id INT NOT NULL,
                PRIMARY KEY (product_id, category_id),
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
            )
        `);

        // [MIGRATION] Ensure display_order exists for manual sorting
        const [displayOrderCols] = await connection.execute(
            `SELECT COUNT(*) as count
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'product_categories'
               AND COLUMN_NAME = 'display_order'`
        );
        if (displayOrderCols[0].count === 0) {
            await connection.query(
                'ALTER TABLE product_categories ADD COLUMN display_order INT DEFAULT 0'
            );
        }

        // 7. [NEW] HERO SLIDES TABLE (CMS)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS hero_slides (
                id INT AUTO_INCREMENT PRIMARY KEY,
                image_url TEXT NOT NULL,
                title VARCHAR(255),
                subtitle VARCHAR(255),
                link VARCHAR(255),          -- Optional: CTA Link
                display_order INT DEFAULT 0,
                status VARCHAR(20) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // 7.1 [NEW] HERO TEXTS (Ticker)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS hero_texts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                text VARCHAR(255) NOT NULL,
                display_order INT DEFAULT 0,
                status VARCHAR(20) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // 7.2 [NEW] HOME BANNER TABLE (CMS)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS home_banner (
                id INT PRIMARY KEY,
                image_url TEXT,
                link VARCHAR(255),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        // 7.3 [NEW] HOME FEATURED CATEGORY SECTION (CMS)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS home_featured_category (
                id INT PRIMARY KEY,
                category_id INT NULL,
                title VARCHAR(255),
                subtitle VARCHAR(255),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
            )
        `);
        await connection.query(`
            CREATE TABLE IF NOT EXISTS company_profile (
                id INT PRIMARY KEY,
                display_name VARCHAR(255) NOT NULL DEFAULT 'SSC Jewellery',
                contact_number VARCHAR(40),
                support_email VARCHAR(255),
                address TEXT,
                instagram_url VARCHAR(255),
                youtube_url VARCHAR(255),
                facebook_url VARCHAR(255),
                whatsapp_number VARCHAR(40),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        // Ensure singleton rows exist (Primary + Secondary)
        const [bannerRows] = await connection.execute('SELECT id FROM home_banner WHERE id IN (1, 2)');
        const existingIds = new Set(bannerRows.map(r => r.id));
        if (!existingIds.has(1)) {
            await connection.execute(
                'INSERT INTO home_banner (id, image_url, link) VALUES (?, ?, ?)',
                [1, '/placeholder_banner.jpg', '']
            );
        }
        if (!existingIds.has(2)) {
            await connection.execute(
                'INSERT INTO home_banner (id, image_url, link) VALUES (?, ?, ?)',
                [2, '/placeholder_banner.jpg', '']
            );
        }
        // Ensure featured category row exists (id=1)
        const [featureRows] = await connection.execute('SELECT id FROM home_featured_category WHERE id = 1');
        if (featureRows.length === 0) {
            const [catRows] = await connection.execute('SELECT id FROM categories ORDER BY name ASC LIMIT 1');
            const defaultCatId = catRows[0]?.id || null;
            await connection.execute(
                'INSERT INTO home_featured_category (id, category_id, title, subtitle) VALUES (?, ?, ?, ?)',
                [1, defaultCatId, '', '']
            );
        }
        const [companyRows] = await connection.execute('SELECT id FROM company_profile WHERE id = 1 LIMIT 1');
        if (companyRows.length === 0) {
            await connection.execute(
                `INSERT INTO company_profile
                (id, display_name, contact_number, support_email, address, instagram_url, youtube_url, facebook_url, whatsapp_number)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [1, 'SSC Jewellery', '', '', '', '', '', '', '']
            );
        }
        // 8. [NEW] Ensure Default Categories Exist (Best Sellers & New Arrivals)
        const defaultCats = ['Best Sellers', 'New Arrivals'];
        for (const catName of defaultCats) {
            // Check if exists
            const [rows] = await connection.execute('SELECT id FROM categories WHERE name = ?', [catName]);
            
            if (rows.length === 0) {
                // Create if missing (using the requested placeholder path)
                await connection.execute(
                    'INSERT INTO categories (name, image_url) VALUES (?, ?)', 
                    [catName, '/src/assets/placeholder.jpg']
                );
                console.log(`✅ Auto-created default category: ${catName}`);
            }
        }
        

        console.log("✅ Tables verified/created successfully!");
        connection.release();
    } catch (error) {
        console.error("❌ Database Initialization Failed:", error.message);
    } 
};

// Run check on startup
initDB();

module.exports = pool;
