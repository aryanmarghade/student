import React from 'react';
import { User } from '../types';
import { ShieldCheck, GraduationCap, BookOpen, Bell, Sparkles, LogOut } from 'lucide-react';

interface HeaderProps {
  user: User;
  onLogout: () => void;
  onOpenAi: () => void;
  onOpenNotifs: () => void;
  unreadNotifsCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  onLogout,
  onOpenAi,
  onOpenNotifs,
  unreadNotifsCount = 0,
}) => {
  return (
    <header className="bg-[var(--color-primary)] text-white shadow-md border-b border-[var(--color-border-dark)] sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Name */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--color-accent)] text-white flex items-center justify-center font-serif font-bold text-xl shadow-inner border border-amber-300/30">
              VA
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-serif tracking-wider font-bold text-lg text-white">VISSION ACADEMY</span>
                <span className="text-[10px] uppercase font-semibold tracking-widest px-2 py-0.5 rounded bg-[var(--color-accent)]/20 text-amber-200 border border-[var(--color-accent)]/40">
                  Est. 1988
                </span>
              </div>
              <p className="text-xs text-slate-300 tracking-wide hidden sm:block">
                Academic Information & Analytics Platform
              </p>
            </div>
          </div>

          {/* Right Action Items */}
          <div className="flex items-center space-x-3">
            {/* AI Assistant Button */}
            <button
              onClick={onOpenAi}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-[var(--color-accent)] to-[#b08d3b] hover:from-[#b08d3b] hover:to-[var(--color-accent)] text-white shadow-sm border border-amber-300/30 transition-all hover:scale-102 cursor-pointer"
              title="Open Grounded Academic AI Assistant"
            >
              <Sparkles className="w-4 h-4 text-amber-200 animate-pulse" />
              <span className="hidden sm:inline">Academic AI</span>
            </button>

            {/* Notifications Bell */}
            <button
              onClick={onOpenNotifs}
              className="relative p-2 text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-lg transition-colors cursor-pointer"
              title="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadNotifsCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce">
                  {unreadNotifsCount}
                </span>
              )}
            </button>

            {/* User Profile Badge */}
            <div className="flex items-center space-x-2.5 pl-2 border-l border-slate-700">
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white border border-slate-600">
                {user.role === 'admin' ? (
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                ) : user.role === 'teacher' ? (
                  <BookOpen className="w-4 h-4 text-sky-400" />
                ) : (
                  <GraduationCap className="w-4 h-4 text-emerald-400" />
                )}
              </div>
              <div className="hidden lg:block text-left text-xs leading-tight">
                <p className="font-semibold text-white max-w-[140px] truncate">{user.full_name}</p>
                <p className="text-slate-400 capitalize flex items-center gap-1">
                  {user.role === 'admin' && 'System Admin'}
                  {user.role === 'teacher' && 'Faculty Member'}
                  {user.role === 'student' && `Student (${user.roll_number || 'Enrolled'})`}
                </p>
              </div>

              {/* Logout Button */}
              <button
                onClick={onLogout}
                className="p-1.5 text-slate-400 hover:text-red-300 hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
