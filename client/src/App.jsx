import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { ProductProvider } from './context/ProductContext';
import { CartProvider } from './context/CartContext';
import { CustomerProvider } from './context/CustomerContext';
import { ShippingProvider } from './context/ShippingContext';
import { OrderProvider } from './context/OrderContext';
import { useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import CategoryStore from './pages/CategoryStore';
import Shop from './pages/Shop';

// Components & Pages
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import FloatingWhatsApp from './components/FloatingWhatsApp';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import ProductPage from './pages/ProductPage';
import Contact from './pages/Contact';
import Profile from './pages/Profile';
import Checkout from './pages/Checkout';
import CartPage from './pages/CartPage';
import Orders from './pages/Orders';

// Admin Protection
const AdminRoute = ({ children }) => {
  const { user } = useAuth();
  return (user && (user.role === 'admin' || user.role === 'staff')) ? children : <Navigate to="/admin/login" />;
};

// [UPDATED] Public Layout
// Changed 'pt-20 md:pt-24' to 'pt-[74px]'
// This perfectly matches the initial height of the Navbar (72px + border)
const PublicLayout = () => {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-secondary pt-[74px]"> 
        <Outlet />
      </main>
      <FloatingWhatsApp />
      <Footer />
    </>
  );
};

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <ProductProvider>
            <SocketProvider>
              <OrderProvider>
                <CustomerProvider>
                  <ShippingProvider>
                    <CartProvider>
                  <Routes>
              
              {/* Public Routes */}
              <Route element={<PublicLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/shop/:category" element={<CategoryStore />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/checkout" element={<Checkout />} />
                {/* Product Details Route */}
                <Route path="/product/:id" element={<ProductPage />} />
              </Route>

              {/* Auth Pages (No Navbar) */}
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

              <Route path="*" element={<Navigate to="/" />} />
                  </Routes>
                    </CartProvider>
                  </ShippingProvider>
                </CustomerProvider>
              </OrderProvider>
            </SocketProvider>
          </ProductProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
