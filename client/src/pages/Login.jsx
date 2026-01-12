import { useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Check, X as XIcon, ShieldCheck } from 'lucide-react'; // Added ShieldCheck
import { useToast } from '../context/ToastContext';
import logo from '../assets/logo.webp';

export default function Login() {
  const navigate = useNavigate();
  const toast = useToast();
  
  const [method, setMethod] = useState('password');
  const [formData, setFormData] = useState({ identifier: '', password: '', mobile: '', otp: '' });
  const [isLoading, setIsLoading] = useState(false);
  
  const [timer, setTimer] = useState(0);
  const [otpStatus, setOtpStatus] = useState('neutral');

  useEffect(() => {
    let interval;
    if (timer > 0) interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  useEffect(() => {
    if (method === 'otp' && formData.otp.length === 6) {
        handleAutoLogin();
    }
  }, [formData.otp]);

  const handleAutoLogin = async () => {
    setOtpStatus('checking');
    setIsLoading(true);
    await performLogin({ type: 'otp', mobile: formData.mobile, otp: formData.otp });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'mobile' && !/^\d*$/.test(value)) return;
    setFormData({ ...formData, [name]: value });
    if (name === 'otp') setOtpStatus('neutral');
  };

  const handleSendOtp = async () => {
    if (formData.mobile.length !== 10) return toast.error("Enter valid 10-digit mobile");
    setIsLoading(true);
    try {
        await authService.sendOtp(formData.mobile);
        setTimer(30);
        toast.success("OTP Sent! Check Server Console.");
    } catch (error) {
        toast.error("Failed to send OTP");
    } finally {
        setIsLoading(false);
    }
  };

  const performLogin = async (payload) => {
    try {
        const res = await authService.login(payload);
        if (res.token) {
            if (method === 'otp') setOtpStatus('valid');
            localStorage.setItem('token', res.token);
            toast.success(`Welcome back, ${res.user.name}!`);
            setTimeout(() => {
                if (res.user.role === 'admin') navigate('/admin/dashboard');
                else navigate('/');
            }, 800); 
        } else {
            if (method === 'otp') setOtpStatus('invalid');
            toast.error(res.message || "Login Failed");
            setIsLoading(false);
        }
    } catch (error) {
        if (method === 'otp') setOtpStatus('invalid');
        toast.error("Connection Error");
        setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);

    const payload = method === 'password' 
      ? { type: 'password', identifier: formData.identifier, password: formData.password }
      : { type: 'otp', mobile: formData.mobile, otp: formData.otp };

    await performLogin(payload);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary p-4 relative">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md border-t-4 border-accent relative z-10">
        
        <div className="text-center mb-8">
            <img src={logo} alt="SSC Impon" className="w-24 h-auto mx-auto mb-4" />
            <h2 className="text-3xl font-serif font-bold text-primary">Welcome Back</h2>
        </div>

        <div className="flex mb-6 border-b border-gray-200">
          <button onClick={() => setMethod('password')} className={`flex-1 pb-3 text-sm font-semibold transition-colors ${method === 'password' ? 'border-b-2 border-accent text-primary' : 'text-gray-400'}`}>Password Login</button>
          <button onClick={() => setMethod('otp')} className={`flex-1 pb-3 text-sm font-semibold transition-colors ${method === 'otp' ? 'border-b-2 border-accent text-primary' : 'text-gray-400'}`}>OTP Login</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {method === 'password' ? (
            <div className="animate-fade-in space-y-4">
              <input name="identifier" placeholder="Email or Mobile" className="input-field" value={formData.identifier} onChange={handleChange} required />
              <div>
                <input name="password" placeholder="Password" type="password" className="input-field" value={formData.password} onChange={handleChange} required />
                <div className="text-right mt-2">
                    <Link to="/forgot-password" state={{ from: 'customer' }} className="text-xs text-accent-deep hover:underline font-medium">Forgot Password?</Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="animate-fade-in space-y-4">
              <div className="flex gap-2">
                <input name="mobile" placeholder="Mobile Number" maxLength={10} className="input-field flex-1" value={formData.mobile} onChange={handleChange} />
                <button type="button" onClick={handleSendOtp} disabled={isLoading || timer > 0} className={`px-3 rounded-lg text-sm font-medium transition-colors min-w-[100px] ${(isLoading || timer > 0) ? 'bg-gray-200 text-gray-500' : 'bg-primary text-accent hover:bg-primary-light'}`}>
                    {timer > 0 ? `Resend ${timer}s` : "Send OTP"}
                </button>
              </div>
              <div className="relative">
                <input name="otp" placeholder="Enter 6-digit OTP" maxLength={6} className={`input-field pr-10 border-2 transition-all ${otpStatus === 'valid' ? 'border-green-500 bg-green-50' : ''} ${otpStatus === 'invalid' ? 'border-red-500 bg-red-50' : 'border-gray-200'}`} value={formData.otp} onChange={handleChange} />
                 <div className="absolute right-3 top-3">
                    {otpStatus === 'checking' && <Loader2 className="animate-spin text-accent" size={20} />}
                    {otpStatus === 'valid' && <Check className="text-green-600" size={20} />}
                    {otpStatus === 'invalid' && <XIcon className="text-red-600" size={20} />}
                </div>
              </div>
            </div>
          )}
          
          <button type="submit" className={`btn-primary w-full text-lg mt-6 flex items-center justify-center gap-2 ${otpStatus === 'valid' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`} disabled={isLoading}>
            {isLoading ? <Loader2 className="animate-spin" /> : (otpStatus === 'valid' ? "Success! Redirecting..." : "Sign In")}
          </button>
        </form>
        
        <p className="text-center mt-6 text-sm text-gray-600">
          New here? <Link to="/register" className="text-accent-deep font-bold hover:underline">Create Account</Link>
        </p>

        {/* --- NEW: Admin Link Footer --- */}
        <div className="mt-8 pt-6 border-t border-gray-100 flex justify-center">
            <Link to="/admin/login" className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary transition-colors">
                <ShieldCheck size={12} />
                <span>Admin Access</span>
            </Link>
        </div>

      </div>
    </div>
  );
}