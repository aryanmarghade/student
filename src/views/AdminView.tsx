import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { AcademicClass, Subject, Department, TeacherAssignment, User, CollegeEvent } from '../types';
import {
  Users,
  BookOpen,
  GraduationCap,
  Calendar,
  Plus,
  Search,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertCircle,
  Shield,
  Send,
  Download,
  BarChart3,
  Layers,
  Award,
  Archive,
  Trash2,
  RefreshCw,
  ShieldCheck,
  FileArchive,
  Clock,
  Trophy,
  MapPin,
  ExternalLink
} from 'lucide-react';
import { Bar, Doughnut } from 'react-chartjs-2';
import '../lib/chart-setup';

export const AdminView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'classes' | 'users' | 'assignments' | 'marksheets' | 'notices' | 'events' | 'audit'>('overview');

  // Overview Data
  const [overview, setOverview] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);

  // Entities Data
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [semesters, setSemesters] = useState<any[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<{ active: TeacherAssignment[]; past: TeacherAssignment[] }>({ active: [], past: [] });

  // Audit Logs Data
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditFilter, setAuditFilter] = useState('');

  // Loading & Filter states
  const [isLoading, setIsLoading] = useState(true);
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [userSearch, setUserSearch] = useState('');

  // Modals state
  const [showAddClassModal, setShowAddClassModal] = useState(false);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showUploadMarksheetModal, setShowUploadMarksheetModal] = useState(false);
  const [showStartSemesterModal, setShowStartSemesterModal] = useState(false);
  const [showZipUploadModal, setShowZipUploadModal] = useState(false);

  // Form states
  const [newClassData, setNewClassData] = useState({ name: '', department_id: '', year: 3, section: 'A' });
  const [newSubjectData, setNewSubjectData] = useState({ name: '', code: '', department_id: '', max_marks: 100 });
  const [newUserData, setNewUserData] = useState({ email: '', full_name: '', role: 'student', password: 'password123', roll_number: '', class_id: '', department_id: '' });
  const [newAssignData, setNewAssignData] = useState({ teacher_user_id: '', class_id: '', subject_id: '', semester_id: '' });
  const [marksheetData, setMarksheetData] = useState({ student_id: '', semester_id: 'sem_4', sgpa: 8.5, cgpa: 8.5 });
    const [marksheetFile, setMarksheetFile] = useState<File | null>(null);
  const [noticeData, setNoticeData] = useState({ title: '', body: '', target_role: 'all', target_class_id: '' });
  const [newSemesterName, setNewSemesterName] = useState('Semester 5 - Autumn 2026');
  const [newSemesterNumber, setNewSemesterNumber] = useState(5);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipSemesterId, setZipSemesterId] = useState('sem_4');
  const [isUploadingZip, setIsUploadingZip] = useState(false);
  const [zipUploadReport, setZipUploadReport] = useState<{ summary: any; matchedFiles: any[]; unmatchedFiles: any[] } | null>(null);
  const [isStartingSemester, setIsStartingSemester] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Events & Hackathons state
  const [events, setEvents] = useState<CollegeEvent[]>([]);
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [newEventData, setNewEventData] = useState({
    name: '',
    description: '',
    organizer: 'Vission Academy Tech Club',
    event_date: '',
    registration_deadline: '',
    location: 'Main Auditorium / Campus Lab 4',
    registration_link: '',
    eligibility: 'All Engineering Students',
    status: 'upcoming' as const
  });

  // Bulk Import state & Report
  const [bulkRole, setBulkRole] = useState<'student' | 'teacher'>('student');
  const [csvContent, setCsvContent] = useState('');
  const [bulkReport, setBulkReport] = useState<{ summary: any; successRows: any[]; failedRows: any[] } | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Feedback banner
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    loadAllAdminData();
  }, []);

  const loadAllAdminData = async () => {
    setIsLoading(true);
    try {
      const [overviewData, analyticsData, classesData, deptsData, subjectsData, semsData, usersData, assignData, auditData, eventsData] = await Promise.all([
        api.getAdminOverview(),
        api.getAdminAnalytics(),
        api.getAdminClasses(),
        api.getAdminDepartments(),
        api.getAdminSubjects(),
        api.getAdminSemesters(),
        api.getAdminUsers(),
        api.getTeacherAssignments(),
        api.getAuditLogs(),
        api.getAdminEvents()
      ]);

      setOverview(overviewData);
      setAnalytics(analyticsData);
      setClasses(classesData);
      setDepartments(deptsData);
      setSubjects(subjectsData);
      setSemesters(semsData);
      setUsers(usersData);
      setAssignments({ active: assignData.active, past: assignData.past });
      setAuditLogs(auditData || []);
      setEvents(eventsData || []);

      if (deptsData.length > 0) {
        setNewClassData(prev => ({ ...prev, department_id: deptsData[0].id }));
        setNewSubjectData(prev => ({ ...prev, department_id: deptsData[0].id }));
        setNewUserData(prev => ({ ...prev, department_id: deptsData[0].id, class_id: classesData[0]?.id || '' }));
      }
      if (classesData.length > 0 && subjectsData.length > 0 && semsData.length > 0) {
        const teachers = usersData.filter(u => u.role === 'teacher');
        setNewAssignData({
          teacher_user_id: teachers[0]?.id || '',
          class_id: classesData[0].id,
          subject_id: subjectsData[0].id,
          semester_id: semsData[0].id
        });
      }
      const students = usersData.filter(u => u.role === 'student');
      if (students.length > 0) {
        setMarksheetData(prev => ({ ...prev, student_id: students[0].student_id || students[0].id }));
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to load institutional records');
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (msg: string, isError = false) => {
    if (isError) {
      setActionError(msg);
      setTimeout(() => setActionError(null), 4000);
    } else {
      setActionSuccess(msg);
      setTimeout(() => setActionSuccess(null), 4000);
    }
  };

  // Class deletion
  const handleDeleteClass = async (classId: string, className: string) => {
    if (!window.confirm(`Are you sure you want to delete class "${className}"? This action cannot be undone.`)) return;
    try {
      await api.deleteClass(classId);
      showToast(`Class "${className}" removed successfully.`);
      loadAllAdminData();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete class', true);
    }
  };

  // Subject deletion
  const handleDeleteSubject = async (subjectId: string, subjectName: string) => {
    if (!window.confirm(`Are you sure you want to delete subject "${subjectName}"? This action cannot be undone.`)) return;
    try {
      await api.deleteSubject(subjectId);
      showToast(`Subject "${subjectName}" removed successfully.`);
      loadAllAdminData();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete subject', true);
    }
  };

  // Start new semester
  const handleStartNewSemester = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsStartingSemester(true);
    try {
      const res = await api.startNewSemester({
        semesterName: newSemesterName,
        semesterNumber: Number(newSemesterNumber)
      });
      showToast(`${res.message} (${res.archivedCount} assignments archived)`);
      setShowStartSemesterModal(false);
      loadAllAdminData();
    } catch (err: any) {
      showToast(err.message || 'Failed to start new semester', true);
    } finally {
      setIsStartingSemester(false);
    }
  };

  // Bulk Marksheets ZIP Upload
  const handleZipUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zipFile) {
      showToast('Please select a ZIP file to upload', true);
      return;
    }
    setIsUploadingZip(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1] || (reader.result as string);
          const res = await api.bulkUploadMarksheetsZip(base64, zipSemesterId);
          setZipUploadReport(res);
          showToast(`Uploaded ZIP: ${res.summary.matched} marksheets matched!`);
          loadAllAdminData();
        } catch (err: any) {
          showToast(err.message || 'ZIP processing failed', true);
        } finally {
          setIsUploadingZip(false);
        }
      };
      reader.readAsDataURL(zipFile);
    } catch (err: any) {
      showToast(err.message || 'Failed to read ZIP file', true);
      setIsUploadingZip(false);
    }
  };

  // Reset Handler
  const handleResetToFresh = async () => {
    if (!window.confirm('RESET ALL DATA: This will clear all classes, subjects, students, marks, and notifications, leaving only the admin account. Continue?')) return;
    setIsResetting(true);
    try {
      const res = await api.resetToFresh();
      showToast(res.message);
      loadAllAdminData();
    } catch (err: any) {
      showToast(err.message || 'Failed to reset database', true);
    } finally {
      setIsResetting(false);
    }
  };

  // College Events Handlers
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventData.name.trim() || !newEventData.event_date) {
      showToast('Event title and date are required.', true);
      return;
    }
    try {
      await api.createAdminEvent(newEventData);
      showToast('College event published successfully.');
      setShowAddEventModal(false);
      setNewEventData({
        name: '',
        description: '',
        organizer: 'Vission Academy Tech Club',
        event_date: '',
        registration_deadline: '',
        location: 'Main Auditorium / Campus Lab 4',
        registration_link: '',
        eligibility: 'All Engineering Students',
        status: 'upcoming'
      });
      const updated = await api.getAdminEvents();
      setEvents(updated);
    } catch (err: any) {
      showToast(err.message || 'Failed to create event', true);
    }
  };

  const handleDeleteEvent = async (eventId: string, eventName: string) => {
    if (!window.confirm(`Delete event "${eventName}"?`)) return;
    try {
      await api.deleteAdminEvent(eventId);
      showToast('Event removed successfully.');
      setEvents(prev => prev.filter(e => e.id !== eventId));
    } catch (err: any) {
      showToast(err.message || 'Failed to delete event', true);
    }
  };

  // Class creation
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createClass(newClassData);
      showToast(`Class ${newClassData.name} created successfully.`);
      setShowAddClassModal(false);
      loadAllAdminData();
    } catch (err: any) {
      showToast(err.message, true);
    }
  };

  // Subject creation
  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createSubject(newSubjectData);
      showToast(`Subject ${newSubjectData.name} (${newSubjectData.code}) added.`);
      setShowAddSubjectModal(false);
      loadAllAdminData();
    } catch (err: any) {
      showToast(err.message, true);
    }
  };

  // Single User creation
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createAdminUser(newUserData);
      showToast(`User ${newUserData.full_name} registered successfully.`);
      setShowAddUserModal(false);
      loadAllAdminData();
    } catch (err: any) {
      showToast(err.message, true);
    }
  };

  // Toggle user status
  const handleToggleUserStatus = async (userId: string) => {
    try {
      const res = await api.toggleUserStatus(userId);
      showToast(res.message);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: res.is_active } : u));
    } catch (err: any) {
      showToast(err.message, true);
    }
  };

  // Reset password
  const handleResetPassword = async (userId: string) => {
    try {
      const res = await api.resetUserPassword(userId);
      showToast(res.message);
    } catch (err: any) {
      showToast(err.message, true);
    }
  };

  // Teacher Assignment
  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createTeacherAssignment(newAssignData);
      showToast('Faculty assigned to class & subject successfully.');
      setShowAssignModal(false);
      loadAllAdminData();
    } catch (err: any) {
      showToast(err.message, true);
    }
  };

  // Archive Teacher Assignment (Preserve History)
  const handleArchiveAssignment = async (assignmentId: string) => {
    try {
      await api.archiveTeacherAssignment(assignmentId);
      showToast('Assignment archived to historical records.');
      loadAllAdminData();
    } catch (err: any) {
      showToast(err.message, true);
    }
  };

  // Upload Marksheet
  const handleUploadMarksheet = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!marksheetFile) {
         showToast('Please select a PDF marksheet file.', true);
         return;
      }
      const fileHeader = new Uint8Array(await marksheetFile.slice(0, 5).arrayBuffer());
      const isPdf = marksheetFile.type === 'application/pdf'
        && new TextDecoder().decode(fileHeader) === '%PDF-';
      if (!isPdf) {
        showToast('Only valid PDF files are accepted.', true);
        return;
      }
      try {
        const formData = new FormData();
        formData.append('file', marksheetFile);
        formData.append('student_id', marksheetData.student_id);
        formData.append('semester_id', marksheetData.semester_id);
        formData.append('sgpa', marksheetData.sgpa.toString());
        formData.append('cgpa', marksheetData.cgpa.toString());

        await api.uploadMarksheetFile(formData);
        showToast('Official student marksheet recorded successfully.');
        setShowUploadMarksheetModal(false);
      } catch (err: any) {
        showToast(err.message, true);
      }
    };

  // Broadcast Notice
  const handleBroadcastNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createNotification(noticeData);
      showToast('Official notice published to campus bulletin.');
      setNoticeData({ title: '', body: '', target_role: 'all', target_class_id: '' });
    } catch (err: any) {
      showToast(err.message, true);
    }
  };

  // CSV Bulk Import
  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvContent.trim()) {
      showToast('Please provide CSV data or sample template.', true);
      return;
    }
    setIsImporting(true);
    setBulkReport(null);
    try {
      const res = await api.bulkImportUsers(csvContent, bulkRole);
      setBulkReport(res);
      showToast(`Bulk Import complete: ${res.summary.successfulCount} created, ${res.summary.failedCount} failed.`);
      loadAllAdminData();
    } catch (err: any) {
      showToast(err.message, true);
    } finally {
      setIsImporting(false);
    }
  };

  const loadSampleCsv = () => {
    if (bulkRole === 'student') {
      setCsvContent(`name,email,roll_number,class\nSophia Chen,sophia.chen@vissionacademy.edu,CS2023015,CS-3A\nLiam Vance,liam.vance@vissionacademy.edu,CS2023016,CS-3A\nInvalid Row Test,invalid-email,CS2023017,CS-3A\nDuplicate Email,student.alex@vissionacademy.edu,CS2023018,CS-3A`);
    } else {
      setCsvContent(`name,email\nDr. Margaret Hamilton,m.hamilton@vissionacademy.edu\nProf. Donald Knuth,d.knuth@vissionacademy.edu\nMissing Email,\nDuplicate Alan,teacher.alan@vissionacademy.edu`);
    }
  };

  // Chart configurations for Admin Analytics
  const gradeChartData = analytics?.gradeDistribution ? {
    labels: ['A (85%+)', 'B (70-84%)', 'C (55-69%)', 'D (40-54%)', 'F (<40%)'],
    datasets: [{
      data: [
        analytics.gradeDistribution.A,
        analytics.gradeDistribution.B,
        analytics.gradeDistribution.C,
        analytics.gradeDistribution.D,
        analytics.gradeDistribution.F,
      ],
      backgroundColor: ['#059669', '#0284c7', '#d97706', '#ea580c', '#dc2626'],
      borderWidth: 1
    }]
  } : null;

  const examTypeChartData = analytics?.examAverages ? {
    labels: analytics.examAverages.map((e: any) => e.examType),
    datasets: [{
      label: 'Average Score (%)',
      data: analytics.examAverages.map((e: any) => e.average),
      backgroundColor: '#0f2744',
      borderRadius: 4
    }]
  } : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Toast notifications */}
      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg flex items-center gap-2 text-xs text-emerald-800 shadow-sm animate-fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="p-3 bg-red-50 border border-red-300 rounded-lg flex items-center gap-2 text-xs text-red-800 shadow-sm animate-fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Admin Title & Navigation Tabs */}
      <div className="border-b border-slate-200 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-1.5 bg-[#0f2744] text-white rounded-md">
                <Shield className="w-4 h-4 text-amber-400" />
              </span>
              <h1 className="text-xl sm:text-2xl font-serif font-bold text-[#0f2744]">
                Institutional Administration
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              College Operations, Academic Rosters, Course Scopes & College-Wide Analytics
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowStartSemesterModal(true)}
              className="px-3 py-1.5 bg-amber-500/10 border border-amber-300 text-amber-900 hover:bg-amber-500/20 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-amber-700" /> Advance Semester
            </button>
            <button
              onClick={() => setShowBulkImportModal(true)}
              className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Bulk CSV Import
            </button>
            <button
              onClick={() => setShowAssignModal(true)}
              className="px-3 py-1.5 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Assign Teacher
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex overflow-x-auto space-x-2 mt-6 pt-2 border-t border-slate-200">
          {[
            { id: 'overview', label: 'College Overview & Analytics', icon: BarChart3 },
            { id: 'classes', label: 'Classes & Courses', icon: BookOpen },
            { id: 'users', label: 'User Directory', icon: Users },
            { id: 'assignments', label: 'Teacher Scopes & History', icon: Layers },
            { id: 'marksheets', label: 'Official Marksheets', icon: Award },
            { id: 'notices', label: 'Broadcast Notices', icon: Send },
            { id: 'events', label: 'College Events & Hackathons', icon: Trophy },
            { id: 'audit', label: 'Audit Trail & Security Logs', icon: ShieldCheck },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#0f2744] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: OVERVIEW & ANALYTICS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Enrolled</p>
              <p className="text-2xl font-serif font-bold text-[#0f2744] mt-1">{overview?.totalStudents ?? 0}</p>
              <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1 font-medium">
                <GraduationCap className="w-3 h-3" /> Active Students
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Faculty Body</p>
              <p className="text-2xl font-serif font-bold text-[#0f2744] mt-1">{overview?.totalTeachers ?? 0}</p>
              <p className="text-[10px] text-sky-600 mt-1 flex items-center gap-1 font-medium">
                <Users className="w-3 h-3" /> Instructors & TAs
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Academic Classes</p>
              <p className="text-2xl font-serif font-bold text-[#0f2744] mt-1">{overview?.totalClasses ?? 0}</p>
              <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1 font-medium">
                <BookOpen className="w-3 h-3" /> Assigned Sections
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Active Semesters</p>
              <p className="text-2xl font-serif font-bold text-[#0f2744] mt-1">{overview?.activeSemesters ?? 0}</p>
              <p className="text-[10px] text-amber-700 mt-1 flex items-center gap-1 font-medium">
                <Calendar className="w-3 h-3" /> Term In-Progress
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs col-span-2 md:col-span-1">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Overall Pass Rate</p>
              <p className="text-2xl font-serif font-bold text-emerald-700 mt-1">{overview?.overallPassRate ?? 92.5}%</p>
              <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1 font-medium">
                <CheckCircle className="w-3 h-3 text-emerald-600" /> College Benchmark
              </p>
            </div>
          </div>

          {/* Analytics Charts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Grade Distribution */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-amber-600" /> College Grade Distribution (All Marks)
              </h3>
              <p className="text-xs text-slate-500 mb-4">Evaluation across all assessment categories</p>
              {gradeChartData ? (
                <div className="h-64 flex items-center justify-center">
                  <Doughnut
                    data={gradeChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { position: 'bottom' } }
                    }}
                  />
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-12">Loading distribution...</p>
              )}
            </div>

            {/* Average by Exam Type */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
                <Award className="w-4 h-4 text-[#0f2744]" /> Average Score by Assessment Format
              </h3>
              <p className="text-xs text-slate-500 mb-4">Comparative evaluation: Midterms, Internals & Finals</p>
              {examTypeChartData ? (
                <div className="h-64">
                  <Bar
                    data={examTypeChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: { y: { min: 0, max: 100 } }
                    }}
                  />
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-12">Loading assessment averages...</p>
              )}
            </div>
          </div>

          {/* Department breakdown table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">Academic Departmental Overview</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-700">
                <thead className="bg-slate-100 text-slate-600 uppercase font-semibold text-[10px] tracking-wider">
                  <tr>
                    <th className="px-4 py-2.5">Code</th>
                    <th className="px-4 py-2.5">Department Name</th>
                    <th className="px-4 py-2.5">Enrolled Students</th>
                    <th className="px-4 py-2.5">Sections / Classes</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(overview?.departmentStats || []).map((d: any) => (
                    <tr key={d.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono font-bold text-[#0f2744]">{d.code}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{d.name}</td>
                      <td className="px-4 py-3">{d.studentCount} students</td>
                      <td className="px-4 py-3">{d.classCount} classes</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                          Accredited
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Institutional Lifecycle & Diagnostics */}
          <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-slate-700" /> Database Maintenance & Clean State
              </h3>
              <p className="text-xs text-slate-500">
                Production reset clears all classes, subjects, students, marks, and announcements, leaving only the primary administrator account.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleResetToFresh}
                disabled={isResetting}
                className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50 cursor-pointer shadow-2xs flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isResetting ? 'Resetting Database...' : 'Reset to Clean Production State'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CLASSES & COURSES */}
      {activeTab === 'classes' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Academic Classes & Sections</h2>
              <p className="text-xs text-slate-500">Configure year cohorts, departments, and class designations</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddClassModal(true)}
                className="px-3 py-1.5 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Class
              </button>
              <button
                onClick={() => setShowAddSubjectModal(true)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Subject
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map(c => (
              <div key={c.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:border-[#0f2744]/40 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    Year {c.year} • Section {c.section}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      {c.studentCount} Students
                    </span>
                    <button
                      onClick={() => handleDeleteClass(c.id, c.name)}
                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                      title="Delete Class"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <h3 className="text-lg font-serif font-bold text-[#0f2744] mt-2">{c.name}</h3>
                <p className="text-xs text-slate-500">{c.departmentName} ({c.department_id})</p>
              </div>
            ))}
          </div>

          {/* Subjects Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden mt-6">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Curriculum Subjects Catalogue</h3>
              <span className="text-xs text-slate-500">{subjects.length} courses registered</span>
            </div>
            <table className="w-full text-xs text-left text-slate-700">
              <thead className="bg-slate-100 text-slate-600 uppercase font-semibold text-[10px]">
                <tr>
                  <th className="px-4 py-2.5">Course Code</th>
                  <th className="px-4 py-2.5">Subject Title</th>
                  <th className="px-4 py-2.5">Department</th>
                  <th className="px-4 py-2.5">Max Marks</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {subjects.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono font-bold text-slate-900">{s.code}</td>
                    <td className="px-4 py-2.5 font-semibold text-[#0f2744]">{s.name}</td>
                    <td className="px-4 py-2.5">{s.departmentName || s.department_id}</td>
                    <td className="px-4 py-2.5 font-mono">{s.max_marks} pts</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => handleDeleteSubject(s.id, s.name)}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                        title="Delete Subject"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: USER DIRECTORY & CSV IMPORT */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">User Directory</h2>
              <p className="text-xs text-slate-500">Manage institutional accounts, toggle status, and reset credentials</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddUserModal(true)}
                className="px-3 py-1.5 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Single User
              </button>
              <button
                onClick={() => setShowBulkImportModal(true)}
                className="px-3 py-1.5 bg-emerald-700 text-white hover:bg-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Bulk CSV Import
              </button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search by name, email, or roll number..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0f2744] bg-slate-50"
              />
            </div>
            <select
              value={userRoleFilter}
              onChange={e => setUserRoleFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">All Roles</option>
              <option value="student">Students Only</option>
              <option value="teacher">Faculty Only</option>
              <option value="admin">Administrators Only</option>
            </select>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <table className="w-full text-xs text-left text-slate-700">
              <thead className="bg-slate-100 text-slate-600 uppercase font-semibold text-[10px]">
                <tr>
                  <th className="px-4 py-3">Full Name & Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Class / Roll No</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {users
                  .filter(u => {
                    if (userRoleFilter && u.role !== userRoleFilter) return false;
                    if (userSearch) {
                      const s = userSearch.toLowerCase();
                      return u.full_name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s) || (u.roll_number && u.roll_number.toLowerCase().includes(s));
                    }
                    return true;
                  })
                  .map(u => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{u.full_name}</p>
                        <p className="text-[11px] text-slate-500">{u.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          u.role === 'admin' ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                          u.role === 'teacher' ? 'bg-sky-100 text-sky-900 border border-sky-300' :
                          'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {u.role === 'student' ? (
                          <span className="font-mono text-slate-700">{u.roll_number || 'N/A'} • {u.class_name || 'Enrolled'}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          u.is_active !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {u.is_active !== false ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => handleToggleUserStatus(u.id)}
                          className={`px-2 py-1 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
                            u.is_active !== false
                              ? 'text-red-700 border-red-200 hover:bg-red-50'
                              : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                          }`}
                        >
                          {u.is_active !== false ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => handleResetPassword(u.id)}
                          className="px-2 py-1 rounded text-[10px] font-semibold text-slate-700 border border-slate-200 hover:bg-slate-100 cursor-pointer"
                        >
                          Reset Pwd
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: TEACHER CLASS ASSIGNMENTS (SINGLE SOURCE OF TRUTH & HISTORY) */}
      {activeTab === 'assignments' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Teacher Class & Subject Assignments</h2>
              <p className="text-xs text-slate-500">
                Single source of truth for faculty authorization. Active scopes and archived history are tracked separately.
              </p>
            </div>
            <button
              onClick={() => setShowAssignModal(true)}
              className="px-3 py-1.5 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Assign Teacher
            </button>
          </div>

          {/* Active Assignments */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 bg-emerald-50/60 border-b border-emerald-200 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-600" /> Active Teaching Assignments ({assignments.active.length})
              </h3>
            </div>
            <table className="w-full text-xs text-left text-slate-700">
              <thead className="bg-slate-100 text-slate-600 uppercase font-semibold text-[10px]">
                <tr>
                  <th className="px-4 py-2.5">Faculty Member</th>
                  <th className="px-4 py-2.5">Assigned Class</th>
                  <th className="px-4 py-2.5">Subject Course</th>
                  <th className="px-4 py-2.5">Semester Term</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {assignments.active.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-[#0f2744]">
                      {a.teacherName} <span className="text-[11px] text-slate-500 block font-normal">{a.teacherEmail}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{a.className}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-slate-800">{a.subjectCode}</span> - {a.subjectName}
                    </td>
                    <td className="px-4 py-3">{a.semesterName}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleArchiveAssignment(a.id)}
                        className="px-2.5 py-1 text-slate-600 hover:text-amber-900 hover:bg-amber-50 rounded border border-slate-200 transition-all text-[10px] font-semibold flex items-center gap-1 ml-auto cursor-pointer"
                        title="Archive to historical records without deleting data"
                      >
                        <Archive className="w-3 h-3 text-amber-600" /> Move to Past
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Past / Historical Assignments */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden opacity-90">
            <div className="p-4 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Archive className="w-4 h-4 text-slate-500" /> Past / Historical Assignments ({assignments.past.length})
              </h3>
            </div>
            {assignments.past.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-400">No past assignments archived yet.</p>
            ) : (
              <table className="w-full text-xs text-left text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-[10px]">
                  <tr>
                    <th className="px-4 py-2.5">Faculty Member</th>
                    <th className="px-4 py-2.5">Class</th>
                    <th className="px-4 py-2.5">Subject</th>
                    <th className="px-4 py-2.5">Semester</th>
                    <th className="px-4 py-2.5">Record Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {assignments.past.map(a => (
                    <tr key={a.id} className="hover:bg-slate-50 text-slate-600">
                      <td className="px-4 py-2.5 font-semibold">{a.teacherName}</td>
                      <td className="px-4 py-2.5">{a.className}</td>
                      <td className="px-4 py-2.5">{a.subjectCode} - {a.subjectName}</td>
                      <td className="px-4 py-2.5">{a.semesterName}</td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                          Historical Record
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: OFFICIAL MARKSHEETS */}
      {activeTab === 'marksheets' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Upload Official Marksheets (PDF)</h2>
              <p className="text-xs text-slate-500">Record certified institutional semester transcripts for student profiles</p>
            </div>
          </div>

          <form onSubmit={handleUploadMarksheet} className="max-w-xl space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Select Student</label>
              <select
                value={marksheetData.student_id}
                onChange={e => setMarksheetData({ ...marksheetData, student_id: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50"
              >
                {users.filter(u => u.role === 'student' && u.student_id).map(s => (
                  <option key={s.student_id} value={s.student_id}>
                    {s.full_name} ({s.roll_number || s.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Semester</label>
                <select
                  value={marksheetData.semester_id}
                  onChange={e => setMarksheetData({ ...marksheetData, semester_id: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50"
                >
                  {semesters.map(sem => (
                    <option key={sem.id} value={sem.id}>{sem.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Document File Name</label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      setMarksheetFile(e.target.files[0]);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">SGPA (0 - 10)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  value={marksheetData.sgpa}
                  onChange={e => setMarksheetData({ ...marksheetData, sgpa: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cumulative CGPA (0 - 10)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  value={marksheetData.cgpa}
                  onChange={e => setMarksheetData({ ...marksheetData, cgpa: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50"
                />
              </div>
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Upload className="w-4 h-4" /> Save & Publish Marksheet
            </button>
          </form>

          {/* BULK MARKSHEET ZIP UPLOADER */}
          <div className="pt-6 border-t border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileArchive className="w-4 h-4 text-indigo-600" /> Bulk Marksheets ZIP Archive Processor
                </h3>
                <p className="text-xs text-slate-500">
                  Upload a compressed .zip archive containing individual student transcripts formatted as <code className="font-mono text-[11px] bg-slate-100 px-1 py-0.5 rounded">ROLLNUMBER_sem_X.pdf</code>.
                </p>
              </div>
            </div>

            <form onSubmit={handleZipUpload} className="max-w-xl space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Semester</label>
                  <select
                    value={zipSemesterId}
                    onChange={e => setZipSemesterId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    {semesters.map(sem => (
                      <option key={sem.id} value={sem.id}>{sem.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Select .ZIP Archive</label>
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    onChange={e => setZipFile(e.target.files?.[0] || null)}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-slate-200 file:text-slate-800"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isUploadingZip || !zipFile}
                className="px-4 py-2 bg-indigo-900 text-white hover:bg-indigo-950 disabled:opacity-50 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Upload className="w-4 h-4 text-indigo-300" />
                {isUploadingZip ? 'Extracting & Matching ZIP...' : 'Process & Distribute Marksheets Archive'}
              </button>

              {zipUploadReport && (
                <div className="mt-4 p-3 bg-white rounded-lg border border-slate-300 text-xs space-y-2">
                  <div className="flex items-center justify-between font-semibold text-slate-800">
                    <span>Matched Transcripts: {zipUploadReport.summary.matched}</span>
                    <span>Unmatched Files: {zipUploadReport.summary.unmatched}</span>
                  </div>
                  {zipUploadReport.unmatchedFiles && zipUploadReport.unmatchedFiles.length > 0 && (
                    <div className="text-[11px] text-red-600 space-y-1">
                      <p className="font-semibold">Unmatched file entries:</p>
                      <ul className="list-disc pl-4">
                        {zipUploadReport.unmatchedFiles.map((f: any, i: number) => (
                          <li key={i}>{f.fileName} — {f.reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* TAB 6: BROADCAST NOTICES */}
      {activeTab === 'notices' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h2 className="text-base font-bold text-slate-900">Broadcast Campus Circulars & Notices</h2>
            <p className="text-xs text-slate-500">Publish targeted administrative communications across the institution</p>
          </div>

          <form onSubmit={handleBroadcastNotice} className="max-w-xl space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Notice Headline</label>
              <input
                type="text"
                required
                placeholder="e.g. End-Semester Examination Registration Schedule"
                value={noticeData.title}
                onChange={e => setNoticeData({ ...noticeData, title: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Audience</label>
              <select
                value={noticeData.target_role}
                onChange={e => setNoticeData({ ...noticeData, target_role: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50"
              >
                <option value="all">Entire Institution (All Users)</option>
                <option value="all_students">All Students</option>
                <option value="all_teachers">All Faculty Members</option>
                <option value="class">Specific Class Cohort Only</option>
              </select>
            </div>

            {noticeData.target_role === 'class' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Class Cohort</label>
                <select
                  value={noticeData.target_class_id}
                  onChange={e => setNoticeData({ ...noticeData, target_class_id: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50"
                >
                  <option value="">Select Class...</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Notice Body / Directives</label>
              <textarea
                required
                rows={4}
                placeholder="Details of the circular, deadlines, guidelines..."
                value={noticeData.body}
                onChange={e => setNoticeData({ ...noticeData, body: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50"
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Send className="w-4 h-4" /> Publish Circular
            </button>
          </form>
        </div>
      )}

      {/* TAB 7: COLLEGE EVENTS & HACKATHONS */}
      {activeTab === 'events' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" /> College Events, Hackathons & Seminars
              </h2>
              <p className="text-xs text-slate-500">
                Manage upcoming inter-college hackathons, technical symposiums, and institutional workshops
              </p>
            </div>
            <button
              onClick={() => setShowAddEventModal(true)}
              className="px-3 py-1.5 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Publish New Event
            </button>
          </div>

          {events.length === 0 ? (
            <div className="bg-white p-8 rounded-xl border border-slate-200 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 mx-auto flex items-center justify-center">
                <Trophy className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-800">No College Events Recorded</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No technical hackathons or seminars are currently scheduled. Publish an event to display it to students and faculty.
              </p>
              <button
                onClick={() => setShowAddEventModal(true)}
                className="px-3 py-1.5 bg-[#0f2744] text-white rounded-lg text-xs font-semibold"
              >
                Create First Event
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {events.map(ev => (
                <div key={ev.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-all">
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        ev.status === 'upcoming'
                          ? 'bg-amber-100 text-amber-800'
                          : ev.status === 'ongoing'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {ev.status}
                      </span>
                      <button
                        onClick={() => handleDeleteEvent(ev.id, ev.name)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors cursor-pointer"
                        title="Delete Event"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900 leading-snug">{ev.name}</h3>
                    <p className="text-xs text-slate-600 line-clamp-2">{ev.description}</p>

                    <div className="pt-2 border-t border-slate-100 space-y-1 text-xs text-slate-600">
                      <p className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Date: <strong>{ev.event_date}</strong></span>
                      </p>
                      {ev.location && (
                        <p className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{ev.location}</span>
                        </p>
                      )}
                      <p className="text-[11px] text-slate-500">Organizer: {ev.organizer}</p>
                      {ev.eligibility && (
                        <p className="text-[11px] text-slate-500">Eligibility: {ev.eligibility}</p>
                      )}
                    </div>
                  </div>

                  {ev.registration_link && (
                    <div className="pt-3 mt-3 border-t border-slate-100">
                      <a
                        href={ev.registration_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-sky-700 hover:underline flex items-center gap-1 font-medium"
                      >
                        <ExternalLink className="w-3 h-3" /> Registration Portal
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 8: AUDIT TRAIL & SYSTEM LOGS */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" /> Institutional Audit Trail & Activity Logs
              </h2>
              <p className="text-xs text-slate-500">
                Immutable chronological log of all administrative actions, grading events, and student access
              </p>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filter audit entries by actor, action..."
                value={auditFilter}
                onChange={e => setAuditFilter(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 w-64"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <table className="w-full text-xs text-left text-slate-700">
              <thead className="bg-slate-100 text-slate-600 uppercase font-semibold text-[10px]">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action Type</th>
                  <th className="px-4 py-3">Target / Resource</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {auditLogs
                  .filter(l => {
                    if (!auditFilter) return true;
                    const q = auditFilter.toLowerCase();
                    return (
                      (l.actor_name || '').toLowerCase().includes(q) ||
                      (l.action_type || '').toLowerCase().includes(q) ||
                      (l.details || '').toLowerCase().includes(q) ||
                      (l.target_id || '').toLowerCase().includes(q)
                    );
                  })
                  .slice(0, 100)
                  .map((log, idx) => (
                    <tr key={log.id || idx} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        {new Date(log.created_at || log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-900">
                        {log.actor_name || log.actor_user_id || 'System'}
                        {log.actor_role && (
                          <span className="ml-1.5 px-1.5 py-0.2 rounded text-[10px] bg-slate-100 text-slate-600 font-normal uppercase">
                            {log.actor_role}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-800">
                          {log.action_type || log.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">
                        {log.target_id || log.entity_id || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {log.details ? (typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details)) : '—'}
                      </td>
                    </tr>
                  ))}
                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">
                      No audit log entries recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: BULK CSV IMPORT WITH VALIDATION REPORT */}
      {showBulkImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-[#0f2744] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm">Bulk CSV User Importer</h3>
              </div>
              <button onClick={() => { setShowBulkImportModal(false); setBulkReport(null); }} className="text-slate-400 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <label className="text-xs font-semibold text-slate-700">Import Role Target:</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setBulkRole('student')}
                      className={`px-3 py-1 rounded text-xs font-semibold ${bulkRole === 'student' ? 'bg-[#0f2744] text-white' : 'bg-slate-100 text-slate-700'}`}
                    >
                      Students
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkRole('teacher')}
                      className={`px-3 py-1 rounded text-xs font-semibold ${bulkRole === 'teacher' ? 'bg-[#0f2744] text-white' : 'bg-slate-100 text-slate-700'}`}
                    >
                      Faculty
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={loadSampleCsv}
                  className="text-xs text-amber-700 hover:underline font-semibold cursor-pointer"
                >
                  Load Sample CSV Template
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Paste CSV Content</label>
                <textarea
                  rows={6}
                  value={csvContent}
                  onChange={e => setCsvContent(e.target.value)}
                  placeholder={bulkRole === 'student' ? "name,email,roll_number,class\n..." : "name,email\n..."}
                  className="w-full p-2.5 text-xs font-mono border border-slate-300 rounded-lg bg-slate-50 focus:ring-2 focus:ring-[#0f2744]"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkImportModal(false)}
                  className="px-4 py-2 bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isImporting}
                  onClick={handleBulkImport}
                  className="px-4 py-2 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {isImporting ? 'Validating & Importing...' : 'Validate & Import'}
                </button>
              </div>

              {/* Validation Report */}
              {bulkReport && (
                <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Import Validation Report:
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 bg-slate-100 rounded">
                      <p className="text-slate-500 text-[10px]">Total Evaluated</p>
                      <p className="font-bold text-slate-900">{bulkReport.summary.totalRows}</p>
                    </div>
                    <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-emerald-900">
                      <p className="text-[10px]">Imported Successfully</p>
                      <p className="font-bold text-emerald-700">{bulkReport.summary.successfulCount}</p>
                    </div>
                    <div className="p-2 bg-red-50 border border-red-200 rounded text-red-900">
                      <p className="text-[10px]">Rejected / Failed</p>
                      <p className="font-bold text-red-700">{bulkReport.summary.failedCount}</p>
                    </div>
                  </div>

                  {bulkReport.failedRows.length > 0 && (
                    <div className="bg-red-50 p-3 rounded-lg border border-red-200 text-xs">
                      <p className="font-bold text-red-900 mb-1">Failed Rows Breakdown:</p>
                      <ul className="list-disc pl-4 space-y-1 text-[11px] text-red-800">
                        {bulkReport.failedRows.map((f, i) => (
                          <li key={i}>
                            <strong>Row {f.rowNumber}:</strong> {f.reason} (<span className="font-mono">{f.data}</span>)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE CLASS */}
      {showAddClassModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 p-5 space-y-4">
            <h3 className="font-bold text-sm text-[#0f2744]">Create New Class / Section</h3>
            <form onSubmit={handleCreateClass} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Class Cohort Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CS-3B"
                  value={newClassData.name}
                  onChange={e => setNewClassData({ ...newClassData, name: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                <select
                  value={newClassData.department_id}
                  onChange={e => setNewClassData({ ...newClassData, department_id: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                >
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Academic Year</label>
                  <input
                    type="number"
                    min="1"
                    max="4"
                    value={newClassData.year}
                    onChange={e => setNewClassData({ ...newClassData, year: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Section</label>
                  <input
                    type="text"
                    value={newClassData.section}
                    onChange={e => setNewClassData({ ...newClassData, section: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddClassModal(false)}
                  className="px-3 py-1.5 bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-[#0f2744] text-white rounded-lg text-xs font-semibold"
                >
                  Create Class
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN TEACHER TO CLASS & SUBJECT */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 p-5 space-y-4">
            <h3 className="font-bold text-sm text-[#0f2744]">Assign Faculty Scope</h3>
            <p className="text-xs text-slate-500">Link an instructor to a class cohort, subject curriculum, and semester.</p>
            <form onSubmit={handleCreateAssignment} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Faculty Member</label>
                <select
                  value={newAssignData.teacher_user_id}
                  onChange={e => setNewAssignData({ ...newAssignData, teacher_user_id: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                >
                  {users.filter(u => u.role === 'teacher').map(t => (
                    <option key={t.id} value={t.id}>{t.full_name} ({t.email})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Class Cohort</label>
                <select
                  value={newAssignData.class_id}
                  onChange={e => setNewAssignData({ ...newAssignData, class_id: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subject Course</label>
                <select
                  value={newAssignData.subject_id}
                  onChange={e => setNewAssignData({ ...newAssignData, subject_id: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                >
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Semester Term</label>
                <select
                  value={newAssignData.semester_id}
                  onChange={e => setNewAssignData({ ...newAssignData, semester_id: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                >
                  {semesters.map(sem => (
                    <option key={sem.id} value={sem.id}>{sem.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-3 py-1.5 bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-[#0f2744] text-white rounded-lg text-xs font-semibold"
                >
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADVANCE TO NEW SEMESTER */}
      {showStartSemesterModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-[#0f2744] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm">Advance Academic Term / Semester</h3>
              </div>
              <button onClick={() => setShowStartSemesterModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleStartNewSemester} className="p-5 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Starting a new term will systematically archive all current active teaching assignments into permanent historical records, preserve all student marks, and set the new term as the active institutional period.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Term Name / Label</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Spring 2026 or Semester VI (2025-26)"
                  value={newSemesterName}
                  onChange={e => setNewSemesterName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800">
                ⚠️ Current faculty class scopes will be archived. You can immediately assign teachers to their new classes in the Teacher Scopes tab.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowStartSemesterModal(false)}
                  className="px-3 py-1.5 bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isStartingSemester || !newSemesterName.trim()}
                  className="px-3 py-1.5 bg-[#0f2744] text-white hover:bg-[#163354] disabled:opacity-50 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  {isStartingSemester ? 'Transitioning...' : 'Transition Academic Term'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PUBLISH COLLEGE EVENT / HACKATHON */}
      {showAddEventModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-[#0f2744] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm">Publish College Event or Hackathon</h3>
              </div>
              <button onClick={() => setShowAddEventModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Event / Hackathon Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vission Hack 2026: AI & Systems Sprint"
                  value={newEventData.name}
                  onChange={e => setNewEventData({ ...newEventData, name: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Event Date</label>
                  <input
                    type="date"
                    required
                    value={newEventData.event_date}
                    onChange={e => setNewEventData({ ...newEventData, event_date: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Registration Deadline</label>
                  <input
                    type="date"
                    value={newEventData.registration_deadline}
                    onChange={e => setNewEventData({ ...newEventData, registration_deadline: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Organizing Body</label>
                  <input
                    type="text"
                    required
                    value={newEventData.organizer}
                    onChange={e => setNewEventData({ ...newEventData, organizer: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Location / Venue</label>
                  <input
                    type="text"
                    value={newEventData.location}
                    onChange={e => setNewEventData({ ...newEventData, location: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Eligibility Criteria</label>
                <input
                  type="text"
                  placeholder="e.g. All 2nd & 3rd Year Engineering Students"
                  value={newEventData.eligibility}
                  onChange={e => setNewEventData({ ...newEventData, eligibility: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Registration Portal / External URL</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={newEventData.registration_link}
                  onChange={e => setNewEventData({ ...newEventData, registration_link: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Event Description & Rules</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Overview of the hackathon, prize tracks, schedule, rules..."
                  value={newEventData.description}
                  onChange={e => setNewEventData({ ...newEventData, description: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddEventModal(false)}
                  className="px-3 py-1.5 bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Publish Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

