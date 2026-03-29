import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import BillingDashboard from './components/BillingDashboard.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 overflow-auto">
          <main className="max-w-5xl mx-auto px-8 py-8">
            <Routes>
              <Route path="/" element={<BillingDashboard />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
