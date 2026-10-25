import React, { useState, useEffect } from 'react';
import { api, getToken, clearToken, setToken, refreshSession, getTokenExpiry } from './lib/api';
import { User, NotificationItem } from './types';
import { Header } from './components/Header';
import { AiAssistantDrawer } from './components/AiAssistantDrawer';
import { NotificationModal } from './components/NotificationModal';
import { LoginView } from './views/LoginView';
import { AdminView } from './views/AdminView';
import { TeacherView } from './views/TeacherView';
import { StudentView } from './views/StudentView';
import { PlacementView } from './views/PlacementView';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [sessionWarning, setSessionWarning] = useState<{ minutesLeft: number } | null>(null);
  const [isRefreshingSession, setIsRefreshingSession] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isNotifsOpen, setIsNotifsOpen] = useState(false);

  // AI Assistant Drawer
  const [isAiOpen, setIsAiOpen] = useState(false);

  useEffect(() => {
    checkInitialAuth();
  }, []);

  const checkInitialAuth = async () => {
    let token = getToken();
    if (!token) {
      token = await refreshSession();
    }
    if (token) {
      try {
        const res = await api.getCurrentUser();
        if (res.user.must_reset_password) {
          clearToken();
          setCurrentUser(null);
        } else {
          setCurrentUser(res.user);
          loadNotifications(res.user);
        }
      } catch (err) {
        clearToken();
        setCurrentUser(null);
      }
    }
    setIsAuthChecking(false);
  };

  const loadNotifications = async (user: User) => {
    try {
      if (user.role === 'student') {
        const list = await api.getStudentNotifications();
        setNotifications(list);
      } else {
        // Institutional notices for faculty/admin
        setNotifications([
          {
            id: 'notif_faculty_1',
            title: 'End-Semester Internal Marks Submission Deadline',
            body: 'All faculty members must complete marks entry in the academic ledger before the 15th of this month.',
            target_role: 'all_teachers',
            created_at: new Date().toISOString(),
            is_read: false
          },
          {
            id: 'notif_faculty_2',
            title: 'Vission Academy Board of Studies Annual Meeting',
            body: 'Curriculum review and AI-grounded analytics evaluation agenda will be discussed in the central auditorium.',
            target_role: 'all',
            created_at: new Date().toISOString(),
            is_read: true
          }
        ]);
      }
    } catch (err) {
      console.warn('Could not load notices:', err);
    }
  };

  // Sync current path state with browser location
  const [currentPath, setCurrentPath] = useState<string>(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToRoleDashboard = (user: User) => {
    const defaultPath = `/${user.role}`;
    if (window.location.pathname !== defaultPath) {
      window.history.replaceState(null, '', defaultPath);
      setCurrentPath(defaultPath);
    }
  };

  useEffect(() => {
    if (currentUser) {
      const path = currentPath.toLowerCase();
      // Role enforcement check
      if (path.startsWith('/admin') && currentUser.role !== 'admin') {
        navigateToRoleDashboard(currentUser);
      } else if (path.startsWith('/teacher') && currentUser.role !== 'teacher') {
        navigateToRoleDashboard(currentUser);
      } else if (path.startsWith('/student') && currentUser.role !== 'student') {
        navigateToRoleDashboard(currentUser);
      } else if (path.startsWith('/placement') && currentUser.role !== 'placement') {
        navigateToRoleDashboard(currentUser);
      } else if (path === '/' || path === '/login') {
        navigateToRoleDashboard(currentUser);
      }
    }
  }, [currentUser, currentPath]);

  // Background session manager & pre-expiry monitor
  useEffect(() => {
    if (!currentUser) {
      setSessionWarning(null);
      return;
    }

    const checkExpiry = async () => {
      const expiry = getTokenExpiry();
      if (!expiry) return;

      const secondsLeft = Math.round((expiry - Date.now()) / 1000);

      // Silent refresh when <= 2 minutes left
      if (secondsLeft <= 120 && secondsLeft > 0) {
        const refreshed = await refreshSession();
        if (refreshed) {
          setSessionWarning(null);
          return;
        }
      }

      // If <= 5 minutes left and refresh failed/did not occur, show pre-expiry warning!
      if (secondsLeft <= 300 && secondsLeft > 0) {
        setSessionWarning({ minutesLeft: Math.max(1, Math.ceil(secondsLeft / 60)) });
      } else if (secondsLeft <= 0) {
        // Expired completely
        clearToken();
        setCurrentUser(null);
        setSessionWarning(null);
      } else {
        setSessionWarning(null);
      }
    };

    const interval = setInterval(checkExpiry, 15000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const handleStaySignedIn = async () => {
    setIsRefreshingSession(true);
    try {
      const refreshed = await refreshSession();
      if (refreshed) {
        setSessionWarning(null);
      } else {
        alert('Session could not be extended. Please save your work and sign in again.');
      }
    } finally {
      setIsRefreshingSession(false);
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setCurrentUser(null);
    setSessionWarning(null);
    window.history.pushState(null, '', '/login');
    setCurrentPath('/login');
  };

  const handleMarkNoticeRead = async (id: string) => {
    if (currentUser?.role === 'student') {
      await api.markNotificationRead(id);
    }
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleMarkAllNoticesRead = async () => {
    if (currentUser?.role === 'student') {
      await api.markAllNotificationsRead();
    }
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center text-slate-700">
        <div className="w-12 h-12 rounded-xl bg-[#0f2744] text-amber-400 flex items-center justify-center font-serif font-bold text-xl mb-3 animate-pulse">
          VA
        </div>
        <p className="font-serif font-bold text-sm text-[#0f2744]">VISION ACADEMY</p>
        <p className="text-xs text-slate-500 mt-1">Connecting to Academic Core...</p>
      </div>
    );
  }

  if (!currentUser) {
    if (window.location.pathname !== '/login') {
      window.history.replaceState(null, '', '/login');
    }
    return <LoginView onLoginSuccess={(user) => {
      setCurrentUser(user);
      loadNotifications(user);
      navigateToRoleDashboard(user);
    }} />;
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const renderRoleView = () => {
    const path = currentPath.toLowerCase();

    if (path.startsWith('/admin')) {
      return currentUser.role === 'admin' ? <AdminView /> : null;
    }
    if (path.startsWith('/teacher')) {
      return currentUser.role === 'teacher' ? <TeacherView /> : null;
    }
    if (path.startsWith('/student')) {
      return currentUser.role === 'student' ? <StudentView /> : null;
    }
    if (path.startsWith('/placement')) {
      return currentUser.role === 'placement' ? <PlacementView /> : null;
    }

    // Default fallback to user's assigned role view
    switch (currentUser.role) {
      case 'admin': return <AdminView />;
      case 'teacher': return <TeacherView />;
      case 'student': return <StudentView />;
      case 'placement': return <PlacementView />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col selection:bg-amber-200 selection:text-amber-950 font-sans">
      {/* Top Header */}
      <Header
        user={currentUser}
        onLogout={handleLogout}
        onOpenAi={() => setIsAiOpen(true)}
        onOpenNotifs={() => setIsNotifsOpen(true)}
        unreadNotifsCount={unreadCount}
      />

      {/* Accessible Pre-Expiry Session Warning Banner */}
      {sessionWarning && (
        <div
          role="alert"
          aria-live="assertive"
          className="bg-amber-500 text-amber-950 px-4 py-2.5 flex items-center justify-between text-xs font-semibold shadow-md border-b border-amber-600 sticky top-0 z-50 animate-bounce-subtle"
        >
          <div className="flex items-center space-x-2">
            <span className="text-base" aria-hidden="true">⏳</span>
            <span>
              Your session expires in {sessionWarning.minutesLeft} minute{sessionWarning.minutesLeft > 1 ? 's' : ''}. Unsaved marks or form inputs may be lost.
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleStaySignedIn}
              disabled={isRefreshingSession}
              className="bg-amber-950 hover:bg-black text-amber-100 px-3 py-1.5 rounded font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              {isRefreshingSession ? 'Extending...' : 'Stay Signed In'}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="bg-amber-600/30 hover:bg-amber-600/50 text-amber-950 px-2.5 py-1.5 rounded transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Main View Area by Role */}
      <main className="flex-1">
        {renderRoleView()}
      </main>

      {/* Grounded AI Assistant Drawer */}
      <AiAssistantDrawer
        isOpen={isAiOpen}
        onClose={() => setIsAiOpen(false)}
        user={currentUser}
      />

      {/* Campus Notifications Modal */}
      <NotificationModal
        isOpen={isNotifsOpen}
        onClose={() => setIsNotifsOpen(false)}
        notifications={notifications}
        onMarkRead={handleMarkNoticeRead}
        onMarkAllRead={handleMarkAllNoticesRead}
      />

      {/* Official Institutional Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-[11px] text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© 2026 Vission Academy of Engineering & Technology. Academic Information System.</p>
          <div className="flex items-center space-x-4">
            <span>Institutional Key Vault: Active</span>
            <span>•</span>
            <span>PostgreSQL & Node.js Architecture</span>
            <span>•</span>
            <span className="text-emerald-700 font-semibold">RBAC Scopes Enforced</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
