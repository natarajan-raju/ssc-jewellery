import { useState } from 'react';
import { authService } from '../services/authService';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Check, X as XIcon } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import logo from '../assets/logo.webp';

export default function Login() {
  const navigate = useNavigate();
  const toast = useToast();
  
  const [method, setMethod] = useState('password');
  const [formData, setFormData] = useState({ identifier: '', password: '', mobile: '', otp: '' });
  const [isLoading, setIsLoading] = useState(false);
  
  // Visual Feedback for OTP Input
  const [otpStatus, setOtpStatus] = useState('neutral');

  const handleSendOtp = async () => {
    if (formData.mobile.length < 10) return toast.error("Invalid mobile number");
    setIsLoading(true);
    try {
        await authService.sendOtp(formData.mobile);
        toast.success("OTP Sent! Check Server Console.");
    } catch (error) {
        toast.error("Failed to send OTP");
    } finally {
        setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setOtpStatus('neutral'); // Reset before api call

    const payload = method === 'password' 
      ? { type: 'password', identifier: formData.identifier, password: formData.password }
      : { type: 'otp', mobile: formData.mobile, otp: formData.otp };

    try {
        const res = await authService.login(payload);
        if (res.token) {
            if (method === 'otp') setOtpStatus('valid');
            toast.success(`Welcome back, ${res.user.name}!`);
            setTimeout(() => navigate('/'), 1000);
        } else {
            if (method === 'otp') setOtpStatus('invalid');
            toast.error(res.message || "Login Failed");
        }
    } catch (error) {
        if (method === 'otp') setOtpStatus('invalid');
        toast.error("Connection Error");
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary p-4">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md border-t-4 border-accent">
        <div className="text-center mb-8">
            <img src={logo} alt="SSC Impon Jewellery" className="w-24 h-auto mx-auto mb-4" />
            <h2 className="text-3xl font-serif font-bold text-primary">Welcome Back</h2>
        </div>

        <div className="flex mb-6 border-b border-gray-200">
          <button onClick={() => setMethod('password')} className={`flex-1 pb-3 text-sm font-semibold ${method === 'password' ? 'border-b-2 border-accent text-primary' : 'text-gray-400'}`}>Password Login</button>
          <button onClick={() => setMethod('otp')} className={`flex-1 pb-3 text-sm font-semibold ${method === 'otp' ? 'border-b-2 border-accent text-primary' : 'text-gray-400'}`}>OTP Login</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {method === 'password' ? (
            <div className="animate-fade-in space-y-4">
              <input placeholder="Email or Mobile" className="input-field" value={formData.identifier} onChange={e => setFormData({...formData, identifier: e.target.value})} required />
              <div>
                <input placeholder="Password" type="password" className="input-field" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required />
                <div className="text-right mt-1">
                    <Link to="/forgot-password" class="text-xs text-accent hover:underline">Forgot Password?</Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="animate-fade-in space-y-4">
              <div className="flex gap-2">
                <input placeholder="Mobile Number" className="input-field flex-1" value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})} />
                <button type="button" onClick={handleSendOtp} disabled={isLoading} className="bg-primary hover:bg-primary-light text-white px-3 rounded-lg text-sm">
                    {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "Send OTP"}
                </button>
              </div>
              <div className="relative">
                <input 
                    placeholder="Enter Mock OTP" 
                    className={`input-field pr-10 border-2 transition-colors 
                        ${otpStatus === 'valid' ? 'border-green-500 bg-green-50' : ''}
                        ${otpStatus === 'invalid' ? 'border-red-500 bg-red-50' : 'border-gray-200'}
                    `}
                    value={formData.otp} 
                    onChange={e => { setFormData({...formData, otp: e.target.value}); setOtpStatus('neutral'); }} 
                />
                 <div className="absolute right-3 top-3 text-gray-400">
                    {otpStatus === 'valid' && <Check className="text-green-600" size={20} />}
                    {otpStatus === 'invalid' && <XIcon className="text-red-600" size={20} />}
                </div>
              </div>
            </div>
          )}
          
          <button type="submit" className="btn-primary w-full text-lg mt-6" disabled={isLoading}>{isLoading ? "Signing In..." : "Sign In"}</button>
        </form>
        
        <p className="text-center mt-6 text-sm text-gray-600">
          New here? <Link to="/register" className="text-accent font-bold hover:underline">Create Account</Link>
        </p>
      </div>
    </div>
  );
}