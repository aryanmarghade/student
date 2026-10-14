/**
 * server/student-evidence-service.ts
 * -----------------------------------
 * Unified Normalized Student Evidence & Placement Intelligence Service
 *
 * Gathers and normalizes authorized multi-domain student records:
 * 1. Academic marks, assessments & verified backlogs (from marks, marksheets, academic-service.ts)
 * 2. GitHub profiles, repositories, tech stacks & bounded README/CI inspection
 * 3. LeetCode verified problem solving (Easy, Medium, Hard, ranking, reputation) & snapshots
 * 4. HackerRank skill badges, stars, certificates & snapshots
 * 5. LinkedIn verified professional activity & imported posts
 * 6. Hackathons & competition outcomes (Winner, Finalist, Shortlisted, Verified)
 * 7. Student projects, certifications, achievements & internal website posts
 * 8. Sports & athletics participation, match stats, leadership & coach verification
 *
 * Core Guarantees:
 * - Works completely when academic marks are absent (marks marked NOT_AVAILABLE).
 * - Distinguishes observed facts, self-reported claims, and faculty-verified achievements.
 * - Never hallucinates or fabricates missing records or external performance.
 * - Sanitizes all student-submitted text against prompt injection.
 * - Produces explainable domain skill assessments and role readiness evaluations.
 */

import { query, id } from './db.js';
import { calculateAcademicHistory, calculateAcademicHistoryBulk } from './academic-service.js';

// ── Types & Interfaces ────────────────────────────────────────────────────────

export type ProvenanceType = 'self_reported' | 'externally_retrieved' | 'faculty_verified';
export type VerificationStateType = 'Verified' | 'Student Submitted' | 'Rejected' | 'Published' | 'Unverified';
export type FreshnessType = 'fresh' | 'recent' | 'stale' | 'historical' | 'not_available';

export interface EvidenceRecord {
  id: string;
  domain: 'academics' | 'github' | 'leetcode' | 'hackerrank' | 'hackathons' | 'portfolio_posts' | 'sports';
  title: string;
  sourcePlatform: 'Institutional Ledger' | 'GitHub' | 'LeetCode' | 'HackerRank' | 'Campus Platform' | 'Sports Dept';
  sourceUrl?: string | null;
  observationDate?: string | null;
  lastSyncedDate?: string | null;
  provenance: ProvenanceType;
  verificationStatus: VerificationStateType;
  isVerified: boolean;
  freshness: FreshnessType;
  metrics?: Record<string, any>;
  limitations?: string[];
}

export interface DomainSkillAssessment {
  domain: string;
  domainStatus: 'AVAILABLE' | 'NOT_AVAILABLE' | 'PARTIAL' | 'UNVERIFIED';
  evidenceSufficiency: 'HIGH' | 'MODERATE' | 'LOW' | 'INSUFFICIENT';
  observedFacts: string[];
  supportedInterpretation: string[];
  selfReportedClaims: string[];
  verifiedAchievements: string[];
  missingInformation: string[];
  recommendations: string[];
}

export interface StudentNormalizedEvidence {
  studentId: string;
  rollNumber: string;
  fullName: string;
  email: string;
  className?: string | null;
  classYear?: number | null;
  departmentName?: string | null;
  dataFreshness?: FreshnessType;

  // Domain Evidence Items
  academics: {
    status: 'AVAILABLE' | 'NOT_AVAILABLE' | 'PARTIAL';
    currentBacklogsCount: number;
    totalBacklogsCount: number;
    currentBacklogSubjects: Array<{ subjectName: string; subjectCode: string; semesterName: string }>;
    cgpa: number | null;
    evaluationsCount: number;
    assessments: Array<{
      title: string;
      obtained: number | null;
      max: number;
      percentage: number | null;
      status: 'RECORDED' | 'MISSING';
      examType: string;
      subjectName?: string;
    }>;
  };

  github: {
    status: 'SYNCED' | 'NOT_SYNCED' | 'NOT_AVAILABLE' | 'ACCESS_UNAVAILABLE';
    username?: string | null;
    url?: string | null;
    publicRepos: number | null;
    totalStars: number | null;
    totalForks: number | null;
    totalContributions: number | null;
    languages: string[];
    topRepos: Array<{
      name: string;
      url: string;
      description?: string | null;
      stars: number;
      language?: string | null;
      isFork?: boolean;
      hasTestsOrCI?: boolean;
    }>;
    lastSyncedAt?: string | null;
    limitations: string[];
  };

  leetcode: {
    status: 'SYNCED' | 'NOT_SYNCED' | 'NOT_AVAILABLE';
    username?: string | null;
    url?: string | null;
    totalSolved: number | null;
    easySolved: number | null;
    mediumSolved: number | null;
    hardSolved: number | null;
    ranking: number | null;
    reputation: number | null;
    historicalSnapshots: Array<{ month: string; totalSolved: number }>;
    lastSyncedAt?: string | null;
    limitations: string[];
  };

  hackerrank: {
    status: 'SYNCED' | 'NOT_SYNCED' | 'NOT_AVAILABLE' | 'MANUAL_REVIEW';
    username?: string | null;
    url?: string | null;
    verifiedSkills: string[];
    badgesCount: number | null;
    studentEvidence: Array<{
      id: string;
      skillName: string;
      badgeName?: string | null;
      stars: number;
      certificateUrl?: string | null;
      evidenceUrl?: string | null;
      verificationStatus: VerificationStateType;
    }>;
    limitations: string[];
  };

  linkedin: {
    status: 'SYNCED' | 'NOT_SYNCED' | 'NOT_AVAILABLE' | 'MANUAL_REVIEW';
    url?: string | null;
    connectionsCount: number | null;
    followersCount: number | null;
    posts: Array<{
      id: string;
      title?: string | null;
      content: string;
      postDate?: string | null;
      postUrl?: string | null;
      category: string;
      topics: string[];
      likesCount: number;
      commentsCount: number;
      verificationStatus: VerificationStateType;
      sourceType: string;
    }>;
    limitations: string[];
  };

  hackathons: Array<{
    id: string;
    name: string;
    organizer: string;
    date?: string | null;
    positionResult?: string | null;
    teamName?: string | null;
    projectName?: string | null;
    projectDescription?: string | null;
    githubUrl?: string | null;
    certificateUrl?: string | null;
    verificationStatus: VerificationStateType;
    isVerified: boolean;
  }>;

  projects: Array<{
    id: string;
    title: string;
    description: string;
    technologies: string[];
    githubUrl?: string | null;
    liveUrl?: string | null;
    verificationStatus: VerificationStateType;
    isVerified: boolean;
  }>;

  certifications: Array<{
    id: string;
    name: string;
    issuer: string;
    issueDate?: string | null;
    credentialId?: string | null;
    certificateUrl?: string | null;
    verificationStatus: VerificationStateType;
    isVerified: boolean;
  }>;

  internalPosts: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    tags: string[];
    externalLink?: string | null;
    createdAt: string;
    attachments: Array<{ fileName: string; fileType: string; fileUrl: string }>;
    verificationStatus: VerificationStateType;
  }>;

  sports: Array<{
    id: string;
    sportName: string;
    eventName: string;
    participationType: 'individual' | 'team';
    positionRole?: string | null;
    competitionLevel: string;
    seasonYear?: string | null;
    matchStats: Record<string, any>;
    resultAward?: string | null;
    leadershipRole: 'member' | 'captain' | 'vice_captain' | 'lead';
    evidenceUrl?: string | null;
    verificationStatus: VerificationStateType;
    isVerified: boolean;
    notes?: string | null;
  }>;

  allEvidenceRecords: EvidenceRecord[];
  domainAssessments: DomainSkillAssessment[];
}

export interface RoleRequirementMatch {
  requirement: string;
  category: 'Language' | 'Framework' | 'ProblemSolving' | 'Project' | 'EngineeringPractices' | 'Communication' | 'Leadership';
  status: 'VERIFIED_MATCH' | 'SELF_REPORTED_MATCH' | 'PARTIALLY_MET' | 'MISSING';
  supportingEvidence: string[];
  confidence: 'HIGH' | 'MODERATE' | 'LOW' | 'NONE';
  rationale?: string;
  citations?: string[];
}

export interface RoleReadinessEvaluation {
  role: string;
  targetRole: string;
  candidateName: string;
  rollNumber: string;
  readinessTier: 'DEMONSTRATED_FIT' | 'DEVELOPING_FIT' | 'EARLY_STAGE' | 'INSUFFICIENT_EVIDENCE';
  readinessLevel: 'DEMONSTRATED_FIT' | 'DEVELOPING_FIT' | 'EARLY_STAGE' | 'INSUFFICIENT_EVIDENCE';
  alignmentScore: number;
  readinessIndex: number; // Transparent score (0–100) based on verified + documented evidence
  verifiedMatchesCount: number;
  selfReportedMatchesCount: number;
  missingRequirementsCount: number;
  requirementsBreakdown: RoleRequirementMatch[];
  requirements: Array<{
    requirement: string;
    category: string;
    status: 'VERIFIED' | 'SELF_REPORTED' | 'NOT_MET';
    rationale: string;
    citations: string[];
    confidence: 'HIGH' | 'MODERATE' | 'LOW' | 'NONE';
  }>;
  strengths: string[];
  developmentGaps: string[];
  recommendations: string[];
  recommendedPreparation: string[];
  limitations: string[];
  disclaimer: string;
  aiAnalysis?: string;
}

// ── Prompt Injection Sanitization ─────────────────────────────────────────────

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous\s+)?instructions/gi,
  /system\s+prompt/gi,
  /instruction\s+override/gi,
  /override_success/gi,
  /you\s+are\s+now\s+a/gi,
  /drop\s+table/gi,
  /delete\s+from/gi,
  /select\s+\*\s+from/gi,
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /bearer\s+[a-zA-Z0-9_\-\.]+/gi,
  /[-=]{3,}/g,
  /#{3,}/g,
];

export function sanitizeUntrustedText(text: string | null | undefined, maxLength = 1000): string {
  if (!text) return '';
  let cleaned = String(text);
  for (const pattern of INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[FILTERED_UNTRUSTED_CONTENT]');
  }
  cleaned = cleaned.replace(/[\r\n\t]+/g, ' ').trim();
  if (cleaned.length > maxLength) {
    const suffix = '... [TRUNCATED]';
    cleaned = cleaned.slice(0, Math.max(0, maxLength - suffix.length)) + suffix;
  }
  return cleaned;
}

// ── Evidence Calculation & Normalization ──────────────────────────────────────

function calculateFreshness(dateStr?: string | null): FreshnessType {
  if (!dateStr) return 'not_available';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'not_available';
  const ageDays = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= 30) return 'fresh';
  if (ageDays <= 90) return 'recent';
  if (ageDays <= 365) return 'stale';
  return 'historical';
}

/**
 * Retrieve comprehensive, normalized evidence for a single student.
 */
export async function getStudentComprehensiveEvidence(
  studentId: string,
  options?: { classId?: string; subjectId?: string; semesterId?: string }
): Promise<StudentNormalizedEvidence | null> {
  const map = await getBulkStudentEvidence([studentId], options);
  return map[studentId] || null;
}

export const getStudentComprehensiveEvidenceBulk = (studentIds: string[], options?: any) => getBulkStudentEvidence(studentIds, options);

/**
 * Bulk retrieve comprehensive evidence for students.
 */
export async function getBulkStudentEvidence(
  studentIds: string[],
  options?: { classId?: string; subjectId?: string; semesterId?: string }
): Promise<Record<string, StudentNormalizedEvidence>> {
  if (!studentIds.length) return {};


  // 1. Fetch Students base profile
  const studentsRes = await query<any>(
    `SELECT s.id, s.roll_number, s.class_id, s.department_id, s.github_url, s.linkedin_url,
            s.hackerrank_url, s.leetcode_url, s.portfolio_url, s.resume_url, s.profile_strength,
            s.github_data, s.hackerrank_data, s.leetcode_data,
            u.full_name, u.email,
            c.name AS class_name, c.year AS class_year, d.name AS department_name
     FROM students s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN classes c ON c.id = s.class_id
     LEFT JOIN departments d ON d.id = s.department_id
     WHERE s.id = ANY($1)`,
    [studentIds]
  );

  // 2. Parallel queries across all 8 evidence sources
  const [
    marksRes,
    academicHistMap,
    ghSnapsRes,
    lcSnapsRes,
    hrSnapsRes,
    hrEvidenceRes,
    liSnapsRes,
    liPostsRes,
    hackRes,
    projRes,
    certRes,
    postsRes,
    sportsRes
  ] = await Promise.all([
    // Marks scoped or unscoped
    query<any>(
      `SELECT m.*, sub.name AS subject_name, sub.code AS subject_code, sem.name AS semester_name
       FROM marks m
       JOIN subjects sub ON sub.id = m.subject_id
       JOIN semesters sem ON sem.id = m.semester_id
       WHERE m.student_id = ANY($1)
       ${options?.classId ? `AND m.class_id = '${options.classId}'` : ''}
       ${options?.subjectId ? `AND m.subject_id = '${options.subjectId}'` : ''}
       ${options?.semesterId ? `AND m.semester_id = '${options.semesterId}'` : ''}
       ORDER BY m.created_at ASC`,
      [studentIds]
    ),
    calculateAcademicHistoryBulk(studentIds),
    // GitHub Snapshots
    query<any>(
      `SELECT DISTINCT ON (student_id) *
       FROM student_github_snapshots WHERE student_id = ANY($1)
       ORDER BY student_id, snapshot_month DESC`,
      [studentIds]
    ),
    // LeetCode Snapshots
    query<any>(
      `SELECT * FROM student_leetcode_snapshots WHERE student_id = ANY($1) ORDER BY snapshot_month DESC`,
      [studentIds]
    ),
    // HackerRank Snapshots
    query<any>(
      `SELECT DISTINCT ON (student_id) *
       FROM student_hackerrank_snapshots WHERE student_id = ANY($1)
       ORDER BY student_id, snapshot_month DESC`,
      [studentIds]
    ),
    // HackerRank Student Evidence
    query<any>(
      `SELECT * FROM student_hackerrank_evidence WHERE student_id = ANY($1) ORDER BY created_at DESC`,
      [studentIds]
    ),
    // LinkedIn Snapshots
    query<any>(
      `SELECT DISTINCT ON (student_id) *
       FROM student_linkedin_snapshots WHERE student_id = ANY($1)
       ORDER BY student_id, snapshot_month DESC`,
      [studentIds]
    ),
    // LinkedIn Student Posts
    query<any>(
      `SELECT * FROM student_linkedin_posts WHERE student_id = ANY($1) ORDER BY post_date DESC, created_at DESC`,
      [studentIds]
    ),
    // Hackathons
    query<any>(
      `SELECT * FROM hackathons WHERE student_id = ANY($1) ORDER BY date DESC, created_at DESC`,
      [studentIds]
    ),
    // Projects
    query<any>(
      `SELECT * FROM projects WHERE student_id = ANY($1) ORDER BY created_at DESC`,
      [studentIds]
    ),
    // Certifications
    query<any>(
      `SELECT * FROM certifications WHERE student_id = ANY($1) ORDER BY created_at DESC`,
      [studentIds]
    ),
    // Internal Website Posts with attachments
    query<any>(
      `SELECT p.*,
              (SELECT json_agg(json_build_object('fileName', a.file_name, 'fileType', a.file_type, 'fileUrl', a.file_url))
               FROM post_attachments a WHERE a.post_id = p.id) AS attachments
       FROM posts p
       WHERE p.student_id = ANY($1)
       ORDER BY p.created_at DESC`,
      [studentIds]
    ),
    // Sports & Athletics
    query<any>(
      `SELECT * FROM sports WHERE student_id = ANY($1) ORDER BY created_at DESC`,
      [studentIds]
    )
  ]);

  const result: Record<string, StudentNormalizedEvidence> = {};

  for (const st of studentsRes.rows) {
    const sId = st.id;
    const allRecords: EvidenceRecord[] = [];

    // --- Domain 1: Academics ---
    const sMarks = marksRes.rows.filter((m: any) => m.student_id === sId);
    const hist = academicHistMap[sId];
    const academicAssessments = sMarks.map((m: any) => {
      const max = Number(m.max_marks || 100);
      const val = m.marks_obtained !== null && m.marks_obtained !== undefined ? Number(m.marks_obtained) : null;
      const pct = val !== null && max > 0 ? Number(((val / max) * 100).toFixed(1)) : null;
      return {
        title: m.exam_type,
        obtained: val,
        max,
        percentage: pct,
        status: (val !== null ? 'RECORDED' : 'MISSING') as 'RECORDED' | 'MISSING',
        examType: m.exam_type,
        subjectName: m.subject_name,
      };
    });

    const academicsStatus: 'AVAILABLE' | 'NOT_AVAILABLE' | 'PARTIAL' =
      academicAssessments.length > 0 ? 'AVAILABLE' : 'NOT_AVAILABLE';

    if (academicAssessments.length > 0) {
      allRecords.push({
        id: `ev_acad_${sId}`,
        domain: 'academics',
        title: `Academic Marks Ledger (${academicAssessments.length} assessments)`,
        sourcePlatform: 'Institutional Ledger',
        sourceUrl: `/api/student/marks`,
        provenance: 'faculty_verified',
        verificationStatus: 'Verified',
        isVerified: true,
        freshness: 'recent',
        metrics: {
          cgpa: hist?.cgpa ?? null,
          activeBacklogs: hist?.currentBacklogsCount ?? 0,
          totalEvaluations: academicAssessments.length,
        },
      });
    }

    // --- Domain 2: GitHub ---
    const ghSnap = ghSnapsRes.rows.find((g: any) => g.student_id === sId);
    const ghStatus: StudentNormalizedEvidence['github']['status'] =
      ghSnap && ghSnap.sync_status === 'synced'
        ? 'SYNCED'
        : st.github_url
        ? 'NOT_SYNCED'
        : 'NOT_AVAILABLE';

    const ghLimitations: string[] = [];
    if (ghStatus !== 'SYNCED') {
      ghLimitations.push('GitHub profile data not synchronized; absence does not equate to zero engineering activity.');
    } else {
      ghLimitations.push('Public repository metadata and code indicators; private/client work cannot be inspected.');
    }

    if (ghStatus === 'SYNCED') {
      allRecords.push({
        id: `ev_gh_${ghSnap.id}`,
        domain: 'github',
        title: `Public GitHub Repository Portfolio (${ghSnap.public_repos || 0} repos)`,
        sourcePlatform: 'GitHub',
        sourceUrl: `https://github.com/${ghSnap.github_username}`,
        lastSyncedDate: ghSnap.synced_at,
        provenance: 'externally_retrieved',
        verificationStatus: 'Verified',
        isVerified: true,
        freshness: calculateFreshness(ghSnap.synced_at),
        metrics: {
          publicRepos: ghSnap.public_repos,
          stars: ghSnap.total_stars,
          forks: ghSnap.total_forks,
          contributions: ghSnap.total_contributions,
          languages: ghSnap.languages || [],
        },
        limitations: ghLimitations,
      });
    }

    // --- Domain 3: LeetCode ---
    const sLcSnaps = lcSnapsRes.rows.filter((l: any) => l.student_id === sId);
    const latestLc = sLcSnaps[0] || (st.leetcode_data ? { ...st.leetcode_data, sync_status: 'synced' } : null);
    const lcStatus: StudentNormalizedEvidence['leetcode']['status'] =
      latestLc && latestLc.sync_status === 'synced'
        ? 'SYNCED'
        : st.leetcode_url
        ? 'NOT_SYNCED'
        : 'NOT_AVAILABLE';

    const lcLimitations: string[] = [
      'Problem counts reflect public solved totals; submissions acceptance rate omitted to prevent synthetic fabrication.',
    ];

    if (lcStatus === 'SYNCED' && latestLc) {
      allRecords.push({
        id: `ev_lc_${sId}`,
        domain: 'leetcode',
        title: `LeetCode Problem Solving Record (${latestLc.total_solved ?? latestLc.totalSolved ?? 0} solved)`,
        sourcePlatform: 'LeetCode',
        sourceUrl: st.leetcode_url,
        provenance: 'externally_retrieved',
        verificationStatus: 'Verified',
        isVerified: true,
        freshness: calculateFreshness(latestLc.synced_at),
        metrics: {
          totalSolved: latestLc.total_solved ?? latestLc.totalSolved ?? 0,
          easy: latestLc.easy_solved ?? latestLc.easySolved ?? 0,
          medium: latestLc.medium_solved ?? latestLc.mediumSolved ?? 0,
          hard: latestLc.hard_solved ?? latestLc.hardSolved ?? 0,
          ranking: latestLc.ranking ?? null,
        },
        limitations: lcLimitations,
      });
    }

    // --- Domain 4: HackerRank ---
    const sHrEvidence = hrEvidenceRes.rows.filter((h: any) => h.student_id === sId);
    const hrSnap = hrSnapsRes.rows.find((h: any) => h.student_id === sId);
    const hrStatus: StudentNormalizedEvidence['hackerrank']['status'] =
      sHrEvidence.length > 0
        ? 'MANUAL_REVIEW'
        : hrSnap && hrSnap.sync_status === 'synced'
        ? 'SYNCED'
        : st.hackerrank_url
        ? 'NOT_SYNCED'
        : 'NOT_AVAILABLE';

    for (const h of sHrEvidence) {
      allRecords.push({
        id: h.id,
        domain: 'hackerrank',
        title: `HackerRank Skill: ${h.skill_name} (${h.stars} Stars)`,
        sourcePlatform: 'HackerRank',
        sourceUrl: h.evidence_url || h.certificate_url,
        provenance: h.verification_status === 'Verified' ? 'faculty_verified' : 'self_reported',
        verificationStatus: h.verification_status,
        isVerified: h.verification_status === 'Verified',
        freshness: 'recent',
        metrics: { stars: h.stars, badge: h.badge_name },
      });
    }

    // --- LinkedIn removed from Intelligence Analyser per institutional policy ---
    const sLiPosts = liPostsRes.rows.filter((p: any) => p.student_id === sId);
    const liSnap = liSnapsRes.rows.find((l: any) => l.student_id === sId);
    const liStatus: StudentNormalizedEvidence['linkedin']['status'] = 'NOT_AVAILABLE';

    // --- Domain 6: Hackathons ---
    const sHacks = hackRes.rows.filter((h: any) => h.student_id === sId);
    for (const h of sHacks) {
      const isVer = h.verification_status === 'Verified';
      allRecords.push({
        id: h.id,
        domain: 'hackathons',
        title: `${h.name} (${h.position_result || 'Participant'})`,
        sourcePlatform: 'Campus Platform',
        sourceUrl: h.certificate_url || h.github_url,
        observationDate: h.date,
        provenance: isVer ? 'faculty_verified' : 'self_reported',
        verificationStatus: h.verification_status || 'Student Submitted',
        isVerified: isVer,
        freshness: calculateFreshness(h.date),
        metrics: {
          organizer: h.organizer,
          outcome: h.position_result,
          project: h.project_name,
        },
      });
    }

    // --- Domain 7: Projects, Certifications, Internal Posts ---
    const sProjs = projRes.rows.filter((p: any) => p.student_id === sId);
    for (const p of sProjs) {
      const isVer = p.verification_status === 'Verified';
      allRecords.push({
        id: p.id,
        domain: 'portfolio_posts',
        title: `Project: ${p.title}`,
        sourcePlatform: 'Campus Platform',
        sourceUrl: p.github_url || p.live_url,
        provenance: isVer ? 'faculty_verified' : 'self_reported',
        verificationStatus: p.verification_status || 'Student Submitted',
        isVerified: isVer,
        freshness: 'recent',
        metrics: { technologies: p.technologies || [] },
      });
    }

    const sCerts = certRes.rows.filter((c: any) => c.student_id === sId);
    for (const c of sCerts) {
      const isVer = c.verification_status === 'Verified';
      allRecords.push({
        id: c.id,
        domain: 'portfolio_posts',
        title: `Certification: ${c.name} (${c.issuer})`,
        sourcePlatform: 'Campus Platform',
        sourceUrl: c.certificate_url || c.credential_url,
        observationDate: c.issue_date,
        provenance: isVer ? 'faculty_verified' : 'self_reported',
        verificationStatus: c.verification_status || 'Student Submitted',
        isVerified: isVer,
        freshness: calculateFreshness(c.issue_date),
        metrics: { issuer: c.issuer, credentialId: c.credential_id },
      });
    }

    const sPosts = postsRes.rows.filter((p: any) => p.student_id === sId);
    for (const p of sPosts) {
      allRecords.push({
        id: p.id,
        domain: 'portfolio_posts',
        title: `Campus Post: ${p.title}`,
        sourcePlatform: 'Campus Platform',
        sourceUrl: p.external_link,
        observationDate: p.created_at,
        provenance: 'self_reported',
        verificationStatus: p.verification_status || 'Published',
        isVerified: false,
        freshness: calculateFreshness(p.created_at),
        metrics: { category: p.category, tags: p.tags, attachmentCount: (p.attachments || []).length },
      });
    }

    // --- Domain 8: Sports & Athletics ---
    const sSports = sportsRes.rows.filter((sp: any) => sp.student_id === sId);
    for (const sp of sSports) {
      const isVer = sp.verification_status === 'Verified';
      allRecords.push({
        id: sp.id,
        domain: 'sports',
        title: `${sp.sport_name} — ${sp.event_name} (${sp.result_award || 'Participation'})`,
        sourcePlatform: 'Sports Dept',
        sourceUrl: sp.evidence_url,
        observationDate: sp.created_at,
        provenance: isVer ? 'faculty_verified' : 'self_reported',
        verificationStatus: sp.verification_status || 'Student Submitted',
        isVerified: isVer,
        freshness: 'recent',
        metrics: {
          level: sp.competition_level,
          role: sp.leadership_role,
          participation: sp.participation_type,
          stats: sp.match_stats || {},
        },
      });
    }

    // --- Synthesize Domain Assessments (7 Authorized Independent Domains) ---
    const domainAssessments: DomainSkillAssessment[] = [
      synthesizeAcademicsAssessment(academicAssessments, hist),
      synthesizeGitHubAssessment(ghStatus, ghSnap),
      synthesizeLeetCodeAssessment(lcStatus, latestLc),
      synthesizeHackerRankAssessment(hrStatus, sHrEvidence),
      synthesizeHackathonsAssessment(sHacks),
      synthesizeProjectsAndPostsAssessment(sProjs, sCerts, sPosts),
      synthesizeSportsAssessment(sSports),
    ];

    result[sId] = {
      studentId: sId,
      rollNumber: st.roll_number,
      fullName: st.full_name,
      email: st.email,
      className: st.class_name,
      classYear: st.class_year ? Number(st.class_year) : null,
      departmentName: st.department_name,
      academics: {
        status: academicsStatus,
        currentBacklogsCount: hist?.currentBacklogsCount ?? 0,
        totalBacklogsCount: hist?.totalBacklogsCount ?? 0,
        currentBacklogSubjects: hist?.currentBacklogSubjects || [],
        cgpa: hist?.cgpa ?? null,
        evaluationsCount: academicAssessments.length,
        assessments: academicAssessments,
      },
      github: {
        status: ghStatus,
        username: ghSnap?.github_username || null,
        url: st.github_url || null,
        publicRepos: ghSnap?.public_repos ?? null,
        totalStars: ghSnap?.total_stars ?? null,
        totalForks: ghSnap?.total_forks ?? null,
        totalContributions: ghSnap?.total_contributions ?? null,
        languages: ghSnap?.languages || [],
        topRepos: ghSnap?.top_repos || [],
        lastSyncedAt: ghSnap?.synced_at || null,
        limitations: ghLimitations,
      },
      leetcode: {
        status: lcStatus,
        username: latestLc?.leetcode_username ?? latestLc?.username ?? null,
        url: st.leetcode_url || null,
        totalSolved: latestLc?.total_solved ?? latestLc?.totalSolved ?? null,
        easySolved: latestLc?.easy_solved ?? latestLc?.easySolved ?? null,
        mediumSolved: latestLc?.medium_solved ?? latestLc?.mediumSolved ?? null,
        hardSolved: latestLc?.hard_solved ?? latestLc?.hardSolved ?? null,
        ranking: latestLc?.ranking ?? null,
        reputation: latestLc?.reputation ?? null,
        historicalSnapshots: sLcSnaps.map((sn: any) => ({
          month: sn.snapshot_month,
          totalSolved: sn.total_solved || 0,
        })),
        lastSyncedAt: latestLc?.synced_at || null,
        limitations: lcLimitations,
      },
      hackerrank: {
        status: hrStatus,
        username: hrSnap?.hackerrank_username || null,
        url: st.hackerrank_url || null,
        verifiedSkills: hrSnap?.verified_skills || [],
        badgesCount: hrSnap?.badges_count ?? null,
        studentEvidence: sHrEvidence.map((h: any) => ({
          id: h.id,
          skillName: h.skill_name,
          badgeName: h.badge_name,
          stars: h.stars || 0,
          certificateUrl: h.certificate_url,
          evidenceUrl: h.evidence_url,
          verificationStatus: h.verification_status,
        })),
        limitations: ['HackerRank skill claims require faculty review of certificates/public URLs.'],
      },
      linkedin: {
        status: liStatus,
        url: st.linkedin_url || null,
        connectionsCount: liSnap?.connections ?? null,
        followersCount: liSnap?.followers ?? null,
        posts: sLiPosts.map((p: any) => ({
          id: p.id,
          title: p.title,
          content: sanitizeUntrustedText(p.content, 400),
          postDate: p.post_date,
          postUrl: p.post_url,
          category: p.category,
          topics: p.topics || [],
          likesCount: p.likes_count || 0,
          commentsCount: p.comments_count || 0,
          verificationStatus: p.verification_status,
          sourceType: p.source_type,
        })),
        limitations: [
          'LinkedIn activity is derived from authorized student-submitted posts and public links. Private feed scraping is not performed.',
        ],
      },
      hackathons: sHacks.map((h: any) => ({
        id: h.id,
        name: h.name,
        organizer: h.organizer,
        date: h.date,
        positionResult: h.position_result,
        teamName: h.team_name,
        projectName: h.project_name,
        projectDescription: sanitizeUntrustedText(h.project_description, 300),
        githubUrl: h.github_url,
        certificateUrl: h.certificate_url,
        verificationStatus: h.verification_status || 'Student Submitted',
        isVerified: h.verification_status === 'Verified',
      })),
      projects: sProjs.map((p: any) => ({
        id: p.id,
        title: p.title,
        description: sanitizeUntrustedText(p.description, 300),
        technologies: Array.isArray(p.technologies) ? p.technologies : [],
        githubUrl: p.github_url,
        liveUrl: p.live_url,
        verificationStatus: p.verification_status || 'Student Submitted',
        isVerified: p.verification_status === 'Verified',
      })),
      certifications: sCerts.map((c: any) => ({
        id: c.id,
        name: c.name,
        issuer: c.issuer,
        issueDate: c.issue_date,
        credentialId: c.credential_id,
        certificateUrl: c.certificate_url,
        verificationStatus: c.verification_status || 'Student Submitted',
        isVerified: c.verification_status === 'Verified',
      })),
      internalPosts: sPosts.map((p: any) => ({
        id: p.id,
        title: p.title,
        description: sanitizeUntrustedText(p.description, 300),
        category: p.category,
        tags: Array.isArray(p.tags) ? p.tags : [],
        externalLink: p.external_link,
        createdAt: p.created_at,
        attachments: p.attachments || [],
        verificationStatus: p.verification_status || 'Published',
      })),
      sports: sSports.map((sp: any) => ({
        id: sp.id,
        sportName: sp.sport_name,
        eventName: sp.event_name,
        participationType: sp.participation_type || 'individual',
        positionRole: sp.position_role,
        competitionLevel: sp.competition_level,
        seasonYear: sp.season_year,
        matchStats: sp.match_stats || {},
        resultAward: sp.result_award,
        leadershipRole: sp.leadership_role || 'member',
        evidenceUrl: sp.evidence_url,
        verificationStatus: sp.verification_status || 'Student Submitted',
        isVerified: sp.verification_status === 'Verified',
        notes: sanitizeUntrustedText(sp.notes, 200),
      })),
      allEvidenceRecords: allRecords,
      domainAssessments,
    };
  }

  return result;
}

// ── Domain Assessment Synthesis Helpers ───────────────────────────────────────

function synthesizeAcademicsAssessment(assessments: any[], hist: any): DomainSkillAssessment {
  if (!assessments.length) {
    return {
      domain: 'Academics & Curricular Progress',
      domainStatus: 'NOT_AVAILABLE',
      evidenceSufficiency: 'INSUFFICIENT',
      observedFacts: ['Zero marks records entered in the institutional academic ledger for this scope.'],
      supportedInterpretation: ['Academic trajectory cannot be evaluated from this scope.'],
      selfReportedClaims: [],
      verifiedAchievements: [],
      missingInformation: ['Internal assessments, midterm exams, and final grade transcripts.'],
      recommendations: ['Check whether marks entry is pending in the faculty marks ledger.'],
    };
  }

  const pcts = assessments.map((a) => a.percentage).filter((p): p is number => p !== null);
  const avg = pcts.length ? Number((pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(1)) : null;
  const backlogs = hist?.currentBacklogsCount ?? 0;

  return {
    domain: 'Academics & Curricular Progress',
    domainStatus: 'AVAILABLE',
    evidenceSufficiency: assessments.length >= 3 ? 'HIGH' : assessments.length === 2 ? 'MODERATE' : 'LOW',
    observedFacts: [
      `${assessments.length} assessment evaluation(s) recorded in ledger.`,
      avg !== null ? `Average recorded assessment score: ${avg}%.` : 'Score pending.',
      `Verified active backlogs: ${backlogs}.`,
    ],
    supportedInterpretation: [
      backlogs === 0
        ? 'Curricular standing is in good standing with 0 active backlogs.'
        : `Student is carrying ${backlogs} active backlog subject(s) requiring remediation.`,
      assessments.length === 1
        ? 'Only 1 assessment recorded; longitudinal learning curve cannot be established.'
        : `Performance observed across ${assessments.length} assessments.`,
    ],
    selfReportedClaims: [],
    verifiedAchievements: avg !== null && avg >= 75 ? [`High academic achievement (avg ${avg}%) in recorded scope.`] : [],
    missingInformation: assessments.length === 1 ? ['Subsequent assessments to observe trajectory.'] : [],
    recommendations: backlogs > 0 ? ['Schedule remedial subject tutorial support.'] : ['Maintain curricular focus.'],
  };
}

function synthesizeGitHubAssessment(status: string, snap: any): DomainSkillAssessment {
  if (status !== 'SYNCED' || !snap) {
    return {
      domain: 'Software Engineering & Version Control (GitHub)',
      domainStatus: 'NOT_AVAILABLE',
      evidenceSufficiency: 'INSUFFICIENT',
      observedFacts: ['No synchronized GitHub activity snapshot is available for this student.'],
      supportedInterpretation: ['Absence of external profile data does not imply lack of programming competence.'],
      selfReportedClaims: snap?.github_url ? ['Student provided a GitHub URL that is pending sync.'] : [],
      verifiedAchievements: [],
      missingInformation: ['Synchronized GitHub repository metadata and project inspection.'],
      recommendations: ['Connect or synchronize public GitHub profile.'],
    };
  }

  const facts: string[] = [
    `${snap.public_repos || 0} public repositories identified on GitHub.`,
    `Total repository stars received: ${snap.total_stars || 0}.`,
  ];
  if (snap.total_contributions !== null) {
    facts.push(`Annual contribution graph: ${snap.total_contributions} recorded contributions.`);
  }

  const langs = snap.languages || [];
  return {
    domain: 'Software Engineering & Version Control (GitHub)',
    domainStatus: 'AVAILABLE',
    evidenceSufficiency: (snap.public_repos || 0) >= 3 ? 'HIGH' : 'MODERATE',
    observedFacts: facts,
    supportedInterpretation: [
      langs.length > 0
        ? `Demonstrated familiarity with programming languages: ${langs.join(', ')}.`
        : 'Repositories do not specify recognized programming languages.',
      'Public repository counts indicate development activity, but code quality requires project inspection.',
    ],
    selfReportedClaims: [],
    verifiedAchievements: (snap.total_stars || 0) >= 10 ? [`Community-recognized projects with ${snap.total_stars} stars.`] : [],
    missingInformation: ['Code review of private/commercial projects not hosted on public GitHub.'],
    recommendations: ['Maintain descriptive README files, setup guides, and automated tests across repositories.'],
  };
}

function synthesizeLeetCodeAssessment(status: string, snap: any): DomainSkillAssessment {
  if (status !== 'SYNCED' || !snap || (!snap.total_solved && !snap.totalSolved)) {
    return {
      domain: 'Algorithmic Problem Solving (LeetCode)',
      domainStatus: 'NOT_AVAILABLE',
      evidenceSufficiency: 'INSUFFICIENT',
      observedFacts: ['No verified LeetCode statistics currently synchronized.'],
      supportedInterpretation: ['Algorithmic problem-solving ability must be evaluated through classroom practicals or other platforms.'],
      selfReportedClaims: [],
      verifiedAchievements: [],
      missingInformation: ['Public LeetCode problem solving metrics.'],
      recommendations: ['Link and synchronize a public LeetCode handle to showcase problem-solving practice.'],
    };
  }

  const total = snap.total_solved ?? snap.totalSolved ?? 0;
  const easy = snap.easy_solved ?? snap.easySolved ?? 0;
  const med = snap.medium_solved ?? snap.mediumSolved ?? 0;
  const hard = snap.hard_solved ?? snap.hardSolved ?? 0;

  return {
    domain: 'Algorithmic Problem Solving (LeetCode)',
    domainStatus: 'AVAILABLE',
    evidenceSufficiency: total >= 50 ? 'HIGH' : total >= 10 ? 'MODERATE' : 'LOW',
    observedFacts: [
      `Total verified solved problems: ${total} (Easy: ${easy}, Medium: ${med}, Hard: ${hard}).`,
      snap.ranking ? `Global LeetCode user ranking: ${snap.ranking.toLocaleString()}.` : 'Unranked.',
    ],
    supportedInterpretation: [
      med + hard > 0
        ? `Demonstrated capability on complex problems (${med} Medium, ${hard} Hard).`
        : 'Problem solving is concentrated in introductory (Easy) challenges.',
      'Practice problem volume demonstrates self-directed commitment, though contest ratings provide stronger verification of speed under pressure.',
    ],
    selfReportedClaims: [],
    verifiedAchievements: total >= 100 ? [`Substantial coding problem solving portfolio (${total}+ questions solved).`] : [],
    missingInformation: ['Contest participation ratings and live whiteboard problem-solving observation.'],
    recommendations: med < 20 ? ['Gradually increase practice on Medium-difficulty dynamic programming, trees, and graphs.'] : ['Participate in weekly timed contests.'],
  };
}

function synthesizeHackerRankAssessment(status: string, evidence: any[]): DomainSkillAssessment {
  if (!evidence.length) {
    return {
      domain: 'Language & Skill Badges (HackerRank)',
      domainStatus: 'NOT_AVAILABLE',
      evidenceSufficiency: 'INSUFFICIENT',
      observedFacts: ['No HackerRank skill badges or certificates recorded.'],
      supportedInterpretation: ['HackerRank data unavailable; no negative inference made.'],
      selfReportedClaims: [],
      verifiedAchievements: [],
      missingInformation: ['HackerRank badges or skill assessment URLs.'],
      recommendations: ['Upload public HackerRank skill assessment certificates for verification.'],
    };
  }

  const verified = evidence.filter((e) => e.verification_status === 'Verified');
  const pending = evidence.filter((e) => e.verification_status !== 'Verified');

  return {
    domain: 'Language & Skill Badges (HackerRank)',
    domainStatus: verified.length > 0 ? 'AVAILABLE' : 'UNVERIFIED',
    evidenceSufficiency: verified.length > 0 ? 'MODERATE' : 'LOW',
    observedFacts: [
      `${evidence.length} skill claim(s) submitted (${verified.length} faculty-verified, ${pending.length} self-reported).`,
    ],
    supportedInterpretation: [
      verified.length > 0
        ? `Verified proficiency in skills: ${verified.map((v) => v.skill_name).join(', ')}.`
        : 'Skill claims require faculty review before being treated as verified achievements.',
    ],
    selfReportedClaims: pending.map((p) => `${p.skill_name} (${p.stars} Stars)`),
    verifiedAchievements: verified.map((v) => `${v.skill_name} (${v.stars} Stars verified)`),
    missingInformation: pending.length > 0 ? ['Faculty certificate audit for pending claims.'] : [],
    recommendations: ['Faculty review requested for pending skill certificates.'],
  };
}

function synthesizeLinkedInAssessment(status: string, posts: any[]): DomainSkillAssessment {
  if (!posts.length) {
    return {
      domain: 'Professional Presence & Technical Writing (LinkedIn)',
      domainStatus: 'NOT_AVAILABLE',
      evidenceSufficiency: 'INSUFFICIENT',
      observedFacts: ['No authorized student-submitted LinkedIn posts or technical reflections on record.'],
      supportedInterpretation: ['Professional writing and public technical communication cannot be evaluated from on-record submissions.'],
      selfReportedClaims: [],
      verifiedAchievements: [],
      missingInformation: ['Technical posts, project announcements, or learning reflections.'],
      recommendations: ['Submit technical writing samples or project announcement links.'],
    };
  }

  const technical = posts.filter((p) => p.category === 'Technical Writing' || p.category === 'Project Update');
  return {
    domain: 'Professional Presence & Technical Writing (LinkedIn)',
    domainStatus: 'AVAILABLE',
    evidenceSufficiency: posts.length >= 3 ? 'MODERATE' : 'LOW',
    observedFacts: [
      `${posts.length} professional post(s) submitted for portfolio tracking.`,
      `Categories represented: ${Array.from(new Set(posts.map((p) => p.category))).join(', ')}.`,
    ],
    supportedInterpretation: [
      technical.length > 0
        ? `Engages in public technical writing and project communication (${technical.length} posts).`
        : 'Posts focus primarily on general milestones rather than deep technical documentation.',
    ],
    selfReportedClaims: posts.map((p) => p.title || p.category),
    verifiedAchievements: [],
    missingInformation: ['Peer or faculty endorsement of technical write-ups.'],
    recommendations: ['Document project architectural decisions and engineering challenges in technical write-ups.'],
  };
}

function synthesizeHackathonsAssessment(hackathons: any[]): DomainSkillAssessment {
  if (!hackathons.length) {
    return {
      domain: 'Hackathons & Competitive Engineering',
      domainStatus: 'NOT_AVAILABLE',
      evidenceSufficiency: 'INSUFFICIENT',
      observedFacts: ['Zero hackathon participations or competitive event entries on record.'],
      supportedInterpretation: ['No competitive hackathon experience documented in the platform.'],
      selfReportedClaims: [],
      verifiedAchievements: [],
      missingInformation: ['Hackathon event participation, project submissions, or certificates.'],
      recommendations: ['Participate in internal collegiate or regional hackathons to build rapid prototyping experience.'],
    };
  }

  const verified = hackathons.filter((h) => h.isVerified);
  const winners = hackathons.filter(
    (h) => h.positionResult && /winner|1st|first|runner|2nd|3rd|champion/i.test(h.positionResult)
  );

  return {
    domain: 'Hackathons & Competitive Engineering',
    domainStatus: 'AVAILABLE',
    evidenceSufficiency: hackathons.length >= 2 ? 'HIGH' : 'MODERATE',
    observedFacts: [
      `${hackathons.length} hackathon participation(s) recorded (${verified.length} faculty-verified).`,
      `Events: ${hackathons.map((h) => `${h.name} (${h.positionResult || 'Participated'})`).join('; ')}.`,
    ],
    supportedInterpretation: [
      winners.length > 0
        ? `Demonstrated top-tier competitive engineering performance: ${winners.map((w) => `${w.name} - ${w.positionResult}`).join(', ')}.`
        : 'Demonstrated participation and hands-on project delivery under hackathon time constraints.',
    ],
    selfReportedClaims: hackathons.filter((h) => !h.isVerified).map((h) => `${h.name}: ${h.positionResult}`),
    verifiedAchievements: verified.map((v) => `${v.name} (${v.positionResult || 'Verified Participant'})`),
    missingInformation: hackathons.length > verified.length ? ['Faculty review of unverified certificates.'] : [],
    recommendations: ['Archive project demo videos and repository links alongside hackathon records.'],
  };
}

function synthesizeProjectsAndPostsAssessment(projects: any[], certs: any[], posts: any[]): DomainSkillAssessment {
  const total = projects.length + certs.length + posts.length;
  if (total === 0) {
    return {
      domain: 'Practical Engineering Projects & Portfolio',
      domainStatus: 'NOT_AVAILABLE',
      evidenceSufficiency: 'INSUFFICIENT',
      observedFacts: ['No projects, certifications, or campus project posts currently on record.'],
      supportedInterpretation: ['Practical engineering portfolio is empty on the institutional platform.'],
      selfReportedClaims: [],
      verifiedAchievements: [],
      missingInformation: ['Project repository links, deployment URLs, or technical work samples.'],
      recommendations: ['Build and upload a capstone software project with live demo and GitHub repository.'],
    };
  }

  const verifiedProjs = projects.filter((p) => p.isVerified);
  const verifiedCerts = certs.filter((c) => c.isVerified);

  return {
    domain: 'Practical Engineering Projects & Portfolio',
    domainStatus: 'AVAILABLE',
    evidenceSufficiency: projects.length >= 2 ? 'HIGH' : 'MODERATE',
    observedFacts: [
      `${projects.length} project(s) recorded (${verifiedProjs.length} faculty-verified).`,
      `${certs.length} certification(s) recorded (${verifiedCerts.length} verified).`,
      `${posts.length} campus project announcement(s) published.`,
    ],
    supportedInterpretation: [
      projects.length > 0
        ? `Applied practical skills in software development across: ${Array.from(new Set(projects.flatMap((p) => p.technologies))).join(', ')}.`
        : 'Portfolio consists primarily of certifications or posts rather than full standalone projects.',
    ],
    selfReportedClaims: projects.filter((p) => !p.isVerified).map((p) => `Project: ${p.title}`),
    verifiedAchievements: [
      ...verifiedProjs.map((p) => `Verified Project: ${p.title}`),
      ...verifiedCerts.map((c) => `Verified Certificate: ${c.name} (${c.issuer})`),
    ],
    missingInformation: projects.filter((p) => !p.githubUrl && !p.liveUrl).length > 0 ? ['Live URLs or repository links for some projects.'] : [],
    recommendations: ['Ensure all software engineering projects include functional live demos and test suites.'],
  };
}

function synthesizeSportsAssessment(sports: any[]): DomainSkillAssessment {
  if (!sports.length) {
    return {
      domain: 'Sports, Athletics & Team Leadership',
      domainStatus: 'NOT_AVAILABLE',
      evidenceSufficiency: 'INSUFFICIENT',
      observedFacts: ['Zero athletic participation records or sports activities on record.'],
      supportedInterpretation: ['Athletics data unavailable; does not impact technical or academic standing.'],
      selfReportedClaims: [],
      verifiedAchievements: [],
      missingInformation: ['Sports tournament participation or athletic certifications.'],
      recommendations: ['Submit university sports participation or tournament records if applicable.'],
    };
  }

  const verified = sports.filter((s) => s.isVerified);
  const leaders = sports.filter((s) => s.leadershipRole === 'captain' || s.leadershipRole === 'vice_captain');
  const awards = sports.filter((s) => s.resultAward && !/participation/i.test(s.resultAward));

  return {
    domain: 'Sports, Athletics & Team Leadership',
    domainStatus: 'AVAILABLE',
    evidenceSufficiency: sports.length >= 2 ? 'HIGH' : 'MODERATE',
    observedFacts: [
      `${sports.length} athletic record(s) logged (${verified.length} coach/faculty verified).`,
      `Sports represented: ${Array.from(new Set(sports.map((s) => s.sport_name))).join(', ')}.`,
      leaders.length > 0 ? `Demonstrated athletic leadership roles: ${leaders.map((l) => `${l.leadershipRole} in ${l.sport_name}`).join(', ')}.` : 'Participated as team or individual athlete.',
    ],
    supportedInterpretation: [
      leaders.length > 0
        ? `Demonstrated leadership, communication, and discipline under competitive pressure as ${leaders[0].leadershipRole}.`
        : 'Demonstrated physical fitness, teamwork, and commitment through regular competition.',
      awards.length > 0
        ? `Competitive success achieved: ${awards.map((a) => `${a.resultAward} in ${a.sport_name} (${a.competitionLevel})`).join('; ')}.`
        : 'Active participation maintained across athletic events.',
    ],
    selfReportedClaims: sports.filter((s) => !s.isVerified).map((s) => `${s.sport_name}: ${s.eventName}`),
    verifiedAchievements: verified.map((v) => `${v.sport_name} — ${v.eventName} (${v.resultAward || 'Verified'})`),
    missingInformation: sports.length > verified.length ? ['Coach verification for pending tournament entries.'] : [],
    recommendations: ['Submit verified tournament result certificates from college athletic department.'],
  };
}

// ── Role Readiness Evaluation Engine (Placement AI) ──────────────────────────

const ROLE_ARCHETYPES: Record<
  string,
  Array<{ name: string; category: RoleRequirementMatch['category']; keywords: string[] }>
> = {
  'full-stack engineer': [
    { name: 'Frontend Engineering (React/Vue/HTML/CSS)', category: 'Framework', keywords: ['react', 'vue', 'next', 'frontend', 'javascript', 'typescript', 'tailwind'] },
    { name: 'Backend Engineering (Node/Express/Python/Go)', category: 'Framework', keywords: ['node', 'express', 'python', 'django', 'fastapi', 'backend', 'api'] },
    { name: 'Relational & Document Databases (SQL/PostgreSQL/MongoDB)', category: 'Language', keywords: ['sql', 'postgres', 'postgresql', 'database', 'mongo', 'mysql'] },
    { name: 'Version Control & Collaborative Git Workflow', category: 'EngineeringPractices', keywords: ['github', 'git', 'pull request', 'merge', 'repo'] },
    { name: 'Algorithmic Problem Solving (Arrays, Graphs, DP)', category: 'ProblemSolving', keywords: ['leetcode', 'hackerrank', 'algorithms', 'data structures', 'problem solving'] },
    { name: 'End-to-End Deployed Projects', category: 'Project', keywords: ['live_url', 'deployed', 'project', 'full-stack', 'production'] },
  ],
  'software engineer': [
    { name: 'Core Programming Language (Python/Java/C++/TypeScript)', category: 'Language', keywords: ['python', 'java', 'c++', 'c', 'typescript', 'javascript'] },
    { name: 'Data Structures & Algorithms', category: 'ProblemSolving', keywords: ['leetcode', 'hackerrank', 'algorithms', 'trees', 'dynamic programming'] },
    { name: 'Object-Oriented Design & System Architecture', category: 'EngineeringPractices', keywords: ['system design', 'architecture', 'design patterns', 'oop'] },
    { name: 'Software Project Implementation', category: 'Project', keywords: ['project', 'github', 'implementation', 'software'] },
    { name: 'Testing & Code Quality', category: 'EngineeringPractices', keywords: ['test', 'ci', 'jest', 'pytest', 'lint', 'workflow'] },
  ],
  'data scientist': [
    { name: 'Python for Data Analysis (Pandas/NumPy)', category: 'Language', keywords: ['python', 'pandas', 'numpy', 'scipy', 'data analysis'] },
    { name: 'Machine Learning Frameworks (Scikit-Learn/PyTorch/TensorFlow)', category: 'Framework', keywords: ['machine learning', 'pytorch', 'tensorflow', 'scikit-learn', 'deep learning'] },
    { name: 'SQL & Data Extraction', category: 'Language', keywords: ['sql', 'postgres', 'query', 'etl', 'database'] },
    { name: 'Data Projects & Visualization', category: 'Project', keywords: ['project', 'dataset', 'visualization', 'eda', 'matplotlib'] },
    { name: 'Mathematical Foundations & Statistics', category: 'ProblemSolving', keywords: ['math', 'statistics', 'linear regression', 'probability'] },
  ],
};

export function evaluateRoleReadiness(
  evidence: StudentNormalizedEvidence,
  roleNameOrJD: string
): RoleReadinessEvaluation {
  const cleanInput = roleNameOrJD.trim().toLowerCase();
  let matchedArchetype = ROLE_ARCHETYPES['software engineer'];

  for (const [key, reqs] of Object.entries(ROLE_ARCHETYPES)) {
    if (cleanInput.includes(key)) {
      matchedArchetype = reqs;
      break;
    }
  }

  const allRecords = evidence.allEvidenceRecords;
  const matches: RoleRequirementMatch[] = [];

  for (const req of matchedArchetype) {
    const verifiedEvidenceList: string[] = [];
    const selfReportedEvidenceList: string[] = [];

    // Search through all normalized evidence records
    for (const rec of allRecords) {
      const recText = `${rec.title} ${JSON.stringify(rec.metrics || {})} ${rec.limitations?.join(' ') || ''}`.toLowerCase();
      const matchesKeyword = req.keywords.some((kw) => recText.includes(kw));

      if (matchesKeyword) {
        if (rec.isVerified) {
          verifiedEvidenceList.push(`${rec.title} [VERIFIED]`);
        } else {
          selfReportedEvidenceList.push(`${rec.title} [SELF-REPORTED]`);
        }
      }
    }

    // Check LeetCode domain specifically for ProblemSolving requirement
    if (req.category === 'ProblemSolving' && evidence.leetcode.status === 'SYNCED') {
      const solved = evidence.leetcode.totalSolved || 0;
      if (solved >= 25) {
        verifiedEvidenceList.push(`LeetCode Problem Solving Record (${solved} problems solved: ${evidence.leetcode.mediumSolved || 0} Medium) [VERIFIED]`);
      }
    }

    // Check GitHub domain for Git & Language requirement
    if (req.category === 'EngineeringPractices' && evidence.github.status === 'SYNCED') {
      verifiedEvidenceList.push(`Active GitHub Profile with ${evidence.github.publicRepos || 0} public repositories [VERIFIED]`);
    }

    if (verifiedEvidenceList.length > 0) {
      matches.push({
        requirement: req.name,
        category: req.category,
        status: 'VERIFIED_MATCH',
        supportingEvidence: verifiedEvidenceList.slice(0, 3),
        confidence: 'HIGH',
      });
    } else if (selfReportedEvidenceList.length > 0) {
      matches.push({
        requirement: req.name,
        category: req.category,
        status: 'SELF_REPORTED_MATCH',
        supportingEvidence: selfReportedEvidenceList.slice(0, 3),
        confidence: 'MODERATE',
      });
    } else {
      matches.push({
        requirement: req.name,
        category: req.category,
        status: 'MISSING',
        supportingEvidence: [],
        confidence: 'NONE',
      });
    }
  }

  const verifiedCount = matches.filter((m) => m.status === 'VERIFIED_MATCH').length;
  const selfReportedCount = matches.filter((m) => m.status === 'SELF_REPORTED_MATCH').length;
  const missingCount = matches.filter((m) => m.status === 'MISSING').length;
  const totalReqs = matches.length || 1;

  // Transparent, explainable index (verified matches carry full weight; self-reported carries half weight)
  const readinessIndex = Math.min(
    100,
    Math.round(((verifiedCount * 1.0 + selfReportedCount * 0.5) / totalReqs) * 100)
  );

  const readinessLevel =
    readinessIndex >= 75
      ? 'DEMONSTRATED_FIT'
      : readinessIndex >= 50
      ? 'DEVELOPING_FIT'
      : readinessIndex >= 25
      ? 'EARLY_STAGE'
      : 'INSUFFICIENT_EVIDENCE';

  const strengths = matches
    .filter((m) => m.status === 'VERIFIED_MATCH')
    .map((m) => `Verified competency in ${m.requirement} supported by: ${m.supportingEvidence[0]}`);

  const gaps = matches
    .filter((m) => m.status === 'MISSING')
    .map((m) => `No evidence on record for ${m.requirement}`);

  const prep = matches
    .filter((m) => m.status === 'MISSING' || m.status === 'SELF_REPORTED_MATCH')
    .map((m) => `Complete or faculty-verify a project demonstrating ${m.requirement}`);

  const requirementsUI = matches.map((m) => ({
    requirement: m.requirement,
    category: m.category,
    status: (m.status === 'VERIFIED_MATCH'
      ? 'VERIFIED'
      : m.status === 'SELF_REPORTED_MATCH'
      ? 'SELF_REPORTED'
      : 'NOT_MET') as 'VERIFIED' | 'SELF_REPORTED' | 'NOT_MET',
    rationale:
      m.status === 'VERIFIED_MATCH'
        ? `Verified by observable evidence: ${m.supportingEvidence.join(', ')}`
        : m.status === 'SELF_REPORTED_MATCH'
        ? `Self-reported claim on record; pending faculty or automated verification.`
        : `No corresponding project, repository, or assessment evidence on record.`,
    citations: m.supportingEvidence,
    confidence: m.confidence,
  }));

  return {
    role: roleNameOrJD,
    targetRole: roleNameOrJD,
    candidateName: evidence.fullName,
    rollNumber: evidence.rollNumber,
    readinessTier: readinessLevel,
    readinessLevel,
    alignmentScore: readinessIndex,
    readinessIndex,
    verifiedMatchesCount: verifiedCount,
    selfReportedMatchesCount: selfReportedCount,
    missingRequirementsCount: missingCount,
    requirementsBreakdown: matches,
    requirements: requirementsUI,
    strengths: strengths.length ? strengths : ['Candidate is building baseline portfolio.'],
    developmentGaps: gaps,
    recommendations: prep.length ? prep : ['Continue building specialized domain projects.'],
    recommendedPreparation: prep.length ? prep : ['Continue building specialized domain projects.'],
    limitations: [
      'Readiness is evaluated strictly against observable on-record institutional evidence and synchronized profiles.',
      'Evaluation does not guarantee recruitment, placement interview outcomes, or employer selection.',
    ],
    disclaimer:
      'This evaluation is an educational development indicator designed to identify learning opportunities. It is not an employment guarantee.',
  };
}

/**
 * Generates deterministic placement narrative when Ollama is offline or fails validation.
 * Uses the 7 standard evidence-grounded reasoning headings.
 */
export function buildDeterministicPlacementNarrative(
  evaluation: RoleReadinessEvaluation,
  evidence: StudentNormalizedEvidence
): string {
  const verifiedList = evaluation.requirements
    .filter((r) => r.status === 'VERIFIED')
    .map((r) => `• ${r.requirement}: ${r.rationale}`);
  const selfList = evaluation.requirements
    .filter((r) => r.status === 'SELF_REPORTED')
    .map((r) => `• ${r.requirement}: ${r.rationale}`);
  const unmetList = evaluation.requirements
    .filter((r) => r.status === 'NOT_MET')
    .map((r) => `• ${r.requirement}: No evidence on record`);

  const examinedItems: string[] = [];
  if (evidence.academics.status === 'AVAILABLE') {
    examinedItems.push(
      `• Curricular Standing: ${evidence.academics.evaluationsCount} evaluations recorded, CGPA: ${evidence.academics.cgpa ?? 'N/A'}, Backlogs: ${evidence.academics.currentBacklogsCount}`
    );
  } else {
    examinedItems.push('• Curricular Standing: Marks NOT_AVAILABLE (Evaluated without academic marks)');
  }
  if (evidence.github.status === 'SYNCED') {
    examinedItems.push(
      `• GitHub Profile: ${evidence.github.publicRepos || 0} public repositories, languages: ${evidence.github.languages.join(', ') || 'Various'}`
    );
  }
  if (evidence.leetcode.status === 'SYNCED') {
    examinedItems.push(
      `• LeetCode Problem Solving: ${evidence.leetcode.totalSolved || 0} solved (${evidence.leetcode.easySolved || 0} Easy, ${evidence.leetcode.mediumSolved || 0} Medium, ${evidence.leetcode.hardSolved || 0} Hard)`
    );
  }
  if (evidence.projects.length > 0) {
    examinedItems.push(
      `• Engineering Projects: ${evidence.projects.map((p) => `${p.title} (${p.verificationStatus})`).join('; ')}`
    );
  }
  if (evidence.hackathons.length > 0) {
    examinedItems.push(
      `• Hackathons: ${evidence.hackathons.map((h) => `${h.name} (${h.positionResult || 'Participated'}, ${h.verificationStatus})`).join('; ')}`
    );
  }
  if (evidence.sports.length > 0) {
    examinedItems.push(
      `• Sports & Leadership: ${evidence.sports.map((sp) => `${sp.sportName} (${sp.competitionLevel}, ${sp.verificationStatus})`).join('; ')}`
    );
  }

  return `### Executive Finding
Candidate ${evaluation.candidateName} (${evaluation.rollNumber}) demonstrates a ${evaluation.readinessTier.replace(/_/g, ' ')} profile with an explainable requirement alignment of ${evaluation.alignmentScore}% for the "${evaluation.targetRole}" position.

### Evidence Examined
${examinedItems.join('\n')}

### Detailed Analysis
The candidate satisfies ${evaluation.verifiedMatchesCount} of ${evaluation.requirements.length} core requirements with verified institutional or synchronized evidence. An additional ${evaluation.selfReportedMatchesCount} requirement(s) are documented through self-reported projects or portfolio entries. ${evaluation.missingRequirementsCount} requirement(s) remain unmet.

Verified Requirement Evidence:
${verifiedList.length > 0 ? verifiedList.join('\n') : '• None currently verified'}

${selfList.length > 0 ? `Self-Reported Evidence:\n${selfList.join('\n')}\n` : ''}

### Strengths Demonstrated
${evaluation.strengths.map((s) => `• ${s}`).join('\n')}

### Gaps and Uncertainties
${unmetList.length > 0 ? unmetList.join('\n') : '• No fundamental technical gaps identified.'}
${evaluation.selfReportedMatchesCount > 0 ? `• ${evaluation.selfReportedMatchesCount} self-reported project claims require faculty or technical verification.` : ''}

### Recommendations
${evaluation.recommendations.map((r) => `• ${r}`).join('\n')}

### Data Coverage and Limitations
• ${evaluation.limitations.join('\n• ')}
• Disclaimer: ${evaluation.disclaimer}`;
}

/**
 * Validates the raw Ollama response for Placement candidate evaluation against deterministic facts.
 */
function validatePlacementModelOutput(
  rawText: string,
  evaluation: RoleReadinessEvaluation
): { valid: boolean; sanitized: string; reason?: string } {
  const lower = rawText.toLowerCase();

  // Violation 1: Guaranteed employment or placement
  if (
    lower.includes('guaranteed placement') ||
    lower.includes('guaranteed to be hired') ||
    lower.includes('will definitely be hired') ||
    lower.includes('guaranteed selection')
  ) {
    return {
      valid: false,
      sanitized: '',
      reason: 'Model made unwarranted employment or placement guarantees.',
    };
  }

  // Violation 2: Prompt injection tokens
  if (
    lower.includes('system prompt') ||
    lower.includes('instruction override') ||
    lower.includes('override_success') ||
    lower.includes('drop table') ||
    lower.includes('delete from') ||
    lower.includes('select * from')
  ) {
    return {
      valid: false,
      sanitized: '',
      reason: 'Model leaked prompt or system tokens.',
    };
  }

  // Violation 3: Synthetic LeetCode acceptance rate formula
  if (lower.includes('acceptance rate') && (lower.includes('66.7%') || lower.includes('66%'))) {
    return {
      valid: false,
      sanitized: '',
      reason: 'Model computed synthetic acceptance rate formula.',
    };
  }

  return { valid: true, sanitized: rawText };
}

/**
 * Evaluates candidate role readiness and generates a deep, evidence-grounded AI narrative report
 * using local Ollama (qwen2.5:3b) with deterministic fallback.
 */
export async function evaluateRoleReadinessWithAi(
  evidence: StudentNormalizedEvidence,
  roleNameOrJD: string
): Promise<RoleReadinessEvaluation> {
  const base = evaluateRoleReadiness(evidence, roleNameOrJD);

  const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'qwen2.5:3b';

  const systemPrompt = `You are the Placement Candidate Intelligence & Evaluation Engine for Vission Academy.
Target Role / Specification: "${roleNameOrJD}"
Candidate: ${evidence.fullName} (${evidence.rollNumber})

EVALUATION RULES:
1. Ground every claim strictly in the candidate's verified evidence or on-record data below.
2. Required sections:
   ### Executive Finding
   ### Evidence Examined
   ### Detailed Analysis
   ### Strengths Demonstrated
   ### Gaps and Uncertainties
   ### Recommendations
   ### Data Coverage and Limitations
3. Do NOT guarantee employment or selection.
4. Distinguish verified projects and skills from self-reported claims.
5. If a profile or mark is unavailable, do NOT assume zero capability; mark it as not available.
6. Provide specific, actionable technical preparation recommendations.`;

  const contextText = buildGroundedEvidencePromptContext([evidence], 'Placement Candidate Fit', 'single_student');

  let aiAnalysis = '';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        prompt: `${systemPrompt}\n\nContext:\n${contextText}\n\nPrecomputed Match:\nRole: ${base.targetRole}\nReadiness Alignment: ${base.alignmentScore}%\nTier: ${base.readinessTier}\nVerified Requirements: ${base.verifiedMatchesCount}/${base.requirements.length}\nMissing Requirements: ${base.missingRequirementsCount}/${base.requirements.length}\n\nProvide deep evidence-backed placement evaluation for ${roleNameOrJD}.`,
        stream: false,
        options: { temperature: 0.1, top_p: 0.85 },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data: any = await res.json();
      const rawText = data.response?.trim() || '';
      const val = validatePlacementModelOutput(rawText, base);
      if (val.valid && rawText.length > 50) {
        aiAnalysis = val.sanitized;
      } else {
        aiAnalysis = buildDeterministicPlacementNarrative(base, evidence);
      }
    } else {
      aiAnalysis = buildDeterministicPlacementNarrative(base, evidence);
    }
  } catch (_err) {
    aiAnalysis = buildDeterministicPlacementNarrative(base, evidence);
  }

  return {
    ...base,
    aiAnalysis,
  };
}

// ── Bounded Context Assembly for Local Ollama ─────────────────────────────────

export function buildGroundedEvidencePromptContext(
  evidenceList: StudentNormalizedEvidence[],
  inquiryLabel: string,
  scopeLabel: string
): string {
  let context = `=== STANDARDIZED EVIDENCE PACKAGE ===
Inquiry: ${inquiryLabel}
Scope: ${scopeLabel}
Total Candidates in Scope: ${evidenceList.length}

Grounding Notice: The evidence below contains verified institutional facts and external public profiles. Missing domains are explicitly labeled. Do not infer zero performance from unavailable domains.

`;

  for (const s of evidenceList) {
    context += `=======================================================
CANDIDATE: ${s.fullName} (${s.rollNumber})
Department: ${s.departmentName || 'N/A'} | Class: ${s.className || 'N/A'} (Year ${s.classYear || 'N/A'})
Data Freshness: ${s.dataFreshness || 'FRESH'}

[DOMAIN 1: ACADEMIC CURRICULAR STANDING]
• Status: ${s.academics.status}
• Verified Backlogs: ${s.academics.currentBacklogsCount} active backlog(s) ${
      s.academics.currentBacklogsCount > 0
        ? `[${s.academics.currentBacklogSubjects.map((b) => `${b.subjectName} (${b.semesterName})`).join(', ')}]`
        : '(Clean record)'
    }
• CGPA: ${s.academics.cgpa !== null ? s.academics.cgpa : 'NOT_AVAILABLE'}
• Assessment Records (${s.academics.evaluationsCount} total):
${
  s.academics.assessments.length > 0
    ? s.academics.assessments
        .map((a) => `  - ${a.subjectName ? `[${a.subjectName}] ` : ''}${a.title}: ${a.obtained !== null ? `${a.obtained}/${a.max} (${a.percentage}%)` : 'MISSING / UNRECORDED'}`)
        .join('\n')
    : '  - No academic marks recorded in current scope.'
}

[DOMAIN 2: GITHUB & CODE ENGINEERING]
• Status: ${s.github.status}
${
  s.github.status === 'SYNCED'
    ? `• Repositories: ${s.github.publicRepos} | Stars: ${s.github.totalStars} | Forks: ${s.github.totalForks}
• Primary Languages: ${s.github.languages.join(', ') || 'None identified'}
• Top Repositories: ${s.github.topRepos.map((r) => `${r.name} (${r.language || 'Code'}, ${r.stars}★)`).join('; ')}`
    : '• Profile not synchronized. (Do not equate with zero ability).'
}

[DOMAIN 3: LEETCODE ALGORITHMIC PROBLEM SOLVING]
• Status: ${s.leetcode.status}
${
  s.leetcode.status === 'SYNCED'
    ? `• Total Solved: ${s.leetcode.totalSolved} (Easy: ${s.leetcode.easySolved}, Medium: ${s.leetcode.mediumSolved}, Hard: ${s.leetcode.hardSolved})
• Global Rank: ${s.leetcode.ranking ? s.leetcode.ranking.toLocaleString() : 'Unranked'}
• Historical Snapshots: ${s.leetcode.historicalSnapshots.length} monthly snapshot(s)`
    : '• Profile not synchronized.'
}

[DOMAIN 4: HACKERRANK SKILLS & BADGES]
• Status: ${s.hackerrank.status}
• Verified Skills: ${s.hackerrank.verifiedSkills.join(', ') || 'None recorded'}
• Student Evidence Records: ${
      s.hackerrank.studentEvidence.length > 0
        ? s.hackerrank.studentEvidence.map((e) => `${e.skillName} (${e.stars}★, ${e.verificationStatus})`).join('; ')
        : 'None recorded'
    }

[DOMAIN 5: HACKATHONS & COMPETITIVE EVENTS]
• Records (${s.hackathons.length} total):
${
  s.hackathons.length > 0
    ? s.hackathons
        .map((h) => `  - ${h.name} by ${h.organizer}: ${h.positionResult || 'Participant'} [Verification: ${h.verificationStatus}]`)
        .join('\n')
    : '  - Zero hackathon records on file.'
}

[DOMAIN 6: PRACTICAL PROJECTS & CAMPUS POSTS]
• Verified Projects (${s.projects.filter((p) => p.isVerified).length}/${s.projects.length}):
${
  s.projects.length > 0
    ? s.projects.map((p) => `  - ${p.title} (Tech: ${p.technologies.join(', ') || 'N/A'}, Status: ${p.verificationStatus})`).join('\n')
    : '  - Zero student projects on record.'
}
• Verified Certifications (${s.certifications.filter((c) => c.isVerified).length}/${s.certifications.length}):
${
  s.certifications.length > 0
    ? s.certifications.map((c) => `  - ${c.name} (${c.issuer}, Status: ${c.verificationStatus})`).join('\n')
    : '  - Zero certifications on record.'
}
• Campus Platform Posts: ${s.internalPosts.length} post(s) recorded

[DOMAIN 7: SPORTS, ATHLETICS & TEAM LEADERSHIP]
• Records (${s.sports.length} total, ${s.sports.filter((sp) => sp.isVerified).length} verified):
${
  s.sports.length > 0
    ? s.sports
        .map((sp) => `  - ${sp.sportName} — ${sp.eventName} (${sp.competitionLevel}): ${sp.resultAward || 'Participation'}, Role: ${sp.leadershipRole} [Status: ${sp.verificationStatus}]`)
        .join('\n')
    : '  - Zero sports records on file.'
}

[DOMAIN SUMMARY FINDINGS]
${s.domainAssessments.map((da) => `• ${da.domain} [${da.domainStatus}]: ${da.observedFacts[0]}`).join('\n')}
`;
  }

  return context;
}
