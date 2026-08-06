import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Shop from './h5/Shop';
import ProductDetail from './h5/ProductDetail';
import Checkout from './h5/Checkout';
import OrderStatus from './h5/OrderStatus';
import OrderHistory from './h5/OrderHistory';
import AdminApp from './admin/AdminApp';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Shop />} />
        <Route path="/product/:id" element={<ProductDetail />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/order/:id" element={<OrderStatus />} />
        <Route path="/orders" element={<OrderHistory />} />
        <Route path="/admin/*" element={<AdminApp />} />
      </Routes>
    </BrowserRouter>
  );
}
