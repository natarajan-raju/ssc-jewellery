import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from '../../services/authService';
import { ShieldCheck, Lock, ExternalLink, Eye, EyeOff } from 'lucide-react'; // Add Eye, EyeOff
import { useToast } from '../../context/ToastContext';

export default function AdminLogin() {
    const [formData, setFormData] = useState({ identifier: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();
    const toast = useToast();

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const res = await authService.login({ type: 'password', ...formData });
            if (res.token) {
                if (res.user.role !== 'admin' && res.user.role !== 'staff') {
                    toast.error("Access Denied: You are not an Admin");
                    return;
                }
                // --- FIX STARTS HERE ---
                localStorage.setItem('token', res.token);
                // Save the user object so Customers.jsx knows you are an admin
                localStorage.setItem('user', JSON.stringify(res.user)); 
                // --- FIX ENDS HERE ---

                toast.success("Welcome, Admin!");
                navigate('/admin/dashboard');
            } else {
                toast.error(res.message);
            }
        } catch (error) {
            toast.error("Login Failed");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-[#0A192F] via-[#112240] to-[#0A192F] fixed inset-0 overflow-hidden">
            {/* Optional: Subtle Overlay Pattern */}
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>

            <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-2xl w-full max-w-sm shadow-2xl animate-slide-in relative z-10">
                
                {/* Header Section */}
                <div className="flex flex-col items-center mb-8">
                    <div className="bg-accent p-4 rounded-full shadow-lg shadow-accent/20 mb-4 animate-bounce-slow">
                        <ShieldCheck className="text-primary w-10 h-10" />
                    </div>
                    <h1 className="text-xl font-serif font-bold text-accent tracking-wide text-center uppercase">
                        SSC Impon Jewellery
                    </h1>
                    <p className="text-gray-400 text-xs tracking-widest mt-1">Administration Portal</p>
                </div>
                
                <form onSubmit={handleLogin} className="space-y-5">
                    <div className="relative group">
                        <input 
                            className="w-full bg-black/20 border border-white/10 text-white px-4 py-3.5 rounded-xl focus:border-accent focus:ring-1 focus:ring-accent outline-none placeholder-gray-500 transition-all group-hover:border-white/20"
                            placeholder="Admin Email"
                            value={formData.identifier}
                            onChange={e => setFormData({...formData, identifier: e.target.value})}
                        />
                    </div>
                    <div className="relative group">
                        <input 
                            type={showPassword ? "text" : "password"} // Toggle type
                            className="w-full bg-black/20 border border-white/10 text-white px-4 py-3.5 rounded-xl focus:border-accent focus:ring-1 focus:ring-accent outline-none placeholder-gray-500 transition-all group-hover:border-white/20 pr-10" // Added pr-10
                            placeholder="Password"
                            value={formData.password}
                            onChange={e => setFormData({...formData, password: e.target.value})}
                        />
                        {/* Toggle Button */}
                        <button 
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-3.5 text-gray-500 hover:text-white transition-colors"
                        >
                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                    </div>
                    
                    {/* Forgot Password Link */}
                    <div className="text-right">
                        <Link 
                            to="/forgot-password" 
                            state={{ from: 'admin' }} 
                            className="text-xs text-accent/80 hover:text-accent hover:underline transition-colors"
                        >
                            Forgot Password?
                        </Link>
                    </div>

                    <button className="w-full bg-accent hover:bg-accent-hover text-primary font-bold py-3.5 rounded-xl shadow-lg shadow-accent/10 transition-all active:scale-95 text-sm uppercase tracking-wider">
                        Secure Login
                    </button>
                </form>

                {/* Powered By Footer */}
                <div className="mt-8 pt-6 border-t border-white/5 text-center">
                    <p className="text-[10px] text-gray-500 flex items-center justify-center gap-1">
                        Powered by 
                        <a 
                            href="https://creativecodz.com" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-accent transition-colors font-medium flex items-center gap-0.5"
                        >
                            Creativecodz <ExternalLink size={8} />
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}