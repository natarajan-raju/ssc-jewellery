// server/services/otpService.js
const pool = require('../config/db'); 

// Keep your local store logic
const otpStore = {}; 

class OtpService {

    // --- 1. SAVE OTP (Environment Aware) ---
    static async saveOtp(mobile, otp) {
        
        // CHECK: Are we in Production?
        if (process.env.NODE_ENV === 'production') {
            // --- PRODUCTION MODE: USE DATABASE ---
            // This allows us to test if the DB connection works!
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); 
            
            // If DB is broken, this throws an error (which we want to see)
            await pool.query('DELETE FROM otps WHERE mobile = ?', [mobile]);
            await pool.query('INSERT INTO otps (mobile, otp, expires_at) VALUES (?, ?, ?)', 
                [mobile, otp, expiresAt]);

        } else {
            // --- LOCAL MODE: USE MEMORY ---
            // This keeps your local development fast and simple
            otpStore[mobile] = { 
                code: otp, 
                expires: Date.now() + 5 * 60 * 1000 
            };
            console.log(`\n🔐 [LOCAL MEMORY] OTP for ${mobile}: ${otp}\n`);
        }
    }

    // --- 2. VERIFY OTP (Environment Aware) ---
    static async verifyOtp(mobile, inputOtp, shouldDelete = true) {
        
        if (process.env.NODE_ENV === 'production') {
            // --- PRODUCTION: CHECK DATABASE ---
            const [rows] = await pool.query(
                'SELECT * FROM otps WHERE mobile = ? AND otp = ? AND expires_at > NOW()', 
                [mobile, inputOtp]
            );

            if (rows.length > 0) {
                if (shouldDelete) {
                    await pool.query('DELETE FROM otps WHERE mobile = ?', [mobile]);
                }
                return true;
            }
            return false;

        } else {
            // --- LOCAL: CHECK MEMORY ---
            const record = otpStore[mobile];
            if (!record) return false;
            
            if (Date.now() > record.expires) {
                delete otpStore[mobile];
                return false;
            }
            
            if (record.code === inputOtp) {
                if (shouldDelete) delete otpStore[mobile];
                return true;
            }
            return false;
        }
    }

    // Legacy support (optional)
    static async sendOtp(mobile) {
         const otp = Math.floor(100000 + Math.random() * 900000).toString();
         await this.saveOtp(mobile, otp);
         return true;
    }
}

module.exports = OtpService;