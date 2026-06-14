import { lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/LoginPage';
import './index.css';

// Lazy-load all protected pages — each page's JS is only downloaded on first visit
const DashboardPage       = lazy(() => import('./pages/DashboardPage'));
const DataEntryHubPage    = lazy(() => import('./pages/DataEntryHubPage'));
const DataEntryPage       = lazy(() => import('./pages/DataEntryPage'));
const ViableDataEntryPage = lazy(() => import('./pages/ViableDataEntryPage'));
const SurfaceSamplingPage = lazy(() => import('./pages/SurfaceSamplingPage'));
const RecordsPage         = lazy(() => import('./pages/RecordsPage'));
const AnalyticsPage       = lazy(() => import('./pages/AnalyticsPage'));
const UsersPage           = lazy(() => import('./pages/UsersPage'));

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* Protected — all authenticated users */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard"  element={<DashboardPage />} />
                <Route path="/data-entry" element={<DataEntryHubPage />} />
                <Route path="/data-entry/pm-excursion" element={<DataEntryPage />} />
                <Route path="/data-entry/viable"       element={<ViableDataEntryPage />} />
                <Route path="/data-entry/surface"      element={<SurfaceSamplingPage />} />
                <Route path="/records"    element={<RecordsPage />} />
                <Route path="/analytics"  element={<AnalyticsPage />} />

                {/* Admin only */}
                <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                  <Route path="/users" element={<UsersPage />} />
                </Route>
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>

        <Toaster
          position="top-right"
          toastOptions={{
            className: '!bg-white dark:!bg-surface-800 !text-surface-900 dark:!text-surface-100 !shadow-lg !rounded-xl !text-sm !border !border-surface-100 dark:!border-surface-700',
            duration: 3500,
          }}
        />
      </AuthProvider>
    </ThemeProvider>
  );
}
