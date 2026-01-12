// server/services/otpService.js
const otpStore = {}; 

class OtpService {
    static async sendOtp(mobile) {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpStore[mobile] = { code: otp, expires: Date.now() + 5 * 60 * 1000 };

        console.log(`\n================================`);
        console.log(`🔐 MOCK OTP for ${mobile}: ${otp}`);
        console.log(`================================\n`);
        return true;
    }

    /**
     * @param {string} mobile 
     * @param {string} inputOtp 
     * @param {boolean} shouldDelete - If true, deletes OTP after successful verification
     */
    static async verifyOtp(mobile, inputOtp, shouldDelete = true) {
        const record = otpStore[mobile];

        if (!record) return false;
        if (Date.now() > record.expires) {
            delete otpStore[mobile];
            return false;
        }
        
        if (record.code === inputOtp) {
            if (shouldDelete) {
                delete otpStore[mobile];
            }
            return true;
        }

        return false;
    }
}

module.exports = OtpService;