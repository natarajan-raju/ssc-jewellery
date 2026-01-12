import { X, AlertTriangle, Key } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, message, type = 'default', onConfirm, isLoading }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      ></div>

      {/* Modal Content */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm relative z-10 overflow-hidden transform transition-all scale-100">
        
        {/* Header Color Bar */}
        <div className={`h-2 w-full ${type === 'delete' ? 'bg-red-500' : 'bg-accent'}`}></div>

        <div className="p-6">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className={`p-3 rounded-full shrink-0 ${type === 'delete' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-accent-deep'}`}>
              {type === 'delete' ? <AlertTriangle size={24} /> : <Key size={24} />}
            </div>

            {/* Text Content */}
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-500 mt-1">{message}</p>
              
              {/* Input Field (Only for 'input' type modals) */}
              {type === 'input' && (
                <input 
                  id="modal-input"
                  type="text" 
                  placeholder="Enter new password" 
                  className="mt-4 w-full input-field py-2 text-sm"
                  autoFocus
                />
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 mt-6">
            <button 
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button 
              onClick={() => {
                // If it's an input modal, pass the input value
                const inputValue = type === 'input' ? document.getElementById('modal-input').value : null;
                onConfirm(inputValue);
              }}
              disabled={isLoading}
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg shadow-md transition-all active:scale-95
                ${type === 'delete' 
                  ? 'bg-red-500 hover:bg-red-600' 
                  : 'bg-primary hover:bg-primary-light'}`
              }
            >
              {isLoading ? 'Processing...' : (type === 'delete' ? 'Delete User' : 'Update Password')}
            </button>
          </div>
        </div>

        {/* Close X Button */}
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}