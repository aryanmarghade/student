/**
 * ai-assistant.ts — Scoped Academic AI Query Handler
 *
 * This module handles AI queries for all roles. When GEMINI_API_KEY is set
 * in the environment, queries are answered by Gemini using structured,
 * role-scoped PostgreSQL data as context. When no API key is configured,
 * a plain PostgreSQL summary is returned instead.
 *
 * Environment requirement:
 *   GEMINI_API_KEY — Google AI Studio API key (see .env.example)
 *
 * RBAC rules enforced:
 *   - Admin: sees institution-wide stats
 *   - Teacher: sees only their assigned classes/students
 *   - Student: sees only their own marks and profile data
 */

import { query } from './db.js';
import { AuthenticatedUser } from './auth.js';
import { GoogleGenAI } from '@google/genai';

type AiResponse = {
  text: string;
  toolCallsExecuted: { name: string; role: string }[];
  resolvedIntent: string;
};

async function buildScopedContext(user: AuthenticatedUser): Promise<string> {
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
      `SELECT c.name AS class_name, s.name AS subject_name, sem.name AS semester_name,
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
       GROUP BY c.name, s.name, sem.name`,
      [user.id],
    )).rows as any[];
    if (!assignments.length) return `You currently have no active class assignments.`;
    return `Your active assignments:\n` + assignments.map((a: any) =>
      `• ${a.class_name} — ${a.subject_name} (${a.semester_name}): ` +
      `${a.student_count} students, ${a.marks_count} marks recorded, avg ${a.avg_pct ?? 'N/A'}%`,
    ).join('\n');
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

export async function processAiQuery(user: AuthenticatedUser, text: string): Promise<AiResponse> {
  const context = await buildScopedContext(user);
  const apiKey = process.env.GEMINI_API_KEY;

  // Gemini path — only when API key is configured
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const systemInstruction =
        `You are an academic assistant for Vission Academy. You have access only to the ` +
        `following data scoped to the current user (role: ${user.role}). ` +
        `Do not invent data. Do not disclose data from other students, teachers, or classes. ` +
        `Answer concisely and helpfully.\n\nData context:\n${context}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text }] }],
        config: { systemInstruction },
      });

      const geminiText = response.text ?? 'Gemini returned an empty response.';
      return {
        text: geminiText,
        toolCallsExecuted: [{ name: 'gemini_scoped_response', role: user.role }],
        resolvedIntent: 'gemini_academic_query',
      };
    } catch (err: any) {
      // Log the error but gracefully fall through to the plain summary
      console.error('[AI] Gemini API error:', err?.message ?? err);
      return {
        text: `Gemini API error: ${err?.message ?? 'Unknown error'}. ` +
          `Here is a direct PostgreSQL summary:\n\n${context}`,
        toolCallsExecuted: [{ name: 'gemini_error_fallback', role: user.role }],
        resolvedIntent: 'gemini_error_fallback',
      };
    }
  }

  // No API key — return plain scoped summary
  return {
    text: `Academic AI Summary (Gemini not configured — set GEMINI_API_KEY to enable):\n\n${context}`,
    toolCallsExecuted: [{ name: 'postgresql_scoped_summary', role: user.role }],
    resolvedIntent: 'postgresql_scoped_summary',
  };
}
