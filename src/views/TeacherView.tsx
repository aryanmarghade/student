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
  Trophy,
  BarChart2,
  Github,
  Code,
  Linkedin,
  User
} from 'lucide-react';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import '../lib/chart-setup';
import { PostCard } from '../components/PostCard';

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

  // Per-Student Analytics Dossier Modal State
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [studentAnalyticsData, setStudentAnalyticsData] = useState<any | null>(null);
  const [isAnalyticsModalLoading, setIsAnalyticsModalLoading] = useState(false);

  const handleOpenStudentAnalytics = async (studentId: string) => {
    if (!selectedAssignment) return;
    setShowAnalyticsModal(true);
    setIsAnalyticsModalLoading(true);
    setStudentAnalyticsData(null);
    try {
      const data = await api.getStudentAnalyticsForTeacher(studentId, {
        classId: selectedAssignment.class_id,
        subjectId: selectedAssignment.subject_id,
        semesterId: selectedAssignment.semester_id,
      });
      setStudentAnalyticsData(data);
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to load student analytics dossier');
    } finally {
      setIsAnalyticsModalLoading(false);
    }
  };
  const [profileSection, setProfileSection] = useState<'overview' | 'posts' | 'achievements' | 'projects' | 'certifications' | 'documents' | 'skills'>('overview');

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
  const [assessmentDraft, setAssessmentDraft] = useState({ title: '', max_marks: '25', assessment_type: 'Other' });
  const [isCreatingAssessment, setIsCreatingAssessment] = useState(false);

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

  const normalizeArray = (value: any) => Array.isArray(value) ? value : [];

  const getAvatarInitials = (name?: string) => {
    const parts = (name || 'ST').split(' ').filter(Boolean);
    return parts.slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'ST';
  };

  const formatDate = (value?: string | null) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getProfileLinks = (profile: any) => {
    const links = [
      { label: 'GitHub', url: profile?.github_url || profile?.profile_links?.github },
      { label: 'LinkedIn', url: profile?.linkedin_url || profile?.profile_links?.linkedin },
      { label: 'HackerRank', url: profile?.hackerrank_url || profile?.profile_links?.hackerrank },
      { label: 'Portfolio', url: profile?.portfolio_url || profile?.profile_links?.portfolio },
      { label: 'Resume', url: profile?.resume_url || profile?.profile_links?.resume },
    ];
    return links.filter((link) => link.url && String(link.url).trim());
  };

  const buildActivityPosts = (profile: any) => {
    const posts: any[] = [];

    normalizeArray(profile?.projects).forEach((project: any) => {
      posts.push({
        id: project.id || `project-${project.title}`,
        category: 'Project',
        title: project.title || 'Project',
        description: project.description || 'No description provided.',
        date: project.date || project.created_at,
        tags: normalizeArray(project.technologies).map((tag: any) => typeof tag === 'string' ? tag : (tag.skill_name || tag.name || '')),
        media: project.image_url ? [project.image_url] : [],
        attachments: [
          ...(project.github_url ? [{ label: 'GitHub', url: project.github_url }] : []),
          ...(project.live_url ? [{ label: 'Live Demo', url: project.live_url }] : []),
        ],
      });
    });

    normalizeArray(profile?.achievements).forEach((achievement: any) => {
      posts.push({
        id: achievement.id || `achievement-${achievement.title}`,
        category: 'Achievement',
        title: achievement.title || 'Achievement',
        description: achievement.description || 'No description provided.',
        date: achievement.date || achievement.created_at,
        tags: [achievement.organization || 'Achievement'],
        media: achievement.certificate_url ? [achievement.certificate_url] : [],
        attachments: [
          ...(achievement.link ? [{ label: 'Verification Link', url: achievement.link }] : []),
          ...(achievement.certificate_url ? [{ label: 'Certificate', url: achievement.certificate_url }] : []),
        ],
      });
    });

    normalizeArray(profile?.hackathons).forEach((hackathon: any) => {
      posts.push({
        id: hackathon.id || `hackathon-${hackathon.name}`,
        category: 'Hackathon',
        title: hackathon.name || 'Hackathon',
        description: hackathon.project_description || hackathon.position_result || 'No description provided.',
        date: hackathon.date || hackathon.created_at,
        tags: [hackathon.position_result, hackathon.organizer, hackathon.project_name].filter(Boolean),
        media: hackathon.certificate_url ? [hackathon.certificate_url] : [],
        attachments: [
          ...(hackathon.github_url ? [{ label: 'GitHub', url: hackathon.github_url }] : []),
          ...(hackathon.demo_url ? [{ label: 'Demo', url: hackathon.demo_url }] : []),
          ...(hackathon.certificate_url ? [{ label: 'Certificate', url: hackathon.certificate_url }] : []),
        ],
      });
    });

    return posts.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  };

  const getStudentSkills = (profile: any) => {
    const collected = new Set<string>();

    normalizeArray(profile?.skills).forEach((skill: any) => {
      const name = typeof skill === 'string' ? skill : (skill.skill_name || skill.name || '');
      if (name) collected.add(name);
    });

    normalizeArray(profile?.projects).forEach((project: any) => {
      normalizeArray(project.technologies).forEach((tag: any) => {
        const name = typeof tag === 'string' ? tag : (tag.skill_name || tag.name || '');
        if (name) collected.add(name);
      });
    });

    return Array.from(collected);
  };

  const openTeacherDocument = async (studentId: string, document: any) => {
    const token = localStorage.getItem('vission_academy_jwt');
    const response = await fetch(`/api/teacher/students/${studentId}/documents/${document.id}/file`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      throw new Error('Unable to open this document right now.');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
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

  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment || !assessmentDraft.title.trim()) return;

    setIsCreatingAssessment(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      const res = await api.createTeacherAssessment(selectedAssignment.class_id, selectedAssignment.subject_id, {
        semester_id: selectedAssignment.semester_id,
        title: assessmentDraft.title.trim(),
        max_marks: Number(assessmentDraft.max_marks),
        assessment_type: assessmentDraft.assessment_type,
      });
      setFeedbackSuccess(res.message);
      setAssessmentDraft({ title: '', max_marks: '25', assessment_type: 'Other' });
      await selectAssignment(selectedAssignment);
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to create assessment definition');
    } finally {
      setIsCreatingAssessment(false);
    }
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

  const handleVerifyPortfolioItem = async (studentId: string, type: 'projects' | 'achievements' | 'certifications' | 'hackathons', itemId: string) => {
    try {
      const res = await api.verifyStudentPortfolioItem(studentId, type, itemId, 'Verified');
      setFeedbackSuccess(res.message || 'Item verified successfully');
      const prof = await api.getStudentFullProfileForTeacher(studentId);
      setSelectedStudentProfile(prof);
    } catch (err: any) {
      setFeedbackError(err.message || `Failed to verify ${type}`);
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
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 border border-slate-300 flex items-center justify-center overflow-hidden shrink-0">
                                {s.profile_photo_url ? (
                                  <img src={s.profile_photo_url} alt={s.full_name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[10px] font-bold uppercase">{s.full_name?.slice(0, 2) || 'ST'}</span>
                                )}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900">{s.full_name}</div>
                                <div className="text-[10px] text-slate-500">
                                  {s.department_name || 'Dept'} • {s.class_name || 'Class'} {s.class_year ? `• ${s.class_year}` : ''}
                                </div>
                              </div>
                            </div>
                          </td>
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
                                onClick={() => handleOpenStudentAnalytics(s.id)}
                                className="px-2 py-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-300 cursor-pointer flex items-center gap-1"
                                title="View Per-Student Analytics Dossier"
                              >
                                <BarChart2 className="w-3 h-3 text-emerald-600" /> Analytics
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

              <form onSubmit={handleCreateAssessment} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-3 lg:flex-row lg:items-end">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">Assessment Title</label>
                  <input
                    type="text"
                    value={assessmentDraft.title}
                    onChange={e => setAssessmentDraft(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="CA 1, Quiz, Viva, Seminar..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-[#0f2744]"
                  />
                </div>
                <div className="w-full lg:w-36">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">Max Marks</label>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    value={assessmentDraft.max_marks}
                    onChange={e => setAssessmentDraft(prev => ({ ...prev, max_marks: e.target.value }))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-[#0f2744]"
                  />
                </div>
                <div className="w-full lg:w-40">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">Assessment Type</label>
                  <select
                    value={assessmentDraft.assessment_type}
                    onChange={e => setAssessmentDraft(prev => ({ ...prev, assessment_type: e.target.value }))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-[#0f2744]"
                  >
                    <option value="Internal">Internal</option>
                    <option value="Mid Sem">Mid Sem</option>
                    <option value="Final">Final</option>
                    <option value="Assignment">Assignment</option>
                    <option value="Practical">Practical</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={isCreatingAssessment || !assessmentDraft.title.trim()}
                  className="px-4 py-2 bg-[#0f2744] text-white rounded-lg text-xs font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {isCreatingAssessment ? 'Creating...' : 'Add Assessment'}
                </button>
              </form>

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
              {analyticsData?.statistics && (
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
              {analyticsData?.charts && (
                <>
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

              {/* 3. Bar Chart: Average by Exam Type / Internal Marks */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
                <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-[#0f2744]" /> Internal Marks Performance by Assessment Format
                </h3>
                <p className="text-xs text-slate-500 mb-4">Comparison between internal tests, midterm, assignments, and exams</p>
                {barExamData ? (
                  <div className="h-64">
                    <Bar
                      data={barExamData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: { y: { min: 0, max: 100, title: { display: true, text: 'Average Score (%)' } } }
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </>
          )}

          {/* 4. External Student Activity: GitHub Contributions & LinkedIn Posts */}
              {(analyticsData?.externalActivity?.totalPosts !== undefined || analyticsData?.externalActivity?.githubTotalRepos !== undefined) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 4A. LinkedIn / Student Posts Activity */}
                  {analyticsData?.externalActivity?.totalPosts !== undefined && (
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <Linkedin className="w-4 h-4 text-blue-600" /> LinkedIn & Student Posts Activity
                      </h3>
                      <p className="text-xs text-slate-500">Student publications and active participation</p>
                    </div>
                    <span className="px-2.5 py-1 rounded bg-blue-50 text-blue-800 font-mono text-xs font-bold border border-blue-200">
                      Total Posts: {analyticsData?.externalActivity?.totalPosts ?? 0}
                    </span>
                  </div>

                  {analyticsData?.externalActivity?.postsByMonth && analyticsData.externalActivity.postsByMonth.length > 0 ? (
                    <div className="h-56 w-full">
                      <Bar
                        data={{
                          labels: analyticsData.externalActivity.postsByMonth.map(p => p.label || p.month),
                          datasets: [
                            {
                              label: 'Number of Posts Published',
                              data: analyticsData.externalActivity.postsByMonth.map(p => p.count),
                              backgroundColor: '#2563eb',
                              borderRadius: 4,
                            },
                          ],
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          scales: {
                            y: { beginAtZero: true, ticks: { stepSize: 1 }, title: { display: true, text: 'Posts Count' } },
                            x: { title: { display: true, text: 'Month' } },
                          },
                        }}
                      />
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                      <Linkedin className="w-6 h-6 text-slate-300 mx-auto mb-1" />
                      <p className="text-xs">No student posts published yet in this cohort.</p>
                    </div>
                  )}
                    </div>
                  )}

                  {/* 4B. GitHub Contributions & Repositories */}
                  {analyticsData?.externalActivity?.githubTotalRepos !== undefined && (
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <Github className="w-4 h-4 text-slate-900" /> GitHub Contributions & Repositories
                      </h3>
                      <p className="text-xs text-slate-500">Synced open source repositories & stars</p>
                    </div>
                    <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-800 font-mono text-xs font-bold border border-slate-200">
                      Synced: {analyticsData?.externalActivity?.githubSyncedCount ?? 0} / {analyticsData?.totalStudentsIncluded ?? 0}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 bg-slate-50 rounded border border-slate-200">
                      <p className="text-[10px] text-slate-500 font-semibold uppercase">Total Repos</p>
                      <p className="font-bold text-slate-900 font-mono text-sm">{analyticsData?.externalActivity?.githubTotalRepos ?? 0}</p>
                    </div>
                    <div className="p-2 bg-slate-50 rounded border border-slate-200">
                      <p className="text-[10px] text-slate-500 font-semibold uppercase">Total Stars</p>
                      <p className="font-bold text-amber-700 font-mono text-sm">★ {analyticsData?.externalActivity?.githubTotalStars ?? 0}</p>
                    </div>
                    <div className="p-2 bg-slate-50 rounded border border-slate-200">
                      <p className="text-[10px] text-slate-500 font-semibold uppercase">Contributions</p>
                      <p className="font-bold text-emerald-800 font-mono text-sm">{analyticsData?.externalActivity?.githubTotalContributions ?? 0}</p>
                    </div>
                  </div>

                  {(analyticsData?.externalActivity?.githubTotalRepos ?? 0) > 0 ? (
                    <div className="h-44 w-full">
                      <Bar
                        data={{
                          labels: ['Public Repositories', 'Total Stars', 'Synced Profiles'],
                          datasets: [
                            {
                              label: 'GitHub Aggregates',
                              data: [
                                analyticsData?.externalActivity?.githubTotalRepos ?? 0,
                                analyticsData?.externalActivity?.githubTotalStars ?? 0,
                                analyticsData?.externalActivity?.githubSyncedCount ?? 0,
                              ],
                              backgroundColor: ['#0f2744', '#d97706', '#059669'],
                              borderRadius: 4,
                            },
                          ],
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                        }}
                      />
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                      <Github className="w-6 h-6 text-slate-300 mx-auto mb-1" />
                      <p className="text-xs">GitHub profiles not synced or no public repositories.</p>
                    </div>
                  )}
                    </div>
                  )}
                </div>
              )}
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full min-h-screen bg-white flex flex-col">
            <div className="p-4 bg-[#0f2744] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm">
                  {isLoadingStudentProfile ? 'Loading Student Dossier...' : 'Student Portfolio'}
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
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-sky-100 to-slate-300 border border-slate-300 overflow-hidden shrink-0 flex items-center justify-center">
                          {selectedStudentProfile.profile_photo_url ? (
                            <img src={selectedStudentProfile.profile_photo_url} alt={selectedStudentProfile.full_name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-base font-bold uppercase text-slate-700">{getAvatarInitials(selectedStudentProfile.full_name)}</span>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-xl font-bold text-slate-900">{selectedStudentProfile.full_name}</h4>
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                              Profile {selectedStudentProfile.profile_strength || 0}%
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                            <span className="font-mono font-semibold text-[#0f2744]">Roll: {selectedStudentProfile.roll_number}</span>
                            <span>•</span>
                            <span>{selectedStudentProfile.departmentName || 'Department'}</span>
                            <span>•</span>
                            <span>{selectedStudentProfile.className || 'Class'} • {selectedStudentProfile.classYear ? `Year ${selectedStudentProfile.classYear}` : 'Year N/A'}</span>
                          </div>

                          <div className="text-xs text-slate-500">
                            {selectedStudentProfile.email}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {getProfileLinks(selectedStudentProfile).map((link) => (
                              <a
                                key={link.label}
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 bg-white text-[11px] font-semibold text-sky-700 hover:bg-sky-50"
                              >
                                {link.label} <ExternalLink className="w-3 h-3" />
                              </a>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
                    {[
                      { id: 'overview', label: 'Overview' },
                      { id: 'posts', label: 'Posts' },
                      { id: 'achievements', label: 'Achievements' },
                      { id: 'projects', label: 'Projects' },
                      { id: 'certifications', label: 'Certifications' },
                      { id: 'documents', label: 'Documents' },
                      { id: 'skills', label: 'Skills' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setProfileSection(tab.id as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          profileSection === tab.id
                            ? 'bg-[#0f2744] text-white border-[#0f2744]'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {profileSection === 'overview' && (
                    <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.9fr] gap-5">
                      <div className="space-y-4">
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">About</h5>
                          <p className="text-sm text-slate-700 leading-relaxed">
                            {selectedStudentProfile.bio?.trim() || 'Student has not added a bio yet.'}
                          </p>
                        </div>

                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">Academic Snapshot</h5>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
                            <div className="bg-white border border-slate-200 rounded-lg p-3">
                              <div className="text-[10px] uppercase tracking-wider text-slate-500">Class / Section</div>
                              <div className="mt-1 font-semibold text-slate-900">{selectedStudentProfile.className || 'N/A'}</div>
                            </div>
                            <div className="bg-white border border-slate-200 rounded-lg p-3">
                              <div className="text-[10px] uppercase tracking-wider text-slate-500">Branch</div>
                              <div className="mt-1 font-semibold text-slate-900">{selectedStudentProfile.departmentName || 'N/A'}</div>
                            </div>
                            <div className="bg-white border border-slate-200 rounded-lg p-3">
                              <div className="text-[10px] uppercase tracking-wider text-slate-500">Year / Semester</div>
                              <div className="mt-1 font-semibold text-slate-900">{selectedStudentProfile.classYear || 'N/A'}</div>
                            </div>
                            <div className="bg-white border border-slate-200 rounded-lg p-3">
                              <div className="text-[10px] uppercase tracking-wider text-slate-500">Institutional Email</div>
                              <div className="mt-1 font-semibold text-slate-900 break-all">{selectedStudentProfile.email || 'N/A'}</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">Profile Summary</h5>
                          <div className="space-y-3">
                            <div>
                              <div className="flex items-center justify-between text-[11px] text-slate-600">
                                <span>Profile Strength</span>
                                <span className="font-semibold text-slate-900">{selectedStudentProfile.profile_strength || 0}%</span>
                              </div>
                              <div className="mt-1 w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                                <div className="h-full rounded-full bg-[#b45309]" style={{ width: `${selectedStudentProfile.profile_strength || 0}%` }} />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                              <div className="bg-white border border-slate-200 rounded-lg p-2">
                                <div className="text-[10px] uppercase tracking-wider text-slate-500">Posts</div>
                                <div className="mt-1 font-bold text-slate-900">{normalizeArray(selectedStudentProfile.posts).length}</div>
                              </div>
                              <div className="bg-white border border-slate-200 rounded-lg p-2">
                                <div className="text-[10px] uppercase tracking-wider text-slate-500">Projects</div>
                                <div className="mt-1 font-bold text-slate-900">{normalizeArray(selectedStudentProfile.projects).length}</div>
                              </div>
                              <div className="bg-white border border-slate-200 rounded-lg p-2">
                                <div className="text-[10px] uppercase tracking-wider text-slate-500">Achievements</div>
                                <div className="mt-1 font-bold text-slate-900">{normalizeArray(selectedStudentProfile.achievements).length}</div>
                              </div>
                              <div className="bg-white border border-slate-200 rounded-lg p-2">
                                <div className="text-[10px] uppercase tracking-wider text-slate-500">Documents</div>
                                <div className="mt-1 font-bold text-slate-900">{normalizeArray(selectedStudentProfile.documents).length}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {profileSection === 'posts' && (
                    <div className="space-y-3">
                      {!selectedStudentProfile.posts || selectedStudentProfile.posts.length === 0 ? (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                          No posts yet.
                        </div>
                      ) : (
                        selectedStudentProfile.posts.map((post: any) => (
                          <PostCard 
                            key={post.id} 
                            post={post} 
                            student={selectedStudentProfile} 
                            viewerRole="teacher"
                          />
                        ))
                      )}
                    </div>
                  )}

                  {profileSection === 'achievements' && (
                    <div className="space-y-3">
                      {normalizeArray(selectedStudentProfile.achievements).length === 0 ? (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                          No achievements added yet.
                        </div>
                      ) : (
                        normalizeArray(selectedStudentProfile.achievements).map((achievement: any) => (
                          <div key={achievement.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <Trophy className="w-4 h-4 text-amber-600" />
                                  <h6 className="text-sm font-bold text-slate-900">{achievement.title}</h6>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">{achievement.organization || 'Achievement'} • {formatDate(achievement.date)}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  achievement.verification_status?.includes('Verified') 
                                    ? 'bg-emerald-100 text-emerald-800' 
                                    : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {achievement.verification_status?.includes('Verified') ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />} 
                                  {achievement.verification_status || 'Submitted'}
                                </span>
                                {(!achievement.verification_status || !achievement.verification_status.includes('Verified')) && (
                                  <button
                                    onClick={() => handleVerifyPortfolioItem(selectedStudentProfile.id, 'achievements', achievement.id)}
                                    className="px-2 py-1 bg-[#0f2744] text-white hover:bg-[#163354] rounded text-[10px] font-bold cursor-pointer"
                                  >
                                    Verify
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed">{achievement.description || 'No description provided.'}</p>
                            {achievement.link && (
                              <a href={achievement.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:underline">
                                Open Link <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {profileSection === 'projects' && (
                    <div className="space-y-3">
                      {normalizeArray(selectedStudentProfile.projects).length === 0 ? (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                          No projects added yet.
                        </div>
                      ) : (
                        normalizeArray(selectedStudentProfile.projects).map((project: any) => (
                          <div key={project.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h6 className="text-sm font-bold text-slate-900">{project.title}</h6>
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    project.verification_status?.includes('Verified') 
                                      ? 'bg-emerald-100 text-emerald-800' 
                                      : 'bg-amber-100 text-amber-800'
                                  }`}>
                                    {project.verification_status?.includes('Verified') ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />} 
                                    {project.verification_status || 'Submitted'}
                                  </span>
                                  {(!project.verification_status || !project.verification_status.includes('Verified')) && (
                                    <button
                                      onClick={() => handleVerifyPortfolioItem(selectedStudentProfile.id, 'projects', project.id)}
                                      className="px-2 py-1 bg-[#0f2744] text-white hover:bg-[#163354] rounded text-[10px] font-bold cursor-pointer"
                                    >
                                      Verify
                                    </button>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1">{formatDate(project.date)}</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {project.github_url && (
                                  <a href={project.github_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
                                    GitHub <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                                {project.live_url && (
                                  <a href={project.live_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
                                    Live Demo <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            </div>

                            {project.description && (
                              <p className="text-xs text-slate-700 leading-relaxed">{project.description}</p>
                            )}

                            {project.technologies && normalizeArray(project.technologies).length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {normalizeArray(project.technologies).map((tech: any, idx: number) => (
                                  <span key={`${project.id}-tech-${idx}`} className="px-2 py-0.5 rounded-full text-[10px] bg-slate-200 text-slate-700 font-semibold">
                                    {typeof tech === 'string' ? tech : (tech.skill_name || tech.name || '')}
                                  </span>
                                ))}
                              </div>
                            )}

                            {project.image_url && (
                              <img src={project.image_url} alt={project.title} className="w-full h-48 object-cover rounded-lg border border-slate-200" />
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {profileSection === 'certifications' && (
                    <div className="space-y-3">
                      {normalizeArray(selectedStudentProfile.certifications).length === 0 ? (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                          No certifications added yet.
                        </div>
                      ) : (
                        normalizeArray(selectedStudentProfile.certifications).map((certification: any) => (
                          <div key={certification.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Award className="w-4 h-4 text-amber-600" />
                                <h6 className="text-sm font-bold text-slate-900">{certification.name || certification.title}</h6>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  certification.verification_status?.includes('Verified') 
                                    ? 'bg-emerald-100 text-emerald-800' 
                                    : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {certification.verification_status?.includes('Verified') ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />} 
                                  {certification.verification_status || 'Submitted'}
                                </span>
                                {(!certification.verification_status || !certification.verification_status.includes('Verified')) && (
                                  <button
                                    onClick={() => handleVerifyPortfolioItem(selectedStudentProfile.id, 'certifications', certification.id)}
                                    className="px-2 py-1 bg-[#0f2744] text-white hover:bg-[#163354] rounded text-[10px] font-bold cursor-pointer"
                                  >
                                    Verify
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-slate-600">Issuer: {certification.issuer || certification.issuing_organization || 'N/A'}</p>
                            <p className="text-[11px] text-slate-500">Issued: {formatDate(certification.issue_date || certification.created_at)}</p>
                            {(certification.credential_url || certification.certificate_url) && (
                              <div className="flex flex-wrap gap-2">
                                {certification.credential_url && (
                                  <a href={certification.credential_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:underline">
                                    View Credential <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                                {certification.certificate_url && (
                                  <a href={certification.certificate_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:underline">
                                    Certificate <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {profileSection === 'documents' && (
                    <div className="space-y-3">
                      {normalizeArray(selectedStudentProfile.documents).length === 0 ? (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                          No documents uploaded.
                        </div>
                      ) : (
                        normalizeArray(selectedStudentProfile.documents).map((document: any) => (
                          <div key={document.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                              <h6 className="text-sm font-bold text-slate-900">{document.title || document.file_name || 'Document'}</h6>
                              <p className="text-[11px] text-slate-600 mt-1">{document.description || document.category || 'Uploaded document'} • {document.doc_type || 'file'} • {formatDate(document.created_at)}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => openTeacherDocument(selectedStudentProfile.id, document)}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                              >
                                View/Open
                              </button>
                              <button
                                type="button"
                                onClick={() => openTeacherDocument(selectedStudentProfile.id, document)}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-300 bg-[#0f2744] text-white hover:bg-[#163354] cursor-pointer"
                              >
                                Download
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {profileSection === 'skills' && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      {getStudentSkills(selectedStudentProfile).length === 0 ? (
                        <div className="text-xs text-slate-500">No skills added yet.</div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {getStudentSkills(selectedStudentProfile).map((skill: string, idx: number) => (
                            <span key={`${skill}-${idx}`} className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-200 text-slate-700">
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}
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
      {/* MODAL: PER-STUDENT ANALYTICS DOSSIER */}
      {showAnalyticsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-5xl max-h-[92vh] bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 bg-[#0f2744] text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-slate-700 overflow-hidden flex items-center justify-center font-bold text-sm shrink-0 border-2 border-slate-400 shadow-xs">
                  {studentAnalyticsData?.student?.profile_photo_url ? (
                    <img src={studentAnalyticsData.student.profile_photo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    getAvatarInitials(studentAnalyticsData?.student?.full_name)
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-base text-white">
                      {studentAnalyticsData?.student?.full_name || 'Student Analytics Dossier'}
                    </h3>
                    {studentAnalyticsData?.student?.roll_number && (
                      <span className="text-xs px-2.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono font-bold">
                        Roll: {studentAnalyticsData.student.roll_number}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-300 flex items-center gap-2 flex-wrap mt-0.5">
                    <span>{studentAnalyticsData?.student?.departmentName || 'Branch N/A'}</span>
                    <span>•</span>
                    <span>Year {studentAnalyticsData?.student?.classYear || 1} ({studentAnalyticsData?.student?.semesterName || 'Sem N/A'})</span>
                    <span>•</span>
                    <span>Class: <strong>{studentAnalyticsData?.context?.className || studentAnalyticsData?.student?.className || selectedAssignment?.className}</strong></span>
                    <span>•</span>
                    <span className="text-amber-300">
                      Subject Context: <strong>{studentAnalyticsData?.context?.subjectName || selectedAssignment?.subjectName} ({studentAnalyticsData?.context?.subjectCode || selectedAssignment?.subjectCode})</strong>
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowAnalyticsModal(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                title="Close Analytics Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-slate-50">
              {isAnalyticsModalLoading ? (
                <div className="p-16 text-center text-slate-500 flex flex-col items-center justify-center space-y-3">
                  <div className="w-10 h-10 border-4 border-[#0f2744] border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs font-semibold">Loading Student Analytics Dossier from PostgreSQL...</p>
                </div>
              ) : studentAnalyticsData ? (
                <>
                  {/* SECTION 0: STUDENT OVERVIEW SUMMARY CARDS */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* Card 1: Internal % */}
                    <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Internal Marks</p>
                      <p className="text-xl font-bold font-mono text-[#0f2744] mt-1">
                        {studentAnalyticsData.internalSummary ? `${studentAnalyticsData.internalSummary.percentage}%` : 'No records'}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                        {studentAnalyticsData.internalSummary
                          ? `${studentAnalyticsData.internalSummary.totalObtained} / ${studentAnalyticsData.internalSummary.totalMax} pts`
                          : 'No assessments'}
                      </p>
                    </div>

                    {/* Card 2: GitHub Contributions */}
                    <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">GitHub</p>
                      <p className="text-xl font-bold font-mono text-slate-900 mt-1">
                        {studentAnalyticsData.githubData?.synced
                          ? (studentAnalyticsData.githubData.totalContributions ?? studentAnalyticsData.githubData.publicRepos ?? 'Synced')
                          : 'Not synced'}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                        {studentAnalyticsData.githubData?.synced
                          ? `${studentAnalyticsData.githubData.publicRepos ?? 0} Repositories`
                          : (studentAnalyticsData.github_url || studentAnalyticsData.student?.github_url ? 'Profile linked' : 'No profile linked')}
                      </p>
                    </div>

                    {/* Card 3: HackerRank Questions */}
                    <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">HackerRank</p>
                      <p className="text-xl font-bold font-mono text-emerald-800 mt-1">
                        {studentAnalyticsData.hackerrankData?.synced ? 'Synced' : 'Not synced'}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                        {studentAnalyticsData.hackerrankUrl || studentAnalyticsData.student?.hackerrank_url ? 'Profile linked' : 'No profile linked'}
                      </p>
                    </div>

                    {/* Card 4: Professional Posts */}
                    <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Professional Posts</p>
                      <p className="text-xl font-bold font-mono text-blue-800 mt-1">
                        {studentAnalyticsData.totalPosts ?? 0}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5 truncate">LinkedIn / Activity</p>
                    </div>
                  </div>

                  {/* SECTION 1: INTERNAL MARKS */}
                  {studentAnalyticsData.internalMarks !== undefined && (
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                          <BarChart2 className="w-4 h-4 text-[#0f2744]" /> 1. Internal Assessment Marks
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Marks recorded for subject: <strong className="text-slate-800">{studentAnalyticsData.context?.subjectName || selectedAssignment?.subjectName}</strong>
                        </p>
                      </div>

                      {studentAnalyticsData.internalSummary && (
                        <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 px-3 py-1 rounded-lg text-xs font-mono">
                          <span className="text-sky-900 font-bold">Total: {studentAnalyticsData.internalSummary.totalObtained} / {studentAnalyticsData.internalSummary.totalMax}</span>
                          <span className="text-sky-700">• {studentAnalyticsData.internalSummary.percentage}%</span>
                          {studentAnalyticsData.internalSummary.average !== undefined && (
                            <span className="text-sky-800">• Avg: {studentAnalyticsData.internalSummary.average}%</span>
                          )}
                        </div>
                      )}
                    </div>

                    {studentAnalyticsData.internalMarks && studentAnalyticsData.internalMarks.length > 0 ? (
                      <div className="space-y-4">
                        {/* Dedicated Internal Marks Bar Chart */}
                        <div className="h-64 w-full">
                          <Bar
                            data={{
                              labels: studentAnalyticsData.internalMarks.map((m: any) => m.title || m.exam_type),
                              datasets: [
                                {
                                  label: 'Marks Obtained',
                                  data: studentAnalyticsData.internalMarks.map((m: any) => m.marks_obtained),
                                  backgroundColor: '#0f2744',
                                  borderRadius: 4,
                                },
                                {
                                  label: 'Maximum Marks',
                                  data: studentAnalyticsData.internalMarks.map((m: any) => m.max_marks),
                                  backgroundColor: '#cbd5e1',
                                  borderRadius: 4,
                                },
                              ],
                            }}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              scales: {
                                y: { beginAtZero: true, title: { display: true, text: 'Marks' } },
                                x: { title: { display: true, text: 'Assessment Name' } },
                              },
                              plugins: {
                                legend: { position: 'top' },
                              },
                            }}
                          />
                        </div>

                        {/* Breakdown Table */}
                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                              <tr>
                                <th className="px-3 py-2">Assessment Name</th>
                                <th className="px-3 py-2 text-center">Type</th>
                                <th className="px-3 py-2 text-center">Marks Obtained</th>
                                <th className="px-3 py-2 text-center">Max Marks</th>
                                <th className="px-3 py-2 text-center">Percentage</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {studentAnalyticsData.internalMarks.map((m: any, idx: number) => {
                                const pct = m.max_marks > 0 ? ((m.marks_obtained / m.max_marks) * 100).toFixed(1) : '0';
                                return (
                                  <tr key={idx} className="hover:bg-slate-50">
                                    <td className="px-3 py-2 font-medium text-slate-900">{m.title || m.exam_type}</td>
                                    <td className="px-3 py-2 text-center text-slate-500">{m.assessment_type || 'Internal'}</td>
                                    <td className="px-3 py-2 text-center font-mono font-bold text-slate-800">{m.marks_obtained}</td>
                                    <td className="px-3 py-2 text-center font-mono text-slate-500">{m.max_marks}</td>
                                    <td className="px-3 py-2 text-center font-mono font-bold text-[#0f2744]">{pct}%</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                        <AlertCircle className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                        <p className="text-xs font-semibold text-slate-700">No assessments recorded</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          No internal assessment marks have been entered into PostgreSQL for this student in {studentAnalyticsData.context?.subjectName || selectedAssignment?.subjectName}.
                        </p>
                      </div>
                      )}
                    </div>
                  )}

                  {/* SECTION 2: GITHUB CONTRIBUTIONS */}
                  {studentAnalyticsData.githubData !== undefined && (
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                          <Github className="w-4 h-4 text-slate-900" /> 2. GitHub Contributions & Repositories
                        </h4>
                        <p className="text-[11px] text-slate-500">Student development and open source activity</p>
                      </div>
                      {(studentAnalyticsData.githubData?.github_url || studentAnalyticsData.student?.github_url) && (
                        <a
                          href={studentAnalyticsData.githubData?.github_url || studentAnalyticsData.student?.github_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                        >
                          View GitHub Profile <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {studentAnalyticsData.githubData?.synced ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <p className="text-[10px] text-slate-500 uppercase font-semibold">Username</p>
                            <p className="text-sm font-bold text-slate-900 font-mono truncate">{studentAnalyticsData.githubData.username || 'N/A'}</p>
                          </div>
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <p className="text-[10px] text-slate-500 uppercase font-semibold">Public Repos</p>
                            <p className="text-lg font-bold text-slate-900 font-mono">{studentAnalyticsData.githubData.publicRepos ?? 'N/A'}</p>
                          </div>
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <p className="text-[10px] text-slate-500 uppercase font-semibold">Total Stars</p>
                            <p className="text-lg font-bold text-slate-900 font-mono">{studentAnalyticsData.githubData.stars ?? 'N/A'}</p>
                          </div>
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <p className="text-[10px] text-slate-500 uppercase font-semibold">Contributions</p>
                            <p className="text-lg font-bold text-slate-900 font-mono">{studentAnalyticsData.githubData.totalContributions ?? 'N/A'}</p>
                          </div>
                        </div>

                        {/* GitHub Visualization: Top Repositories or Monthly Contributions */}
                        {studentAnalyticsData.githubData.topRepos && studentAnalyticsData.githubData.topRepos.length > 0 && (
                          <div>
                            <h5 className="text-xs font-semibold text-slate-700 mb-2">Public Repositories Star Count</h5>
                            <div className="h-44 w-full mb-3">
                              <Bar
                                data={{
                                  labels: studentAnalyticsData.githubData.topRepos.slice(0, 6).map((r: any) => r.name),
                                  datasets: [
                                    {
                                      label: 'Stars',
                                      data: studentAnalyticsData.githubData.topRepos.slice(0, 6).map((r: any) => r.stars ?? r.stargazers_count ?? 0),
                                      backgroundColor: '#2563eb',
                                      borderRadius: 4,
                                    },
                                  ],
                                }}
                                options={{
                                  responsive: true,
                                  maintainAspectRatio: false,
                                  scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                                }}
                              />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {studentAnalyticsData.githubData.topRepos.slice(0, 6).map((repo: any, idx: number) => (
                                <div key={idx} className="p-2.5 bg-slate-50 rounded border border-slate-200 text-xs">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-900 truncate">{repo.name}</span>
                                    {(repo.stars > 0 || repo.stargazers_count > 0) && (
                                      <span className="text-[10px] font-mono text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-bold">
                                        ★ {repo.stars ?? repo.stargazers_count}
                                      </span>
                                    )}
                                  </div>
                                  {repo.description && <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{repo.description}</p>}
                                  {repo.language && <span className="text-[10px] text-slate-400 mt-1 block">{repo.language}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300 space-y-2">
                        <Github className="w-6 h-6 text-slate-400 mx-auto" />
                        <p className="text-xs font-semibold text-slate-700">GitHub data not synced</p>
                        <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                          {studentAnalyticsData.student?.github_url
                            ? 'GitHub profile URL exists on student profile, but contribution data has not been synchronized yet.'
                            : 'This student has not provided a GitHub URL in their profile.'}
                        </p>
                        {(studentAnalyticsData.student?.github_url || studentAnalyticsData.github_url) && (
                          <a
                            href={studentAnalyticsData.student?.github_url || studentAnalyticsData.github_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline pt-1"
                          >
                            Open Profile Link <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  )}

                  {/* SECTION 3: HACKERRANK */}
                  {studentAnalyticsData.hackerrankData !== undefined && (
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                          <Code className="w-4 h-4 text-emerald-600" /> 3. HackerRank & Coding Platform
                        </h4>
                        <p className="text-[11px] text-slate-500">Problem solving statistics and coding practice</p>
                      </div>
                    </div>

                    {studentAnalyticsData.hackerrankData?.synced ? (
                      <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200 space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-emerald-950">HackerRank Synced Statistics Available</p>
                          <span className="text-[10px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-semibold">
                            {studentAnalyticsData.hackerrankData.snapshotMonth}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-white p-3 rounded shadow-2xs border border-emerald-100 text-center">
                            <p className="text-[10px] text-slate-500 font-bold uppercase">Badges</p>
                            <p className="text-xl font-bold font-mono text-emerald-700 mt-1">{studentAnalyticsData.hackerrankData.badgesCount}</p>
                          </div>
                          <div className="bg-white p-3 rounded shadow-2xs border border-emerald-100 text-center col-span-2 md:col-span-3 text-left">
                            <p className="text-[10px] text-slate-500 font-bold uppercase text-center md:text-left">Verified Skills</p>
                            <div className="flex flex-wrap gap-1 mt-2 justify-center md:justify-start">
                              {studentAnalyticsData.hackerrankData.verifiedSkills?.map((skill: string) => (
                                <span key={skill} className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded font-semibold">{skill}</span>
                              ))}
                              {(!studentAnalyticsData.hackerrankData.verifiedSkills || studentAnalyticsData.hackerrankData.verifiedSkills.length === 0) && (
                                <span className="text-[10px] text-slate-400">No verified skills synced.</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end pt-2">
                          <a href={studentAnalyticsData.hackerrankData.url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-700 hover:underline font-semibold flex items-center gap-1">
                            View Profile on HackerRank <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    ) : studentAnalyticsData.hackerrankUrl || studentAnalyticsData.student?.hackerrank_url ? (
                      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <Code className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-bold text-slate-900">HackerRank Profile Linked</p>
                              <p className="text-[11px] font-mono text-slate-600 truncate max-w-md">
                                {studentAnalyticsData.hackerrankUrl || studentAnalyticsData.student?.hackerrank_url}
                              </p>
                              <p className="text-[11px] text-amber-700 font-medium mt-1">
                                HackerRank statistics not synced
                              </p>
                            </div>
                          </div>
                          <a
                            href={studentAnalyticsData.hackerrankUrl || studentAnalyticsData.student?.hackerrank_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 bg-[#0f2744] text-white hover:bg-[#163354] text-xs font-semibold rounded-lg flex items-center gap-1 shadow-2xs shrink-0"
                          >
                            Open HackerRank Profile <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                        <Code className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                        <p className="text-xs font-semibold text-slate-700">HackerRank statistics not available</p>
                        <p className="text-[11px] text-slate-400 mt-1">This student has not linked a HackerRank profile.</p>
                      </div>
                    )}
                  </div>
                  )}

                  {/* SECTION 4: LINKEDIN / PROFESSIONAL ACTIVITY */}
                  {studentAnalyticsData.linkedinData !== undefined && (
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                          <Linkedin className="w-4 h-4 text-blue-600" /> 4. LinkedIn & Student Posts Activity
                        </h4>
                        <p className="text-[11px] text-slate-500">Active participation, academic achievements, and articles</p>
                      </div>
                      {(studentAnalyticsData.linkedinUrl || studentAnalyticsData.student?.linkedin_url) && (
                        <a
                          href={studentAnalyticsData.linkedinUrl || studentAnalyticsData.student?.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                        >
                          LinkedIn Profile <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {studentAnalyticsData.linkedinData?.synced ? (
                      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-blue-950">LinkedIn Synced Statistics Available</p>
                          <span className="text-[10px] text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full font-semibold">
                            {studentAnalyticsData.linkedinData.snapshotMonth}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-white p-3 rounded shadow-2xs border border-blue-100 text-center">
                            <p className="text-[10px] text-slate-500 font-bold uppercase">Connections</p>
                            <p className="text-xl font-bold font-mono text-blue-700 mt-1">{studentAnalyticsData.linkedinData.connections}</p>
                          </div>
                          <div className="bg-white p-3 rounded shadow-2xs border border-blue-100 text-center">
                            <p className="text-[10px] text-slate-500 font-bold uppercase">Followers</p>
                            <p className="text-xl font-bold font-mono text-blue-700 mt-1">{studentAnalyticsData.linkedinData.followers}</p>
                          </div>
                          <div className="bg-white p-3 rounded shadow-2xs border border-blue-100 text-center">
                            <p className="text-[10px] text-slate-500 font-bold uppercase">Posts</p>
                            <p className="text-xl font-bold font-mono text-blue-700 mt-1">{studentAnalyticsData.linkedinData.postsCount}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-center">
                        <p className="text-[11px] text-slate-500">LinkedIn statistics not synced.</p>
                      </div>
                    )}

                    {/* Dedicated Posts Activity Chart (Monthly) */}
                    {studentAnalyticsData.postsByMonth && studentAnalyticsData.postsByMonth.length > 0 ? (
                      <div className="space-y-4">
                        <div>
                          <h5 className="text-xs font-semibold text-slate-700 mb-2">Student Activity / Posts Over Time</h5>
                          <div className="h-48 w-full">
                            <Bar
                              data={{
                                labels: studentAnalyticsData.postsByMonth.map((p: any) => p.label || p.month),
                                datasets: [
                                  {
                                    label: 'Posts Published',
                                    data: studentAnalyticsData.postsByMonth.map((p: any) => p.count),
                                    backgroundColor: '#2563eb',
                                    borderRadius: 4,
                                  },
                                ],
                              }}
                              options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                scales: {
                                  y: { beginAtZero: true, ticks: { stepSize: 1 }, title: { display: true, text: 'Posts Count' } },
                                  x: { title: { display: true, text: 'Month' } },
                                },
                              }}
                            />
                          </div>
                        </div>

                        {/* Recent Posts List */}
                        {studentAnalyticsData.recentPosts && studentAnalyticsData.recentPosts.length > 0 && (
                          <div>
                            <h5 className="text-xs font-semibold text-slate-700 mb-2">Recent Student Posts</h5>
                            <div className="space-y-2">
                              {studentAnalyticsData.recentPosts.slice(0, 4).map((post: any, idx: number) => (
                                <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-xs text-slate-900">{post.title}</span>
                                    <span className="text-[10px] text-slate-400">{new Date(post.created_at).toLocaleDateString()}</span>
                                  </div>
                                  <p className="text-xs text-slate-600 line-clamp-2">{post.description}</p>
                                  {post.category && (
                                    <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 uppercase">
                                      {post.category}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                        <Linkedin className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                        <p className="text-xs font-semibold text-slate-700">No activity yet</p>
                        <p className="text-[11px] text-slate-400 mt-1">This student has not published any professional or academic posts yet.</p>
                      </div>
                    )}
                  </div>
                  )}
                </>
              ) : null}
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-100 border-t border-slate-200 flex justify-end shrink-0">
              <button
                onClick={() => setShowAnalyticsModal(false)}
                className="px-4 py-1.5 bg-[#0f2744] text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
