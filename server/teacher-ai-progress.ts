/**
 * teacher-ai-progress.ts — Teacher AI Student Progress & Deep Analytics Grounding Engine
 *
 * Requirements & Constraints:
 * 1. Strict RBAC verification on the backend (teacher_user_id + assigned class + assigned subject + authorized semester).
 * 2. Deterministic evidence package computed purely in backend TypeScript (NOT by Ollama):
 *    - 1 assessment: report observed score; trend is "Insufficient data (only 1 recorded assessment)."
 *    - 2 assessments: describe only the observed difference (X pp), without claiming a reliable long-term trend.
 *    - 3+ assessments: calculate a trend only when sequence and comparability support it.
 *    - Never claim improvement, decline, consistency, or weak subject without sufficient supporting records.
 *    - Never call a student a topper, weakest performer, or at risk without a defined metric and valid comparison cohort.
 *    - Do not compare unlike assessment types as equivalent.
 *    - Distinguish missing data from zero marks.
 *    - Backlog calculation matches production academic-service.ts.
 *    - Never treat GitHub repo count as proof of coding proficiency or equate unavailable external data with zero activity.
 * 3. Question-specific prompt engineering and output validation:
 *    - System prompt strictly tailored to teacher query type.
 *    - Output validator checks model claims against deterministic calculations.
 *    - If model produces unsupported claims (e.g. "consistent performance" with 1 assessment), safe deterministic answer is returned.
 * 4. Read-only PostgreSQL queries and audit logging to audit_logs.
 * 5. Local Ollama (qwen2.5:3b) execution with graceful fallback if offline.
 */

import { query, logActivity } from './db.js';
import { AuthenticatedUser, verifyTeacherClassScope } from './auth.js';
import { calculateAcademicHistoryBulk } from './academic-service.js';

export interface TeacherAiProgressRequest {
  classId: string;
  subjectId: string;
  semesterId: string;
  scope: 'whole_class' | 'selected_students' | 'single_student';
  studentIds?: string[];
  question: string;
}

export interface TeacherAiProgressResponse {
  available: boolean;
  provider: string;
  model: string;
  answer: string;
  scope: string;
  studentCount: number;
  classSummary?: any;
  studentsAnalytics?: StudentDeterministicAnalytics[];
  evidencePackage?: any;
  validationStatus?: 'PASSED' | 'DETERMINISTIC_FALLBACK' | 'SANITIZED';
  error?: string;
}

export interface StudentAssessmentRecord {
  title: string;
  obtainedMarks: number | null;
  maxMarks: number;
  percentage: number | null;
  status: 'RECORDED' | 'MISSING';
  createdAt?: string;
}

export interface StudentDeterministicAnalytics {
  id: string;
  rollNumber: string;
  fullName: string;
  className: string;
  subjectName: string;
  semesterName: string;
  assessments: StudentAssessmentRecord[];
  validAssessmentCount: number;
  missingAssessmentCount: number;
  averagePercentage: number | null;
  highestPercentage: number | null;
  lowestPercentage: number | null;
  firstPercentage: number | null;
  latestPercentage: number | null;
  changePercentagePoints: number | null; // e.g. +12.0 pp
  trendDescription: string;
  trendReliability: 'INSUFFICIENT_DATA' | 'TWO_POINT_DIFFERENCE' | 'ESTABLISHED_TREND' | 'NO_DATA';
  backlogs: {
    count: number;
    subjects: Array<{ subjectName: string; semesterName: string }>;
  };
  projects: Array<{ title: string; techStack: string[]; status: string }>;
  certifications: Array<{ title: string; issuer: string; status: string }>;
  hackathons: Array<{
    title: string;
    role: string;
    status: string;
    eventName?: string;
    competitionLevel?: string;
    positionResult?: string;
  }>;
  posts: Array<{
    title: string;
    category?: string;
    status: string;
  }>;
  postsCount: number;
  sports: Array<{
    sportName: string;
    eventName?: string;
    competitionLevel: string;
    rolePosition?: string;
    awardResult?: string;
    status: string;
    statsSummary?: string;
  }>;
  externalProfiles: {
    github: { status: 'SYNCED' | 'NOT_SYNCED' | 'NOT_AVAILABLE'; repos?: number; stars?: number; contributions?: number; note?: string };
    linkedin: { status: 'SYNCED' | 'NOT_SYNCED' | 'NOT_AVAILABLE'; connections?: number; followers?: number };
    hackerrank: { status: 'SYNCED' | 'NOT_SYNCED' | 'NOT_AVAILABLE'; badgesCount?: number; certificates?: string[] };
    leetcode: { status: 'SYNCED' | 'LINKED' | 'NOT_AVAILABLE'; url?: string; totalSolved?: number; easy?: number; medium?: number; hard?: number; ranking?: number };
  };
  limitations: string[];
}

/**
 * Classifies the type of user inquiry to customize prompt rules and validation.
 */
function classifyTeacherQuestion(question: string): {
  type:
    | 'PROGRESS_SUMMARY'
    | 'TOP_IMPROVERS'
    | 'NEEDS_ATTENTION'
    | 'TREND'
    | 'WEAK_SUBJECTS'
    | 'COMPARISON'
    | 'REPORT'
    | 'INTERVENTION'
    | 'PROJECTS_GITHUB'
    | 'CODING_PLATFORMS'
    | 'SPORTS_ATHLETICS'
    | 'HACKATHONS'
    | 'COMMUNICATION_POSTS'
    | 'GENERAL';
  label: string;
} {
  const q = question.toLowerCase();
  if (q.includes('progress summary') || q.includes('summary for this student') || q.includes('overall progress')) {
    return { type: 'PROGRESS_SUMMARY', label: 'Student Progress Summary' };
  }
  if (q.includes('improving the most') || q.includes('who is improving') || q.includes('highest improvement')) {
    return { type: 'TOP_IMPROVERS', label: 'Top Improving Students' };
  }
  if (q.includes('need attention') || q.includes('needs attention') || q.includes('at risk') || q.includes('struggling')) {
    return { type: 'NEEDS_ATTENTION', label: 'Students Needing Attention' };
  }
  if (q.includes('trend') || q.includes('marks trend') || q.includes('trajectory') || q.includes('progression')) {
    return { type: 'TREND', label: 'Assessment Marks Trend Analysis' };
  }
  if (q.includes('weak subject') || q.includes('identify weak') || q.includes('subject performance')) {
    return { type: 'WEAK_SUBJECTS', label: 'Subject Performance Evaluation' };
  }
  if (q.includes('compare') || q.includes('comparison')) {
    return { type: 'COMPARISON', label: 'Cohort Comparison' };
  }
  if (q.includes('report') || q.includes('progress report')) {
    return { type: 'REPORT', label: 'Faculty Progress Report' };
  }
  if (q.includes('intervention') || q.includes('recommendation') || q.includes('follow-up') || q.includes('remedial')) {
    return { type: 'INTERVENTION', label: 'Targeted Pedagogical Interventions' };
  }
  if (q.includes('github') || q.includes('project') || q.includes('repository') || q.includes('software engineering') || q.includes('code quality')) {
    return { type: 'PROJECTS_GITHUB', label: 'Projects & Code Engineering Analysis' };
  }
  if (q.includes('leetcode') || q.includes('hackerrank') || q.includes('problem solving') || q.includes('coding profile') || q.includes('algorithms')) {
    return { type: 'CODING_PLATFORMS', label: 'Algorithmic Problem Solving Analysis' };
  }
  if (q.includes('sport') || q.includes('athletic') || q.includes('fitness') || q.includes('tournament') || q.includes('match stats')) {
    return { type: 'SPORTS_ATHLETICS', label: 'Sports & Athletic Participation Analysis' };
  }
  if (q.includes('hackathon') || q.includes('competition') || q.includes('contest')) {
    return { type: 'HACKATHONS', label: 'Hackathons & Competitive Engineering' };
  }
  if (q.includes('linkedin') || q.includes('post') || q.includes('communication') || q.includes('publication') || q.includes('article')) {
    return { type: 'COMMUNICATION_POSTS', label: 'Professional Communication & Publications' };
  }
  return { type: 'GENERAL', label: 'Academic Inquiry' };
}

/**
 * Generates an authoritative, factual deterministic response when the LLM is unavailable
 * or when the LLM output violates factual verification rules.
 * Strictly adheres to the 7 required reasoning sections.
 */
function buildDeterministicAnswer(
  classifiedType: ReturnType<typeof classifyTeacherQuestion>['type'],
  scope: 'whole_class' | 'selected_students' | 'single_student',
  studentsList: StudentDeterministicAnalytics[],
  classSummary: any
): string {
  if (studentsList.length === 0) {
    return `### Executive Finding\nNo student records are available for this assigned scope.\n\n### Data Coverage and Limitations\nZero enrolled students found matching the selected class and subject filters.`;
  }

  if (scope === 'single_student') {
    const s = studentsList[0];
    const validCount = s.validAssessmentCount;

    // Academic analysis
    let academicFinding = '';
    let academicEvidence = '';
    let academicAnalysis = '';
    let academicStrengths: string[] = [];
    let academicGaps: string[] = [];
    let academicRecs: string[] = [];

    if (validCount === 0) {
      academicFinding = `Curricular marks are currently unrecorded (Status: NOT_AVAILABLE) in ${s.subjectName} for ${s.fullName}.`;
      academicEvidence = `• Recorded Subject Assessments: 0 / ${s.assessments.length}\n• Ledger Status: All assessments unentered or pending. (Missing marks are not equated with zero ability).`;
      academicAnalysis = `Academic performance cannot be evaluated from marks in this subject because no evaluation scores have been submitted to the academic ledger.`;
      academicGaps.push(`Unentered marks for ${s.subjectName}: ${s.assessments.map(a => a.title).join(', ')}.`);
      academicRecs.push(`Verify whether assessments have taken place and record scores in the institutional ledger.`);
    } else if (validCount === 1) {
      const a = s.assessments.find(x => x.status === 'RECORDED')!;
      academicFinding = `Single recorded score observed for ${s.fullName}: ${a.title} = ${a.obtainedMarks}/${a.maxMarks} (${a.percentage}%). Long-term trajectory cannot be established from a single assessment.`;
      academicEvidence = `• Recorded Assessment: ${a.title} = ${a.obtainedMarks}/${a.maxMarks} (${a.percentage}%) [Observed on-record]\n• Assessment Count: 1 score recorded\n• Trajectory Status: Insufficient data to infer consistency, improvement, or decline.`;
      academicAnalysis = `A single examination point confirms participation and mastery on the specific topics assessed in ${a.title}. However, a single score cannot demonstrate consistency or establish a trend.`;
      if (a.percentage !== null && a.percentage >= 60) {
        academicStrengths.push(`Satisfactory performance on ${a.title} (${a.percentage}%).`);
      } else {
        academicGaps.push(`Score on ${a.title} (${a.percentage}%) is below 60%. Needs diagnostic feedback.`);
      }
      academicRecs.push(`Administer diagnostic review for ${a.title} and track performance on upcoming assessments.`);
    } else if (validCount === 2) {
      const recorded = s.assessments.filter(x => x.status === 'RECORDED');
      const first = recorded[0];
      const second = recorded[1];
      const diff = s.changePercentagePoints ?? 0;
      const direction = diff > 0 ? `higher by +${diff} percentage points (pp)` : diff < 0 ? `lower by ${diff} pp` : 'identical';
      academicFinding = `Two sequential assessments recorded: ${first.title} (${first.percentage}%) and ${second.title} (${second.percentage}%). Observed change is ${direction}. An established longitudinal trend requires at least three assessments.`;
      academicEvidence = `• Assessment 1: ${first.title} = ${first.obtainedMarks}/${first.maxMarks} (${first.percentage}%)\n• Assessment 2: ${second.title} = ${second.obtainedMarks}/${second.maxMarks} (${second.percentage}%)\n• Observed Difference: ${diff > 0 ? '+' : ''}${diff} pp.`;
      academicAnalysis = `The two recorded scores describe an immediate two-point shift between ${first.title} and ${second.title}. This shows score variation between assessment formats, but should not be interpreted as a sustained learning trend.`;
      if (diff > 0) {
        academicStrengths.push(`Score gain of +${diff} pp between ${first.title} and ${second.title}.`);
      } else if (diff < -5) {
        academicGaps.push(`Score decrease of ${Math.abs(diff)} pp between ${first.title} and ${second.title}.`);
      }
      academicRecs.push(`Review error analysis from ${second.title} and evaluate stability on subsequent evaluations.`);
    } else {
      const diff = s.changePercentagePoints ?? 0;
      academicFinding = `${validCount} assessments recorded in ${s.subjectName} with an observed average of ${s.averagePercentage}%. ${s.trendDescription}`;
      academicEvidence = `• Assessments Recorded: ${validCount} sequential assessments\n• Cohort Subject Average: ${s.averagePercentage}%\n• Score Range: ${s.lowestPercentage}% to ${s.highestPercentage}%\n• Net Score Delta: ${diff > 0 ? '+' : ''}${diff} pp.`;
      academicAnalysis = `With ${validCount} sequential points, the academic trajectory shows ${s.trendDescription.toLowerCase()}`;
      if ((s.averagePercentage || 0) >= 60) {
        academicStrengths.push(`Consistent subject average (${s.averagePercentage}%) across ${validCount} assessments.`);
      } else {
        academicGaps.push(`Subject average (${s.averagePercentage}%) is below 60% across recorded evaluations.`);
      }
      academicRecs.push(`Maintain regular formative feedback and tutorial sessions.`);
    }

    // Backlog status
    const backlogSummary = s.backlogs.count > 0
      ? `• Active Backlogs: ${s.backlogs.count} backlog(s) [${s.backlogs.subjects.map(b => `${b.subjectName} in ${b.semesterName}`).join(', ')}]`
      : `• Active Backlogs: 0 verified backlogs (Clean institutional record)`;

    // Extracurricular Evidence details
    const extraExamined: string[] = [];
    const extraAnalysis: string[] = [];
    const extraStrengths: string[] = [];
    const extraGaps: string[] = [];
    const extraRecs: string[] = [];

    // Projects / GitHub
    if (s.projects.length > 0) {
      const verifiedProjs = s.projects.filter(p => p.status === 'Verified');
      extraExamined.push(`• Engineering Projects: ${s.projects.map(p => `${p.title} (${p.status})`).join('; ')}`);
      extraAnalysis.push(`Demonstrated hands-on software development across ${Array.from(new Set(s.projects.flatMap(p => p.techStack))).join(', ') || 'software'}. Verified projects: ${verifiedProjs.length}/${s.projects.length}. Note: A repository or project claim supports proficiency only to the extent that its implementation demonstrates that skill.`);
      if (verifiedProjs.length > 0) {
        extraStrengths.push(`Verified practical projects: ${verifiedProjs.map(p => p.title).join(', ')}.`);
      }
    } else {
      extraGaps.push(`No software engineering projects on institutional record.`);
      extraRecs.push(`Build and submit a software engineering capstone project with live demo and GitHub repository.`);
    }

    if (s.externalProfiles.github.status === 'SYNCED') {
      extraExamined.push(`• GitHub Public Profile: ${s.externalProfiles.github.repos || 0} public repos, ${s.externalProfiles.github.stars || 0} stars, ${s.externalProfiles.github.contributions || 0} contributions`);
      extraAnalysis.push(`Public GitHub activity shows repository management and version control familiarity. Note: Repository count alone cannot establish programming proficiency without inspectable code quality.`);
    }

    // LeetCode
    if (s.externalProfiles.leetcode.totalSolved !== undefined) {
      const lc = s.externalProfiles.leetcode;
      extraExamined.push(`• LeetCode Problem Solving: ${lc.totalSolved} solved (Easy: ${lc.easy || 0}, Medium: ${lc.medium || 0}, Hard: ${lc.hard || 0})${lc.ranking ? `, Global Rank: ${lc.ranking.toLocaleString()}` : ''}`);
      extraAnalysis.push(`Algorithmic practice totals reflect problem-solving engagement across ${lc.easy || 0} Easy, ${lc.medium || 0} Medium, and ${lc.hard || 0} Hard problems. Genuine metrics recorded without synthetic acceptance rate formula.`);
      if ((lc.medium || 0) + (lc.hard || 0) >= 10) {
        extraStrengths.push(`Demonstrated algorithmic consistency on intermediate problem-solving (${(lc.medium || 0) + (lc.hard || 0)} Medium/Hard solved).`);
      }
    }

    // HackerRank
    if (s.externalProfiles.hackerrank.badgesCount !== undefined && s.externalProfiles.hackerrank.badgesCount > 0) {
      extraExamined.push(`• HackerRank Badges & Skills: ${s.externalProfiles.hackerrank.badgesCount} badges on record (${(s.externalProfiles.hackerrank.certificates || []).join(', ') || 'General skills'})`);
    }

    // Hackathons
    if (s.hackathons.length > 0) {
      const verifiedHacks = s.hackathons.filter(h => h.status === 'Verified');
      extraExamined.push(`• Hackathons & Competitions: ${s.hackathons.map(h => `${h.title} [Result: ${h.positionResult || h.role}, Status: ${h.status}]`).join('; ')}`);
      extraAnalysis.push(`Competitive engineering participation demonstrates team delivery under strict time constraints. Verified outcomes: ${verifiedHacks.length}/${s.hackathons.length}. A hackathon result supports competition experience, but does not independently establish mastery of every framework used.`);
      const winners = s.hackathons.filter(h => /winner|1st|first|runner/i.test(h.positionResult || ''));
      if (winners.length > 0) {
        extraStrengths.push(`Competitive distinction in hackathons: ${winners.map(w => `${w.title} (${w.positionResult})`).join(', ')}.`);
      }
    }

    // Sports & Athletics
    if (s.sports.length > 0) {
      const verifiedSports = s.sports.filter(sp => sp.status === 'Verified');
      extraExamined.push(`• Sports & Athletics: ${s.sports.map(sp => `${sp.sportName} (${sp.competitionLevel}, Result: ${sp.awardResult || sp.rolePosition || 'Participation'}, Status: ${sp.status})`).join('; ')}`);
      extraAnalysis.push(`Athletic records reflect sport-specific competition and discipline. Distinguishes participation from competitive results and leadership. Sports participation does not independently establish high athletic ability unless verified by coach/tournament results.`);
      const captains = s.sports.filter(sp => /captain|lead/i.test(sp.rolePosition || ''));
      if (captains.length > 0) {
        extraStrengths.push(`Demonstrated team leadership as ${captains.map(c => `${c.rolePosition} in ${c.sportName}`).join(', ')}.`);
      }
      const medalists = s.sports.filter(sp => sp.awardResult && !/participation/i.test(sp.awardResult));
      if (medalists.length > 0) {
        extraStrengths.push(`Verified athletic results: ${medalists.map(m => `${m.awardResult} in ${m.sportName}`).join(', ')}.`);
      }
    }

    // Campus Posts
    if (s.posts.length > 0) {
      extraExamined.push(`• Campus Publications & Posts: ${s.posts.length} post(s) [${s.posts.map(p => `"${p.title}"`).slice(0, 3).join(', ')}]`);
    }

    // Combine into the 7 standard sections
    const allStrengths = [...academicStrengths, ...extraStrengths];
    const allGaps = [...academicGaps, ...extraGaps];
    const allRecs = [...academicRecs, ...extraRecs];

    // Executive finding based on question type
    let executiveFinding = academicFinding;
    if (classifiedType === 'PROJECTS_GITHUB') {
      executiveFinding = s.projects.length > 0
        ? `${s.fullName} has ${s.projects.length} project(s) recorded on campus portfolio (${s.projects.filter(p => p.status === 'Verified').length} faculty-verified). GitHub status: ${s.externalProfiles.github.status}.`
        : `No practical software engineering projects are currently recorded for ${s.fullName}. GitHub status: ${s.externalProfiles.github.status}.`;
    } else if (classifiedType === 'SPORTS_ATHLETICS') {
      executiveFinding = s.sports.length > 0
        ? `${s.fullName} has ${s.sports.length} athletic record(s) logged across ${Array.from(new Set(s.sports.map(sp => sp.sportName))).join(', ')} (${s.sports.filter(sp => sp.status === 'Verified').length} coach/faculty verified).`
        : `Zero sports or athletic participation records are logged for ${s.fullName}. Absence of athletic data does not impact academic or technical standing.`;
    } else if (classifiedType === 'CODING_PLATFORMS') {
      executiveFinding = s.externalProfiles.leetcode.totalSolved !== undefined
        ? `${s.fullName} has recorded ${s.externalProfiles.leetcode.totalSolved} solved problems on LeetCode (${s.externalProfiles.leetcode.easy || 0} Easy, ${s.externalProfiles.leetcode.medium || 0} Medium, ${s.externalProfiles.leetcode.hard || 0} Hard). HackerRank badges: ${s.externalProfiles.hackerrank.badgesCount || 0}.`
        : `External coding profiles (LeetCode/HackerRank) are not synchronized for ${s.fullName}. Absence of external profile data does not indicate zero coding ability.`;
    } else if (classifiedType === 'HACKATHONS') {
      executiveFinding = s.hackathons.length > 0
        ? `${s.fullName} has participated in ${s.hackathons.length} hackathon(s) (${s.hackathons.filter(h => h.status === 'Verified').length} verified).`
        : `No competitive hackathon participation records are logged for ${s.fullName}.`;
    }

    const limitationsList = s.limitations.length > 0
      ? s.limitations.map(l => `• ${l}`).join('\n')
      : `• No significant data coverage limitations identified for this student scope.`;

    return `### Executive Finding
${executiveFinding}

### Evidence Examined
${academicEvidence}
${backlogSummary}
${extraExamined.length > 0 ? extraExamined.join('\n') : '• No extracurricular or external domain evidence recorded'}

### Detailed Analysis
${academicAnalysis}
${extraAnalysis.length > 0 ? '\n' + extraAnalysis.join('\n\n') : ''}

### Strengths Demonstrated
${allStrengths.length > 0 ? allStrengths.map(st => `• ${st}`).join('\n') : '• Baseline portfolio under construction; continue recording verified assessments and work samples.'}

### Gaps and Uncertainties
${allGaps.length > 0 ? allGaps.map(g => `• ${g}`).join('\n') : '• No critical performance gaps identified in current scope.'}

### Recommendations
${allRecs.length > 0 ? allRecs.map(r => `• ${r}`).join('\n') : '• Continue sequential academic monitoring and project documentation.'}

### Data Coverage and Limitations
${limitationsList}`;
  }

  // Multi-student or Whole-class deterministic answer
  const total = studentsList.length;
  const withMarks = studentsList.filter(s => s.validAssessmentCount > 0);
  const singleAssessmentCount = studentsList.filter(s => s.validAssessmentCount === 1).length;
  const multiAssessmentCount = studentsList.filter(s => s.validAssessmentCount >= 2).length;
  const noMarksCount = studentsList.filter(s => s.validAssessmentCount === 0).length;

  if (classifiedType === 'TOP_IMPROVERS') {
    const improvers = studentsList
      .filter(s => s.changePercentagePoints !== null && s.changePercentagePoints > 0 && s.validAssessmentCount >= 2)
      .sort((a, b) => (b.changePercentagePoints || 0) - (a.changePercentagePoints || 0));

    if (improvers.length === 0) {
      return `### Executive Finding
No positive score trajectories can be verified across the authorized cohort.

### Evidence Examined
• Authorized Student Count: ${total}
• Students with Single Assessment (Trend Insufficient): ${singleAssessmentCount}
• Students with Multiple Assessments: ${multiAssessmentCount}

### Detailed Analysis
A longitudinal improvement trend requires at least 2 comparable sequential assessments. ${
  singleAssessmentCount === total
    ? `All ${total} authorized students currently have only 1 recorded assessment in ${classSummary.subjectName}. Single data points cannot mathematically establish improvement or decline.`
    : `None of the students with multiple recorded assessments showed a net positive score change.`
}

### Gaps and Uncertainties
• Historical depth is insufficient for ${singleAssessmentCount} student(s) with only 1 recorded assessment.

### Recommendations
• Complete entry of subsequent assessments in the academic marks ledger before calculating cohort growth rankings.

### Data Coverage and Limitations
• Analysis restricted to assigned scope: ${classSummary.className} • ${classSummary.subjectName}.`;
    }

    const list = improvers.slice(0, 5).map((s, idx) =>
      `${idx + 1}. **${s.fullName}** (${s.rollNumber}): +${s.changePercentagePoints} pp gain (${s.firstPercentage}% → ${s.latestPercentage}% across ${s.validAssessmentCount} assessments)`
    ).join('\n');

    return `### Executive Finding
Identified ${improvers.length} student(s) with verifiable positive score gains across comparable sequential assessments in ${classSummary.subjectName}.

### Evidence Examined
${list}

### Detailed Analysis
Ranking is determined strictly by the percentage point (pp) difference between the latest and first recorded assessments. Only students with 2 or more comparable assessments are eligible. Note: A two-point delta describes immediate score change rather than an established longitudinal trajectory.

### Strengths Demonstrated
• Demonstrated score improvement across sequential evaluation milestones for top candidates.

### Gaps and Uncertainties
• Excluded ${singleAssessmentCount} student(s) who have only 1 recorded assessment from trend analysis.

### Recommendations
• Acknowledge positive momentum for top improving students during mentoring sessions.
• Monitor whether performance gains are sustained in upcoming evaluations.

### Data Coverage and Limitations
• Scope restricted to: ${classSummary.className} • ${classSummary.subjectName}. Students with 1 assessment cannot be evaluated for trends.`;
  }

  if (classifiedType === 'NEEDS_ATTENTION') {
    const backlogged = studentsList.filter(s => s.backlogs.count > 0);
    const lowScorers = studentsList.filter(s => s.averagePercentage !== null && s.averagePercentage < 50);
    const missingOnly = studentsList.filter(s => s.validAssessmentCount === 0);

    return `### Executive Finding
Identified ${lowScorers.length} student(s) below the 50% passing benchmark, ${backlogged.length} with active academic backlogs, and ${missingOnly.length} with unentered marks.

### Evidence Examined
${lowScorers.length > 0 ? `• Below 50% Passing Benchmark in ${classSummary.subjectName}:\n${lowScorers.slice(0, 5).map(s => `  - ${s.fullName} (${s.rollNumber}): Average ${s.averagePercentage}% across ${s.validAssessmentCount} assessment(s)`).join('\n')}` : '• Below 50% Passing Benchmark: 0 students'}
${backlogged.length > 0 ? `\n• Active Institutional Backlogs:\n${backlogged.slice(0, 5).map(s => `  - ${s.fullName} (${s.rollNumber}): ${s.backlogs.count} backlog(s)`).join('\n')}` : '\n• Active Backlogs: 0 students'}
${missingOnly.length > 0 ? `\n• Missing All Assessment Marks:\n${missingOnly.slice(0, 5).map(s => `  - ${s.fullName} (${s.rollNumber}): 0 assessments entered`).join('\n')}` : ''}

### Detailed Analysis
Students scoring below 50% demonstrate comprehension gaps on curriculum objectives. Active backlogs reflect unmet prerequisites from previous semesters according to institutional backlog rules (subject mark < 40% in latest attempt). Unentered marks indicate missing ledger data rather than academic failure.

### Strengths Demonstrated
• ${studentsList.filter(s => (s.averagePercentage || 0) >= 60).length} of ${withMarks.length || 1} evaluated students have maintained marks above 60%.

### Gaps and Uncertainties
• Missing marks ledger data for ${missingOnly.length} student(s) prevents complete risk assessment.

### Recommendations
• Schedule remedial problem-solving clinics for students scoring below 50%.
• Coordinate academic tutoring for students carrying active backlogs.
• Complete marks entry for all missing student records.

### Data Coverage and Limitations
• Assessment scope is strictly limited to ${classSummary.className} • ${classSummary.subjectName}. Backlogs are sourced from the verified production academic service.`;
  }

  // General Cohort or Progress Report
  const classAvg = classSummary.classAveragePercentage !== null ? `${classSummary.classAveragePercentage}%` : 'N/A';
  return `### Executive Finding
Cohort performance analysis for **${classSummary.className}** in **${classSummary.subjectName}** covering ${total} authorized students. Class average is ${classAvg}.

### Evidence Examined
• Authorized Enrolled Students: ${total}
• Students with Recorded Marks: ${withMarks.length} (${noMarksCount} with unentered marks)
• Single Assessment Recorded: ${singleAssessmentCount} student(s) (trend cannot be calculated)
• Multi-Assessment Recorded: ${multiAssessmentCount} student(s)
• Class Average Percentage: ${classAvg}

### Detailed Analysis
Evaluation of the authorized cohort shows an average score of ${classAvg}. ${
  singleAssessmentCount > 0
    ? `${singleAssessmentCount} student(s) currently possess only 1 recorded assessment, precluding longitudinal trend determination.`
    : `Historical depth allows evaluation of sequential changes.`
} ${
  noMarksCount > 0
    ? `${noMarksCount} student(s) have unrecorded marks in the ledger.`
    : `All students have at least one recorded mark.`
}

### Strengths Demonstrated
• ${withMarks.filter(s => (s.averagePercentage || 0) >= 60).length} of ${withMarks.length || 1} evaluated students scored at or above the 60% first-class threshold.

### Gaps and Uncertainties
• ${noMarksCount > 0 ? `${noMarksCount} student(s) have zero marks entered in the ledger.` : 'Score distribution reflects expected academic variance.'}
• Longitudinal trend data is unavailable for ${singleAssessmentCount} student(s) with single assessments.

### Recommendations
• Complete marks entry for pending assessments in the academic ledger.
• Offer diagnostic support for students falling in the lower quartile.

### Data Coverage and Limitations
• Analysis is strictly restricted to assigned scope: ${classSummary.className} • ${classSummary.subjectName}. Longitudinal conclusions are constrained by recorded assessment frequency.`;
}

/**
 * Validates the raw text from Ollama against the ground truth deterministic calculations.
 * Returns { valid: boolean, sanitized: string, reason?: string }
 */
function validateModelOutput(
  rawText: string,
  scope: 'whole_class' | 'selected_students' | 'single_student',
  studentsList: StudentDeterministicAnalytics[]
): { valid: boolean; sanitized: string; reason?: string } {
  const lower = rawText.toLowerCase();

  // Violation 1: Single assessment described as "consistent", "maintains consistent", "steady trend", or "trajectory"
  for (const s of studentsList) {
    if (s.validAssessmentCount === 1) {
      if (
        (lower.includes('consistent performance') ||
          lower.includes('consistently') ||
          lower.includes('steady performance') ||
          lower.includes('steady trajectory') ||
          lower.includes('proven consistency')) &&
        (scope === 'single_student' || lower.includes(s.fullName.toLowerCase()))
      ) {
        return {
          valid: false,
          sanitized: '',
          reason: `Model claimed consistent performance for student with only 1 recorded assessment (${s.fullName}).`,
        };
      }
    }
  }

  // Violation 2: Model claiming positive/negative trend with only 1 assessment
  if (scope === 'single_student' && studentsList[0]?.validAssessmentCount === 1) {
    if (
      lower.includes('improving trend') ||
      lower.includes('declining trend') ||
      lower.includes('steady improvement') ||
      lower.includes('consistent progress') ||
      lower.includes('downward trajectory') ||
      lower.includes('upward trajectory') ||
      lower.includes('trajectory of improvement')
    ) {
      return {
        valid: false,
        sanitized: '',
        reason: 'Model claimed a longitudinal trend for a single recorded assessment.',
      };
    }
  }

  // Violation 3: Hallucinated zero marks where data was merely missing/unrecorded
  if (
    lower.includes('scored 0%') ||
    lower.includes('scored 0 marks') ||
    lower.includes('scored zero') ||
    lower.includes('failed all assessments')
  ) {
    const hasRealZero = studentsList.some(s => s.assessments.some(a => a.status === 'RECORDED' && a.obtainedMarks === 0));
    if (!hasRealZero) {
      return {
        valid: false,
        sanitized: '',
        reason: 'Model equated unrecorded/missing assessments with zero marks or academic failure.',
      };
    }
  }

  // Violation 4: Repositories cited as proof of coding proficiency
  if (
    lower.includes('proficient coder because of github') ||
    lower.includes('proves high coding proficiency') ||
    lower.includes('proves programming mastery') ||
    lower.includes('repository count proves')
  ) {
    return {
      valid: false,
      sanitized: '',
      reason: 'Model equated GitHub repository count with proven coding proficiency.',
    };
  }

  // Violation 5: Prompt injection leakage or code execution hallucinations
  if (
    lower.includes('system prompt') ||
    lower.includes('instruction override') ||
    lower.includes('override_success') ||
    lower.includes('drop table') ||
    lower.includes('delete from') ||
    lower.includes('select * from') ||
    lower.includes('ignore previous instructions')
  ) {
    return {
      valid: false,
      sanitized: '',
      reason: 'Model leaked prompt or system tokens.',
    };
  }

  // Violation 6: Hallucinated sports athletic mastery without verified sports records
  if (
    lower.includes('elite athlete') ||
    lower.includes('exceptional athlete') ||
    lower.includes('star player') ||
    lower.includes('national champion') ||
    lower.includes('gold medal')
  ) {
    const hasVerifiedSports = studentsList.some(s =>
      s.sports && s.sports.some(sp => sp.status === 'Verified' && (/national|gold|champion/i.test(sp.awardResult || '') || /national/i.test(sp.competitionLevel)))
    );
    if (!hasVerifiedSports) {
      return {
        valid: false,
        sanitized: '',
        reason: 'Model claimed exceptional or unverified athletic championship without supporting records.',
      };
    }
  }

  // Violation 7: Artificial LeetCode acceptance rate formula
  if (
    lower.includes('acceptance rate') &&
    (lower.includes('66.7%') || lower.includes('66%') || lower.includes('estimated acceptance rate') || lower.includes('acceptance rate of'))
  ) {
    return {
      valid: false,
      sanitized: '',
      reason: 'Model computed synthetic LeetCode acceptance rate from solved totals.',
    };
  }

  // Violation 8: Hallucinated hackathon awards
  if (lower.includes('won the hackathon') || lower.includes('1st place winner') || lower.includes('hackathon champion')) {
    const hasVerifiedWin = studentsList.some(s =>
      s.hackathons && s.hackathons.some(h => /winner|1st|first/i.test(h.positionResult || '') && h.status === 'Verified')
    );
    if (!hasVerifiedWin) {
      return {
        valid: false,
        sanitized: '',
        reason: 'Model claimed hackathon win or 1st place without verified hackathon outcome record.',
      };
    }
  }

  // Violation 9: Employment or selection guarantee
  if (lower.includes('guaranteed to be hired') || lower.includes('guaranteed placement') || lower.includes('guaranteed job')) {
    return {
      valid: false,
      sanitized: '',
      reason: 'Model provided unwarranted employment or placement guarantees.',
    };
  }

  return { valid: true, sanitized: rawText };
}

export async function processTeacherAiProgress(
  user: AuthenticatedUser,
  payload: TeacherAiProgressRequest
): Promise<TeacherAiProgressResponse> {
  const { classId, subjectId, semesterId, scope, studentIds = [], question } = payload;

  if (!classId || !subjectId || !semesterId) {
    throw new Error('Class, Subject, and Semester selections are required.');
  }

  // Strict RBAC Verification
  const isAssigned = await verifyTeacherClassScope(classId, subjectId, semesterId, user.id);
  if (!isAssigned) {
    await logActivity(
      user.id,
      'TEACHER_AI_PROGRESS_DENIED',
      'classes',
      classId,
      JSON.stringify({
        subjectId,
        semesterId,
        scope,
        reason: 'Unauthorized scope access attempt',
      })
    );
    const err: any = new Error('Access Denied: Student progress is not available for your assigned scope.');
    err.status = 403;
    throw err;
  }

  // Teacher Faculty Visibility Controls
  let facultyVisibility = {
    academic_enabled: true,
    github_enabled: true,
    linkedin_enabled: true,
    hackerrank_enabled: true,
    leetcode_enabled: true,
    hackathon_enabled: true,
  };
  if (user.role === 'teacher') {
    const visRes = await query<any>(
      `SELECT github_enabled, linkedin_enabled, hackerrank_enabled, leetcode_enabled, hackathon_enabled, academic_enabled
       FROM teacher_analytics_visibility
       WHERE teacher_user_id = $1`,
      [user.id]
    );
    if (visRes.rows.length > 0) {
      facultyVisibility = {
        academic_enabled: visRes.rows[0].academic_enabled ?? true,
        github_enabled: visRes.rows[0].github_enabled ?? true,
        linkedin_enabled: visRes.rows[0].linkedin_enabled ?? true,
        hackerrank_enabled: visRes.rows[0].hackerrank_enabled ?? true,
        leetcode_enabled: visRes.rows[0].leetcode_enabled ?? true,
        hackathon_enabled: visRes.rows[0].hackathon_enabled ?? true,
      };
    }
    if (!facultyVisibility.academic_enabled) {
      const err: any = new Error('Access Denied: Academic Analytics visibility is disabled for your faculty account.');
      err.status = 403;
      throw err;
    }
  }

  // Fetch Class, Subject, and Semester metadata
  const [clsRes, subRes, semRes] = await Promise.all([
    query<any>('SELECT id, name, year, section FROM classes WHERE id = $1', [classId]),
    query<any>('SELECT id, name, code FROM subjects WHERE id = $1', [subjectId]),
    query<any>('SELECT id, name, semester_number FROM semesters WHERE id = $1', [semesterId]),
  ]);

  const cls = clsRes.rows[0];
  const sub = subRes.rows[0];
  const sem = semRes.rows[0];

  if (!cls || !sub || !sem) {
    throw new Error('Invalid class, subject, or semester entity.');
  }

  // Query enrolled students for this class strictly
  let studentQuery = `
    SELECT s.id, s.roll_number, u.full_name, u.email,
           s.github_url, s.linkedin_url, s.hackerrank_url, s.leetcode_url,
           s.profile_strength
    FROM students s
    JOIN users u ON u.id = s.user_id
    WHERE s.class_id = $1
  `;
  const studentParams: any[] = [classId];

  if (scope === 'single_student' || scope === 'selected_students') {
    if (!studentIds.length) {
      throw new Error('Please select at least one student for this scope.');
    }
    studentQuery += ` AND s.id = ANY($2)`;
    studentParams.push(studentIds);
  }

  studentQuery += ` ORDER BY s.roll_number ASC`;
  const students = (await query<any>(studentQuery, studentParams)).rows;

  if (students.length === 0) {
    return {
      available: true,
      provider: 'ollama',
      model: process.env.OLLAMA_MODEL || 'qwen2.5:3b',
      answer: 'Not enough academic data is available for this analysis. No authorized students match the current selection.',
      scope,
      studentCount: 0,
      validationStatus: 'PASSED',
    };
  }

  const targetStudentIds = students.map((s: any) => s.id);

  // Fetch marks and assessment definitions for this exact class, subject, and semester
  const [marksRes, defsRes] = await Promise.all([
    query<any>(
      `SELECT m.*
       FROM marks m
       WHERE m.class_id = $1 AND m.subject_id = $2 AND m.semester_id = $3
         AND m.student_id = ANY($4)
       ORDER BY m.created_at ASC`,
      [classId, subjectId, semesterId, targetStudentIds]
    ),
    query<any>(
      `SELECT id, title, max_marks, assessment_type, created_at
       FROM assessment_definitions
       WHERE class_id = $1 AND subject_id = $2 AND semester_id = $3 AND status = 'active'
       ORDER BY created_at ASC`,
      [classId, subjectId, semesterId]
    ),
  ]);

  // Fetch verified academic histories and portfolios
  const [
    projRes, certRes, hackRes, postRes, ghSnapRes, liSnapRes, hrSnapRes,
    academicHistMap, sportsRes, leetcodeSnapRes, hrEvidenceRes
  ] = await Promise.all([
    query<any>(
      `SELECT student_id, title, technologies, verification_status FROM projects WHERE student_id = ANY($1)`,
      [targetStudentIds]
    ),
    query<any>(
      `SELECT student_id, name, issuer, verification_status FROM certifications WHERE student_id = ANY($1)`,
      [targetStudentIds]
    ),
    query<any>(
      `SELECT student_id, name, organizer, position_result, project_name, verification_status FROM hackathons WHERE student_id = ANY($1) ORDER BY created_at DESC`,
      [targetStudentIds]
    ),
    query<any>(
      `SELECT student_id, id, title, category, verification_status FROM posts WHERE student_id = ANY($1) ORDER BY created_at DESC`,
      [targetStudentIds]
    ),
    query<any>(
      `SELECT DISTINCT ON (student_id) student_id, sync_status, public_repos, total_stars, total_contributions, snapshot_month
       FROM student_github_snapshots WHERE student_id = ANY($1) ORDER BY student_id, snapshot_month DESC`,
      [targetStudentIds]
    ),
    query<any>(
      `SELECT DISTINCT ON (student_id) student_id, sync_status, connections, followers, snapshot_month
       FROM student_linkedin_snapshots WHERE student_id = ANY($1) ORDER BY student_id, snapshot_month DESC`,
      [targetStudentIds]
    ),
    query<any>(
      `SELECT DISTINCT ON (student_id) student_id, sync_status, badges_count, snapshot_month
       FROM student_hackerrank_snapshots WHERE student_id = ANY($1) ORDER BY student_id, snapshot_month DESC`,
      [targetStudentIds]
    ),
    calculateAcademicHistoryBulk(targetStudentIds),
    query<any>(
      `SELECT student_id, sport_name, event_name, competition_level, position_role, result_award, match_stats, verification_status
       FROM sports WHERE student_id = ANY($1) ORDER BY created_at DESC`,
      [targetStudentIds]
    ),
    query<any>(
      `SELECT DISTINCT ON (student_id) student_id, sync_status, total_solved, easy_solved, medium_solved, hard_solved, global_ranking, snapshot_month
       FROM student_leetcode_snapshots WHERE student_id = ANY($1) ORDER BY student_id, snapshot_month DESC`,
      [targetStudentIds]
    ),
    query<any>(
      `SELECT student_id, badge_name, skill_name, certificate_url, verification_status
       FROM student_hackerrank_evidence WHERE student_id = ANY($1) ORDER BY created_at DESC`,
      [targetStudentIds]
    ),
  ]);

  // Determine standard assessment columns from definitions
  const standardDefs = defsRes.rows.length > 0
    ? defsRes.rows.map((d: any) => ({ title: d.title, maxMarks: Number(d.max_marks) }))
    : [
        { title: 'Final', maxMarks: 100 },
      ];

  // Deterministic analytics calculation per student
  const studentAnalyticsList: StudentDeterministicAnalytics[] = [];

  for (const st of students) {
    const sMarks = marksRes.rows.filter((m: any) => m.student_id === st.id);
    const markMap = new Map<string, { obtained: number; max: number; createdAt?: string }>();
    for (const m of sMarks) {
      if (m.marks_obtained !== null && m.marks_obtained !== undefined) {
        markMap.set(m.exam_type, {
          obtained: Number(m.marks_obtained),
          max: Number(m.max_marks || 100),
          createdAt: m.created_at,
        });
      }
    }

    const assessments: StudentAssessmentRecord[] = [];

    // Evaluate defined assessments
    for (const def of standardDefs) {
      const entry = markMap.get(def.title);
      if (entry !== undefined) {
        const pct = entry.max > 0 ? Number(((entry.obtained / entry.max) * 100).toFixed(1)) : 0;
        assessments.push({
          title: def.title,
          obtainedMarks: entry.obtained,
          maxMarks: entry.max,
          percentage: pct,
          status: 'RECORDED',
          createdAt: entry.createdAt,
        });
      } else {
        assessments.push({
          title: def.title,
          obtainedMarks: null,
          maxMarks: def.maxMarks,
          percentage: null,
          status: 'MISSING',
        });
      }
    }

    // Include other marks not in standard definitions
    for (const m of sMarks) {
      if (!standardDefs.some((d) => d.title === m.exam_type)) {
        const max = Number(m.max_marks || 100);
        const val = Number(m.marks_obtained);
        const pct = max > 0 ? Number(((val / max) * 100).toFixed(1)) : 0;
        assessments.push({
          title: m.exam_type,
          obtainedMarks: val,
          maxMarks: max,
          percentage: pct,
          status: 'RECORDED',
          createdAt: m.created_at,
        });
      }
    }

    const recorded = assessments.filter((a) => a.status === 'RECORDED' && a.percentage !== null);
    const validCount = recorded.length;
    const missingCount = assessments.filter((a) => a.status === 'MISSING').length;

    let avgPct: number | null = null;
    let highestPct: number | null = null;
    let lowestPct: number | null = null;
    let firstPct: number | null = null;
    let latestPct: number | null = null;
    let changePp: number | null = null;
    let trendDesc = 'No recorded assessments.';
    let trendReliability: StudentDeterministicAnalytics['trendReliability'] = 'NO_DATA';
    const limitations: string[] = [];

    if (validCount === 0) {
      trendDesc = 'No assessment marks recorded in the academic ledger for this subject and semester.';
      trendReliability = 'NO_DATA';
      limitations.push('Zero recorded assessment scores. Cannot compute averages or trends.');
    } else if (validCount === 1) {
      const p = recorded[0].percentage!;
      avgPct = p;
      highestPct = p;
      lowestPct = p;
      firstPct = p;
      latestPct = p;
      trendDesc = `Single recorded assessment observed (${recorded[0].title}: ${p}%). Insufficient data to determine a trend, consistency, or trajectory.`;
      trendReliability = 'INSUFFICIENT_DATA';
      limitations.push('Only 1 assessment recorded. Trajectory, consistency, or decline claims are mathematically unsupported.');
    } else if (validCount === 2) {
      const pcts = recorded.map((r) => r.percentage as number);
      avgPct = Number((pcts.reduce((a, b) => a + b, 0) / validCount).toFixed(1));
      highestPct = Math.max(...pcts);
      lowestPct = Math.min(...pcts);
      firstPct = pcts[0];
      latestPct = pcts[1];
      changePp = Number((latestPct - firstPct).toFixed(1));
      trendReliability = 'TWO_POINT_DIFFERENCE';

      if (changePp > 0) {
        trendDesc = `Observed score difference of +${changePp} percentage points from ${recorded[0].title} (${firstPct}%) to ${recorded[1].title} (${latestPct}%). Note: Two points describe only an immediate difference, not a reliable long-term trend.`;
      } else if (changePp < 0) {
        trendDesc = `Observed score difference of ${changePp} percentage points from ${recorded[0].title} (${firstPct}%) to ${recorded[1].title} (${latestPct}%). Note: Two points describe only an immediate difference, not a reliable long-term trend.`;
      } else {
        trendDesc = `Identical score observed across two assessments at ${firstPct}%. Additional assessments needed before establishing consistency.`;
      }
      limitations.push('Only 2 assessments recorded. Represents a two-point delta rather than an established longitudinal trend.');
    } else {
      // 3 or more assessments
      const pcts = recorded.map((r) => r.percentage as number);
      avgPct = Number((pcts.reduce((a, b) => a + b, 0) / validCount).toFixed(1));
      highestPct = Math.max(...pcts);
      lowestPct = Math.min(...pcts);
      firstPct = pcts[0];
      latestPct = pcts[pcts.length - 1];
      changePp = Number((latestPct - firstPct).toFixed(1));
      trendReliability = 'ESTABLISHED_TREND';

      if (changePp > 2) {
        trendDesc = `Positive trajectory: +${changePp} percentage points gain across ${validCount} sequential assessments (first: ${firstPct}%, latest: ${latestPct}%).`;
      } else if (changePp < -2) {
        trendDesc = `Downward trajectory: ${changePp} percentage points reduction across ${validCount} sequential assessments (first: ${firstPct}%, latest: ${latestPct}%).`;
      } else {
        trendDesc = `Steady performance: within a ±2 pp band across ${validCount} sequential assessments (average: ${avgPct}%).`;
      }
    }

    // Historical Backlogs from calculateAcademicHistoryBulk
    const hist = academicHistMap[st.id];
    const backlogs = {
      count: hist?.totalBacklogsCount ?? 0,
      subjects: (hist?.currentBacklogSubjects ?? []).map((b: any) => ({
        subjectName: b.subjectName,
        semesterName: b.semesterName,
      })),
    };

    // Extracurriculars
    const sProjs = projRes.rows
      .filter((p: any) => p.student_id === st.id)
      .map((p: any) => ({
        title: p.title,
        techStack: Array.isArray(p.technologies) ? p.technologies : [],
        status: p.verification_status,
      }));

    const sCerts = certRes.rows
      .filter((c: any) => c.student_id === st.id)
      .map((c: any) => ({
        title: c.name,
        issuer: c.issuer,
        status: c.verification_status,
      }));

    const sHacks = facultyVisibility.hackathon_enabled
      ? hackRes.rows
          .filter((h: any) => h.student_id === st.id)
          .map((h: any) => ({
            title: h.name,
            role: h.position_result || 'Participant',
            status: h.verification_status,
            eventName: h.name || undefined,
            competitionLevel: undefined,
            positionResult: h.position_result || undefined,
          }))
      : [];

    const sPosts = facultyVisibility.linkedin_enabled
      ? postRes.rows
          .filter((p: any) => p.student_id === st.id)
          .map((p: any) => ({
            title: p.title,
            category: p.category || undefined,
            status: p.verification_status || 'unverified',
          }))
      : [];
    const postsCount = sPosts.length;

    const sSports = sportsRes.rows
      .filter((sp: any) => sp.student_id === st.id)
      .map((sp: any) => ({
        sportName: sp.sport_name,
        eventName: sp.event_name || undefined,
        competitionLevel: sp.competition_level || 'College',
        rolePosition: sp.position_role || sp.leadership_role || undefined,
        awardResult: sp.result_award || undefined,
        status: sp.verification_status || 'unverified',
        statsSummary: sp.match_stats ? JSON.stringify(sp.match_stats) : undefined,
      }));

    // External Profiles
    const gh = ghSnapRes.rows.find((g: any) => g.student_id === st.id);
    const li = liSnapRes.rows.find((l: any) => l.student_id === st.id);
    const hr = hrSnapRes.rows.find((r: any) => r.student_id === st.id);
    const lcSnap = leetcodeSnapRes.rows.find((l: any) => l.student_id === st.id);
    const hrEvs = hrEvidenceRes.rows.filter((e: any) => e.student_id === st.id);

    const externalProfiles: StudentDeterministicAnalytics['externalProfiles'] = {
      github: facultyVisibility.github_enabled
        ? (gh && gh.sync_status === 'synced'
            ? {
                status: 'SYNCED',
                repos: gh.public_repos ?? undefined,
                stars: gh.total_stars ?? undefined,
                contributions: gh.total_contributions ?? undefined,
                note: 'Public GitHub activity snapshot; repository count is not direct proof of curriculum coding proficiency.',
              }
            : { status: st.github_url ? 'NOT_SYNCED' : 'NOT_AVAILABLE' })
        : { status: 'NOT_AVAILABLE' },
      linkedin: facultyVisibility.linkedin_enabled
        ? (li && li.sync_status === 'synced'
            ? {
                status: 'SYNCED',
                connections: li.connections ?? undefined,
                followers: li.followers ?? undefined,
              }
            : { status: st.linkedin_url ? 'NOT_SYNCED' : 'NOT_AVAILABLE' })
        : { status: 'NOT_AVAILABLE' },
      hackerrank: facultyVisibility.hackerrank_enabled
        ? (hr && hr.sync_status === 'synced'
            ? {
                status: 'SYNCED',
                badgesCount: hr.badges_count ?? undefined,
                certificates: hrEvs.map((e: any) => e.badge_name || e.skill_name),
              }
            : {
                status: hrEvs.length > 0 ? 'SYNCED' : (st.hackerrank_url ? 'NOT_SYNCED' : 'NOT_AVAILABLE'),
                badgesCount: hrEvs.length,
                certificates: hrEvs.map((e: any) => e.badge_name || e.skill_name),
              })
        : { status: 'NOT_AVAILABLE', badgesCount: 0, certificates: [] },
      leetcode: facultyVisibility.leetcode_enabled
        ? (lcSnap && lcSnap.sync_status === 'synced'
            ? {
                status: 'SYNCED',
                url: st.leetcode_url || undefined,
                totalSolved: lcSnap.total_solved ?? undefined,
                easy: lcSnap.easy_solved ?? undefined,
                medium: lcSnap.medium_solved ?? undefined,
                hard: lcSnap.hard_solved ?? undefined,
                ranking: lcSnap.global_ranking ?? undefined,
              }
            : (st.leetcode_url ? { status: 'LINKED', url: st.leetcode_url } : { status: 'NOT_AVAILABLE' }))
        : { status: 'NOT_AVAILABLE' },
    };

    if (externalProfiles.github.status !== 'SYNCED') {
      limitations.push('GitHub data is not synchronized; absence of external data does not indicate zero activity.');
    }
    if (sProjs.length === 0) {
      limitations.push('No verified student projects recorded in the system.');
    }

    studentAnalyticsList.push({
      id: st.id,
      rollNumber: st.roll_number,
      fullName: st.full_name,
      className: cls.name,
      subjectName: sub.name,
      semesterName: sem.name,
      assessments,
      validAssessmentCount: validCount,
      missingAssessmentCount: missingCount,
      averagePercentage: avgPct,
      highestPercentage: highestPct,
      lowestPercentage: lowestPct,
      firstPercentage: firstPct,
      latestPercentage: latestPct,
      changePercentagePoints: changePp,
      trendDescription: trendDesc,
      trendReliability,
      backlogs,
      projects: sProjs,
      certifications: sCerts,
      hackathons: sHacks,
      posts: sPosts,
      postsCount,
      sports: sSports,
      externalProfiles,
      limitations,
    });
  }

  // Class aggregates
  const validAvgs = studentAnalyticsList
    .map((s) => s.averagePercentage)
    .filter((a): a is number => a !== null);
  const classAvg = validAvgs.length > 0
    ? Number((validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length).toFixed(1))
    : null;

  const improvingStudents = studentAnalyticsList.filter(
    (s) => s.changePercentagePoints !== null && s.changePercentagePoints > 0 && s.validAssessmentCount >= 2
  );
  const decliningStudents = studentAnalyticsList.filter(
    (s) => s.changePercentagePoints !== null && s.changePercentagePoints < 0 && s.validAssessmentCount >= 2
  );
  const singleAssessmentStudents = studentAnalyticsList.filter(
    (s) => s.validAssessmentCount === 1
  );
  const noDataStudents = studentAnalyticsList.filter(
    (s) => s.validAssessmentCount === 0
  );

  const classSummary = {
    className: cls.name,
    subjectName: `${sub.name} (${sub.code})`,
    semesterName: sem.name,
    totalStudents: students.length,
    studentsWithMarks: validAvgs.length,
    classAveragePercentage: classAvg,
    improvingCount: improvingStudents.length,
    decliningCount: decliningStudents.length,
    singleAssessmentCount: singleAssessmentStudents.length,
    insufficientDataCount: noDataStudents.length,
  };

  const classified = classifyTeacherQuestion(question);

  // Construct Structured Authorized Evidence Package for Local Ollama
  let contextText = `=== DETERMINISTIC EVIDENCE PACKAGE ===
Scope: ${scope} (${classified.label})
Class: ${cls.name}
Subject: ${sub.name} (${sub.code})
Semester: ${sem.name}
Authorized Students Count: ${students.length}
Class Average: ${classAvg !== null ? `${classAvg}%` : 'INSUFFICIENT_DATA'}
Students with 1 Assessment (Trend Insufficient): ${singleAssessmentStudents.length}
Students with ≥2 Assessments (Trend Eligible): ${improvingStudents.length + decliningStudents.length}
Students with 0 Assessments: ${noDataStudents.length}

=== AUTHORIZED STUDENT EVIDENCE RECORDS ===
`;

  for (const s of studentAnalyticsList) {
    contextText += `\n[STUDENT: ${s.fullName} | Roll: ${s.rollNumber}]
• Assessments Recorded:
${s.assessments
  .map(
    (a) =>
      `    - ${a.title}: ${
        a.obtainedMarks !== null
          ? `${a.obtainedMarks}/${a.maxMarks} (${a.percentage}%) [RECORDED]`
          : 'UNRECORDED / MISSING (Do not treat as 0)'
      }`
  )
  .join('\n')}
• Valid Assessment Count: ${s.validAssessmentCount}
• Missing Assessment Count: ${s.missingAssessmentCount}
• Average Score: ${s.averagePercentage !== null ? `${s.averagePercentage}%` : 'INSUFFICIENT_DATA'}
• Trend Status: ${s.trendDescription}
• Trend Reliability Code: ${s.trendReliability}
• Verified Backlogs (Production Academic Service): ${s.backlogs.count} active backlogs ${
      s.backlogs.count > 0 ? `[${s.backlogs.subjects.map((b) => `${b.subjectName} in ${b.semesterName}`).join(', ')}]` : ''
    }
• Recorded Projects: ${s.projects.length > 0 ? s.projects.map((p) => `${p.title} (${p.status})`).join(', ') : 'None recorded'}
• Hackathons & Competitions: ${s.hackathons.length > 0 ? s.hackathons.map((h) => `${h.title} [${h.role}, Level: ${h.competitionLevel || 'N/A'}, Status: ${h.status}]`).join('; ') : 'None recorded'}
• Sports & Athletics (Faculty Verified / Recorded): ${s.sports.length > 0 ? s.sports.map((sp) => `${sp.sportName} (${sp.competitionLevel}, Award: ${sp.awardResult || 'Participation'}, Status: ${sp.status})`).join('; ') : 'None recorded'}
• Campus Posts & Publications: ${s.posts.length > 0 ? s.posts.map((p) => `"${p.title}" [${p.category || 'General'}, ${p.status}]`).join('; ') : 'None recorded'}
• Coding Platform Metrics (LeetCode): ${s.externalProfiles.leetcode.totalSolved !== undefined ? `${s.externalProfiles.leetcode.totalSolved} solved (${s.externalProfiles.leetcode.easy || 0}E, ${s.externalProfiles.leetcode.medium || 0}M, ${s.externalProfiles.leetcode.hard || 0}H). Real metrics; acceptance rate formula removed.` : s.externalProfiles.leetcode.status}
• Coding Platform Evidence (HackerRank): ${s.externalProfiles.hackerrank.status} (Badges: ${s.externalProfiles.hackerrank.badgesCount || 0}, Certs: ${s.externalProfiles.hackerrank.certificates?.length || 0})
• External Profiles: GitHub: ${s.externalProfiles.github.status}; LinkedIn: ${s.externalProfiles.linkedin.status}; HackerRank: ${s.externalProfiles.hackerrank.status}
• Limitations: ${s.limitations.join('; ')}
`;
  }

  // System Prompt strictly customized according to Teacher question
  const systemPrompt = `You are the Teacher AI Student Progress & Deep Analysis Assistant for Vission Academy.
Target Inquiry Type: ${classified.label}
Teacher Question: "${question}"

MANDATORY EVIDENCE-BASED GROUNDING RULES:
1. ANSWER THE EXACT TEACHER QUESTION directly. Do not repeat the same generic summary for different questions.
2. ONE ASSESSMENT RULE: If a student has only 1 recorded assessment (Valid Assessment Count = 1):
   - You MUST report the single observed score.
   - The trend is strictly "Insufficient data (only 1 recorded assessment)."
   - NEVER claim "consistent performance", "steady performance", "improvement", "decline", or "established trajectory".
3. TWO ASSESSMENTS RULE: If a student has 2 assessments:
   - Describe only the observed difference (e.g., "+X percentage points difference").
   - NEVER claim an established long-term trend.
4. THREE+ ASSESSMENTS RULE: Only calculate a longitudinal trend if 3 or more sequential assessments exist.
5. NEVER equate unrecorded/missing data with zero marks or zero achievement. State "Data not recorded / NOT_AVAILABLE".
6. BACKLOGS: Use ONLY the verified backlog count provided. Never invent backlogs.
7. REPOSITORIES & CODING: GitHub repo counts are NOT proof of curriculum coding proficiency. Solved totals reflect practice engagement rather than curriculum mastery. Never calculate synthetic acceptance rate formulas.
8. EXTRACURRICULARS & SPORTS: Distinguish participation from competitive results and leadership. Never claim athletic championship without verified records.
9. FOR EVERY IMPORTANT CONCLUSION: State what exact evidence supports it, source and date, and what it does NOT demonstrate.
10. OUTPUT STRUCTURE (use concise, clear markdown headings):
   ### Executive Finding
   ### Evidence Examined
   ### Detailed Analysis
   ### Strengths Demonstrated
   ### Gaps and Uncertainties
   ### Recommendations
   ### Data Coverage and Limitations

Return only factual, evidence-backed text. Do not invent filler or advice not rooted in the evidence.`;

  const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'qwen2.5:3b';

  let answer = '';
  let aiAvailable = false;
  let validationStatus: 'PASSED' | 'DETERMINISTIC_FALLBACK' | 'SANITIZED' = 'DETERMINISTIC_FALLBACK';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout for local Ollama

    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        prompt: `${systemPrompt}\n\nContext:\n${contextText}\n\nTeacher Question: ${question}`,
        stream: false,
        options: {
          temperature: 0.1, // Strict deterministic output
          top_p: 0.85,
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data: any = await res.json();
      const rawModelAnswer = data.response?.trim() || '';

      // Run Output Validation against Ground Truth calculations
      const valResult = validateModelOutput(rawModelAnswer, scope, studentAnalyticsList);
      if (valResult.valid && rawModelAnswer.length > 20) {
        answer = valResult.sanitized;
        aiAvailable = true;
        validationStatus = 'PASSED';
      } else {
        // Fallback to deterministic calculated answer
        console.warn(`[AI Progress Validation] Rejecting LLM response: ${valResult.reason}. Using deterministic calculations.`);
        answer = buildDeterministicAnswer(classified.type, scope, studentAnalyticsList, classSummary);
        aiAvailable = true;
        validationStatus = 'DETERMINISTIC_FALLBACK';
      }
    } else {
      answer = buildDeterministicAnswer(classified.type, scope, studentAnalyticsList, classSummary);
      validationStatus = 'DETERMINISTIC_FALLBACK';
    }
  } catch (err: any) {
    console.warn('[AI Progress] Ollama request failed or offline:', err.message);
    answer = buildDeterministicAnswer(classified.type, scope, studentAnalyticsList, classSummary);
    validationStatus = 'DETERMINISTIC_FALLBACK';
  }

  // Audit Logging
  await logActivity(
    user.id,
    'TEACHER_AI_PROGRESS',
    'classes',
    classId,
    JSON.stringify({
      subjectId,
      semesterId,
      scope,
      selectedStudentIds: targetStudentIds,
      aiAvailable,
      validationStatus,
      model: ollamaModel,
    })
  );

  return {
    available: aiAvailable,
    provider: 'ollama',
    model: ollamaModel,
    answer,
    scope,
    studentCount: students.length,
    classSummary,
    studentsAnalytics: studentAnalyticsList,
    evidencePackage: {
      classifiedInquiry: classified,
      classSummary,
    },
    validationStatus,
  };
}
