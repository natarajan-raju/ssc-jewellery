import { useState } from 'react';
import { X, UserPlus, Loader2 } from 'lucide-react';

export default function AddCustomerModal({ isOpen, onClose, onConfirm }) {
  const [formData, setFormData] = useState({
    name: '', email: '', mobile: '', password: '',
    addressLine1: '', city: '', state: '', zip: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    // Input Restrictions
    if ((name === 'mobile' && !/^\d*$/.test(value)) || (name === 'zip' && !/^\d*$/.test(value))) return;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (formData.mobile.length !== 10) return setError("Mobile must be 10 digits");
    if (formData.zip && formData.zip.length !== 6) return setError("Zip must be 6 digits");
    if (formData.password.length < 6) return setError("Password must be 6+ characters");

    setIsLoading(true);
    
    // Structure Address
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
        await onConfirm(payload); // Pass data back to parent
        // Reset form is handled by parent closing modal, but good practice to clear if needed
    } catch (err) {
        setError(err.message);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative z-10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-primary px-6 py-4 flex justify-between items-center">
            <h3 className="text-white font-serif font-bold flex items-center gap-2">
                <UserPlus size={20} className="text-accent" /> Add New Customer
            </h3>
            <button onClick={onClose} className="text-white/70 hover:text-white"><X size={20}/></button>
        </div>

        {/* Form Content - Scrollable */}
        <div className="p-6 overflow-y-auto">
            {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>}
            
            <form id="add-customer-form" onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 md:col-span-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Full Name *</label>
                        <input name="name" className="input-field mt-1" value={formData.name} onChange={handleChange} required />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Email *</label>
                        <input name="email" type="email" className="input-field mt-1" value={formData.email} onChange={handleChange} required />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 md:col-span-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Mobile *</label>
                        <input name="mobile" maxLength={10} className="input-field mt-1" value={formData.mobile} onChange={handleChange} required />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Set Password *</label>
                        <input name="password" type="password" className="input-field mt-1" value={formData.password} onChange={handleChange} required />
                    </div>
                </div>

                <div className="border-t pt-4 mt-2">
                    <p className="text-sm font-bold text-primary mb-3">Address Details</p>
                    <input name="addressLine1" placeholder="Street Address" className="input-field mb-3" value={formData.addressLine1} onChange={handleChange} />
                    <div className="grid grid-cols-3 gap-2">
                        <input name="city" placeholder="City" className="input-field" value={formData.city} onChange={handleChange} />
                        <input name="state" placeholder="State" className="input-field" value={formData.state} onChange={handleChange} />
                        <input name="zip" placeholder="Zip" maxLength={6} className="input-field" value={formData.zip} onChange={handleChange} />
                    </div>
                </div>
            </form>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
            <button onClick={onClose} type="button" className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-200 rounded-lg">Cancel</button>
            <button 
                form="add-customer-form"
                type="submit" 
                disabled={isLoading}
                className="bg-accent text-primary font-bold px-6 py-2 rounded-lg hover:bg-accent-hover shadow-md flex items-center gap-2"
            >
                {isLoading ? <Loader2 className="animate-spin" size={18} /> : 'Create Customer'}
            </button>
        </div>
      </div>
    </div>
  );
}