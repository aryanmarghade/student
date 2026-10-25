import React, { useState, useEffect } from 'react';
import { api, sanitizeUrl } from '../lib/api';
import { User } from '../types';
import {
  Users,
  Search,
  BookOpen,
  GraduationCap,
  Briefcase,
  AlertCircle,
  Globe,
  ExternalLink,
  Code2,
  Trophy,
  Sparkles,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import '../lib/chart-setup';
import { RoleReadinessEvaluation } from '../types';

export const PlacementView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'students'>('dashboard');
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('All');
  
  // Student Profile Modal
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [targetRole, setTargetRole] = useState<string>('Software Engineer');
  const [isMatchingRole, setIsMatchingRole] = useState(false);
  const [roleMatchResult, setRoleMatchResult] = useState<RoleReadinessEvaluation | null>(null);
  const [roleMatchError, setRoleMatchError] = useState<string | null>(null);

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
    setRoleMatchResult(null);
    setRoleMatchError(null);
    try {
      const data = await api.getStudentFullProfileForPlacement(studentId);
      setSelectedStudent(data);
    } catch (err) {
      console.error('Failed to load profile', err);
    } finally {
      setIsProfileLoading(false);
    }
  };

  const handleEvaluateRole = async (studentId: string, role: string) => {
    setIsMatchingRole(true);
    setRoleMatchError(null);
    try {
      const result = await api.matchPlacementRole(studentId, role);
      setRoleMatchResult(result);
    } catch (err: any) {
      setRoleMatchError(err.message || 'Failed to evaluate candidate role readiness');
    } finally {
      setIsMatchingRole(false);
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
                <p className="text-3xl font-bold text-slate-900 mt-2">{dashboardData.summary?.totalStudents ?? dashboardData.students?.length ?? 0}</p>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <p className="text-sm font-semibold text-slate-500">Eligible (No Backlogs)</p>
                <p className="text-3xl font-bold text-emerald-600 mt-2">{dashboardData.summary?.studentsWith0Backlogs ?? 0}</p>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <p className="text-sm font-semibold text-slate-500">Active Backlogs</p>
                <p className="text-3xl font-bold text-red-600 mt-2">{dashboardData.summary?.studentsWithCurrentBacklogs ?? 0}</p>
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
                  {(() => {
                    const filtered = dashboardData?.students
                      ?.filter((s: any) => selectedYear === 'All' || String(s.classYear) === selectedYear)
                      ?.filter((s: any) => {
                        if (!searchQuery) return true;
                        const q = searchQuery.toLowerCase().trim();
                        const nameMatch = (s.full_name || '').toLowerCase().includes(q);
                        const rollMatch = (s.roll_number || '').toLowerCase().includes(q);
                        return nameMatch || rollMatch;
                      }) || [];

                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan={11} className="p-8 text-center text-slate-500">
                            No students match the current filters.
                          </td>
                        </tr>
                      );
                    }

                    return filtered.map((s: any) => (
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
                            {s.github_url && <a href={sanitizeUrl(s.github_url)} target="_blank" rel="noreferrer" className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-semibold text-xs hover:bg-slate-200">GitHub</a>}
                            {s.leetcode_url && <a href={sanitizeUrl(s.leetcode_url)} target="_blank" rel="noreferrer" className="px-2 py-0.5 bg-amber-50 text-amber-800 rounded font-semibold text-xs hover:bg-amber-100 border border-amber-200">LeetCode</a>}
                            {s.hackerrank_url && <a href={sanitizeUrl(s.hackerrank_url)} target="_blank" rel="noreferrer" className="px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded font-semibold text-xs hover:bg-emerald-100 border border-emerald-200">HackerRank</a>}
                            {s.linkedin_url && <a href={sanitizeUrl(s.linkedin_url)} target="_blank" rel="noreferrer" className="px-2 py-0.5 bg-blue-50 text-blue-800 rounded font-semibold text-xs hover:bg-blue-100 border border-blue-200">LinkedIn</a>}
                          </div>
                        </td>
                        <td className="p-4 text-slate-700">{s.projects_count || 0}</td>
                        <td className="p-4 text-slate-700">{s.posts_count || 0}</td>
                        <td className="p-4 text-slate-700 font-semibold">{s.ai_score || 0}%</td>
                        <td className="p-4">
                          {s.resume_url ? (
                            <a href={sanitizeUrl(s.resume_url)} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline text-sm font-medium">View Resume</a>
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
                    ));
                  })()}
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
              
              {/* Academic Overview Header (if enabled) */}
              {selectedStudent.academicHistory && (
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
              )}

              {/* External Profiles & Coding Platform Badges */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#0f2744]" /> External Profiles & Technical Platforms
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {selectedStudent.github_url !== null && (
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <p className="text-[10px] uppercase font-bold text-slate-500">GitHub</p>
                      <p className="font-semibold text-xs text-slate-800 mt-1">
                        {selectedStudent.github_data?.public_repos !== undefined ? `${selectedStudent.github_data.public_repos} Repos (${selectedStudent.github_data.stars ?? 0}★)` : (selectedStudent.github_url ? 'Linked' : 'Not linked')}
                      </p>
                      {selectedStudent.github_url && (
                        <a href={sanitizeUrl(selectedStudent.github_url)} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 hover:underline font-medium block mt-1">
                          View GitHub →
                        </a>
                      )}
                    </div>
                  )}

                  {selectedStudent.leetcode_url !== null && (
                    <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-200">
                      <p className="text-[10px] uppercase font-bold text-amber-900 flex items-center justify-between">
                        <span>LeetCode</span>
                        {selectedStudent.leetcode_data?.ranking && (
                          <span className="text-[9px] text-amber-700 font-mono">Rank #{selectedStudent.leetcode_data.ranking.toLocaleString()}</span>
                        )}
                      </p>
                      <p className="font-semibold text-xs text-amber-950 mt-1">
                        {selectedStudent.leetcode_data?.totalSolved !== undefined ? `${selectedStudent.leetcode_data.totalSolved} Solved` : (selectedStudent.leetcode_url ? 'Linked' : 'Not linked')}
                      </p>
                      {selectedStudent.leetcode_data?.totalSolved !== undefined && (
                        <p className="text-[10px] text-amber-800 mt-0.5 font-mono">
                          E: {selectedStudent.leetcode_data.easySolved || 0} | M: {selectedStudent.leetcode_data.mediumSolved || 0} | H: {selectedStudent.leetcode_data.hardSolved || 0}
                        </p>
                      )}
                      {selectedStudent.leetcode_url && (
                        <a href={sanitizeUrl(selectedStudent.leetcode_url)} target="_blank" rel="noreferrer" className="text-[11px] text-amber-700 hover:underline font-medium block mt-1">
                          View LeetCode →
                        </a>
                      )}
                    </div>
                  )}

                  {selectedStudent.hackerrank_url !== null && (
                    <div className="p-3 bg-emerald-50/60 rounded-lg border border-emerald-200">
                      <p className="text-[10px] uppercase font-bold text-emerald-900 flex items-center justify-between">
                        <span>HackerRank</span>
                        {selectedStudent.hackerrank_data?.badges_count ? (
                          <span className="text-[9px] text-emerald-700 font-mono">{selectedStudent.hackerrank_data.badges_count} Badges</span>
                        ) : null}
                      </p>
                      <p className="font-semibold text-xs text-emerald-950 mt-1">
                        {selectedStudent.hackerrank_data?.verified_skills?.length > 0 ? `${selectedStudent.hackerrank_data.verified_skills.length} Skills Verified` : (selectedStudent.hackerrank_url ? 'Profile Linked' : 'Not linked')}
                      </p>
                      {selectedStudent.hackerrank_url && (
                        <a href={sanitizeUrl(selectedStudent.hackerrank_url)} target="_blank" rel="noreferrer" className="text-[11px] text-emerald-700 hover:underline font-medium block mt-1">
                          View HackerRank →
                        </a>
                      )}
                    </div>
                  )}

                  {selectedStudent.linkedin_url !== null && (
                    <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-200">
                      <p className="text-[10px] uppercase font-bold text-blue-900">LinkedIn</p>
                      <p className="font-semibold text-xs text-blue-950 mt-1">
                        {selectedStudent.linkedin_url ? 'Profile Linked' : 'Not linked'}
                      </p>
                      {selectedStudent.linkedin_url && (
                        <a href={sanitizeUrl(selectedStudent.linkedin_url)} target="_blank" rel="noreferrer" className="text-[11px] text-blue-700 hover:underline font-medium block mt-1">
                          View LinkedIn →
                        </a>
                      )}
                    </div>
                  )}
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
              ) : null}
              
              {/* Projects Section */}
              {selectedStudent.projects?.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-emerald-600" /> Student Projects ({selectedStudent.projects.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedStudent.projects.map((proj: any) => (
                      <div key={proj.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-slate-900 text-xs">{proj.title}</h4>
                          {proj.github_url && (
                            <a href={sanitizeUrl(proj.github_url)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-[11px] flex items-center gap-1 font-medium">
                              Code <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        <p className="text-slate-600 text-xs line-clamp-2">{proj.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hackathons & Competitions */}
              {selectedStudent.hackathons?.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-amber-600" /> Hackathons & Competitions ({selectedStudent.hackathons.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedStudent.hackathons.map((h: any) => (
                      <div key={h.id} className="p-3 bg-amber-50/40 border border-amber-200 rounded-xl space-y-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-slate-900 text-xs">{h.title || h.event_name}</h4>
                          {h.position && <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">{h.position}</span>}
                        </div>
                        <p className="text-slate-600 text-xs">{h.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Uploaded Documents & Certificates */}
              {selectedStudent.documents?.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-blue-600" /> Documents & Certificates ({selectedStudent.documents.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedStudent.documents.map((doc: any) => (
                      <div key={doc.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                        <div className="truncate mr-2">
                          <p className="text-xs font-medium text-slate-900 truncate">{doc.title || doc.file_name || 'Document'}</p>
                          <p className="text-[10px] text-slate-500">{doc.category || doc.doc_type}</p>
                        </div>
                        <a href={sanitizeUrl(doc.file_url)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-600 hover:underline shrink-0">
                          View
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sports & Athletics Intelligence */}
              {selectedStudent.sports?.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-emerald-600" /> Sports & Athletics ({selectedStudent.sports.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedStudent.sports.map((sport: any) => (
                      <div key={sport.id} className="p-3 bg-emerald-50/40 border border-emerald-200 rounded-xl space-y-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-slate-900 text-xs">{sport.sport_name}</h4>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            sport.verification_status === 'Verified' ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {sport.verification_status === 'Verified' ? '✓ Verified' : 'Self-Reported'}
                          </span>
                        </div>
                        <p className="text-slate-600 text-xs">
                          {sport.competition_level} • {sport.participation_type} {sport.position ? `(${sport.position})` : ''}
                          {sport.team_role ? ` • ${sport.team_role}` : ''}
                        </p>
                        {sport.metrics && typeof sport.metrics === 'object' && Object.keys(sport.metrics).length > 0 && (
                          <div className="text-[10px] font-mono bg-white p-1.5 rounded border border-emerald-100 text-slate-700">
                            {Object.entries(sport.metrics).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                          </div>
                        )}
                        {sport.awards && <p className="text-[11px] font-semibold text-amber-800">🏆 {sport.awards}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Placement Role Readiness Matcher */}
              <div className="bg-slate-900 text-white p-5 rounded-xl space-y-4 border border-slate-800 shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-base flex items-center gap-2 text-emerald-400">
                      <Sparkles className="w-5 h-5 text-emerald-400" /> AI Candidate Role Readiness Matcher
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Evaluate candidate against target engineering roles with transparent, evidence-grounded requirement mapping.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={targetRole}
                      onChange={(e) => setTargetRole(e.target.value)}
                      className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="Software Engineer">Software Engineer (General)</option>
                      <option value="Full Stack Developer">Full Stack Developer</option>
                      <option value="Frontend Engineer">Frontend Engineer</option>
                      <option value="Backend Engineer">Backend Engineer</option>
                      <option value="Data Scientist">Data Scientist / ML Engineer</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleEvaluateRole(selectedStudent.id, targetRole)}
                      disabled={isMatchingRole}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      {isMatchingRole ? (
                        <span>Evaluating Evidence...</span>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" /> Evaluate Fit
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {roleMatchError && (
                  <div className="p-3 bg-red-900/40 border border-red-700/60 rounded-lg text-xs text-red-200">
                    {roleMatchError}
                  </div>
                )}

                {roleMatchResult && (
                  <div className="space-y-4 pt-3 border-t border-slate-800">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/60">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Target Role</div>
                        <div className="text-sm font-bold text-white mt-0.5">{roleMatchResult.role}</div>
                      </div>
                      <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/60">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Readiness Tier</div>
                        <div className="text-sm font-bold text-emerald-400 mt-0.5">{roleMatchResult.readinessTier.replace(/_/g, ' ')}</div>
                      </div>
                      <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/60">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Requirement Alignment</div>
                        <div className="text-sm font-bold text-sky-400 mt-0.5">{roleMatchResult.alignmentScore}% Met</div>
                      </div>
                    </div>

                    {/* Requirements Mapping */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Evidence-Mapped Requirements</h4>
                      <div className="space-y-2">
                        {roleMatchResult.requirements.map((req, idx) => (
                          <div key={idx} className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/40 space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-200">{req.requirement}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                                req.status === 'VERIFIED'
                                  ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                                  : req.status === 'SELF_REPORTED'
                                  ? 'bg-amber-900/60 text-amber-300 border border-amber-700/50'
                                  : 'bg-red-900/60 text-red-300 border border-red-700/50'
                              }`}>
                                {req.status}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400">{req.rationale}</p>
                            {req.citations.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {req.citations.map((cite, cIdx) => (
                                  <span key={cIdx} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-sky-300 font-mono">
                                    {cite}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Deep AI Candidate Evaluation Narrative */}
                    {roleMatchResult.aiAnalysis && (
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Evidence-Grounded Candidate Intelligence Report
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                            qwen2.5:3b (Local Ollama)
                          </span>
                        </div>
                        <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-sans space-y-2 max-h-96 overflow-y-auto pr-1">
                          {roleMatchResult.aiAnalysis}
                        </div>
                      </div>
                    )}

                    {/* Recommendations */}
                    {roleMatchResult.recommendations.length > 0 && (
                      <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/40 space-y-1">
                        <div className="text-xs font-bold text-amber-300">Recommended Preparation:</div>
                        <ul className="list-disc list-inside text-[11px] text-slate-300 space-y-0.5">
                          {roleMatchResult.recommendations.map((rec, rIdx) => (
                            <li key={rIdx}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Disclaimer */}
                    <div className="p-2.5 bg-slate-950/80 rounded border border-slate-800 text-[10px] text-slate-400 leading-relaxed">
                      ⚠️ <strong className="text-slate-300">Ethical AI Notice:</strong> {roleMatchResult.disclaimer}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
