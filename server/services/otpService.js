// In-memory storage for OTPs (resets when server restarts)
const otpStore = {}; 

class OtpService {
    static async sendOtp(mobile) {
        // Generate random 6-digit code
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Save it with 5-minute expiration
        otpStore[mobile] = { 
            code: otp, 
            expires: Date.now() + 5 * 60 * 1000 
        };

        // --- LOG TO CONSOLE (This is your "Mock SMS") ---
        console.log(`\n================================`);
        console.log(`🔐 MOCK OTP for ${mobile}: ${otp}`);
        console.log(`================================\n`);
        
        return true;
    }

    static async verifyOtp(mobile, inputOtp) {
        const record = otpStore[mobile];

        if (!record) return false; // No OTP requested
        if (Date.now() > record.expires) { // OTP expired
            delete otpStore[mobile];
            return false;
        }
        if (record.code === inputOtp) { // Valid OTP
            delete otpStore[mobile];
            return true;
        }

        return false;
    }
}

module.exports = OtpService;