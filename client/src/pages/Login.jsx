import { useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { useAuth } from '../context/AuthContext'; // [NEW]
import { Link, useNavigate } from 'react-router-dom'; // Removed useNavigate since we use window.location
import { auth, googleProvider } from '../firebase';
import { signInWithPopup, signOut } from 'firebase/auth';
import { Loader2, Check, X as XIcon, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import logo from '../assets/logo.webp';

export default function Login() {
  const toast = useToast();
  
  // State for UI
  const [method, setMethod] = useState('password');
  const [formData, setFormData] = useState({ identifier: '', password: '', mobile: '', otp: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [timer, setTimer] = useState(0);
  const [otpStatus, setOtpStatus] = useState('neutral');
  const { login, user } = useAuth(); // [NEW] Get login function and current user
  const navigate = useNavigate(); // We can use navigate again now!

  // Auto-Redirect if already logged in (using Context state)
  useEffect(() => {
      if (user) {
          if (user.role === 'admin') navigate('/admin/dashboard', { replace: true });
          else navigate('/', { replace: true });
      }
  }, [user, navigate]);

  


  // Timer Logic
  useEffect(() => {
    let interval;
    if (timer > 0) interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  // Auto-Login for OTP
  useEffect(() => {
    if (method === 'otp' && formData.otp.length === 6) {
        handleAutoLogin();
    }
  }, [formData.otp]);

  // --- HANDLERS ---

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
        toast.success("OTP Sent!");
    } catch (error) {
        toast.error("Failed to send OTP");
    } finally {
        setIsLoading(false);
    }
  };

  const performLogin = async (payload) => {
    try {
        const res = await authService.login(payload);
        processLoginSuccess(res);
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

  // --- CENTRALIZED SUCCESS HANDLER ---
  const processLoginSuccess = (res) => {
      if (res.token) {
        if (method === 'otp') setOtpStatus('valid');

        login(res.token, res.user);

        toast.success(`Welcome back, ${res.user.name}!`);
    } else {
        if (method === 'otp') setOtpStatus('invalid');
        toast.error(res.message || "Login Failed");
        setIsLoading(false);
    }
  };

  // --- GOOGLE LOGIN ---
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
        // 1. Force Clean Slate (Prevents conflicts)
        await signOut(auth); 

        // 2. Open Popup
        const result = await signInWithPopup(auth, googleProvider);
        
        // 3. Get Fresh Token
        const firebaseToken = await result.user.getIdToken();
        
        // 4. Send to Backend
        const res = await authService.googleLogin(firebaseToken);
        
        // 5. Process Success
        processLoginSuccess(res);

    } catch (error) {
        console.error("Google Login Error:", error);
        if (error.code !== 'auth/popup-closed-by-user') {
            toast.error("Google Sign-In Failed");
        }
        setIsLoading(false);
    }
  };

 

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary p-4 relative">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md border-t-4 border-accent relative z-10 animate-fade-in">
        
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
              <div className="relative">
                  <input 
                      name="password" 
                      placeholder="Password" 
                      type={showPassword ? "text" : "password"} 
                      className="input-field pr-10" 
                      value={formData.password} 
                      onChange={handleChange} 
                      required 
                  />
                  <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-primary"
                  >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
              </div>
              <div className="text-right mt-1">
                  <Link to="/forgot-password" state={{ from: 'customer' }} className="text-xs text-accent-deep hover:underline font-medium">Forgot Password?</Link>
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

        {/* --- GOOGLE LOGIN --- */}
        <div className="mt-6">
            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">Or continue with</span>
                </div>
            </div>

            <button 
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="mt-4 w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-xl shadow-sm bg-white hover:bg-gray-50 transition-all font-semibold text-gray-700"
            >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Sign in with Google
            </button>
        </div>
        
        <p className="text-center mt-6 text-sm text-gray-600">
          New here? <Link to="/register" className="text-accent-deep font-bold hover:underline">Create Account</Link>
        </p>

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