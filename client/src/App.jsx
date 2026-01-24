import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';

// Import Components
import Navbar from './components/Navbar';

// Import Public Pages
import Home from './pages/Home'; // <--- We will create this next
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';

// Import Admin Pages
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';

// Import Toast Provider
import { ToastProvider } from './context/ToastContext';

// --- PROTECTED ROUTES ---
const AdminRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/admin/login" />;
};

// --- LAYOUTS ---
// Layout for public pages (Home, Shop, About, etc.)
// Includes the Navbar and padding for the fixed header
const PublicLayout = () => {
  return (
    <>
      <Navbar />
      <main className="pt-20 min-h-screen bg-secondary"> 
        <Outlet />
      </main>
    </>
  );
};

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          
          {/* --- PUBLIC ROUTES (With Navbar) --- */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} /> {/* Landing Page */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            {/* Future pages like /shop, /about go here */}
          </Route>

          {/* --- ADMIN ROUTES (No Public Navbar) --- */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route 
            path="/admin/dashboard" 
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            } 
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" />} />
          
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;