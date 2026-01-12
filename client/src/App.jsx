import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Import Public Pages
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';

// Import Admin Pages
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';

// Import Toast Provider
import { ToastProvider } from './context/ToastContext';

// Protected Route Wrapper for Admin
// (Optional: You can add this logic later, for now let's keep it simple)
const AdminRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  // In a real app, you would also decode the token to check role === 'admin'
  return token ? children : <Navigate to="/admin/login" />;
};

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          
          {/* Admin Routes */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route 
            path="/admin/dashboard" 
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            } 
          />

          {/* Default Redirect */}
          <Route path="/" element={<Navigate to="/login" />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;