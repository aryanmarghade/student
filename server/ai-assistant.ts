/**
 * ai-assistant.ts — Scoped Academic AI Query Handler (Optional Local AI via Ollama)
 *
 * This module handles optional AI queries for all roles.
 * - Ollama is the ONLY AI provider (100% local, no cloud dependencies, no API keys).
 * - Core PostgreSQL analytics remain the absolute source of truth.
 * - If Ollama is not running or unreachable, it returns a graceful non-500 response
 *   with available: false.
 *
 * RBAC rules enforced:
 *   - Admin: sees college-level permitted institutional stats
 *   - Teacher: sees only assigned class/subject/semester context
 *   - Student: sees only their own academic context
 */

import { query } from './db.js';
import { AuthenticatedUser } from './auth.js';
import { getStudentComprehensiveEvidence } from './student-evidence-service.js';

export type AiResponse = {
  available: boolean;
  provider: string;
  message: string;
  answer: string;
  toolCallsExecuted: { name: string; role: string }[];
  resolvedIntent: string;
};

async function buildScopedContext(user: AuthenticatedUser, queryText = ''): Promise<string> {
  if (user.role === 'admin') {
    const [users, classes, marks] = await Promise.all([
      query(`SELECT role, count(*)::int cnt FROM users GROUP BY role ORDER BY role`),
      query(`SELECT count(*)::int cnt FROM classes`),
      query(`SELECT count(*)::int total, round(avg(marks_obtained/NULLIF(max_marks,0)*100)::numeric,1) avg_pct FROM marks`),
    ]);
    const u = Object.fromEntries(users.rows.map((r: any) => [r.role, r.cnt]));
    const c = classes.rows[0] as any;
    const m = marks.rows[0] as any;
    return `Institution summary: ${u.student ?? 0} students, ${u.teacher ?? 0} teachers, ${c?.cnt ?? 0} classes. ` +
      `Overall marks: ${m?.total ?? 0} evaluations, average score ${m?.avg_pct ?? 'N/A'}%.`;
  }

  if (user.role === 'teacher') {
    const assignments = (await query(
      `SELECT c.id AS class_id, c.name AS class_name, s.id AS subject_id, s.name AS subject_name, sem.id AS semester_id, sem.name AS semester_name,
              count(DISTINCT st.id)::int AS student_count,
              count(m.id)::int AS marks_count,
              round(avg(m.marks_obtained/NULLIF(m.max_marks,0)*100)::numeric,1) AS avg_pct
       FROM teacher_class_assignments a
       JOIN classes c ON c.id=a.class_id
       JOIN subjects s ON s.id=a.subject_id
       JOIN semesters sem ON sem.id=a.semester_id
       LEFT JOIN students st ON st.class_id=c.id
       LEFT JOIN marks m ON m.student_id=st.id AND m.subject_id=a.subject_id AND m.semester_id=a.semester_id
       WHERE a.teacher_user_id=$1 AND a.status='active'
       GROUP BY c.id, c.name, s.id, s.name, sem.id, sem.name`,
      [user.id],
    )).rows as any[];

    if (!assignments.length) return `You currently have no active class assignments.`;

    let baseContext = `Your active assignments:\n` + assignments.map((a: any) =>
      `• ${a.class_name} — ${a.subject_name} (${a.semester_name}): ` +
      `${a.student_count} students, ${a.marks_count} marks recorded, avg ${a.avg_pct ?? 'N/A'}%`,
    ).join('\n');

    // Check if query contains @mention, student name, or roll number in teacher's authorized classes
    const matchMention = queryText.match(/@([^\s,?!]+)/i);
    const mentionTerm = matchMention ? matchMention[1].trim() : null;

    // Search for any student in teacher's assigned classes matching mention or query tokens
    const studentMatches = (await query(
      `SELECT s.id, s.roll_number, u.full_name, c.name AS class_name,
              count(m.id)::int AS total_assessments,
              round(avg(m.marks_obtained/NULLIF(m.max_marks,0)*100)::numeric,1) AS avg_percentage,
              json_agg(json_build_object('exam_type', m.exam_type, 'obtained', m.marks_obtained, 'max', m.max_marks, 'percentage', round((m.marks_obtained/NULLIF(m.max_marks,0)*100)::numeric,1))) FILTER (WHERE m.id IS NOT NULL) AS assessment_details
       FROM students s
       JOIN users u ON u.id = s.user_id
       JOIN classes c ON c.id = s.class_id
       JOIN teacher_class_assignments a ON a.class_id = s.class_id AND a.teacher_user_id = $1 AND a.status = 'active'
       LEFT JOIN marks m ON m.student_id = s.id AND m.subject_id = a.subject_id AND m.semester_id = a.semester_id
       WHERE ($2::text IS NOT NULL AND (u.full_name ILIKE $2 OR s.roll_number ILIKE $2 OR s.id ILIKE $2))
          OR ($3::text IS NOT NULL AND $3 ILIKE '%' || u.full_name || '%')
          OR ($3::text IS NOT NULL AND $3 ILIKE '%' || s.roll_number || '%')
       GROUP BY s.id, s.roll_number, u.full_name, c.name
       LIMIT 5`,
      [user.id, mentionTerm ? `%${mentionTerm}%` : null, queryText.trim()],
    )).rows as any[];

    if (studentMatches.length > 0) {
      baseContext += `\n\nDetailed Student Records Scoped to Query:\n` + studentMatches.map((st: any) =>
        `• Student: ${st.full_name} (${st.roll_number}) in ${st.class_name}\n` +
        `  Total Assessments: ${st.total_assessments}, Average Score: ${st.avg_percentage ?? 'N/A'}%\n` +
        `  Assessments Breakdown: ${JSON.stringify(st.assessment_details || [])}`,
      ).join('\n');
    }

    return baseContext;
  }

  if (user.role === 'placement') {
    const [students, projects, hackathons] = await Promise.all([
      query(`SELECT count(*)::int total, count(portfolio_url)::int portfolio_cnt, count(resume_url)::int resume_cnt, round(avg(profile_strength)::numeric,1) avg_profile_score FROM students`),
      query(`SELECT count(*)::int cnt FROM projects`),
      query(`SELECT count(*)::int cnt FROM hackathons`),
    ]);
    const s = students.rows[0] as any;
    const p = projects.rows[0] as any;
    const h = hackathons.rows[0] as any;
    let baseContext = `Placement & Career records: ${s?.total ?? 0} total students tracked. ` +
      `Resumes uploaded: ${s?.resume_cnt ?? 0}, Portfolios active: ${s?.portfolio_cnt ?? 0}, Average profile strength: ${s?.avg_profile_score ?? 'N/A'}. ` +
      `Total student projects: ${p?.cnt ?? 0}, Hackathons participated: ${h?.cnt ?? 0}.`;

    const matchMention = queryText.match(/@([^\s,?!]+)/i);
    const mentionTerm = matchMention ? matchMention[1].trim() : null;

    const studentMatches = (await query<any>(
      `SELECT s.id, s.roll_number, u.full_name, c.name AS class_name
       FROM students s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN classes c ON c.id = s.class_id
       WHERE ($1::text IS NOT NULL AND (u.full_name ILIKE $1 OR s.roll_number ILIKE $1))
          OR ($2::text IS NOT NULL AND $2 ILIKE '%' || u.full_name || '%')
          OR ($2::text IS NOT NULL AND $2 ILIKE '%' || s.roll_number || '%')
       LIMIT 3`,
      [mentionTerm ? `%${mentionTerm}%` : null, queryText.trim()]
    )).rows;

    if (studentMatches.length > 0) {
      for (const sm of studentMatches) {
        try {
          const evidence = await getStudentComprehensiveEvidence(sm.id);
          if (evidence) {
            baseContext += `\n\nCandidate Profile: ${evidence.fullName} (${evidence.rollNumber}) in ${evidence.className || 'N/A'}\n` +
              `• Backlogs: ${evidence.academics.currentBacklogsCount} active\n` +
              `• Projects: ${evidence.projects.map(pr => `${pr.title} (${pr.verificationStatus})`).join(', ') || 'None'}\n` +
              `• LeetCode: ${evidence.leetcode.status === 'SYNCED' ? `${evidence.leetcode.totalSolved} solved (${evidence.leetcode.easySolved}E, ${evidence.leetcode.mediumSolved}M, ${evidence.leetcode.hardSolved}H)` : 'Not synced'}\n` +
              `• GitHub: ${evidence.github.status === 'SYNCED' ? `${evidence.github.publicRepos} repos (${evidence.github.languages.join(', ')})` : 'Not synced'}\n` +
              `• Hackathons: ${evidence.hackathons.map(hk => `${hk.name} (${hk.positionResult || 'Participant'}, ${hk.verificationStatus})`).join(', ') || 'None'}\n` +
              `• Sports: ${evidence.sports.map(sp => `${sp.sportName} (${sp.competitionLevel}, ${sp.verificationStatus})`).join(', ') || 'None'}`;
          }
        } catch (_err) {}
      }
    }

    return baseContext;
  }

  // student
  const student = (await query(
    `SELECT s.roll_number, u.full_name, c.name AS class_name,
            count(m.id)::int AS marks_count,
            round(avg(m.marks_obtained/NULLIF(m.max_marks,0)*100)::numeric,1) AS avg_pct
     FROM students s
     JOIN users u ON u.id=s.user_id
     LEFT JOIN classes c ON c.id=s.class_id
     LEFT JOIN marks m ON m.student_id=s.id
     WHERE s.user_id=$1
     GROUP BY s.roll_number, u.full_name, c.name`,
    [user.id],
  )).rows[0] as any;
  if (!student) return 'No student record found for your account.';
  return `Student ${student.full_name} (${student.roll_number}), class: ${student.class_name ?? 'N/A'}. ` +
    `Marks: ${student.marks_count} evaluations, average score ${student.avg_pct ?? 'N/A'}%.`;
}

import { processRoleIntelligenceQuery } from './role-intelligence-engine.js';

export async function processAiQuery(user: AuthenticatedUser, text: string): Promise<AiResponse & { structuredData?: any; dataCoverage?: any; isGroundingVerified?: boolean }> {
  try {
    const roleReq = {
      role: (user.role as any) || 'student',
      task: user.role === 'student' ? 'student_academic_analysis' : user.role === 'teacher' ? 'teacher_assessment_analysis' : user.role === 'placement' ? 'placement_overview' : 'admin_overview',
      queryText: text,
    };
    const roleRes = await processRoleIntelligenceQuery(user, roleReq);
    if (roleRes && roleRes.answer) {
      return {
        available: roleRes.available,
        provider: roleRes.provider,
        message: 'Success',
        answer: roleRes.answer,
        toolCallsExecuted: [{ name: roleRes.task, role: user.role }],
        resolvedIntent: roleRes.task,
        structuredData: roleRes.structuredData,
        dataCoverage: roleRes.dataCoverage,
        isGroundingVerified: roleRes.isGroundingVerified,
      };
    }
  } catch (err: any) {
    console.warn('[AI Assistant] Role intelligence fallback to scoped prompt:', err?.message);
  }

  const context = await buildScopedContext(user, text);
  const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'qwen2.5:3b';

  const systemInstruction =
    `You are an academic assistant for Vission Academy. You have access strictly to the ` +
    `following verified data scoped to the current user (role: ${user.role}). ` +
    `Do not invent data. Do not disclose data outside this context. ` +
    `Answer concisely and helpfully.\n\nAcademic Context:\n${context}`;

  const prompt = `${systemInstruction}\n\nUser Question: ${text}\n\nResponse:`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        prompt,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json().catch(() => null) as any;
      const responseText = data?.response?.trim();
      if (responseText) {
        return {
          available: true,
          provider: 'ollama',
          message: 'Success',
          answer: responseText,
          toolCallsExecuted: [{ name: 'ollama_scoped_response', role: user.role }],
          resolvedIntent: 'ollama_academic_query',
        };
      }
    }
  } catch (err: any) {
    // Local Ollama is unreachable, offline, or timed out.
    // This is completely expected when Ollama is off.
  }

  // Graceful local AI unavailable fallback (No 500, clean response)
  return {
    available: false,
    provider: 'ollama',
    message: 'Local AI is unavailable. Start Ollama to enable AI features.',
    answer: 'Local AI is unavailable. Start Ollama to enable AI features.',
    toolCallsExecuted: [{ name: 'ollama_unavailable', role: user.role }],
    resolvedIntent: 'ollama_unavailable',
  };
}
