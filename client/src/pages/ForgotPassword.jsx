import { useState } from 'react';
import { authService } from '../services/authService';
import { useNavigate, Link } from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import logo from '../assets/logo.webp';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const toast = useToast();
  
  const [step, setStep] = useState(1); // 1: Send OTP, 2: Reset Password
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (mobile.length < 10) return toast.error("Invalid mobile number");

    setIsLoading(true);
    try {
        await authService.sendOtp(mobile);
        toast.success("OTP Sent! Check Console.");
        setStep(2);
    } catch (error) {
        toast.error("Failed to send OTP");
    } finally {
        setIsLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) return toast.error("Password too short");

    setIsLoading(true);
    try {
        const res = await authService.resetPassword({ mobile, otp, newPassword });
        if (res.message.includes('successful')) {
            toast.success("Password Reset Successfully!");
            setTimeout(() => navigate('/login'), 2000);
        } else {
            toast.error(res.message);
        }
    } catch (error) {
        toast.error("Server Error");
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary p-4">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md border-t-4 border-accent">
        
        <div className="text-center mb-6">
            <img src={logo} alt="SSC Impon Jewellery" className="w-20 h-auto mx-auto mb-4" />
            <h2 className="text-2xl font-serif font-bold text-primary">Reset Password</h2>
            <p className="text-gray-500 text-sm">Secure account recovery</p>
        </div>

        {step === 1 ? (
            <form onSubmit={handleSendOtp} className="space-y-4 animate-fade-in">
                <div>
                    <label className="block text-sm font-medium mb-1">Enter your registered mobile</label>
                    <input 
                        placeholder="Mobile Number" 
                        className="input-field" 
                        value={mobile} 
                        onChange={e => setMobile(e.target.value)} 
                        required 
                    />
                </div>
                <button type="submit" className="btn-primary w-full" disabled={isLoading}>
                    {isLoading ? <Loader2 className="animate-spin" /> : "Send OTP"}
                </button>
            </form>
        ) : (
            <form onSubmit={handleReset} className="space-y-4 animate-fade-in">
                <div className="bg-green-50 p-3 rounded text-sm text-green-800 mb-2">
                    OTP Sent to {mobile}
                </div>
                <input 
                    placeholder="Enter OTP" 
                    className="input-field" 
                    value={otp} 
                    onChange={e => setOtp(e.target.value)} 
                    required 
                />
                <input 
                    placeholder="New Password" 
                    type="password" 
                    className="input-field" 
                    value={newPassword} 
                    onChange={e => setNewPassword(e.target.value)} 
                    required 
                />
                <button type="submit" className="btn-primary w-full" disabled={isLoading}>
                    {isLoading ? "Resetting..." : "Set New Password"}
                </button>
            </form>
        )}

        <div className="mt-6 text-center">
            <Link to="/login" className="text-gray-500 text-sm flex items-center justify-center gap-2 hover:text-primary">
                <ArrowLeft size={16} /> Back to Login
            </Link>
        </div>
      </div>
    </div>
  );
}