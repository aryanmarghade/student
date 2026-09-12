import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { TeacherAssignment, AnalyticsResponse } from '../types';
import {
  Users,
  Grid,
  TrendingUp,
  Download,
  Search,
  CheckSquare,
  Square,
  Save,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  FileSpreadsheet,
  ChevronRight,
  BookOpen,
  Calendar,
  Layers,
  Sparkles,
  Megaphone,
  Bell,
  Send,
  X,
  Clock,
  ExternalLink,
  FileText,
  Upload,
  FolderGit2,
  Award,
  Trophy
} from 'lucide-react';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import '../lib/chart-setup';

export const TeacherView: React.FC = () => {
  // Assignments list
  const [assignments, setAssignments] = useState<{ active: TeacherAssignment[]; past: TeacherAssignment[] }>({
    active: [],
    past: []
  });
  const [selectedAssignment, setSelectedAssignment] = useState<TeacherAssignment | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'roster' | 'marks' | 'analytics' | 'notices'>('roster');

  // Student Full Profile Modal State
  const [selectedStudentProfile, setSelectedStudentProfile] = useState<any | null>(null);
  const [isLoadingStudentProfile, setIsLoadingStudentProfile] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Batch CSV Marks Import State
  const [showImportMarksModal, setShowImportMarksModal] = useState(false);
  const [csvMarksText, setCsvMarksText] = useState('');
  const [isImportingMarks, setIsImportingMarks] = useState(false);

  // Roster state
  const [students, setStudents] = useState<any[]>([]);
  const [rosterSearch, setRosterSearch] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Announcements & Notifications state
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false);

  // Marks Grid state
  const [examColumns, setExamColumns] = useState<Array<{ type: string; max: number }>>([]);
  const [marksGrid, setMarksGrid] = useState<Record<string, Record<string, any>>>({});
  const [marksEdits, setMarksEdits] = useState<Record<string, Record<string, number | null>>>({});
  const [isSavingMarks, setIsSavingMarks] = useState(false);

  // Analytics state
  const [analyticsScope, setAnalyticsScope] = useState<'whole_class' | 'selected_students' | 'single_student'>('whole_class');
  const [singleStudentTarget, setSingleStudentTarget] = useState<string>('');
  const [includedSemesters, setIncludedSemesters] = useState<string[]>(['sem_3', 'sem_4']);
  const [includedExamTypes, setIncludedExamTypes] = useState<string[]>([
    'Internal 1', 'Internal 2', 'Midterm', 'Final', 'Assignment', 'Practical'
  ]);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsResponse | null>(null);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);

  // Chart ref for PNG export
  const trendChartRef = useRef<any>(null);

  // Notifications / Feedback
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  useEffect(() => {
    loadAssignments();
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const res = await api.getTeacherNotifications();
      setNotifications(Array.isArray(res) ? res : (res as any).notifications || []);
    } catch {
      // safe fallback
    }
  };

  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment || !announcementTitle.trim() || !announcementBody.trim()) return;
    setIsPostingAnnouncement(true);
    try {
      await api.postTeacherAnnouncement({
        class_id: selectedAssignment.class_id,
        title: announcementTitle.trim(),
        body: announcementBody.trim()
      });
      setFeedbackSuccess(`Announcement posted to Class ${selectedAssignment.className}!`);
      setAnnouncementTitle('');
      setAnnouncementBody('');
      setShowAnnouncementModal(false);
      loadNotifications();
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to post announcement');
    } finally {
      setIsPostingAnnouncement(false);
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await api.markTeacherNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch {
      // safe fallback
    }
  };

  const loadAssignments = async () => {
    try {
      const res = await api.getTeacherAssignmentsList();
      setAssignments(res);
      if (res.active.length > 0 && !selectedAssignment) {
        selectAssignment(res.active[0]);
      }
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to load assigned classes');
    }
  };

  const selectAssignment = async (assignment: TeacherAssignment) => {
    setSelectedAssignment(assignment);
    setSelectedStudentIds([]);
    setMarksEdits({});
    setFeedbackError(null);
    setFeedbackSuccess(null);

    // Load Class Roster
    try {
      const rosterRes = await api.getClassStudents(assignment.class_id);
      setStudents(rosterRes.students);
      if (rosterRes.students.length > 0) {
        setSingleStudentTarget(rosterRes.students[0].id);
      }

      // Load Marks Grid
      const marksRes = await api.getMarksGrid(assignment.class_id, assignment.subject_id, assignment.semester_id);
      setExamColumns(marksRes.examColumns);
      setMarksGrid(marksRes.grid);

      // Pre-seed marks edits from grid
      const initialEdits: Record<string, Record<string, number | null>> = {};
      for (const s of marksRes.students) {
        initialEdits[s.id] = {};
        for (const ec of marksRes.examColumns) {
          initialEdits[s.id][ec.type] = marksRes.grid[s.id]?.[ec.type]?.marks_obtained ?? null;
        }
      }
      setMarksEdits(initialEdits);

      // Trigger initial analytics
      loadAnalytics(assignment.class_id, assignment.subject_id, 'whole_class', [], includedSemesters, includedExamTypes);
    } catch (err: any) {
      setFeedbackError(err.message || 'Error loading class records.');
    }
  };

  const loadAnalytics = async (
    classId: string,
    subjectId: string,
    scope: 'whole_class' | 'selected_students' | 'single_student',
    studentIds: string[],
    semesters: string[],
    examTypes: string[]
  ) => {
    setIsAnalyticsLoading(true);
    try {
      const targetIds = scope === 'single_student' ? [singleStudentTarget] : studentIds;
      const res = await api.getTeacherAnalytics({
        classId,
        subjectId,
        scope,
        studentIds: targetIds,
        selectedSemesters: semesters,
        selectedExamTypes: examTypes,
      });
      setAnalyticsData(res);
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to compute class analytics');
    } finally {
      setIsAnalyticsLoading(false);
    }
  };

  const handleScopeChange = (newScope: 'whole_class' | 'selected_students' | 'single_student') => {
    setAnalyticsScope(newScope);
    if (!selectedAssignment) return;
    loadAnalytics(
      selectedAssignment.class_id,
      selectedAssignment.subject_id,
      newScope,
      selectedStudentIds,
      includedSemesters,
      includedExamTypes
    );
  };

  // Toggle Semester Filter
  const toggleSemester = (sem: string) => {
    const updated = includedSemesters.includes(sem)
      ? includedSemesters.filter(s => s !== sem)
      : [...includedSemesters, sem];
    if (updated.length === 0) return; // Prevent empty set
    setIncludedSemesters(updated);
    if (selectedAssignment) {
      loadAnalytics(selectedAssignment.class_id, selectedAssignment.subject_id, analyticsScope, selectedStudentIds, updated, includedExamTypes);
    }
  };

  // Toggle Exam Type Filter
  const toggleExamType = (type: string) => {
    const updated = includedExamTypes.includes(type)
      ? includedExamTypes.filter(t => t !== type)
      : [...includedExamTypes, type];
    if (updated.length === 0) return;
    setIncludedExamTypes(updated);
    if (selectedAssignment) {
      loadAnalytics(selectedAssignment.class_id, selectedAssignment.subject_id, analyticsScope, selectedStudentIds, includedSemesters, updated);
    }
  };

  // Multi-Select Students in Roster
  const handleToggleSelectStudent = (id: string) => {
    setSelectedStudentIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllStudents = () => {
    if (selectedStudentIds.length === filteredStudents.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(filteredStudents.map(s => s.id));
    }
  };

  // Marks Grid change
  const handleMarkChange = (studentId: string, examType: string, value: string) => {
    const num = value === '' ? null : Number(value);
    setMarksEdits(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [examType]: num
      }
    }));
  };

  // Batch Save Marks
  const handleSaveMarks = async () => {
    if (!selectedAssignment) return;
    setIsSavingMarks(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    const updates: any[] = [];
    const validationErrors: string[] = [];

    for (const student of students) {
      for (const ec of examColumns) {
        const val = marksEdits[student.id]?.[ec.type];
        if (val !== null && val !== undefined) {
          if (val > ec.max) {
            validationErrors.push(`${student.full_name} (${ec.type}): Mark of ${val} exceeds exam max of ${ec.max}.`);
          } else if (val < 0) {
            validationErrors.push(`${student.full_name} (${ec.type}): Mark cannot be negative.`);
          } else {
            updates.push({
              student_id: student.id,
              exam_type: ec.type,
              marks_obtained: val,
              max_marks: ec.max
            });
          }
        }
      }
    }

    if (validationErrors.length > 0) {
      setFeedbackError(validationErrors.slice(0, 3).join(' '));
      setIsSavingMarks(false);
      return;
    }

    try {
      const res = await api.saveMarksGrid(selectedAssignment.class_id, selectedAssignment.subject_id, {
        semester_id: selectedAssignment.semester_id,
        updates
      });
      setFeedbackSuccess(`Successfully recorded ${res.savedCount} marks entries.`);
      // Reload analytics to refresh trend lines
      loadAnalytics(selectedAssignment.class_id, selectedAssignment.subject_id, analyticsScope, selectedStudentIds, includedSemesters, includedExamTypes);
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to save marks');
    } finally {
      setIsSavingMarks(false);
    }
  };

  // View Student Full Portfolio Profile
  const handleViewStudentProfile = async (studentId: string) => {
    setIsLoadingStudentProfile(true);
    setShowProfileModal(true);
    setSelectedStudentProfile(null);
    try {
      const res = await api.getStudentFullProfileForTeacher(studentId);
      setSelectedStudentProfile(res);
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to fetch student full profile');
      setShowProfileModal(false);
    } finally {
      setIsLoadingStudentProfile(false);
    }
  };

  // Batch CSV Import for Marks
  const handleBatchImportMarks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment || !csvMarksText.trim()) return;
    setIsImportingMarks(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      const lines = csvMarksText.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        throw new Error('CSV must contain a header line and at least one data row.');
      }

      const headers = lines[0].split(',').map(h => h.trim());
      const rollIdx = headers.findIndex(h => h.toLowerCase().includes('roll'));
      if (rollIdx === -1) {
        throw new Error('CSV must include a "roll_number" column header.');
      }

      const entries: Array<{ roll_number: string; exam_type: string; marks_obtained: number }> = [];

      // Check if format is roll_number,exam_type,marks_obtained
      const examIdx = headers.findIndex(h => h.toLowerCase().includes('exam'));
      const marksIdx = headers.findIndex(h => h.toLowerCase().includes('mark'));

      if (examIdx !== -1 && marksIdx !== -1) {
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          if (cols[rollIdx] && cols[examIdx] && cols[marksIdx] !== undefined) {
            entries.push({
              roll_number: cols[rollIdx],
              exam_type: cols[examIdx],
              marks_obtained: Number(cols[marksIdx])
            });
          }
        }
      } else {
        // Wide format: roll_number, Internal 1, Internal 2, Midterm, etc.
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          const roll = cols[rollIdx];
          if (!roll) continue;

          for (let j = 0; j < headers.length; j++) {
            if (j === rollIdx) continue;
            const examType = headers[j];
            const val = cols[j];
            if (val !== undefined && val !== '') {
              entries.push({
                roll_number: roll,
                exam_type: examType,
                marks_obtained: Number(val)
              });
            }
          }
        }
      }

      if (entries.length === 0) {
        throw new Error('No valid mark entries found to import. Verify format.');
      }

      const res = await api.importTeacherMarks(
        selectedAssignment.class_id,
        selectedAssignment.subject_id,
        selectedAssignment.semester_id,
        entries
      );

      setFeedbackSuccess(res.message);
      setShowImportMarksModal(false);
      setCsvMarksText('');

      // Reload marks grid
      await selectAssignment(selectedAssignment);
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to import CSV marks');
    } finally {
      setIsImportingMarks(false);
    }
  };

  // Export Analytics CSV
  const handleExportCsv = () => {
    if (!analyticsData || !analyticsData.rawExportData || analyticsData.rawExportData.length === 0) return;
    const headers = Object.keys(analyticsData.rawExportData[0]).join(',');
    const rows = analyticsData.rawExportData.map(r => Object.values(r).join(',')).join('\n');
    const csvContent = `data:text/csv;charset=utf-8,${encodeURIComponent(headers + '\n' + rows)}`;
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `VissionAcademy_${selectedAssignment?.className}_Marks_Analytics.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Trend Chart as PNG
  const handleExportChartPng = () => {
    if (trendChartRef.current) {
      const chartUrl = trendChartRef.current.toBase64Image();
      const link = document.createElement('a');
      link.href = chartUrl;
      link.download = `VissionAcademy_${selectedAssignment?.className}_Regression_Trend.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const filteredStudents = students.filter(s => {
    if (!rosterSearch) return true;
    const q = rosterSearch.toLowerCase();
    return s.full_name.toLowerCase().includes(q) || s.roll_number.toLowerCase().includes(q);
  });

  // Chart datasets
  const lineChartData = analyticsData?.linearRegression ? {
    labels: analyticsData.linearRegression.points.map(p => p.label),
    datasets: [
      {
        label: 'Actual Recorded Marks (%)',
        data: analyticsData.linearRegression.points.map(p => p.actual),
        borderColor: '#0284c7',
        backgroundColor: 'rgba(2, 132, 199, 0.1)',
        tension: 0.2,
        pointRadius: 5
      },
      {
        label: 'Linear Regression Trend Line (Estimated)',
        data: analyticsData.linearRegression.points.map(p => p.trend),
        borderColor: '#b45309',
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0
      }
    ]
  } : null;

  const barExamData = analyticsData?.charts?.averageByExamType ? {
    labels: analyticsData.charts.averageByExamType.map(e => e.examType),
    datasets: [{
      label: 'Average Score (%)',
      data: analyticsData.charts.averageByExamType.map(e => e.average),
      backgroundColor: '#0f2744',
      borderRadius: 4
    }]
  } : null;

  const doughnutData = analyticsData?.charts?.gradeDistribution ? {
    labels: ['A (85%+)', 'B (70-84%)', 'C (55-69%)', 'D (40-54%)', 'F (<40%)'],
    datasets: [{
      data: [
        analyticsData.charts.gradeDistribution.A,
        analyticsData.charts.gradeDistribution.B,
        analyticsData.charts.gradeDistribution.C,
        analyticsData.charts.gradeDistribution.D,
        analyticsData.charts.gradeDistribution.F,
      ],
      backgroundColor: ['#059669', '#0284c7', '#d97706', '#ea580c', '#dc2626']
    }]
  } : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Toast banners */}
      {feedbackSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg flex items-center gap-2 text-xs text-emerald-800 shadow-sm animate-fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedbackSuccess}</span>
        </div>
      )}
      {feedbackError && (
        <div className="p-3 bg-red-50 border border-red-300 rounded-lg flex items-center gap-2 text-xs text-red-800 shadow-sm animate-fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{feedbackError}</span>
        </div>
      )}

      {/* Header & Scoped Assignments Selector */}
      <div className="border-b border-slate-200 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-1.5 bg-[#0f2744] text-white rounded-md">
                <BookOpen className="w-4 h-4 text-sky-400" />
              </span>
              <h1 className="text-xl sm:text-2xl font-serif font-bold text-[#0f2744]">
                Faculty Class Workspace
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Restricted to courses assigned by the Academic Registrar. Fully audited access control.
            </p>
          </div>

          {selectedAssignment && (
            <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 px-3 py-1.5 rounded-lg text-xs">
              <span className="font-bold text-sky-900">{selectedAssignment.className}</span>
              <span className="text-sky-700">• {selectedAssignment.subjectCode} ({selectedAssignment.subjectName})</span>
              <span className="text-sky-600 font-mono text-[11px]">• {selectedAssignment.semesterName}</span>
            </div>
          )}
        </div>

        {/* Assigned Classes Quick Tabs */}
        <div className="mt-4 pt-2 border-t border-slate-200">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" /> Your Active Teaching Scopes:
          </p>
          <div className="flex flex-wrap gap-2">
            {assignments.active.map(a => {
              const isSelected = selectedAssignment?.id === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => selectAssignment(a)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer text-left ${
                    isSelected
                      ? 'bg-[#0f2744] text-white border-[#0f2744] shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <p className="font-bold">{a.className} — {a.subjectCode}</p>
                  <p className={`text-[10px] ${isSelected ? 'text-amber-300' : 'text-slate-500'}`}>
                    {a.subjectName} • {a.studentCount} Students
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Class Workspace Navigation */}
      {selectedAssignment && (
        <div className="space-y-6">
          <div className="flex space-x-2 border-b border-slate-200 pb-2">
            {[
              { id: 'roster', label: 'Class Student Roster', icon: Users, count: students.length },
              { id: 'marks', label: 'Spreadsheet Marks Entry Grid', icon: Grid },
              { id: 'analytics', label: 'Analytics & Regression Forecasts', icon: TrendingUp },
              { id: 'notices', label: 'Announcements & Inbox', icon: Megaphone, count: notifications.filter(n => !n.is_read).length || undefined },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id as any)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#0f2744] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-white">
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* SUBTAB 1: CLASS ROSTER */}
          {activeSubTab === 'roster' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search by student name or roll number..."
                    value={rosterSearch}
                    onChange={e => setRosterSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAnnouncementModal(true)}
                    className="px-3 py-1.5 bg-amber-600 text-white hover:bg-amber-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Megaphone className="w-3.5 h-3.5" /> Post Announcement
                  </button>

                  <button
                    onClick={handleSelectAllStudents}
                    className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 cursor-pointer"
                  >
                    {selectedStudentIds.length === filteredStudents.length ? (
                      <CheckSquare className="w-3.5 h-3.5 text-[#0f2744]" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <span>{selectedStudentIds.length === filteredStudents.length ? 'Deselect All' : 'Select All'}</span>
                  </button>

                  {selectedStudentIds.length > 0 && (
                    <button
                      onClick={() => {
                        setActiveSubTab('analytics');
                        handleScopeChange('selected_students');
                      }}
                      className="px-3 py-1.5 bg-[#0f2744] text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <TrendingUp className="w-3.5 h-3.5" /> Run Analytics ({selectedStudentIds.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Roster Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                <table className="w-full text-xs text-left text-slate-700">
                  <thead className="bg-slate-100 text-slate-600 uppercase font-semibold text-[10px]">
                    <tr>
                      <th className="w-10 px-4 py-3">Select</th>
                      <th className="px-4 py-3">Roll Number</th>
                      <th className="px-4 py-3">Student Name</th>
                      <th className="px-4 py-3">Institutional Email</th>
                      <th className="px-4 py-3">Profile Strength</th>
                      <th className="px-4 py-3 text-right">Quick Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredStudents.map(s => {
                      const isSelected = selectedStudentIds.includes(s.id);
                      return (
                        <tr key={s.id} className={`hover:bg-slate-50 ${isSelected ? 'bg-sky-50/50' : ''}`}>
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectStudent(s.id)}
                              className="w-4 h-4 rounded text-[#0f2744] focus:ring-[#0f2744] cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-[#0f2744]">{s.roll_number}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{s.full_name}</td>
                          <td className="px-4 py-3 text-slate-500">{s.email}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-slate-200 rounded-full h-1.5">
                                <div
                                  className="bg-[#b45309] h-1.5 rounded-full"
                                  style={{ width: `${s.profile_strength || 50}%` }}
                                ></div>
                              </div>
                              <span className="font-mono text-[11px] font-bold text-slate-700">{s.profile_strength}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleViewStudentProfile(s.id)}
                                className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 rounded border border-slate-300 cursor-pointer flex items-center gap-1"
                                title="View Comprehensive Portfolio, Projects & Certifications"
                              >
                                <FileText className="w-3 h-3 text-slate-500" /> Portfolio
                              </button>
                              <button
                                onClick={() => {
                                  setSingleStudentTarget(s.id);
                                  setActiveSubTab('analytics');
                                  handleScopeChange('single_student');
                                }}
                                className="px-2 py-1 text-[11px] font-semibold text-[#0f2744] hover:bg-sky-50 rounded border border-sky-200 cursor-pointer"
                              >
                                Analyze Trend
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUBTAB 2: SPREADSHEET MARKS GRID */}
          {activeSubTab === 'marks' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Grid className="w-4 h-4 text-[#0f2744]" /> Assessment Marks Ledger — {selectedAssignment.subjectName}
                  </h3>
                  <p className="text-[11px] text-slate-500">Enter or adjust marks. Maximum constraints are automatically validated.</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowImportMarksModal(true)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer border border-slate-300"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Batch CSV Import
                  </button>
                  <button
                    onClick={handleSaveMarks}
                    disabled={isSavingMarks}
                    className="px-4 py-2 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {isSavingMarks ? 'Recording Ledger...' : 'Save All Marks'}
                  </button>
                </div>
              </div>

              {/* Spreadsheet Grid Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                    <tr>
                      <th className="px-4 py-3 sticky left-0 bg-slate-100 z-10 border-r border-slate-200 w-48">Student</th>
                      {examColumns.map(col => (
                        <th key={col.type} className="px-3 py-3 text-center border-r border-slate-200 min-w-[110px]">
                          <div>{col.type}</div>
                          <div className="text-[10px] font-normal text-slate-500 font-mono">Max: {col.max} pts</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {students.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 sticky left-0 bg-white z-10 border-r border-slate-200 font-medium">
                          <p className="font-bold text-slate-900 leading-tight">{s.full_name}</p>
                          <p className="font-mono text-[10px] text-slate-500">{s.roll_number}</p>
                        </td>
                        {examColumns.map(col => {
                          const currentVal = marksEdits[s.id]?.[col.type];
                          const isOver = currentVal !== null && currentVal !== undefined && currentVal > col.max;
                          return (
                            <td key={col.type} className="px-2 py-2 text-center border-r border-slate-200">
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                max={col.max}
                                value={currentVal ?? ''}
                                onChange={e => handleMarkChange(s.id, col.type, e.target.value)}
                                className={`w-20 text-center py-1 px-2 border rounded font-mono text-xs transition-colors ${
                                  isOver
                                    ? 'bg-red-50 border-red-500 text-red-700 font-bold ring-2 ring-red-400'
                                    : 'border-slate-300 bg-slate-50 focus:bg-white focus:ring-1 focus:ring-[#0f2744]'
                                }`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUBTAB 3: ANALYTICS & REGRESSION PROJECTIONS */}
          {activeSubTab === 'analytics' && (
            <div className="space-y-6">
              {/* Scope & Filter Toolbar */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-3">
                  {/* Scope Selector */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Analytics Scope:</span>
                    <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                      <button
                        onClick={() => handleScopeChange('whole_class')}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                          analyticsScope === 'whole_class' ? 'bg-[#0f2744] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Whole Class ({students.length})
                      </button>
                      <button
                        onClick={() => handleScopeChange('selected_students')}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                          analyticsScope === 'selected_students' ? 'bg-[#0f2744] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Selected Cohort ({selectedStudentIds.length})
                      </button>
                      <button
                        onClick={() => handleScopeChange('single_student')}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                          analyticsScope === 'single_student' ? 'bg-[#0f2744] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Single Student
                      </button>
                    </div>
                  </div>

                  {analyticsScope === 'single_student' && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-slate-700">Target Student:</label>
                      <select
                        value={singleStudentTarget}
                        onChange={e => {
                          setSingleStudentTarget(e.target.value);
                          if (selectedAssignment) {
                            loadAnalytics(selectedAssignment.class_id, selectedAssignment.subject_id, 'single_student', [e.target.value], includedSemesters, includedExamTypes);
                          }
                        }}
                        className="text-xs px-2.5 py-1 border border-slate-300 rounded-lg bg-slate-50"
                      >
                        {students.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.full_name} ({s.roll_number})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Export Options */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleExportCsv}
                      className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-600" /> Export CSV Data
                    </button>
                    <button
                      onClick={handleExportChartPng}
                      className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-[#0f2744]" /> Export Trend PNG
                    </button>
                  </div>
                </div>

                {/* Filter Checklists: Semesters & Exam Types */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="font-semibold text-slate-700 block mb-1.5">Semesters Included:</span>
                    <div className="flex flex-wrap gap-2">
                      {['sem_1', 'sem_2', 'sem_3', 'sem_4'].map(sem => {
                        const checked = includedSemesters.includes(sem);
                        return (
                          <label key={sem} className="flex items-center gap-1.5 cursor-pointer bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSemester(sem)}
                              className="rounded text-[#0f2744]"
                            />
                            <span className="capitalize">{sem.replace('_', ' ')}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <span className="font-semibold text-slate-700 block mb-1.5">Exam Types Included:</span>
                    <div className="flex flex-wrap gap-2">
                      {['Internal 1', 'Internal 2', 'Midterm', 'Final', 'Assignment', 'Practical'].map(type => {
                        const checked = includedExamTypes.includes(type);
                        return (
                          <label key={type} className="flex items-center gap-1.5 cursor-pointer bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleExamType(type)}
                              className="rounded text-[#0f2744]"
                            />
                            <span>{type}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Statistical Summary Cards */}
              {analyticsData && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Evaluations</p>
                    <p className="text-xl font-serif font-bold text-slate-900 mt-1">{analyticsData.statistics.count}</p>
                    <p className="text-[10px] text-slate-400">Total records</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Arithmetic Mean</p>
                    <p className="text-xl font-serif font-bold text-sky-800 mt-1">{analyticsData.statistics.mean}%</p>
                    <p className="text-[10px] text-slate-400">Average score</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Median Score</p>
                    <p className="text-xl font-serif font-bold text-slate-800 mt-1">{analyticsData.statistics.median}%</p>
                    <p className="text-[10px] text-slate-400">50th percentile</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Std Deviation</p>
                    <p className="text-xl font-serif font-bold text-slate-800 mt-1">±{analyticsData.statistics.stdDev}%</p>
                    <p className="text-[10px] text-slate-400">Variance dispersion</p>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Score Range</p>
                    <p className="text-xl font-serif font-bold text-slate-800 mt-1">{analyticsData.statistics.min} - {analyticsData.statistics.max}%</p>
                    <p className="text-[10px] text-slate-400">Min to Max</p>
                  </div>
                  {/* Linear Regression Next Projection Card */}
                  <div className="bg-amber-50/80 p-3.5 rounded-xl border border-amber-300 shadow-2xs">
                    <p className="text-[10px] font-bold text-amber-900 uppercase flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-700" /> Forecast
                    </p>
                    <p className="text-xl font-serif font-bold text-amber-900 mt-1">
                      {analyticsData.linearRegression.predictedNextScore}%
                    </p>
                    <p className="text-[10px] text-amber-800 font-medium">Estimated next score</p>
                  </div>
                </div>
              )}

              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 1. Linear Regression Trend Line with Overlaid Projection */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs lg:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-[#0f2744]" /> Linear Regression Trend & Forecast
                      </h3>
                      <p className="text-xs text-slate-500">
                        Trend slope: <strong>{analyticsData?.linearRegression.slope}</strong> • Dashed line indicates statistical projection
                      </p>
                    </div>
                  </div>

                  {lineChartData ? (
                    <div className="h-72">
                      <Line
                        ref={trendChartRef}
                        data={lineChartData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          scales: {
                            y: { min: 0, max: 100, title: { display: true, text: 'Percentage Score (%)' } }
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 py-16 text-center">Loading trend data...</p>
                  )}
                </div>

                {/* 2. Grade Distribution Pie/Doughnut */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
                  <h3 className="text-sm font-bold text-slate-900 mb-1">Grade Distribution</h3>
                  <p className="text-xs text-slate-500 mb-4">Letter grades across active filter</p>
                  {doughnutData ? (
                    <div className="h-64 flex items-center justify-center">
                      <Doughnut
                        data={doughnutData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: { legend: { position: 'bottom' } }
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              {/* 3. Bar Chart: Average by Exam Type */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
                <h3 className="text-sm font-bold text-slate-900 mb-1">Average Performance by Assessment Format</h3>
                <p className="text-xs text-slate-500 mb-4">Comparison between tests, practicals, assignments, and exams</p>
                {barExamData ? (
                  <div className="h-64">
                    <Bar
                      data={barExamData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: { y: { min: 0, max: 100 } }
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* SUBTAB 4: ANNOUNCEMENTS & INBOX */}
          {activeSubTab === 'notices' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-amber-600" /> Class Announcements & Faculty Bulletins
                  </h3>
                  <p className="text-xs text-slate-500">
                    Broadcast directives to {selectedAssignment.className} students and review official institutional circulars.
                  </p>
                </div>
                <button
                  onClick={() => setShowAnnouncementModal(true)}
                  className="px-3.5 py-1.5 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Megaphone className="w-3.5 h-3.5 text-amber-400" /> Post New Announcement
                </button>
              </div>

              {/* Feed of notifications */}
              <div className="space-y-3">
                {notifications.length === 0 ? (
                  <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-xs text-slate-400">
                    No announcements or circulars in your inbox yet.
                  </div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      className={`p-4 rounded-xl border transition-all bg-white shadow-2xs ${
                        !n.is_read ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              n.target_role === 'class' ? 'bg-sky-100 text-sky-800' :
                              n.target_role === 'all_teachers' ? 'bg-indigo-100 text-indigo-800' :
                              'bg-amber-100 text-amber-800'
                            }`}>
                              {n.target_role === 'class' ? `Class Notice (${n.target_class_id})` :
                               n.target_role === 'all_teachers' ? 'Faculty Bulletin' : 'Campus Circular'}
                            </span>
                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {new Date(n.created_at).toLocaleString()}
                            </span>
                            {!n.is_read && (
                              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500 text-white">
                                New
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-bold text-slate-900">{n.title}</h4>
                          <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{n.body}</p>
                        </div>
                        {!n.is_read && (
                          <button
                            onClick={() => handleMarkNotificationRead(n.id)}
                            className="px-2.5 py-1 text-[11px] text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded border border-slate-200 transition-colors cursor-pointer shrink-0"
                          >
                            Mark Read
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State when 0 assignments */}
      {assignments.active.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-lg mx-auto my-12 space-y-3 shadow-2xs">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-[#0f2744] mx-auto flex items-center justify-center">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No Active Faculty Teaching Scopes</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Your instructor profile is registered in Vission Academy. Once the Academic Registrar assigns class cohorts and subjects to your profile, your student rosters, marks entry ledger, and regression forecasts will appear here immediately.
          </p>
        </div>
      )}

      {/* MODAL: POST ANNOUNCEMENT */}
      {showAnnouncementModal && selectedAssignment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-4 bg-[#0f2744] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm">Post Class Announcement</h3>
              </div>
              <button
                onClick={() => setShowAnnouncementModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePostAnnouncement} className="p-5 space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-2">
                  Broadcasting to enrolled students in <strong className="text-slate-800">{selectedAssignment.className}</strong> for <strong className="text-slate-800">{selectedAssignment.subjectName}</strong>.
                </p>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Announcement Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lab Viva Schedule or Project Submission Deadline"
                  value={announcementTitle}
                  onChange={e => setAnnouncementTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:ring-2 focus:ring-[#0f2744]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notice Content</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Enter details, instructions, or deadlines for the class..."
                  value={announcementBody}
                  onChange={e => setAnnouncementBody(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:ring-2 focus:ring-[#0f2744]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAnnouncementModal(false)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPostingAnnouncement}
                  className="px-4 py-1.5 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isPostingAnnouncement ? 'Publishing...' : 'Broadcast to Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: STUDENT FULL PORTFOLIO PROFILE */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-4 bg-[#0f2744] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm">
                  {isLoadingStudentProfile ? 'Loading Student Dossier...' : selectedStudentProfile?.student?.full_name}
                </h3>
              </div>
              <button
                onClick={() => setShowProfileModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-5">
              {isLoadingStudentProfile ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  <div className="animate-spin w-6 h-6 border-2 border-[#0f2744] border-t-transparent rounded-full mx-auto mb-2" />
                  Loading student records and portfolio...
                </div>
              ) : selectedStudentProfile ? (
                <>
                  {/* Top Header Card */}
                  <div className="flex items-start justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="space-y-1">
                      <h4 className="font-bold text-base text-slate-900">{selectedStudentProfile.full_name}</h4>
                      <p className="text-xs text-slate-600 font-mono font-semibold">
                        Roll: {selectedStudentProfile.roll_number}
                      </p>
                      <p className="text-xs text-slate-500">
                        {selectedStudentProfile.email} • Class: {selectedStudentProfile.className}
                      </p>
                      {selectedStudentProfile.bio && (
                        <p className="text-xs text-slate-700 italic pt-1 border-t border-slate-200 mt-2">
                          "{selectedStudentProfile.bio}"
                        </p>
                      )}
                    </div>
                    <div className="text-right space-y-1">
                      <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                        Profile: {selectedStudentProfile.profile_strength}%
                      </span>
                      {selectedStudentProfile.github_url && (
                        <div>
                          <a
                            href={selectedStudentProfile.github_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-sky-700 hover:underline inline-flex items-center gap-1"
                          >
                            GitHub <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                      {selectedStudentProfile.linkedin_url && (
                        <div>
                          <a
                            href={selectedStudentProfile.linkedin_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-sky-700 hover:underline inline-flex items-center gap-1"
                          >
                            LinkedIn <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Skills Section */}
                  {selectedStudentProfile.skills && selectedStudentProfile.skills.length > 0 && (
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                        Technical Skills
                      </h5>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedStudentProfile.skills.map((sk: any, idx: number) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-300"
                          >
                            {sk.skill_name || sk}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Projects Section */}
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                      <FolderGit2 className="w-3.5 h-3.5 text-sky-600" />
                      Student Projects ({selectedStudentProfile.projects?.length || 0})
                    </h5>
                    {(!selectedStudentProfile.projects || selectedStudentProfile.projects.length === 0) ? (
                      <p className="text-xs text-slate-400 italic">No student projects listed yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedStudentProfile.projects.map((p: any) => (
                          <div key={p.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div className="flex items-start justify-between">
                              <h6 className="font-bold text-xs text-slate-900">{p.title}</h6>
                              <div className="flex gap-2 text-[11px]">
                                {p.project_url && (
                                  <a href={p.project_url} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline flex items-center gap-0.5">
                                    Demo <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                                {p.repo_url && (
                                  <a href={p.repo_url} target="_blank" rel="noreferrer" className="text-slate-700 hover:underline flex items-center gap-0.5">
                                    Repo <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-slate-600 mt-1">{p.description}</p>
                            {p.tech_stack && (
                              <p className="text-[10px] font-mono text-slate-500 mt-1.5">Tech: {p.tech_stack}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Certifications Section */}
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-amber-600" />
                      Certifications & Credentials ({selectedStudentProfile.certifications?.length || 0})
                    </h5>
                    {(!selectedStudentProfile.certifications || selectedStudentProfile.certifications.length === 0) ? (
                      <p className="text-xs text-slate-400 italic">No certifications logged.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {selectedStudentProfile.certifications.map((c: any) => (
                          <div key={c.id} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                            <h6 className="font-bold text-xs text-slate-900">{c.title}</h6>
                            <p className="text-[11px] text-slate-600">Issuer: {c.issuing_organization}</p>
                            <p className="text-[10px] text-slate-400">Issued: {c.issue_date || 'N/A'}</p>
                            {c.credential_url && (
                              <a href={c.credential_url} target="_blank" rel="noreferrer" className="text-[10px] text-sky-700 hover:underline inline-flex items-center gap-1 mt-1">
                                View Credential <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Resume Document Scan */}
                  {selectedStudentProfile.resumeDocument?.parsed_headings && (
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-emerald-600" /> Parsed Resume Profile
                      </h5>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-700 space-y-2">
                        {Object.entries(selectedStudentProfile.resumeDocument.parsed_headings).map(([section, items]) => {
                          const list = Array.isArray(items) ? (items as string[]) : [];
                          if (list.length === 0) return null;
                          return (
                            <div key={section}>
                              <strong className="text-[11px] uppercase tracking-wider text-[#0f2744] block mb-1">{section}</strong>
                              <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                                {list.map((it, idx) => (
                                  <li key={idx}>{it}</li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            <div className="p-3 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowProfileModal(false)}
                className="px-4 py-1.5 bg-[#0f2744] text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Close Portfolio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BATCH CSV MARKS IMPORT */}
      {showImportMarksModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-[#0f2744] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-sm">Batch Import Marks via CSV</h3>
              </div>
              <button
                onClick={() => setShowImportMarksModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleBatchImportMarks} className="p-5 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Paste CSV data below. You may use standard format:
              </p>
              <div className="bg-slate-100 p-2.5 rounded font-mono text-[11px] text-slate-800">
                roll_number,exam_type,marks_obtained<br />
                CS2026-001,Internal 1,18.5<br />
                CS2026-002,Internal 1,19.0
              </div>
              <p className="text-[11px] text-slate-500">
                Or multi-column format with exam headers matching your syllabus (e.g. roll_number,Internal 1,Internal 2,Midterm).
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">CSV Content</label>
                <textarea
                  rows={8}
                  required
                  placeholder="roll_number,exam_type,marks_obtained&#10;..."
                  value={csvMarksText}
                  onChange={e => setCsvMarksText(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-slate-50 focus:ring-2 focus:ring-[#0f2744]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowImportMarksModal(false)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isImportingMarks || !csvMarksText.trim()}
                  className="px-4 py-1.5 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  {isImportingMarks ? 'Importing Records...' : 'Import CSV Marks'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
