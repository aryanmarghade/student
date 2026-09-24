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
  const [selectedYear, setSelectedYear] = useState<string>('All');
  
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
              <h3 className="text-lg font-bold text-slate-900 mb-4">CGPA Distribution (Year-wise)</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-semibold text-slate-500 mb-2">Average CGPA per Year</h4>
                  <div className="flex flex-col gap-3">
                    {dashboardData.yearWiseData?.map((yd: any) => (
                      <div key={yd.year} className="flex items-center gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div className="w-16 font-bold text-slate-700">Year {yd.year}</div>
                        <div className="flex-1">
                          <div className="w-full bg-slate-200 rounded-full h-2.5">
                            <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: `${(yd.avgCgpa / 10) * 100}%` }}></div>
                          </div>
                        </div>
                        <div className="w-16 text-right font-semibold text-emerald-700">{yd.avgCgpa.toFixed(2)}</div>
                        <div className="w-24 text-xs text-slate-500 text-right">{yd.total} students</div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className="text-sm font-semibold text-slate-500 mb-2">Average CGPA by Class</h4>
                  <div className="space-y-4">
                    {dashboardData.classWiseData?.map((cwd: any) => (
                      <div key={cwd.year} className="bg-white border border-slate-100 rounded-lg p-3">
                        <h5 className="font-semibold text-slate-800 text-xs uppercase mb-2">Year {cwd.year}</h5>
                        <div className="flex flex-wrap gap-2">
                          {cwd.classes.map((c: any) => (
                            <div key={c.className} className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg flex-1 min-w-[120px]">
                              <div className="text-xs text-slate-500">{c.className}</div>
                              <div className="font-bold text-emerald-700">{c.avgCgpa.toFixed(2)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
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
              <div className="flex items-center gap-4">
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="All">All Years</option>
                  <option value="1">1st Year</option>
                  <option value="2">2nd Year</option>
                  <option value="3">3rd Year</option>
                  <option value="4">4th Year</option>
                </select>
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
                    <th className="p-4 font-semibold">Links</th>
                    <th className="p-4 font-semibold">Projects</th>
                    <th className="p-4 font-semibold">Posts</th>
                    <th className="p-4 font-semibold">AI Score</th>
                    <th className="p-4 font-semibold">Resume</th>
                    <th className="p-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {dashboardData?.students
                    ?.filter((s: any) => selectedYear === 'All' || String(s.classYear) === selectedYear)
                    ?.filter((s: any) => s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || s.roll_number.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((s: any) => (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-medium text-slate-900">{s.roll_number}</td>
                      <td className="p-4 text-slate-700">{s.full_name}</td>
                      <td className="p-4 text-slate-500">{s.className || 'Unknown'}</td>
                      <td className="p-4 font-semibold text-emerald-600">
                        {s.cgpa ? Number(s.cgpa).toFixed(2) : (s.academicHistory?.currentCgpa ? s.academicHistory.currentCgpa.toFixed(2) : 'N/A')}
                      </td>
                      <td className="p-4">
                        {s.academicHistory?.totalActiveBacklogs > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-700 text-xs font-semibold">
                            <AlertCircle className="w-3 h-3" />
                            {s.academicHistory.totalActiveBacklogs}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-sm">None</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          {s.github_url && <a href={s.github_url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">GitHub</a>}
                          {s.hackerrank_url && <a href={s.hackerrank_url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">HackerRank</a>}
                          {s.linkedin_url && <a href={s.linkedin_url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">LinkedIn</a>}
                        </div>
                      </td>
                      <td className="p-4 text-slate-700">{s.projects_count || 0}</td>
                      <td className="p-4 text-slate-700">{s.posts_count || 0}</td>
                      <td className="p-4 text-slate-700 font-semibold">{s.ai_score || 0}%</td>
                      <td className="p-4">
                        {s.resume_url ? (
                          <a href={s.resume_url} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline text-sm font-medium">View Resume</a>
                        ) : (
                          <span className="text-slate-400 text-sm">No Resume</span>
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
                  {(!dashboardData?.students || dashboardData.students.length === 0) && (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-slate-500">
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
                        <span>{sem.semesterName || `Semester ${sem.semesterId}`}</span>
                        <div className="flex items-center gap-4 text-sm">
                          <span>Percentage: {sem.percentage.toFixed(1)}%</span>
                          {sem.sgpa && <span className="text-emerald-700">SGPA: {sem.sgpa.toFixed(2)}</span>}
                          {sem.cgpa && <span className="text-blue-700">CGPA: {sem.cgpa.toFixed(2)}</span>}
                        </div>
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
