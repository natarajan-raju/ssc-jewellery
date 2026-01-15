import { useEffect, useState } from 'react';
import { adminService } from '../../services/adminService';
import { 
    Loader2, Trash2, Search, Mail, Phone, Key, 
    ShieldCheck, Plus, UserCog 
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/Modal';
import AddCustomerModal from '../../components/AddCustomerModal';

export default function Customers() {
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    // --- ROLE & ID TRACKING ---
    const [currentUserRole, setCurrentUserRole] = useState(null);
    const [currentUserId, setCurrentUserId] = useState(null); 
    
    const toast = useToast();
    const [modalConfig, setModalConfig] = useState({ isOpen: false, type: 'default', title: '', message: '', targetUser: null });
    const [addModalRole, setAddModalRole] = useState(null); 
    const [isActionLoading, setIsActionLoading] = useState(false);

    useEffect(() => { 
        loadUsers(); 
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        setCurrentUserRole(storedUser.role || 'customer');
        setCurrentUserId(storedUser.id);
    }, []);

    const loadUsers = async () => {
        try {
            const data = await adminService.getUsers();
            setUsers(data);
        } catch (error) { toast.error("Failed to load users"); } 
        finally { setIsLoading(false); }
    };

    const handleAddUser = async (userData) => {
        const payload = { ...userData, role: addModalRole };
        if (addModalRole === 'staff') {
            delete payload.addressLine1; delete payload.city; delete payload.state; delete payload.zip;
        }
        const res = await adminService.createUser(payload);
        setUsers([...users, res.user]); 
        setAddModalRole(null);
        toast.success(`${addModalRole === 'staff' ? 'Staff' : 'Customer'} added successfully`);
    };

    const openDeleteModal = (user) => {
        setModalConfig({ isOpen: true, type: 'delete', title: 'Delete User?', message: `Are you sure you want to remove ${user.name}?`, targetUser: user });
    };

    const openResetModal = (user) => {
        setModalConfig({ 
            isOpen: true, 
            type: 'password', 
            title: `Reset Password`, 
            message: `Enter a new password for ${user.name}.`, 
            targetUser: user 
        });
    };

    const handleModalConfirm = async (inputValue) => {
        setIsActionLoading(true);
        const { type, targetUser } = modalConfig;
        try {
            if (type === 'delete') {
                await adminService.deleteUser(targetUser.id);
                setUsers(users.filter(u => u.id !== targetUser.id));
                toast.success("User deleted successfully");
            } else if (type === 'password' || type === 'input') {
                if (!inputValue || inputValue.length < 6) {
                    toast.error("Password must be at least 6 characters");
                    setIsActionLoading(false); return;
                }
                await adminService.resetPassword(targetUser.id, inputValue);
                toast.success("Password updated successfully");
            }
            setModalConfig({ ...modalConfig, isOpen: false });
        } catch (error) { 
            console.error(error);
            toast.error(error.response?.data?.message || "Action failed"); 
        } 
        finally { setIsActionLoading(false); }
    };

    const filteredUsers = users.filter(user => 
        (user.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
        (user.mobile || '').includes(searchTerm)
    );

    // --- HELPER FOR PERMISSIONS ---
    const canResetPassword = (targetUser) => {
        // 1. Admin can reset ANYONE except Customers
        if (currentUserRole === 'admin' && targetUser.role !== 'customer') return true;
        // 2. Staff can reset THEMSELVES only
        if (currentUserRole === 'staff' && targetUser.id === currentUserId) return true;
        
        return false;
    };

    const canDeleteUser = (targetUser) => {
        // 1. Admin can delete Staff & Customers (NOT other Admins)
        if (currentUserRole === 'admin' && targetUser.role !== 'admin') return true;
        // 2. Staff can delete Customers ONLY
        if (currentUserRole === 'staff' && targetUser.role === 'customer') return true;
        
        return false;
    };

    return (
        <div className="animate-fade-in">
            <Modal 
                isOpen={modalConfig.isOpen}
                onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
                onConfirm={handleModalConfirm}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                isLoading={isActionLoading}
            />

            <AddCustomerModal 
                isOpen={!!addModalRole} 
                onClose={() => setAddModalRole(null)}
                onConfirm={handleAddUser}
                roleToAdd={addModalRole} 
            />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-serif text-primary font-bold">User Management</h1>
                    <p className="text-gray-500 text-sm mt-1">Manage staff access & customers</p>
                </div>
                
                <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64 lg:w-80">
                        <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                        <input 
                            placeholder="Search users..." 
                            className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-gray-200 shadow-sm focus:border-accent outline-none"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    
                    <div className="flex gap-2">
                        {currentUserRole === 'admin' && (
                            <button 
                                onClick={() => setAddModalRole('staff')}
                                className="bg-gray-800 hover:bg-gray-700 text-white font-bold px-4 py-3 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 flex-1 md:flex-none"
                            >
                                <UserCog size={20} strokeWidth={2} />
                                <span className="whitespace-nowrap">Add Staff</span>
                            </button>
                        )}

                        <button 
                            onClick={() => setAddModalRole('customer')}
                            className="bg-primary hover:bg-primary-light text-accent font-bold px-4 py-3 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all active:scale-95 flex-1 md:flex-none"
                        >
                            <Plus size={20} strokeWidth={3} />
                            <span className="whitespace-nowrap">Add Customer</span>
                        </button>
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20"><Loader2 className="animate-spin text-accent w-10 h-10" /></div>
            ) : (
                <>
                    {/* MOBILE LIST */}
                    <div className="grid grid-cols-1 gap-4 md:hidden">
                        {filteredUsers.map((user) => (
                            <div key={user.id} className={`p-5 rounded-xl shadow-sm border relative 
                                ${user.role === 'admin' ? 'bg-amber-50 border-accent/30' : 
                                  user.role === 'staff' ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100'}`}>
                                
                                <div className="flex items-start gap-4">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 
                                        ${user.role === 'admin' ? 'bg-accent text-primary' : 
                                          user.role === 'staff' ? 'bg-blue-100 text-blue-600' : 'bg-primary/5 text-primary'}`}>
                                        {user.role === 'admin' ? <ShieldCheck size={20} /> : 
                                         user.role === 'staff' ? <UserCog size={20} /> : 
                                         <span className="font-bold">{user.name.charAt(0)}</span>}
                                    </div>

                                    <div className="flex-1 overflow-hidden">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-gray-800">{user.name}</h3>
                                            {user.role === 'admin' && <span className="text-[10px] bg-primary text-accent px-2 py-0.5 rounded uppercase font-bold tracking-wider">Admin</span>}
                                            {user.role === 'staff' && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase font-bold tracking-wider">Staff</span>}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1"><Mail size={12}/> {user.email}</p>
                                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1"><Phone size={12}/> {user.mobile}</p>
                                    </div>
                                </div>

                                <div className="mt-4 pt-3 border-t border-gray-200/50 flex justify-end gap-3">
                                    {/* RESET PASSWORD */}
                                    {canResetPassword(user) && (
                                        <button onClick={() => openResetModal(user)} className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-accent-deep bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                                            <Key size={14} /> Reset Pwd
                                        </button>
                                    )}
                                    
                                    {/* DELETE */}
                                    {canDeleteUser(user) && (
                                        <button onClick={() => openDeleteModal(user)} className="flex items-center gap-1 text-xs font-medium text-red-400 hover:text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">
                                            <Trash2 size={14} /> Delete
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* DESKTOP TABLE */}
                    <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">User</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Contact</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Role</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredUsers.map((user) => (
                                    <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs 
                                                    ${user.role === 'admin' ? 'bg-accent text-primary' : 
                                                      user.role === 'staff' ? 'bg-blue-100 text-blue-600' : 'bg-primary/10 text-primary'}`}>
                                                    {user.role === 'admin' ? <ShieldCheck size={14}/> : 
                                                     user.role === 'staff' ? <UserCog size={14}/> : 
                                                     user.name.charAt(0)}
                                                </div>
                                                <span className="font-medium text-gray-900">{user.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-gray-900">{user.email}</div>
                                            <div className="text-xs text-gray-500">{user.mobile}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {user.role === 'admin' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary text-accent">ADMIN</span>}
                                            {user.role === 'staff' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">STAFF</span>}
                                            {(!user.role || user.role === 'customer') && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Customer</span>}
                                        </td>
                                        <td className="px-6 py-4 text-right flex justify-end gap-2">
                                            
                                            {canResetPassword(user) && (
                                                <button onClick={() => openResetModal(user)} className="text-gray-400 hover:text-accent-deep hover:bg-amber-50 p-2 rounded-lg transition-all" title="Reset Password">
                                                    <Key size={18} />
                                                </button>
                                            )}

                                            {canDeleteUser(user) && (
                                                <button onClick={() => openDeleteModal(user)} className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-all" title="Delete User">
                                                    <Trash2 size={18} />
                                                </button>
                                            )}

                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}