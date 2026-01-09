import { useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { useNavigate, Link } from 'react-router-dom';
import { Loader2, Check, X as XIcon } from 'lucide-react';
import { useToast } from '../context/ToastContext'; 
import logo from '../assets/logo.webp'; 

export default function Register() {
  const navigate = useNavigate();
  const toast = useToast(); 
  
  const [formData, setFormData] = useState({
    name: '', email: '', mobile: '', password: '', 
    addressLine1: '', city: '', state: '', zip: '', otp: ''
  });
  
  const [errors, setErrors] = useState({});
  const [otpSent, setOtpSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [timer, setTimer] = useState(0); 

  // Visual Validation State for OTP
  const [otpStatus, setOtpStatus] = useState('neutral'); 

  useEffect(() => {
    let interval;
    if (timer > 0) interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  // --- VALIDATION HELPER ---
  const validateField = (name, value) => {
    if (name === 'mobile' && !/^[0-9]{10}$/.test(value)) return "Invalid mobile";
    // You can add more specific validations here if needed
    return "";
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    
    // Reset OTP status if user types
    if (name === 'otp') setOtpStatus('neutral');

    const error = validateField(name, value);
    setErrors({ ...errors, [name]: error });
  };

  const handleSendOtp = async () => {
    const mobileError = validateField('mobile', formData.mobile);
    if (mobileError) {
        setErrors({ ...errors, mobile: mobileError });
        toast.error(mobileError);
        return;
    }

    setIsLoading(true);
    try {
        await authService.sendOtp(formData.mobile);
        setOtpSent(true);
        setTimer(30);
        toast.success("OTP Sent! Check Server Console.");
    } catch (error) {
        toast.error("Failed to send OTP.");
    } finally {
        setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!otpSent) return toast.error("Please verify mobile number first.");
    
    // Construct payload
    const payload = { 
        ...formData, 
        address: formData.addressLine1 ? { 
            line1: formData.addressLine1,
            city: formData.city,
            state: formData.state,
            zip: formData.zip
        } : null 
    };

    try {
        const res = await authService.register(payload);
        
        if (res.token) {
            setOtpStatus('valid');
            toast.success("Registration Successful!");
            setTimeout(() => navigate('/login'), 1500);
        } else {
            setOtpStatus('invalid');
            toast.error(res.message || "Registration failed");
        }
    } catch (error) {
        setOtpStatus('invalid');
        toast.error("Error connecting to server");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary p-4">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-lg border-t-4 border-accent">
        
        <div className="text-center mb-8">
            <img src={logo} alt="SSC Impon Jewellery" className="w-24 h-auto mx-auto mb-4" />
            <h2 className="text-3xl font-serif font-bold text-primary">Create Account</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input name="name" placeholder="Full Name" className="input-field" value={formData.name} onChange={handleChange} required />
              <input name="email" placeholder="Email Address" type="email" className="input-field" value={formData.email} onChange={handleChange} required />
          </div>
          
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
              <p className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wide">Mobile Verification</p>
              
              <div className="flex gap-2 mb-2">
                <input name="mobile" placeholder="Mobile Number" className="input-field flex-1" value={formData.mobile} onChange={handleChange} required />
                <button 
                    type="button" onClick={handleSendOtp} disabled={isLoading || timer > 0}
                    className={`px-4 rounded-lg text-sm font-medium transition-colors min-w-[100px]
                        ${(isLoading || timer > 0) ? 'bg-gray-300 text-gray-500' : 'bg-primary text-accent hover:bg-primary-light'}`}
                >
                    {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : (timer > 0 ? `${timer}s` : "Send OTP")}
                </button>
              </div>
              
              {otpSent && (
                <div className="relative animate-fade-in mt-2">
                    <input 
                        name="otp" 
                        placeholder="Enter 6-digit OTP" 
                        className={`input-field pr-10 transition-colors border-2 
                            ${otpStatus === 'valid' ? 'border-green-500 bg-green-50 text-green-700' : ''}
                            ${otpStatus === 'invalid' ? 'border-red-500 bg-red-50 text-red-700' : ''}
                            ${otpStatus === 'neutral' ? 'border-accent ring-1 ring-accent' : ''}
                        `}
                        value={formData.otp} 
                        onChange={handleChange} 
                        required 
                    />
                    <div className="absolute right-3 top-3 text-gray-400">
                        {otpStatus === 'valid' && <Check className="text-green-600" size={20} />}
                        {otpStatus === 'invalid' && <XIcon className="text-red-600" size={20} />}
                    </div>
                </div>
              )}
          </div>

          <input name="password" placeholder="Password" type="password" className="input-field" value={formData.password} onChange={handleChange} required />

          {/* --- RESTORED ADDRESS SECTION --- */}
          <div className="border-t pt-4 mt-2">
            <p className="text-sm font-medium text-gray-500 mb-3">Shipping Address (Optional)</p>
            <input name="addressLine1" placeholder="Street Address" className="input-field mb-3" value={formData.addressLine1} onChange={handleChange} />
            <div className="grid grid-cols-3 gap-2">
                <input name="city" placeholder="City" className="input-field" value={formData.city} onChange={handleChange} />
                <input name="state" placeholder="State" className="input-field" value={formData.state} onChange={handleChange} />
                <input name="zip" placeholder="Zip" className="input-field" value={formData.zip} onChange={handleChange} />
            </div>
          </div>
          {/* ------------------------------- */}

          <button type="submit" className="btn-primary w-full mt-4 text-lg">Register Account</button>
        </form>
        
        <p className="text-center mt-6 text-sm text-gray-600">
            Already have an account? <Link to="/login" className="text-accent font-bold hover:underline">Login here</Link>
        </p>
      </div>
    </div>
  );
}