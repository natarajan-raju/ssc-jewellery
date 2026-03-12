import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { ProductProvider } from './context/ProductContext';
import { CartProvider } from './context/CartContext';
import { CustomerProvider } from './context/CustomerContext';
import { ShippingProvider } from './context/ShippingContext';
import { OrderProvider } from './context/OrderContext';
import { WishlistProvider } from './context/WishlistContext';
import { useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';

// Components & Pages
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import FloatingWhatsApp from './components/FloatingWhatsApp';
import MobileBottomNav from './components/MobileBottomNav';
import CustomerCouponPopup from './components/CustomerCouponPopup';
import GuestGoogleOneTap from './components/GuestGoogleOneTap';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import AppSeoDefaults from './components/AppSeoDefaults';
import ScrollToTop from './components/ScrollToTop';
import Home from './pages/Home';
import { canAccessAdminDashboard, shouldRedirectAdminToDashboard } from './utils/authRoutePolicy';

const Shop = lazy(() => import('./pages/Shop'));
const CategoryStore = lazy(() => import('./pages/CategoryStore'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const ProductPage = lazy(() => import('./pages/ProductPage'));
const Contact = lazy(() => import('./pages/Contact'));
const Profile = lazy(() => import('./pages/Profile'));
const Wishlist = lazy(() => import('./pages/Wishlist'));
const Checkout = lazy(() => import('./pages/Checkout'));
const CartPage = lazy(() => import('./pages/CartPage'));
const Orders = lazy(() => import('./pages/Orders'));
const PaymentSuccess = lazy(() => import('./pages/PaymentSuccess'));
const PaymentFailed = lazy(() => import('./pages/PaymentFailed'));
const TrackOrder = lazy(() => import('./pages/TrackOrder'));
const PolicyPage = lazy(() => import('./pages/PolicyPage'));
const About = lazy(() => import('./pages/About'));
const Faq = lazy(() => import('./pages/Faq'));

const RouteFallback = () => (
  <div className="min-h-[40vh] bg-secondary flex items-center justify-center px-4">
    <div className="rounded-2xl border border-gray-200 bg-white/90 px-4 py-3 text-sm text-gray-500 shadow-sm">
      Loading page...
    </div>
  </div>
);

// Admin Protection
const AdminRoute = ({ children }) => {
  const { user } = useAuth();
  return canAccessAdminDashboard(user) ? children : <Navigate to="/admin/login" replace />;
};

const RedirectAdminToDashboard = ({ children }) => {
  const { user } = useAuth();
  return shouldRedirectAdminToDashboard(user) ? <Navigate to="/admin/dashboard" replace /> : children;
};

const ClientRoute = ({ children, redirectTo = '/track-order' }) => {
  const { user } = useAuth();
  return user ? children : <Navigate to={`/login?redirect=${encodeURIComponent(redirectTo)}`} replace />;
};

// [UPDATED] Public Layout
// Changed 'pt-20 md:pt-24' to 'pt-[74px]'
// This perfectly matches the initial height of the Navbar (72px + border)
const PublicLayout = () => {
  const { user } = useAuth();
  const tier = String(user?.loyaltyTier || 'regular').toLowerCase();

  useEffect(() => {
    const tiers = ['regular', 'bronze', 'silver', 'gold', 'platinum'];
    document.body.classList.remove(...tiers.map((entry) => `tier-${entry}`));
    document.body.classList.add(`tier-${tiers.includes(tier) ? tier : 'regular'}`);
    return () => {
      document.body.classList.remove(...tiers.map((entry) => `tier-${entry}`));
      document.body.classList.add('tier-regular');
    };
  }, [tier]);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-secondary pt-[74px] pb-24 md:pb-0 tier-surface"> 
        <Outlet />
      </main>
      <FloatingWhatsApp />
      <MobileBottomNav />
      <CustomerCouponPopup />
      <Footer />
    </>
  );
};

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <ToastProvider>
        <AuthProvider>
            <SocketProvider>
          <ProductProvider>
              <OrderProvider>
                <CustomerProvider>
                  <ShippingProvider>
                    <WishlistProvider>
                    <CartProvider>
                  <GuestGoogleOneTap />
                  <PwaInstallPrompt />
                  <AppSeoDefaults />
                  <Suspense fallback={<RouteFallback />}>
                  <Routes>
              
              {/* Public Routes */}
              <Route element={<RedirectAdminToDashboard><PublicLayout /></RedirectAdminToDashboard>}>
                <Route path="/" element={<Home />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/shop/:category" element={<CategoryStore />} />
                <Route path="/about" element={<About />} />
                <Route path="/faq" element={<Faq />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/profile" element={<ClientRoute redirectTo="/profile"><Profile /></ClientRoute>} />
                <Route path="/wishlist" element={<ClientRoute redirectTo="/wishlist"><Wishlist /></ClientRoute>} />
                <Route path="/orders" element={<ClientRoute redirectTo="/orders"><Orders /></ClientRoute>} />
                <Route
                  path="/track-order"
                  element={
                    <ClientRoute redirectTo="/track-order">
                      <TrackOrder />
                    </ClientRoute>
                  }
                />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/checkout" element={<ClientRoute redirectTo="/checkout"><Checkout /></ClientRoute>} />
                <Route path="/payment/success" element={<PaymentSuccess />} />
                <Route path="/payment/failed" element={<PaymentFailed />} />
                <Route path="/terms" element={<PolicyPage />} />
                <Route path="/shipping" element={<PolicyPage />} />
                <Route path="/refund" element={<PolicyPage />} />
                <Route path="/privacy" element={<PolicyPage />} />
                <Route path="/copyright" element={<PolicyPage />} />
                {/* Product Details Route */}
                <Route path="/product/:id" element={<ProductPage />} />
              </Route>

              {/* Auth Pages (No Navbar) */}
              <Route path="/login" element={<RedirectAdminToDashboard><Login /></RedirectAdminToDashboard>} />
              <Route path="/register" element={<RedirectAdminToDashboard><Register /></RedirectAdminToDashboard>} />
              <Route path="/forgot-password" element={<RedirectAdminToDashboard><ForgotPassword /></RedirectAdminToDashboard>} />

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
                  </Suspense>
                    </CartProvider>
                    </WishlistProvider>
                  </ShippingProvider>
                </CustomerProvider>
              </OrderProvider>
          </ProductProvider>
            </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
