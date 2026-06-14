import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { Suspense, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { clsx } from '../lib/utils';

function PageFallback() {
  return (
    <div className="flex-1 p-6 space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-surface-100 dark:bg-surface-800 rounded-xl" />
      <div className="h-4 w-72 bg-surface-100 dark:bg-surface-800 rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-surface-100 dark:bg-surface-800 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':  'Dashboard',
  '/data-entry': 'Data Entry',
  '/records':    'Records',
  '/analytics':  'Analytics',
  '/users':      'User Management',
};

export default function AppLayout() {
  const [mobileSidebarOpen, setMobile] = useState(false);
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] ?? '';

  return (
    <div className="flex h-screen overflow-hidden bg-surface-50 dark:bg-surface-950">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex h-full shrink-0">
        <Sidebar />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-surface-900/50 backdrop-blur-sm z-30 md:hidden"
            onClick={() => setMobile(false)}
          />
          <div className="fixed left-0 top-0 h-full z-40 md:hidden animate-slide-in-right" style={{ animationName: 'slideInLeft' }}>
            <style>{`@keyframes slideInLeft{from{transform:translateX(-100%);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
            <Sidebar />
          </div>
        </>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-surface-900 border-b border-surface-100 dark:border-surface-800 shrink-0">
          <button
            onClick={() => setMobile(v => !v)}
            className="btn-ghost p-1.5 rounded-xl"
          >
            {mobileSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="text-sm font-semibold text-surface-800 dark:text-white">{title}</span>
          <div className="w-8" />
        </header>

        {/* Page */}
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
