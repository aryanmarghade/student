import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { StudentProfile, Marksheet, ProjectItem, CertificationItem, DocumentItem, CollegeEvent, PostItem } from '../types';
import { PostCard } from '../components/PostCard';
import {
  GraduationCap,
  FileText,
  Award,
  Link2,
  Github,
  Linkedin,
  Upload,
  Camera,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Download,
  BookOpen,
  Calendar,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  FolderGit2,
  Trophy,
  Plus,
  Trash2,
  ExternalLink,
  Globe,
  Tag,
  MapPin,
  Activity,
  Code2,
  BarChart2,
  RefreshCw
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import '../lib/chart-setup';
const VerificationBadge = ({ status }: { status?: string }) => {
  if (!status || status === 'Student Submitted') {
    return <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wider">Submitted</span>;
  }
  if (status.includes('Verified')) {
    return <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1 uppercase tracking-wider"><CheckCircle className="w-2.5 h-2.5" /> {status}</span>;
  }
  if (status === 'Pending Verification' || status === 'Pending') {
    return <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1 uppercase tracking-wider"><RefreshCw className="w-2.5 h-2.5" /> Pending</span>;
  }
  return <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wider">{status}</span>;
};

export const StudentView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'profile' | 'activity' | 'portfolio' | 'academics' | 'events' | 'documents'>('profile');
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Edit fields
  const [bioInput, setBioInput] = useState('');
  const [linkedinInput, setLinkedinInput] = useState('');
  const [githubInput, setGithubInput] = useState('');
  const [hackerrankInput, setHackerrankInput] = useState('');
  const [portfolioInput, setPortfolioInput] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSyncingGithub, setIsSyncingGithub] = useState(false);

  // Portfolio Records State
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [certifications, setCertifications] = useState<CertificationItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [events, setEvents] = useState<CollegeEvent[]>([]);

  // Project Modal State
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [newProject, setNewProject] = useState({ title: '', description: '', tech_stack: '', project_url: '', repo_url: '' });

  // Certification Modal State
  const [showAddCertModal, setShowAddCertModal] = useState(false);
  const [newCert, setNewCert] = useState({ title: '', issuing_organization: '', issue_date: '', credential_id: '', credential_url: '' });

  // Document Upload Modal State
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [newDoc, setNewDoc] = useState({ title: '', description: '', category: 'Certificate', file: null as File | null });

  // Post State
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [showAddPostModal, setShowAddPostModal] = useState(false);
  const [newPost, setNewPost] = useState({ title: '', description: '', category: 'Achievement', tags: '', external_link: '', files: [] as File[] });

  // Academic Records State
  const [semestersData, setSemestersData] = useState<any[]>([]);
  const [cgpaTrend, setCgpaTrend] = useState<any[]>([]);
  const [officialMarksheets, setOfficialMarksheets] = useState<Marksheet[]>([]);
  const [expandedSemester, setExpandedSemester] = useState<string>('sem_4');

  // Resume Upload State
  const [resumeText, setResumeText] = useState('');
  const [resumeFileName, setResumeFileName] = useState('');
  const [isUploadingResume, setIsUploadingResume] = useState(false);

  // Feedback notifications
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  useEffect(() => {
    loadStudentData();
  }, []);

  const loadStudentData = async () => {
    setIsLoading(true);
    try {
      const [profileRes, marksRes, eventsRes, docsRes, projsRes, certsRes, postsRes] = await Promise.all([
        api.getStudentProfile(),
        api.getStudentMarks(),
        api.getCollegeEvents().catch(() => []),
        api.getStudentDocuments().catch(() => []),
        api.getStudentProjects().catch(() => []),
        api.getStudentCertifications().catch(() => []),
        api.getStudentPosts().catch(() => []),
      ]);

      setProfile(profileRes);
      setBioInput(profileRes.bio || '');
      setLinkedinInput(profileRes.linkedin_url || '');
      setGithubInput(profileRes.github_url || '');
      setHackerrankInput(profileRes.hackerrank_url || '');
      setPortfolioInput(profileRes.portfolio_url || '');

      setEvents(eventsRes || []);
      setDocuments(docsRes || []);
      setProjects(projsRes || []);
      setCertifications(certsRes || []);
      setPosts(postsRes || []);

      setSemestersData(marksRes.semestersData);
      setCgpaTrend(marksRes.cgpaTrend);
      setOfficialMarksheets(marksRes.officialMarksheets);

      if (marksRes.semestersData.length > 0) {
        setExpandedSemester(marksRes.semestersData[marksRes.semestersData.length - 1].semester_id);
      }
    } catch (err: any) {
      setFeedbackError(err.message || 'Error loading student profile');
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (msg: string, isErr = false) => {
    if (isErr) {
      setFeedbackError(msg);
      setTimeout(() => setFeedbackError(null), 4000);
    } else {
      setFeedbackSuccess(msg);
      setTimeout(() => setFeedbackSuccess(null), 4000);
    }
  };

  const handleDownloadMarksheet = async (marksheet: Marksheet) => {
    try {
      const blob = await api.downloadStudentMarksheet(marksheet.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      showToast(err.message || 'Unable to open the official marksheet.', true);
    }
  };

  // Post Handlers
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('title', newPost.title);
      formData.append('description', newPost.description);
      formData.append('category', newPost.category);
      if (newPost.tags) formData.append('tags', JSON.stringify(newPost.tags.split(',').map(t => t.trim())));
      if (newPost.external_link) formData.append('external_link', newPost.external_link);
      newPost.files.forEach(f => formData.append('attachments', f));
      
      const res = await api.createStudentPost(formData);
      setPosts(prev => [res.post, ...prev]);
      setShowAddPostModal(false);
      setNewPost({ title: '', description: '', category: 'Achievement', tags: '', external_link: '', files: [] });
      showToast('Post created successfully!');
    } catch (err: any) {
      showToast(err.message || 'Failed to create post', true);
    }
  };

  const handleDeletePost = async (id: string) => {
    if (!confirm('Are you sure you want to delete this post?')) return;
    try {
      await api.deleteStudentPost(id);
      setPosts(prev => prev.filter(p => p.id !== id));
      showToast('Post deleted.');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete post', true);
    }
  };

  // Portfolio Handlers
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createStudentProject(newProject);
      setProjects(prev => [res.project, ...prev]);
      setShowAddProjectModal(false);
      setNewProject({ title: '', description: '', tech_stack: '', project_url: '', repo_url: '' });
      showToast('Project added to your portfolio!');
    } catch (err: any) {
      showToast(err.message || 'Failed to add project', true);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm('Are you sure you want to remove this project?')) return;
    try {
      await api.deleteStudentProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      showToast('Project removed.');
    } catch (err: any) {
      showToast(err.message || 'Failed to remove project', true);
    }
  };

  const handleCreateCert = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createStudentCertification(newCert);
      setCertifications(prev => [res.certification, ...prev]);
      setShowAddCertModal(false);
      setNewCert({ title: '', issuing_organization: '', issue_date: '', credential_id: '', credential_url: '' });
      showToast('Certification added to your profile!');
    } catch (err: any) {
      showToast(err.message || 'Failed to add certification', true);
    }
  };

  const handleDeleteCert = async (id: string) => {
    if (!confirm('Delete this certification record?')) return;
    try {
      await api.deleteStudentCertification(id);
      setCertifications(prev => prev.filter(c => c.id !== id));
      showToast('Certification removed.');
    } catch (err: any) {
      showToast(err.message || 'Failed to remove certification', true);
    }
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!newDoc.file) {
        showToast('Please select a document file.', true);
        return;
      }
      const formData = new FormData();
      formData.append('file', newDoc.file);
      formData.append('title', newDoc.title);
      formData.append('description', newDoc.description);
      formData.append('category', newDoc.category);
      const res = await api.uploadStudentDocument(formData);
      setDocuments(prev => [res.document, ...prev]);
      setShowAddDocModal(false);
      setNewDoc({ title: '', description: '', category: 'Certificate', file: null });
      showToast('Document archived in your vault!');
    } catch (err: any) {
      showToast(err.message || 'Failed to save document', true);
    }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!confirm('Remove document from your vault?')) return;
    try {
      await api.deleteStudentDocument(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
      showToast('Document removed.');
    } catch (err: any) {
      showToast(err.message || 'Failed to remove document', true);
    }
  };

  // Update Bio & Social Links
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      const res = await api.updateStudentProfile({
        bio: bioInput,
        linkedin_url: linkedinInput,
        github_url: githubInput,
        hackerrank_url: hackerrankInput,
        portfolio_url: portfolioInput
      });
      setProfile(prev => prev ? {
        ...prev,
        bio: res.student.bio,
        linkedin_url: res.student.linkedin_url,
        github_url: res.student.github_url,
        hackerrank_url: res.student.hackerrank_url,
        portfolio_url: res.student.portfolio_url,
        profile_strength: res.student.profile_strength
      } : null);
      showToast('Profile information saved and strength score updated.');
    } catch (err: any) {
      showToast(err.message, true);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSyncGithub = async () => {
    setIsSyncingGithub(true);
    try {
      const res = await api.syncGitHub();
      setProfile(prev => prev ? { ...prev, github_data: res.githubData } : null);
      showToast('GitHub stats synchronized successfully!');
    } catch (err: any) {
      showToast(err.message || 'Failed to sync GitHub', true);
    } finally {
      setIsSyncingGithub(false);
    }
  };

  // Photo Upload Simulation / Real Data URL
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const res = await api.uploadStudentPhoto(reader.result as string);
        setProfile(prev => prev ? {
          ...prev,
          profile_photo_url: res.profile_photo_url,
          profile_strength: res.profile_strength
        } : null);
        showToast('Profile photo updated successfully.');
      } catch (err: any) {
        showToast(err.message, true);
      }
    };
    reader.readAsDataURL(file);
  };

  // Resume Upload & Automatic Scanner
  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingResume(true);
    setResumeFileName(file.name);

    // Read text or file content
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const textContent = (reader.result as string) || '';
        const res = await api.uploadStudentResume({
          file_name: file.name,
          file_text: textContent
        });

        setProfile(prev => prev ? {
          ...prev,
          resume_url: res.document.file_url,
          profile_strength: res.profile_strength,
          resumeDocument: res.document
        } : null);

        showToast('Resume uploaded and scanned into structured preview!');
      } catch (err: any) {
        showToast(err.message, true);
      } finally {
        setIsUploadingResume(false);
      }
    };

    // If text or fallback
    reader.readAsText(file);
  };

  // CGPA Progression Trend Chart Data
  const cgpaChartData = cgpaTrend.length > 0 ? {
    labels: cgpaTrend.map(c => c.semesterName),
    datasets: [
      {
        label: 'Cumulative Grade Point Average (CGPA)',
        data: cgpaTrend.map(c => c.cgpa),
        borderColor: '#b45309',
        backgroundColor: 'rgba(180, 83, 9, 0.1)',
        tension: 0.3,
        fill: true,
        pointRadius: 6,
        pointBackgroundColor: '#b45309'
      },
      {
        label: 'Semester Grade Point Average (SGPA)',
        data: cgpaTrend.map(c => c.sgpa),
        borderColor: '#0284c7',
        borderDash: [4, 4],
        tension: 0.3,
        pointRadius: 5
      }
    ]
  } : null;

  if (isLoading || !profile) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center text-slate-500 text-sm">
        Loading verified student records...
      </div>
    );
  }

  const checklist = [
    { label: 'Profile Photo Uploaded', completed: !!profile.profile_photo_url, pts: '+15%' },
    { label: 'Resume Uploaded & Parsed', completed: !!profile.resume_url, pts: '+25%' },
    { label: 'LinkedIn Profile Linked', completed: !!profile.linkedin_url && profile.linkedin_url.includes('linkedin.com'), pts: '+15%' },
    { label: 'GitHub Profile Linked', completed: !!profile.github_url && profile.github_url.includes('github.com'), pts: '+15%' },
    { label: 'Academic Bio (>20 chars)', completed: !!profile.bio && profile.bio.length >= 20, pts: '+15%' },
    { label: 'Semester Marks On Record', completed: semestersData.length > 0, pts: '+15%' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Toast notifications */}
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

      {/* Student Profile Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="h-28 bg-gradient-to-r from-[#0f2744] via-[#163354] to-[#0f2744] relative">
          <div className="absolute right-4 bottom-3 text-white/30 font-serif font-bold text-4xl tracking-widest hidden sm:block">
            VISSION ACADEMY
          </div>
        </div>

        <div className="px-6 pb-6 pt-0 relative">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-12 mb-4">
            {/* Photo Avatar with change trigger */}
            <div className="relative group w-24 h-24 rounded-2xl bg-white p-1 border-2 border-white shadow-md">
              {profile.profile_photo_url ? (
                <img
                  src={profile.profile_photo_url}
                  alt={profile.full_name}
                  className="w-full h-full object-cover rounded-xl"
                />
              ) : (
                <div className="w-full h-full bg-[#0f2744] text-white rounded-xl flex items-center justify-center font-bold text-2xl font-serif">
                  {profile.full_name.split(' ').map(n => n[0]).join('')}
                </div>
              )}
              <label
                htmlFor="photo-upload"
                className="absolute inset-1 bg-black/60 text-white rounded-xl flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[10px] font-semibold"
              >
                <Camera className="w-4 h-4 mb-0.5" /> Change
                <input
                  id="photo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Student metadata */}
            <div className="flex-1 sm:pl-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-serif font-bold text-[#0f2744]">{profile.full_name}</h1>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                  {profile.roll_number}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {profile.className} • {profile.departmentName} • {profile.email}
              </p>
            </div>

            {/* Profile Strength Meter */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 min-w-[220px]">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-bold text-slate-700">Profile Strength</span>
                <span className="font-mono font-bold text-amber-800">{profile.profile_strength}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-amber-500 to-[#0f2744] h-2 rounded-full transition-all duration-500"
                  style={{ width: `${profile.profile_strength}%` }}
                ></div>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {profile.profile_strength >= 80 ? 'Distinguished Profile' : 'Complete checklist to reach 100%'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-200 pb-2 overflow-x-auto">
        {[
          { id: 'profile', label: 'Bio & Resume', icon: GraduationCap },
          { id: 'activity', label: 'Activity & Posts', icon: Activity },
          { id: 'analytics', label: 'Analytics', icon: BarChart2 },
          { id: 'portfolio', label: 'Projects & Certifications', icon: FolderGit2 },
          { id: 'academics', label: 'Marks & Transcripts', icon: Award },
          { id: 'events', label: 'Events & Hackathons', icon: Trophy },
          { id: 'documents', label: 'Document Vault', icon: FileText },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
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

      {/* TAB 1: PROFILE & RESUME */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Bio, Social Links & Resume Upload */}
          <div className="lg:col-span-2 space-y-6">
            {/* Bio & Social Links Editor */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-[#0f2744]" /> Academic Bio & Professional Profiles
              </h3>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Academic Bio / Research Interests
                  </label>
                  <textarea
                    rows={3}
                    value={bioInput}
                    onChange={e => setBioInput(e.target.value)}
                    placeholder="Brief overview of your academic specializations, career goals, and technical focus..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#0f2744]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <Linkedin className="w-3.5 h-3.5 text-sky-700" /> LinkedIn Profile URL
                    </label>
                    <input
                      type="url"
                      value={linkedinInput}
                      onChange={e => setLinkedinInput(e.target.value)}
                      placeholder="https://linkedin.com/in/username"
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1"><Github className="w-3.5 h-3.5 text-slate-800" /> GitHub Profile URL</span>
                    </label>
                    <input
                      type="url"
                      value={githubInput}
                      onChange={e => setGithubInput(e.target.value)}
                      placeholder="https://github.com/username"
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <Code2 className="w-3.5 h-3.5 text-green-700" /> HackerRank Profile URL
                    </label>
                    <input
                      type="url"
                      value={hackerrankInput}
                      onChange={e => setHackerrankInput(e.target.value)}
                      placeholder="https://hackerrank.com/username"
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <Globe className="w-3.5 h-3.5 text-purple-600" /> Portfolio Website
                    </label>
                    <input
                      type="url"
                      value={portfolioInput}
                      onChange={e => setPortfolioInput(e.target.value)}
                      placeholder="https://myportfolio.com"
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="px-4 py-2 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {isSavingProfile ? 'Saving...' : 'Save Profile Changes'}
                  </button>
                </div>
              </form>
            </div>

            {/* Resume Upload Box */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600" /> Resume & Curriculum Vitae (PDF / DOCX)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Uploaded resumes are automatically parsed into structured sections.
                  </p>
                </div>
                {profile.resume_url && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Active Resume On File
                  </span>
                )}
              </div>

              {/* Upload Dropzone */}
              <div className="border-2 border-dashed border-slate-300 hover:border-[#0f2744] rounded-xl p-6 text-center bg-slate-50 hover:bg-slate-100/60 transition-colors">
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">
                  {isUploadingResume ? 'Parsing Document Headings...' : 'Select or drop your resume file here'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Supports PDF and Word Documents (.pdf, .docx, .txt)</p>

                <label
                  htmlFor="resume-file"
                  className="mt-3 inline-block px-4 py-1.5 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold cursor-pointer shadow-xs"
                >
                  Browse Files
                  <input
                    id="resume-file"
                    type="file"
                    accept=".pdf,.docx,.doc,.txt"
                    onChange={handleResumeUpload}
                    disabled={isUploadingResume}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Automatic Section Headings Scanner Preview */}
              {profile.resumeDocument?.parsed_headings && (
                <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" /> Automatic Section Scanner Preview:
                    </h4>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {profile.resumeDocument.file_name}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(profile.resumeDocument.parsed_headings).map(([section, items]) => {
                      const list = Array.isArray(items) ? (items as string[]) : [];
                      if (list.length === 0) return null;
                      return (
                        <div key={section} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                          <p className="text-xs font-bold text-[#0f2744] uppercase tracking-wider border-b border-slate-200 pb-1 mb-2">
                            {section}
                          </p>
                          <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-700">
                            {list.map((item, idx) => (
                              <li key={idx} className="leading-snug">{item}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Profile Strength Checklist */}
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Profile Completion Checklist</h3>
              <p className="text-xs text-slate-500">
                Institutional accreditation and career placement eligibility require a complete record.
              </p>

              <div className="space-y-2.5">
                {checklist.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-lg border flex items-center justify-between text-xs transition-all ${
                      item.completed
                        ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {item.completed ? (
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
                      )}
                      <span className="font-medium text-[11px]">{item.label}</span>
                    </div>
                    <span className="font-mono text-[10px] font-bold opacity-80">{item.pts}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1.5: ACTIVITY & POSTS */}
      {activeTab === 'activity' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
               <div>
                  <h3 className="font-bold text-slate-900">Student Activity</h3>
                  <p className="text-xs text-slate-500">Share updates, achievements, and insights with your network.</p>
               </div>
               <button
                 onClick={() => setShowAddPostModal(true)}
                 className="px-4 py-2 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-sm"
               >
                 <Plus className="w-4 h-4" /> Create Post
               </button>
            </div>
            
            <div className="space-y-4">
              {posts.length === 0 ? (
                <div className="text-center p-8 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl">
                  <p className="text-sm font-semibold text-slate-500 mb-1">No posts yet</p>
                  <p className="text-xs text-slate-400">Share your first update, project milestone, or certification.</p>
                </div>
              ) : (
                posts.map(post => (
                  <PostCard 
                    key={post.id} 
                    post={post} 
                    student={profile} 
                    viewerRole="student"
                    onDelete={handleDeletePost} 
                  />
                ))
              )}
            </div>
          </div>
          
          {/* Right Column: Mini Profile Stats */}
          <div className="space-y-6">
             <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Network Profile</h3>
                <div className="flex items-center gap-3">
                   <div className="w-12 h-12 rounded-full bg-slate-100 overflow-hidden flex items-center justify-center font-bold text-[#0f2744]">
                      {profile?.profile_photo_url ? (
                        <img src={profile.profile_photo_url} alt="" className="w-full h-full object-cover" />
                      ) : 'S'}
                   </div>
                   <div>
                     <p className="font-bold text-slate-900 text-sm">{profile?.full_name}</p>
                     <p className="text-[11px] text-slate-500">{profile?.className}</p>
                   </div>
                </div>
                <div className="pt-2 flex justify-between items-center text-xs border-t border-slate-100 mt-2">
                   <span className="text-slate-500">Total Posts</span>
                   <span className="font-bold text-[#0f2744]">{posts.length}</span>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* TAB 1.75: ANALYTICS */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-sky-600" /> Student Activity Analytics
              </h3>
              <p className="text-xs text-slate-500">Evidence-based metrics computed from your verified profile data</p>
            </div>
            {profile?.github_url && (
              <button
                onClick={handleSyncGithub}
                disabled={isSyncingGithub}
                className="px-3 py-1.5 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingGithub ? 'animate-spin' : ''}`} />
                {isSyncingGithub ? 'Syncing...' : 'Sync GitHub'}
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm text-center">
              <FolderGit2 className="w-8 h-8 text-sky-500 mx-auto mb-2" />
              <p className="text-3xl font-bold text-slate-900">{projects.length}</p>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mt-1">Total Projects</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm text-center">
              <Award className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-3xl font-bold text-slate-900">{certifications.length}</p>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mt-1">Certifications</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm text-center">
              <Activity className="w-8 h-8 text-amber-500 mx-auto mb-2" />
              <p className="text-3xl font-bold text-slate-900">{posts.length}</p>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mt-1">Activity Posts</p>
            </div>
          </div>
          
          {profile?.github_data && (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h4 className="font-bold text-sm flex items-center gap-2 border-b border-slate-100 pb-2">
                <Github className="w-4 h-4 text-slate-800" /> GitHub Statistics
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div>
                   <p className="text-2xl font-bold text-slate-900">{profile.github_data.public_repos}</p>
                   <p className="text-[10px] text-slate-500 uppercase">Public Repos</p>
                </div>
                <div>
                   <p className="text-2xl font-bold text-slate-900">{profile.github_data.stars}</p>
                   <p className="text-[10px] text-slate-500 uppercase">Total Stars</p>
                </div>
                <div>
                   <p className="text-2xl font-bold text-slate-900">{profile.github_data.followers}</p>
                   <p className="text-[10px] text-slate-500 uppercase">Followers</p>
                </div>
                <div>
                   <p className="text-2xl font-bold text-slate-900">{profile.github_data.forks}</p>
                   <p className="text-[10px] text-slate-500 uppercase">Forks</p>
                </div>
              </div>
              {profile.github_data.languages && profile.github_data.languages.length > 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-700 mb-2">Languages Used</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.github_data.languages.map((lang: string) => (
                      <span key={lang} className="px-2 py-1 rounded bg-slate-100 text-slate-800 text-[10px] font-mono border border-slate-200">
                        {lang}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ACADEMIC SCORES & OFFICIAL MARKSHEETS */}
      {activeTab === 'academics' && (
        <div className="space-y-6">
          {/* CGPA Progression Line Chart */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#0f2744]" /> Academic CGPA & SGPA Progression History
                </h3>
                <p className="text-xs text-slate-500">Official cumulative performance across all completed semesters</p>
              </div>
            </div>

            {cgpaChartData ? (
              <div className="h-64">
                <Line
                  data={cgpaChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: { min: 6, max: 10, title: { display: true, text: 'Grade Points (out of 10.0)' } }
                    }
                  }}
                />
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-12 text-center">No completed semesters recorded yet.</p>
            )}
          </div>

          {/* Official Marksheets for Download */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-[#b45309]" /> Official Institutional Transcripts (PDF)
              </h3>
              <span className="text-xs text-slate-500">{officialMarksheets.length} verified documents</span>
            </div>

            <table className="w-full text-xs text-left text-slate-700">
              <thead className="bg-slate-100 text-slate-600 uppercase font-semibold text-[10px]">
                <tr>
                  <th className="px-4 py-2.5">Semester Term</th>
                  <th className="px-4 py-2.5">SGPA</th>
                  <th className="px-4 py-2.5">CGPA</th>
                  <th className="px-4 py-2.5">Certified Record File</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {officialMarksheets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-xs">
                      No official semester transcripts released by the registrar yet.
                    </td>
                  </tr>
                ) : (
                  officialMarksheets.map(ms => (
                    <tr key={ms.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900 capitalize">
                        {ms.semester_id.replace('_', ' ')}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-sky-800">{ms.sgpa}</td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-800">{ms.cgpa}</td>
                      <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">{ms.file_name}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDownloadMarksheet(ms)}
                          className="px-2.5 py-1 bg-[#0f2744] text-white hover:bg-[#163354] rounded text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3 h-3" /> Download Certified PDF
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Detailed Course Marks by Semester */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Semester Course Performance Breakdown</h3>

            {semestersData.map((semRecord: any) => {
              const isExpanded = expandedSemester === semRecord.semester_id;
              return (
                <div key={semRecord.semester_id} className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                  <button
                    onClick={() => setExpandedSemester(isExpanded ? '' : semRecord.semester_id)}
                    className="w-full p-4 flex items-center justify-between bg-slate-50 hover:bg-slate-100/70 transition-colors text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-[#0f2744]" />
                      <span className="font-bold text-sm text-slate-900">{semRecord.semester_name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">
                        {Object.keys(semRecord.subjects).length} Courses evaluated
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="p-4 divide-y divide-slate-100">
                      {Object.values(semRecord.subjects).map((sub: any) => (
                        <div key={sub.subject_id} className="py-3 first:pt-0">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className="font-mono text-xs font-bold text-[#0f2744] mr-2">{sub.subject_code}</span>
                              <span className="font-semibold text-xs text-slate-800">{sub.subject_name}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                            {sub.marks.map((m: any, idx: number) => (
                              <div key={idx} className="bg-slate-50 p-2 rounded border border-slate-200 text-center">
                                <p className="text-[10px] font-semibold text-slate-500">{m.exam_type}</p>
                                <p className="font-mono font-bold text-xs text-slate-900 mt-0.5">
                                  {m.marks_obtained} / {m.max_marks}
                                </p>
                                <p className="text-[10px] text-sky-700 font-semibold">{m.percentage}%</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Academic History & Backlogs from calculateAcademicHistory */}
          {profile?.academicHistory && (
            <div className="space-y-4 pt-6 border-t border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#0f2744]" /> Academic History & Backlogs
              </h3>
              
              <div className="bg-emerald-50 text-emerald-900 p-4 rounded-xl flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold opacity-80">Current CGPA</p>
                  <p className="text-3xl font-bold">{profile.academicHistory.currentCgpa?.toFixed(2) || 'N/A'}</p>
                </div>
                <div className="w-px h-12 bg-emerald-200" />
                <div className="flex-1 pl-4">
                  <p className="text-sm font-semibold opacity-80">Active Backlogs</p>
                  <p className="text-3xl font-bold text-red-600">{profile.academicHistory.totalActiveBacklogs || 0}</p>
                </div>
              </div>

              {Array.isArray(profile.academicHistory.semesters) && profile.academicHistory.semesters.length > 0 ? (
                <div className="space-y-4">
                  {profile.academicHistory.semesters.map((sem: any, i: number) => (
                    <div key={i} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="bg-slate-50 p-3 border-b border-slate-200 font-semibold text-slate-800 flex justify-between">
                        <span>{sem.semesterId}</span>
                        <span>Percentage: {sem.percentage.toFixed(1)}%</span>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-white text-slate-500 text-left border-b border-slate-200">
                            <th className="p-2 pl-4 font-semibold">Subject</th>
                            <th className="p-2 text-right font-semibold">Marks</th>
                            <th className="p-2 pl-4 font-semibold">Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(sem.subjects || []).map((sub: any, j: number) => (
                            <tr key={j} className="border-t border-slate-100 bg-white">
                              <td className="p-2 pl-4 text-slate-700">{sub.subjectName}</td>
                              <td className="p-2 text-right font-mono text-slate-900">{sub.obtained}/{sub.max}</td>
                              <td className="p-2 pl-4">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  sub.status === 'PASS' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                                }`}>{sub.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                  No academic history available.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PORTFOLIO (PROJECTS & CERTIFICATIONS) */}
      {activeTab === 'portfolio' && (
        <div className="space-y-8">
          {/* Projects Section */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FolderGit2 className="w-4 h-4 text-sky-600" /> Technical Projects & Engineering Portfolios
                </h3>
                <p className="text-xs text-slate-500">
                  Showcase software builds, hardware prototypes, capstone projects, and open-source contributions
                </p>
              </div>
              <button
                onClick={() => setShowAddProjectModal(true)}
                className="px-3 py-1.5 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" /> Add Project
              </button>
            </div>

            {projects.length === 0 ? (
              <div className="bg-white p-8 rounded-xl border border-slate-200 text-center space-y-2">
                <FolderGit2 className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">No Projects Added Yet</p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Add projects to showcase your practical skills to faculty reviewers and recruiters.
                </p>
                <button
                  onClick={() => setShowAddProjectModal(true)}
                  className="mt-2 px-3 py-1.5 bg-[#0f2744] text-white rounded-lg text-xs font-semibold"
                >
                  Create First Project Entry
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {projects.map(p => (
                  <div key={p.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-all">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                           <h4 className="font-bold text-sm text-slate-900 leading-snug">{p.title}</h4>
                           <VerificationBadge status={p.verification_status} />
                        </div>
                        <button
                          onClick={() => handleDeleteProject(p.id)}
                          className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors cursor-pointer"
                          title="Delete Project"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">{p.description}</p>
                      {p.tech_stack && (
                        <div className="pt-2 flex flex-wrap gap-1">
                          {p.tech_stack.split(',').map((tech, i) => (
                            <span key={i} className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              {tech.trim()}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 pt-3 mt-3 border-t border-slate-100 text-xs">
                      {p.project_url && (
                        <a
                          href={p.project_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-700 hover:underline flex items-center gap-1 font-medium"
                        >
                          <Globe className="w-3 h-3" /> Live Demo
                        </a>
                      )}
                      {p.repo_url && (
                        <a
                          href={p.repo_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-700 hover:underline flex items-center gap-1 font-medium"
                        >
                          <Github className="w-3 h-3" /> Source Code
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Certifications Section */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-500" /> Verified Certifications & Credentials
                </h3>
                <p className="text-xs text-slate-500">
                  Record industry credentials, cloud certifications, and technical accreditations
                </p>
              </div>
              <button
                onClick={() => setShowAddCertModal(true)}
                className="px-3 py-1.5 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" /> Add Certification
              </button>
            </div>

            {certifications.length === 0 ? (
              <div className="bg-white p-8 rounded-xl border border-slate-200 text-center space-y-2">
                <Award className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">No Certifications Recorded</p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Add professional certificates (AWS, Google Cloud, Cisco, etc.) to enhance your institutional dossier.
                </p>
                <button
                  onClick={() => setShowAddCertModal(true)}
                  className="mt-2 px-3 py-1.5 bg-[#0f2744] text-white rounded-lg text-xs font-semibold"
                >
                  Record First Certification
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {certifications.map(c => (
                  <div key={c.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-all">
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-xs text-slate-900 leading-snug">{c.title}</h4>
                          <VerificationBadge status={c.verification_status} />
                        </div>
                        <button
                          onClick={() => handleDeleteCert(c.id)}
                          className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors cursor-pointer"
                          title="Delete Certification"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-600 font-medium">Issuer: {c.issuing_organization}</p>
                      {c.issue_date && (
                        <p className="text-[11px] text-slate-400">Issue Date: {c.issue_date}</p>
                      )}
                      {c.credential_id && (
                        <p className="text-[10px] font-mono text-slate-500 truncate">ID: {c.credential_id}</p>
                      )}
                    </div>

                    {c.credential_url && (
                      <div className="pt-2 mt-2 border-t border-slate-100">
                        <a
                          href={c.credential_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-sky-700 hover:underline flex items-center gap-1 font-medium"
                        >
                          <ExternalLink className="w-3 h-3" /> View Credential
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: COLLEGE EVENTS & HACKATHONS */}
      {activeTab === 'events' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" /> College Events, Hackathons & Technical Symposia
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Explore officially sanctioned inter-college competitions, research symposiums, and engineering sprints
            </p>
          </div>

          {events.length === 0 ? (
            <div className="bg-white p-10 rounded-xl border border-slate-200 text-center space-y-2">
              <Trophy className="w-10 h-10 text-amber-500/50 mx-auto" />
              <p className="text-sm font-semibold text-slate-800">No Events Scheduled</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No active college events or hackathons are currently open for registration. Check back periodically for updates.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {events.map(ev => (
                <div key={ev.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-all">
                  <div className="space-y-2.5">
                    <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      ev.status === 'upcoming'
                        ? 'bg-amber-100 text-amber-800'
                        : ev.status === 'ongoing'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {ev.status}
                    </span>

                    <h4 className="text-sm font-bold text-slate-900 leading-snug">{ev.name}</h4>
                    <p className="text-xs text-slate-600 line-clamp-3">{ev.description}</p>

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
                        className="text-xs text-sky-700 hover:underline flex items-center gap-1 font-semibold"
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

      {/* TAB 5: DOCUMENT VAULT */}
      {activeTab === 'documents' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" /> Student Records & Documents Archive
              </h3>
              <p className="text-xs text-slate-500">
                Secure repository for verified transcripts, internship offer letters, identity proofs, and credentials
              </p>
            </div>
            <button
              onClick={() => setShowAddDocModal(true)}
              className="px-3 py-1.5 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" /> Archive Document
            </button>
          </div>

          {documents.length === 0 ? (
            <div className="bg-white p-10 rounded-xl border border-slate-200 text-center space-y-2">
              <FileText className="w-10 h-10 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-800">No Documents in Vault</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Upload scanned transcripts, completion letters, or identity credentials for secure record keeping.
              </p>
              <button
                onClick={() => setShowAddDocModal(true)}
                className="mt-2 px-3 py-1.5 bg-[#0f2744] text-white rounded-lg text-xs font-semibold"
              >
                Archive First Document
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
              <table className="w-full text-xs text-left text-slate-700">
                <thead className="bg-slate-100 text-slate-600 uppercase font-semibold text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Document Title</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">File Reference</th>
                    <th className="px-4 py-3">Date Archived</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {documents.map(doc => (
                    <tr key={doc.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{doc.title}</div>
                        {doc.description && <div className="text-[11px] text-slate-500">{doc.description}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {doc.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-600">{doc.file_name}</td>
                      <td className="px-4 py-3 text-slate-500 text-[11px]">
                        {new Date(doc.uploaded_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDeleteDoc(doc.id)}
                          className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors cursor-pointer"
                          title="Remove Document"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: ADD PROJECT */}
      {showAddProjectModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-[#0f2744] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderGit2 className="w-4 h-4 text-sky-400" />
                <h3 className="font-bold text-sm">Add Portfolio Project</h3>
              </div>
              <button onClick={() => setShowAddProjectModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Project Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Distributed Task Orchestrator"
                  value={newProject.title}
                  onChange={e => setNewProject({ ...newProject, title: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Brief summary of architecture, problems solved, and technical depth..."
                  value={newProject.description}
                  onChange={e => setNewProject({ ...newProject, description: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tech Stack (comma separated)</label>
                <input
                  type="text"
                  placeholder="e.g. TypeScript, Rust, Docker, PostgreSQL"
                  value={newProject.tech_stack}
                  onChange={e => setNewProject({ ...newProject, tech_stack: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Live Demo URL</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={newProject.project_url}
                    onChange={e => setNewProject({ ...newProject, project_url: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Repository URL</label>
                  <input
                    type="url"
                    placeholder="https://github.com/..."
                    value={newProject.repo_url}
                    onChange={e => setNewProject({ ...newProject, repo_url: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddProjectModal(false)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold cursor-pointer shadow-2xs"
                >
                  Save Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD CERTIFICATION */}
      {showAddCertModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-[#0f2744] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm">Add Certification Record</h3>
              </div>
              <button onClick={() => setShowAddCertModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCert} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Certification Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AWS Certified Solutions Architect"
                  value={newCert.title}
                  onChange={e => setNewCert({ ...newCert, title: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Issuing Organization</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Amazon Web Services"
                    value={newCert.issuing_organization}
                    onChange={e => setNewCert({ ...newCert, issuing_organization: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Issue Date</label>
                  <input
                    type="date"
                    value={newCert.issue_date}
                    onChange={e => setNewCert({ ...newCert, issue_date: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Credential ID (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. AWS-9482938"
                    value={newCert.credential_id}
                    onChange={e => setNewCert({ ...newCert, credential_id: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Credential Verification URL</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={newCert.credential_url}
                    onChange={e => setNewCert({ ...newCert, credential_url: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddCertModal(false)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold cursor-pointer shadow-2xs"
                >
                  Save Certification
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ARCHIVE DOCUMENT */}
      {showAddDocModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-[#0f2744] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-sm">Archive Document in Vault</h3>
              </div>
              <button onClick={() => setShowAddDocModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadDoc} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Document Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 3rd Semester Verified Transcript"
                  value={newDoc.title}
                  onChange={e => setNewDoc({ ...newDoc, title: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={newDoc.category}
                    onChange={e => setNewDoc({ ...newDoc, category: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                  >
                    <option value="Transcript">Transcript</option>
                    <option value="Certificate">Certificate</option>
                    <option value="Internship Letter">Internship Letter</option>
                    <option value="Identity Proof">Identity Proof</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Document File</label>
                  <input
                    type="file"
                    required
                    accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.txt"
                    onChange={e => setNewDoc({ ...newDoc, file: e.target.files?.[0] || null })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Notes (optional)</label>
                <textarea
                  rows={2}
                  placeholder="Brief note about the document..."
                  value={newDoc.description}
                  onChange={e => setNewDoc({ ...newDoc, description: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddDocModal(false)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#0f2744] text-white hover:bg-[#163354] rounded-lg text-xs font-semibold cursor-pointer shadow-2xs"
                >
                  Archive Document
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD POST */}
      {showAddPostModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-[#0f2744] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-400" />
                <h3 className="font-bold text-sm">Create New Post</h3>
              </div>
              <button onClick={() => setShowAddPostModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePost} className="p-5 space-y-4">
              <div>
                <input
                  type="text"
                  required
                  placeholder="Post Title (e.g. Won 1st Prize in Hackathon)"
                  value={newPost.title}
                  onChange={e => setNewPost({ ...newPost, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-lg bg-slate-50 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
                />
              </div>

              <div>
                <textarea
                  required
                  rows={4}
                  placeholder="What do you want to talk about?"
                  value={newPost.description}
                  onChange={e => setNewPost({ ...newPost, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-50 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={newPost.category}
                    onChange={e => setNewPost({ ...newPost, category: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                  >
                    <option value="Achievement">Achievement</option>
                    <option value="Project">Project Update</option>
                    <option value="Event">Event Participation</option>
                    <option value="Certification">Certification</option>
                    <option value="Discussion">Discussion</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tags (comma separated)</label>
                  <input
                    type="text"
                    placeholder="react, webdev, hackathon"
                    value={newPost.tags}
                    onChange={e => setNewPost({ ...newPost, tags: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">External Link (Optional)</label>
                <input
                  type="url"
                  placeholder="https://github.com/..."
                  value={newPost.external_link}
                  onChange={e => setNewPost({ ...newPost, external_link: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Attachments (Images, PDF, PPT, Video)</label>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.mp4,.webm"
                  onChange={e => {
                     const selected = Array.from(e.target.files || []);
                     if (selected.length > 5) {
                        alert('You can only upload up to 5 files at a time.');
                        return;
                     }
                     setNewPost({ ...newPost, files: selected });
                  }}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                />
                <p className="text-[10px] text-slate-500 mt-1">Max 5 files. Supported: PDF, PPT, Images, MP4 (Max 20MB per file).</p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddPostModal(false)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-sky-600 text-white hover:bg-sky-700 rounded-lg text-xs font-semibold cursor-pointer shadow-2xs"
                >
                  Post
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
