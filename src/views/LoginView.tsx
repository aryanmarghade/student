import React, { useState } from 'react';
import { api, setToken } from '../lib/api';
import { User } from '../types';
import { Lock, Mail, ArrowRight, AlertCircle, Eye, EyeOff, ShieldCheck, HelpCircle, GraduationCap, Sparkles, BookOpen, Layers } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: (user: User) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Forced password reset state
  const [mustReset, setMustReset] = useState(false);
  const [currentPasswordForReset, setCurrentPasswordForReset] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      const res = await api.login(email.trim(), password);
      setToken(res.token);

      if (res.user.must_reset_password) {
        setMustReset(true);
        setCurrentPasswordForReset(password);
      } else {
        onLoginSuccess(res.user);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');

    if (newPassword.length < 8) {
      setResetError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetError('New password and confirmation do not match.');
      return;
    }

    setIsResetting(true);
    try {
      const res = await api.resetFirstLoginPassword(newPassword);
      setMustReset(false);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setResetError(err.message || 'Failed to update password.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center">
      <div className="w-full max-w-5xl mx-auto my-auto p-4 sm:p-6 lg:p-8">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[580px]">
          {/* Left Column: Authentic Credentials Sign In */}
          <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-between">
            <div>
              {/* Mobile Monogram Header */}
              <div className="flex items-center gap-3 mb-6 lg:hidden">
                <div className="w-10 h-10 rounded-xl bg-[#0f2744] text-amber-400 flex items-center justify-center font-serif font-bold text-xl shadow-xs">
                  VA
                </div>
                <div>
                  <h2 className="text-base font-serif font-bold text-[#0f2744]">VISSION ACADEMY</h2>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">Academic Portal</p>
                </div>
              </div>

              <div className="mb-6">
                <h1 className="text-xl sm:text-2xl font-serif font-bold text-slate-900 tracking-tight">
                  Institutional Portal Login
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Enter your assigned academic email and password to access your workspace.
                </p>
              </div>

              {errorMessage && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700 animate-fade-in">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Institutional Email Address
                  </label>
                  <div className="relative rounded-lg shadow-2xs">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Mail className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@vissionacademy.edu"
                      className="block w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0f2744] focus:border-transparent bg-slate-50 text-slate-900 placeholder:text-slate-400 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Account Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowHelpModal(true)}
                      className="text-xs text-[#0f2744] hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative rounded-lg shadow-2xs">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Lock className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="block w-full pl-10 pr-10 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0f2744] focus:border-transparent bg-slate-50 text-slate-900 placeholder:text-slate-400 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-slate-300 text-[#0f2744] focus:ring-[#0f2744] w-4 h-4"
                    />
                    Remember this session
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowHelpModal(true)}
                    className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
                  >
                    <HelpCircle className="w-3.5 h-3.5" /> Support
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-[#0f2744] hover:bg-[#163354] transition-all disabled:opacity-50 cursor-pointer mt-3"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      Authenticating...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Sign In to Academic Portal <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </button>
              </form>

              <div className="mt-5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                <p className="font-medium text-slate-800">New or unverified account?</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Use your Vission Academy account. Contact your administrator if you don't have one or require an initial password reset.
                </p>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Enterprise Role-Based Access Control
              </span>
              <span>Secure Session</span>
            </div>
          </div>

          {/* Right Column: Institutional Identity & Architecture Panel */}
          <div className="lg:col-span-5 bg-[#0f2744] text-white p-8 sm:p-10 flex flex-col justify-between relative overflow-hidden">
            {/* Background Accent Gradients */}
            <div className="absolute -top-24 -right-24 w-72 h-72 bg-sky-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20 text-amber-400 flex items-center justify-center font-serif font-bold text-2xl shadow-lg mb-6">
                VA
              </div>

              <h2 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-white leading-tight">
                VISSION ACADEMY
              </h2>
              <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mt-1">
                Student Record & Academic Analytics Engine
              </p>

              <p className="text-xs text-slate-300 mt-4 leading-relaxed">
                Institutional record-keeping and predictive analytics platform for higher education governance, faculty assessment ledgers, and student portfolio showcases.
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-white/10 text-sky-300 shrink-0 mt-0.5">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">Three-Tier Strict RBAC</h3>
                    <p className="text-[11px] text-slate-300 leading-normal">
                      Hard-isolated scopes for System Administrators, Subject Faculty, and Verified Students.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-white/10 text-amber-300 shrink-0 mt-0.5">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">Academic Ledger & Analytics</h3>
                    <p className="text-[11px] text-slate-300 leading-normal">
                      Spreadsheet mark entry, batch Excel imports, Linear Regression projection, and official marksheets.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-white/10 text-emerald-300 shrink-0 mt-0.5">
                    <GraduationCap className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">Comprehensive Student Showcase</h3>
                    <p className="text-[11px] text-slate-300 leading-normal">
                      Profile strength score, project portfolios, verifiable certificates, hackathons, and documents vault.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative z-10 mt-8 pt-6 border-t border-white/10 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Academic Ridge Campus</span>
              <span>AY 2025–2026</span>
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-500 mt-4">
          Vission Academy Academic Record System. All logins and academic modifications are logged for institutional audit.
        </p>
      </div>

      {/* Mandatory Password Reset Modal */}
      {mustReset && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-amber-100 text-amber-800">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Mandatory Password Setup</h3>
                <p className="text-xs text-slate-500">First-time login credential initialization</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Your account administrator has required a secure password change before you can access the academic portal.
            </p>

            {resetError && (
              <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{resetError}</span>
              </div>
            )}

            <form onSubmit={handlePasswordResetSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="submit"
                  disabled={isResetting}
                  className="px-4 py-2 bg-[#0f2744] text-white text-xs font-semibold rounded-lg hover:bg-[#163354] disabled:opacity-50 cursor-pointer"
                >
                  {isResetting ? 'Saving Password...' : 'Save & Enter Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Help / Password Recovery Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-[#0f2744] text-amber-400">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Institutional Access Support</h3>
                <p className="text-xs text-slate-500">Vission Academy Credentials Helpdesk</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p>
                <strong>Students & Faculty:</strong> Institutional login credentials are provided during registration and onboarding.
              </p>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                <p className="font-semibold text-slate-800">Need a password reset or account activation?</p>
                <p>Please contact your department coordinator or the Registrar's Office with your official roll number or employee ID.</p>
                <p className="text-slate-500 pt-1">
                  Email: <span className="font-mono text-slate-700">admin@vissionacademy.edu</span><br />
                  Office: Administration Block, Room 104 (Mon–Fri 8:30 AM – 5:00 PM)
                </p>
              </div>
              <p>
                <strong>Initial Administrator Credentials:</strong> The default administrator account is configured with <span className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-800">admin@vissionacademy.edu</span> / <span className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-800">admin123</span>.
              </p>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-2 bg-[#0f2744] text-white rounded-lg text-xs font-medium hover:bg-[#163354] transition-colors cursor-pointer"
              >
                Close Support Notice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

