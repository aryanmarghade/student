import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { User } from '../types';
import {
  Users,
  Search,
  BookOpen,
  GraduationCap,
  Briefcase,
  AlertCircle
} from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import '../lib/chart-setup';

export const PlacementView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'students'>('dashboard');
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Student Profile Modal
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setIsLoading(true);
    try {
      const res = await api.getPlacementDashboard();
      setDashboardData(res);
    } catch (err) {
      console.error('Failed to load placement dashboard', err);
    } finally {
      setIsLoading(false);
    }
  };

  const openStudentProfile = async (studentId: string) => {
    setIsProfileLoading(true);
    try {
      const data = await api.getStudentFullProfileForPlacement(studentId);
      setSelectedStudent(data);
    } catch (err) {
      console.error('Failed to load profile', err);
    } finally {
      setIsProfileLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        Loading Placement Data...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900 flex items-center gap-2">
            <Briefcase className="w-7 h-7 text-emerald-600" />
            Placement Office Dashboard
          </h1>
          <p className="text-slate-500 mt-1">
            Access to academic records and student performance analytics
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-white p-1 rounded-xl shadow-sm border border-slate-100 w-fit">
        {[
          { id: 'dashboard', label: 'Overview', icon: BookOpen },
          { id: 'students', label: 'Academic Records', icon: Users },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-emerald-50 text-emerald-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'dashboard' && dashboardData && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <p className="text-sm font-semibold text-slate-500">Total Students</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{dashboardData.totalStudents}</p>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <p className="text-sm font-semibold text-slate-500">Eligible (No Backlogs)</p>
                <p className="text-3xl font-bold text-emerald-600 mt-2">{dashboardData.studentsNoBacklogs}</p>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <p className="text-sm font-semibold text-slate-500">Active Backlogs</p>
                <p className="text-3xl font-bold text-red-600 mt-2">{dashboardData.studentsWithBacklogs}</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 mb-4">CGPA Distribution</h3>
              <div className="h-64">
                {/* Simplified placeholder chart for CGPA ranges */}
                <div className="flex h-full items-end justify-around gap-2 pb-6">
                  {Object.entries(dashboardData.cgpaDistribution || {}).map(([range, count]: [string, any]) => (
                    <div key={range} className="flex flex-col items-center flex-1">
                      <div 
                        className="w-full bg-emerald-500 rounded-t-sm" 
                        style={{ height: `${(count / dashboardData.totalStudents) * 100}%`, minHeight: '20px' }}
                      />
                      <span className="text-xs text-slate-500 mt-2">{range}</span>
                      <span className="font-bold text-slate-700">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'students' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-emerald-600" />
                Student Academic Profiles
              </h3>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search students..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-64"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                    <th className="p-4 font-semibold">Roll No</th>
                    <th className="p-4 font-semibold">Name</th>
                    <th className="p-4 font-semibold">Class</th>
                    <th className="p-4 font-semibold">CGPA</th>
                    <th className="p-4 font-semibold">Backlogs</th>
                    <th className="p-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {dashboardData?.recentStudents
                    ?.filter((s: any) => s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || s.roll_number.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((s: any) => (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-medium text-slate-900">{s.roll_number}</td>
                      <td className="p-4 text-slate-700">{s.full_name}</td>
                      <td className="p-4 text-slate-500">{s.className || 'Unknown'}</td>
                      <td className="p-4 font-semibold text-emerald-600">
                        {s.cgpa ? Number(s.cgpa).toFixed(2) : 'N/A'}
                      </td>
                      <td className="p-4">
                        {s.active_backlogs > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-700 text-xs font-semibold">
                            <AlertCircle className="w-3 h-3" />
                            {s.active_backlogs}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-sm">None</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => openStudentProfile(s.id)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                        >
                          View Profile
                        </button>
                      </td>
                    </tr>
                  ))}
                  {dashboardData?.recentStudents?.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">
                        No students found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Student Profile Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col my-8">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{selectedStudent.full_name}</h2>
                <p className="text-sm text-slate-500">Roll: {selectedStudent.roll_number} • {selectedStudent.className}</p>
              </div>
              <button 
                onClick={() => setSelectedStudent(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              
              <div className="bg-emerald-50 text-emerald-900 p-4 rounded-xl flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold opacity-80">Current CGPA</p>
                  <p className="text-3xl font-bold">{selectedStudent.academicHistory?.currentCgpa?.toFixed(2) || 'N/A'}</p>
                </div>
                <div className="w-px h-12 bg-emerald-200" />
                <div className="flex-1 pl-4">
                  <p className="text-sm font-semibold opacity-80">Active Backlogs</p>
                  <p className="text-3xl font-bold text-red-600">{selectedStudent.academicHistory?.totalActiveBacklogs || 0}</p>
                </div>
              </div>

              {selectedStudent.academicHistory?.semesters?.length > 0 ? (
                <div className="space-y-4">
                  <h3 className="font-bold text-slate-900">Academic History</h3>
                  {selectedStudent.academicHistory.semesters.map((sem: any, i: number) => (
                    <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 p-3 border-b border-slate-200 font-semibold text-slate-800 flex justify-between">
                        <span>{sem.semesterId}</span>
                        <span>Percentage: {sem.percentage.toFixed(1)}%</span>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-white text-slate-500 text-left">
                            <th className="p-2 pl-4">Subject</th>
                            <th className="p-2 text-right">Marks</th>
                            <th className="p-2 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sem.subjects.map((sub: any, j: number) => (
                            <tr key={j}>
                              <td className="p-2 pl-4 text-slate-700">{sub.subjectName}</td>
                              <td className="p-2 text-right font-medium">{sub.obtained}/{sub.max}</td>
                              <td className="p-2 text-right">
                                {sub.status === 'Pass' ? (
                                  <span className="text-emerald-600 font-semibold text-xs bg-emerald-50 px-2 py-1 rounded">Pass</span>
                                ) : (
                                  <span className="text-red-600 font-semibold text-xs bg-red-50 px-2 py-1 rounded">Fail</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-8 bg-slate-50 rounded-xl border border-slate-100 text-slate-500">
                  No academic history found for this student.
                </div>
              )}
              
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
