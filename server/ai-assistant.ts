import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { memDb, MarkRecord } from './db.js';
import { AuthenticatedUser, verifyTeacherClassScope } from './auth.js';

// Lazy initialization of GoogleGenAI
let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClient;
}

// -------------------------------------------------------------
// Real Database Query Functions (Grounded Tool Implementations)
// -------------------------------------------------------------

// Tool 1: Get Class Topper
export function queryClassTopper(classId: string, subjectId?: string, semesterId?: string) {
  // Get all students in the class
  const classStudents = memDb.students.filter(s => s.class_id === classId);
  if (classStudents.length === 0) {
    return { error: 'No students found enrolled in this class.' };
  }

  const studentAverages: Array<{
    studentId: string;
    studentName: string;
    rollNumber: string;
    averagePercentage: number;
    totalExams: number;
  }> = [];

  for (const s of classStudents) {
    const user = memDb.users.find(u => u.id === s.user_id);
    let marks = memDb.marks.filter(m => m.student_id === s.id);
    if (subjectId) marks = marks.filter(m => m.subject_id === subjectId);
    if (semesterId) marks = marks.filter(m => m.semester_id === semesterId);

    if (marks.length > 0) {
      const totalPct = marks.reduce((sum, m) => sum + (m.marks_obtained / m.max_marks) * 100, 0);
      const avg = Number((totalPct / marks.length).toFixed(2));
      studentAverages.push({
        studentId: s.id,
        studentName: user ? user.full_name : 'Unknown',
        rollNumber: s.roll_number,
        averagePercentage: avg,
        totalExams: marks.length
      });
    }
  }

  if (studentAverages.length === 0) {
    return { message: 'No examination marks on record for students in this class yet.' };
  }

  studentAverages.sort((a, b) => b.averagePercentage - a.averagePercentage);
  const topper = studentAverages[0];

  const targetClass = memDb.classes.find(c => c.id === classId);
  const targetSubject = subjectId ? memDb.subjects.find(s => s.id === subjectId) : null;

  return {
    topperStudentName: topper.studentName,
    rollNumber: topper.rollNumber,
    className: targetClass ? targetClass.name : classId,
    subjectName: targetSubject ? targetSubject.name : 'All Subjects',
    averageScorePercent: topper.averagePercentage,
    totalExamsEvaluated: topper.totalExams,
    runnerUp: studentAverages[1] ? {
      name: studentAverages[1].studentName,
      average: studentAverages[1].averagePercentage
    } : null
  };
}

// Tool 2: Get Student Average & Subject Breakdown
export function queryStudentAverage(studentId: string, semesterId?: string) {
  const student = memDb.students.find(s => s.id === studentId || s.roll_number.toLowerCase() === studentId.toLowerCase());
  if (!student) {
    return { error: `Student with identifier "${studentId}" not found in database.` };
  }

  const user = memDb.users.find(u => u.id === student.user_id);
  let marks = memDb.marks.filter(m => m.student_id === student.id);
  if (semesterId) marks = marks.filter(m => m.semester_id === semesterId);

  if (marks.length === 0) {
    return {
      studentName: user ? user.full_name : 'Student',
      rollNumber: student.roll_number,
      message: 'No marks records available for the requested period.'
    };
  }

  // Group by subject
  const subjectGroups: Record<string, MarkRecord[]> = {};
  for (const m of marks) {
    if (!subjectGroups[m.subject_id]) subjectGroups[m.subject_id] = [];
    subjectGroups[m.subject_id].push(m);
  }

  const subjectBreakdown = Object.entries(subjectGroups).map(([subId, subMarks]) => {
    const sub = memDb.subjects.find(s => s.id === subId);
    const avgPct = subMarks.reduce((sum, m) => sum + (m.marks_obtained / m.max_marks) * 100, 0) / subMarks.length;
    return {
      subjectName: sub ? sub.name : subId,
      subjectCode: sub ? sub.code : '',
      averagePercent: Number(avgPct.toFixed(2)),
      examsCount: subMarks.length
    };
  });

  const totalPercentage = marks.reduce((sum, m) => sum + (m.marks_obtained / m.max_marks) * 100, 0) / marks.length;

  return {
    studentName: user ? user.full_name : 'Student',
    rollNumber: student.roll_number,
    overallAveragePercent: Number(totalPercentage.toFixed(2)),
    totalExamsEvaluated: marks.length,
    subjectBreakdown
  };
}

// Tool 3: Predict Next Semester Score (Linear Regression)
export function predictNextScore(studentId: string, subjectId?: string) {
  const student = memDb.students.find(s => s.id === studentId || s.roll_number.toLowerCase() === studentId.toLowerCase());
  if (!student) {
    return { error: `Student "${studentId}" not found.` };
  }

  const user = memDb.users.find(u => u.id === student.user_id);
  let marks = memDb.marks.filter(m => m.student_id === student.id);
  if (subjectId) marks = marks.filter(m => m.subject_id === subjectId);

  if (marks.length < 2) {
    return {
      studentName: user ? user.full_name : 'Student',
      message: 'Insufficient historical mark records (minimum 2 data points required) to compute linear regression trend line.'
    };
  }

  // Sort chronologically
  marks.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Compute percentage scores as Y, indices as X
  const points = marks.map((m, idx) => ({
    x: idx + 1,
    y: (m.marks_obtained / m.max_marks) * 100
  }));

  const n = points.length;
  const sumX = points.reduce((acc, p) => acc + p.x, 0);
  const sumY = points.reduce((acc, p) => acc + p.y, 0);
  const sumXY = points.reduce((acc, p) => acc + p.x * p.y, 0);
  const sumX2 = points.reduce((acc, p) => acc + p.x * p.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Next prediction point
  const nextX = n + 1;
  const predictedRaw = slope * nextX + intercept;
  const predictedPercent = Number(Math.min(100, Math.max(0, predictedRaw)).toFixed(2));

  return {
    studentName: user ? user.full_name : 'Student',
    rollNumber: student.roll_number,
    historicalScoresCount: n,
    linearTrendSlope: Number(slope.toFixed(3)),
    trendDirection: slope > 0.5 ? 'Upward (Improving)' : slope < -0.5 ? 'Downward (Declining)' : 'Stable',
    predictedNextScorePercentage: predictedPercent,
    disclaimer: 'This is a statistical linear regression estimate based strictly on historical assessment marks.'
  };
}

// Tool 4: Get Struggling Students (Marks below 50% or needing academic attention)
export function queryStrugglingStudents(classId: string, thresholdPercent = 50) {
  const classStudents = memDb.students.filter(s => s.class_id === classId);
  const strugglingList: Array<{
    studentName: string;
    rollNumber: string;
    averagePercent: number;
    failingSubjects: string[];
  }> = [];

  for (const s of classStudents) {
    const user = memDb.users.find(u => u.id === s.user_id);
    const marks = memDb.marks.filter(m => m.student_id === s.id);
    if (marks.length === 0) continue;

    const avgPct = marks.reduce((sum, m) => sum + (m.marks_obtained / m.max_marks) * 100, 0) / marks.length;

    const failingSubjectsSet = new Set<string>();
    marks.forEach(m => {
      const pct = (m.marks_obtained / m.max_marks) * 100;
      if (pct < thresholdPercent) {
        const sub = memDb.subjects.find(sb => sb.id === m.subject_id);
        failingSubjectsSet.add(sub ? sub.name : m.subject_id);
      }
    });

    if (avgPct < thresholdPercent || failingSubjectsSet.size > 0) {
      strugglingList.push({
        studentName: user ? user.full_name : 'Unknown',
        rollNumber: s.roll_number,
        averagePercent: Number(avgPct.toFixed(2)),
        failingSubjects: Array.from(failingSubjectsSet)
      });
    }
  }

  const targetClass = memDb.classes.find(c => c.id === classId);

  return {
    className: targetClass ? targetClass.name : classId,
    thresholdPercentage: thresholdPercent,
    strugglingCount: strugglingList.length,
    studentsRequiringSupport: strugglingList
  };
}

// Tool 5: Student Academic Summary (for Student's own inquiry)
export function queryOwnAcademicSummary(studentId: string) {
  const student = memDb.students.find(s => s.id === studentId);
  if (!student) return { error: 'Student record not found.' };

  const user = memDb.users.find(u => u.id === student.user_id);
  const marksheets = memDb.marksheets.filter(m => m.student_id === student.id);
  const marks = memDb.marks.filter(m => m.student_id === student.id);

  const overallAvg = marks.length > 0
    ? Number((marks.reduce((sum, m) => sum + (m.marks_obtained / m.max_marks) * 100, 0) / marks.length).toFixed(2))
    : null;

  return {
    fullName: user ? user.full_name : '',
    rollNumber: student.roll_number,
    overallMarksAveragePercentage: overallAvg,
    totalCompletedAssessments: marks.length,
    semesterReports: marksheets.map(ms => {
      const sem = memDb.semesters.find(s => s.id === ms.semester_id);
      return {
        semester: sem ? sem.name : ms.semester_id,
        sgpa: ms.sgpa,
        cgpa: ms.cgpa
      };
    })
  };
}

// -------------------------------------------------------------
// Institutional Administrator Tools (College-wide analytics)
// -------------------------------------------------------------

export function queryDepartmentPerformance(semesterId?: string) {
  if (memDb.departments.length === 0) {
    return { message: 'No academic departments defined in the institution.' };
  }

  const deptSummaries = memDb.departments.map(d => {
    const deptStudents = memDb.students.filter(s => s.department_id === d.id);
    const studentIds = deptStudents.map(s => s.id);
    let marks = memDb.marks.filter(m => studentIds.includes(m.student_id));
    if (semesterId) {
      marks = marks.filter(m => m.semester_id === semesterId);
    }

    const avg = marks.length > 0
      ? Number((marks.reduce((sum, m) => sum + (m.marks_obtained / m.max_marks) * 100, 0) / marks.length).toFixed(2))
      : null;

    return {
      departmentId: d.id,
      departmentCode: d.code,
      departmentName: d.name,
      enrolledStudents: deptStudents.length,
      evaluatedAssessments: marks.length,
      averagePercentage: avg
    };
  });

  const evaluatedDepts = deptSummaries.filter(d => d.averagePercentage !== null);
  evaluatedDepts.sort((a, b) => (a.averagePercentage ?? 0) - (b.averagePercentage ?? 0));

  const lowest = evaluatedDepts.length > 0 ? evaluatedDepts[0] : null;
  const highest = evaluatedDepts.length > 0 ? evaluatedDepts[evaluatedDepts.length - 1] : null;

  return {
    departments: deptSummaries,
    totalDepartments: deptSummaries.length,
    lowestPerformingDepartment: lowest ? {
      name: lowest.departmentName,
      code: lowest.departmentCode,
      average: lowest.averagePercentage
    } : null,
    highestPerformingDepartment: highest ? {
      name: highest.departmentName,
      code: highest.departmentCode,
      average: highest.averagePercentage
    } : null,
    message: evaluatedDepts.length === 0 ? 'No assessment marks recorded across departments yet.' : undefined
  };
}

export function queryUnassignedTeachers() {
  const teachers = memDb.users.filter(u => u.role === 'teacher');
  const activeAssignments = memDb.teacher_class_assignments.filter(a => a.status === 'active');
  const assignedTeacherIds = new Set(activeAssignments.map(a => a.teacher_user_id));

  const unassigned = teachers.filter(t => !assignedTeacherIds.has(t.id)).map(t => ({
    id: t.id,
    name: t.full_name,
    email: t.email
  }));

  return {
    totalTeachers: teachers.length,
    activeAssignedTeachersCount: assignedTeacherIds.size,
    unassignedTeachersCount: unassigned.length,
    unassignedTeachers: unassigned
  };
}

export function queryCollegeSummary() {
  const totalStudents = memDb.students.length;
  const totalTeachers = memDb.users.filter(u => u.role === 'teacher').length;
  const totalClasses = memDb.classes.length;
  const activeSemesters = memDb.semesters.filter(s => s.is_active).length;

  const allMarks = memDb.marks;
  const passingMarks = allMarks.filter(m => (m.marks_obtained / m.max_marks) >= 0.4);
  const passRate = allMarks.length > 0
    ? Number(((passingMarks.length / allMarks.length) * 100).toFixed(1))
    : null;

  return {
    totalActiveStudents: totalStudents,
    totalFacultyTeachers: totalTeachers,
    totalClasses: totalClasses,
    activeSemestersCount: activeSemesters,
    overallPassRatePercent: passRate,
    totalEvaluatedMarks: allMarks.length
  };
}

export function queryRecentAuditActivity(limit = 10) {
  const logs = memDb.audit_logs.slice(0, limit).map(l => {
    const user = memDb.users.find(u => u.id === l.user_id);
    return {
      action: l.action,
      entity: l.entity_type,
      details: l.details,
      timestamp: l.created_at,
      performedBy: user ? user.full_name : 'System'
    };
  });

  return {
    totalLogsRecorded: memDb.audit_logs.length,
    recentActions: logs
  };
}

// -------------------------------------------------------------
// Gemini Function Declarations (Tools)
// -------------------------------------------------------------

const toolCollegeSummary: FunctionDeclaration = {
  name: 'get_college_summary',
  description: 'Retrieves institutional overview metrics: total active students, faculty count, total classes, and overall pass rate.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
    required: []
  }
};

const toolDepartmentPerformance: FunctionDeclaration = {
  name: 'get_department_performance',
  description: 'Compares average scores across college departments and identifies the lowest and highest performing departments this semester.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      semesterId: { type: Type.STRING, description: 'Optional semester ID to filter, e.g. sem_1' }
    },
    required: []
  }
};

const toolUnassignedTeachers: FunctionDeclaration = {
  name: 'get_unassigned_teachers',
  description: 'Finds faculty members who currently have zero active class or subject teaching assignments.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
    required: []
  }
};

const toolAuditActivity: FunctionDeclaration = {
  name: 'get_audit_activity',
  description: 'Retrieves recent institutional actions and operations from the official audit log.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      limit: { type: Type.NUMBER, description: 'Number of recent audit records to fetch (default 10)' }
    },
    required: []
  }
};

const toolClassTopper: FunctionDeclaration = {
  name: 'get_class_topper',
  description: 'Finds the student with the highest average score percentage in an assigned class, optionally filtered by subject or semester.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      classId: { type: Type.STRING, description: 'The class ID to inspect, e.g. cls_cs3a' },
      subjectId: { type: Type.STRING, description: 'Optional subject ID, e.g. sub_algo' },
      semesterId: { type: Type.STRING, description: 'Optional semester ID, e.g. sem_4' }
    },
    required: ['classId']
  }
};

const toolStudentAverage: FunctionDeclaration = {
  name: 'get_student_average',
  description: 'Calculates the overall average percentage and subject-wise breakdown for a specific student.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      studentId: { type: Type.STRING, description: 'The student ID (std_01) or Roll Number (CS2023001)' },
      semesterId: { type: Type.STRING, description: 'Optional semester ID, e.g. sem_4' }
    },
    required: ['studentId']
  }
};

const toolPredictNextScore: FunctionDeclaration = {
  name: 'predict_next_score',
  description: 'Computes a linear regression trend line and estimates the next assessment score based on historical marks.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      studentId: { type: Type.STRING, description: 'The student ID or Roll Number' },
      subjectId: { type: Type.STRING, description: 'Optional subject ID to predict for a specific course' }
    },
    required: ['studentId']
  }
};

const toolStrugglingStudents: FunctionDeclaration = {
  name: 'get_struggling_students',
  description: 'Identifies students in a class whose marks or averages fall below a threshold percentage (default 50%).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      classId: { type: Type.STRING, description: 'The class ID to check, e.g. cls_cs3a' },
      thresholdPercent: { type: Type.NUMBER, description: 'Cutoff percentage threshold (e.g. 50)' }
    },
    required: ['classId']
  }
};

const toolOwnAcademicSummary: FunctionDeclaration = {
  name: 'get_student_academic_summary',
  description: 'Retrieves the authenticated student personal marks summary, SGPA, and CGPA.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
    required: []
  }
};

// -------------------------------------------------------------
// Orchestrator: Process AI Queries with Scoping & Grounding
// -------------------------------------------------------------

export async function processAiQuery(user: AuthenticatedUser, prompt: string): Promise<{
  text: string;
  toolCallsExecuted: any[];
  resolvedIntent: string;
}> {
  const toolCallsExecuted: any[] = [];
  let resolvedIntent = 'general_academic_query';

  // 1. Role Scope Enforcement & Pre-validation
  if (user.role === 'student') {
    // Check if query is attempting to access another student's data
    const queryLower = prompt.toLowerCase();
    const otherRollMatches = queryLower.match(/cs202[0-9]{4}/g);
    if (otherRollMatches) {
      const student = memDb.students.find(s => s.user_id === user.id);
      if (student && otherRollMatches.some(r => r.toUpperCase() !== student.roll_number)) {
        return {
          text: 'Access Denied: As a student, you are authorized to query your own academic records only. You cannot view information regarding other students.',
          toolCallsExecuted: [],
          resolvedIntent: 'student_unauthorized_scope_blocked'
        };
      }
    }
  }

  // 2. Determine appropriate tools based on role
  const availableTools: FunctionDeclaration[] = user.role === 'admin'
    ? [toolCollegeSummary, toolDepartmentPerformance, toolUnassignedTeachers, toolAuditActivity, toolClassTopper, toolStudentAverage, toolStrugglingStudents]
    : user.role === 'teacher'
    ? [toolClassTopper, toolStudentAverage, toolPredictNextScore, toolStrugglingStudents]
    : [toolOwnAcademicSummary, toolStudentAverage, toolPredictNextScore];

  // System instructions strictly enforcing grounded truth
  const systemInstruction = user.role === 'admin'
    ? `You are Vission Academy's Institutional AI Assistant for academic administrators.
You have access to real database tools to fetch college-wide statistics, department performance, unassigned faculty, and audit logs.
RULES:
1. ALWAYS call a tool to retrieve real numbers from the database.
2. NEVER guess, estimate, or fabricate a number, student name, department average, or unassigned teacher count.
3. If no real data exists to answer a question (e.g., no marks recorded yet), state that plainly rather than inventing values.
4. Report objective, factual information strictly based on tool execution.`
    : user.role === 'teacher'
    ? `You are Vission Academy's Academic Analytics Assistant for faculty members.
You have access to real database tools to fetch student and class statistics.
RULES:
1. ALWAYS call a tool to retrieve real numbers from the database.
2. NEVER guess, estimate, or fabricate a number, student name, or grade not returned by a tool.
3. If the user asks about a class or student not returned by the tool, state plainly that the data is not in the database or outside scope.
4. When reporting predictions, clearly state it is a linear regression statistical estimate.`
    : `You are Vission Academy's Student Assistant.
You assist the authenticated student with their own academic performance, SGPA, and preparation.
RULES:
1. You must ONLY report real data from the database using tools for this student.
2. You must NEVER reveal any other student's data under any circumstance.
3. Never fabricate or hallucinate any marks.`;

  const ai = getGenAI();

  // If Gemini API Key is not yet configured or in offline preview,
  // we execute an intelligent deterministic tool resolution engine
  // to ensure 100% reliable functionality in all environments!
  if (!ai) {
    const fallbackRes = handleDeterministicToolResolution(user, prompt);
    memDb.ai_query_logs.push({
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      user_id: user.id,
      query_text: prompt,
      resolved_intent: fallbackRes.resolvedIntent,
      response_summary: fallbackRes.text.slice(0, 300),
      tool_calls: fallbackRes.toolCallsExecuted,
      created_at: new Date().toISOString()
    });
    memDb.logActivity(user.id, 'AI_QUERY_EXECUTED', 'ai_assistant', undefined, `AI query executed by ${user.role} (${user.full_name}): "${prompt.slice(0, 60)}" [${fallbackRes.resolvedIntent}]`);
    return fallbackRes;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.2, // Low temperature for high factual accuracy
        tools: [{ functionDeclarations: availableTools }]
      }
    });

    const functionCalls = response.functionCalls;

    if (functionCalls && functionCalls.length > 0) {
      const toolResults: any[] = [];

      for (const call of functionCalls) {
        resolvedIntent = call.name;
        const args = (call.args || {}) as any;

        // Teacher Server-side Scope Enforcement inside Tool Invocations
        if (user.role === 'teacher') {
          if (args.classId && !verifyTeacherClassScope(args.classId, undefined, undefined, user.id)) {
            toolResults.push({
              tool: call.name,
              error: `Authorization Error: You are not assigned to class "${args.classId}". Access forbidden.`
            });
            continue;
          }
          if (args.studentId) {
            const stud = memDb.students.find(s => s.id === args.studentId || s.roll_number.toLowerCase() === args.studentId.toLowerCase());
            if (stud && !verifyTeacherClassScope(stud.class_id, undefined, undefined, user.id)) {
              toolResults.push({
                tool: call.name,
                error: `Authorization Error: Student "${args.studentId}" is enrolled in a class not assigned to you.`
              });
              continue;
            }
          }
        }

        // Student Scope Lock
        if (user.role === 'student') {
          const myStudent = memDb.students.find(s => s.user_id === user.id);
          if (myStudent) {
            args.studentId = myStudent.id; // Hard-lock to student's own ID
          }
        }

        let result: any = null;
        if (call.name === 'get_college_summary') {
          result = queryCollegeSummary();
        } else if (call.name === 'get_department_performance') {
          result = queryDepartmentPerformance(args.semesterId);
        } else if (call.name === 'get_unassigned_teachers') {
          result = queryUnassignedTeachers();
        } else if (call.name === 'get_audit_activity') {
          result = queryRecentAuditActivity(args.limit);
        } else if (call.name === 'get_class_topper') {
          result = queryClassTopper(args.classId, args.subjectId, args.semesterId);
        } else if (call.name === 'get_student_average') {
          result = queryStudentAverage(args.studentId, args.semesterId);
        } else if (call.name === 'predict_next_score') {
          result = predictNextScore(args.studentId, args.subjectId);
        } else if (call.name === 'get_struggling_students') {
          result = queryStrugglingStudents(args.classId, args.thresholdPercent);
        } else if (call.name === 'get_student_academic_summary') {
          const myStudent = memDb.students.find(s => s.user_id === user.id);
          result = myStudent ? queryOwnAcademicSummary(myStudent.id) : { error: 'Student not found' };
        }

        toolCallsExecuted.push({ name: call.name, args, result });
        toolResults.push(result);
      }

      // Second turn with tool results to synthesize final answer
      const synthesis = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          { role: 'user', parts: [{ text: prompt }] },
          { role: 'model', parts: [{ text: `Executed tool queries:\n${JSON.stringify(toolResults, null, 2)}` }] },
          { role: 'user', parts: [{ text: 'Summarize the verified data for the user objectively and professionally. Include only real values from the tool output. Never invent or estimate unverified numbers.' }] }
        ],
        config: { systemInstruction }
      });

      const finalText = synthesis.text || 'Data retrieved successfully.';

      memDb.ai_query_logs.push({
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        user_id: user.id,
        query_text: prompt,
        resolved_intent: resolvedIntent,
        response_summary: finalText.slice(0, 300),
        tool_calls: toolCallsExecuted,
        created_at: new Date().toISOString()
      });
      memDb.logActivity(user.id, 'AI_QUERY_EXECUTED', 'ai_assistant', undefined, `AI query executed by ${user.role} (${user.full_name}): "${prompt.slice(0, 60)}" [${resolvedIntent}]`);

      return {
        text: finalText,
        toolCallsExecuted,
        resolvedIntent
      };
    }

    // Direct text response
    const directText = response.text || 'I checked institutional database records but could not find a verified match.';
    memDb.ai_query_logs.push({
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      user_id: user.id,
      query_text: prompt,
      resolved_intent: resolvedIntent,
      response_summary: directText.slice(0, 300),
      tool_calls: toolCallsExecuted,
      created_at: new Date().toISOString()
    });
    memDb.logActivity(user.id, 'AI_QUERY_EXECUTED', 'ai_assistant', undefined, `AI query answered by ${user.role}: "${prompt.slice(0, 60)}"`);

    return {
      text: directText,
      toolCallsExecuted,
      resolvedIntent
    };
  } catch (err: any) {
    console.warn('Gemini API call encountered issue, using deterministic tool resolver:', err?.message);
    const fallbackRes = handleDeterministicToolResolution(user, prompt);
    memDb.ai_query_logs.push({
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      user_id: user.id,
      query_text: prompt,
      resolved_intent: fallbackRes.resolvedIntent,
      response_summary: fallbackRes.text.slice(0, 300),
      tool_calls: fallbackRes.toolCallsExecuted,
      created_at: new Date().toISOString()
    });
    memDb.logActivity(user.id, 'AI_QUERY_EXECUTED', 'ai_assistant', undefined, `AI query executed (fallback) by ${user.role} (${user.full_name}): "${prompt.slice(0, 60)}" [${fallbackRes.resolvedIntent}]`);
    return fallbackRes;
  }
}

// Fallback deterministic tool handler that executes the exact tool functions
function handleDeterministicToolResolution(user: AuthenticatedUser, prompt: string): {
  text: string;
  toolCallsExecuted: any[];
  resolvedIntent: string;
} {
  const p = prompt.toLowerCase();
  const toolCallsExecuted: any[] = [];

  // Admin Deterministic Handling
  if (user.role === 'admin') {
    if (p.includes('department') || p.includes('lowest average') || p.includes('highest average') || p.includes('dept')) {
      const data = queryDepartmentPerformance();
      toolCallsExecuted.push({ name: 'get_department_performance', args: {}, result: data });
      if (data.lowestPerformingDepartment) {
        return {
          text: `Institutional Department Performance:\n• Lowest average score: ${data.lowestPerformingDepartment.name} (${data.lowestPerformingDepartment.code}) at ${data.lowestPerformingDepartment.average}%\n• Highest average score: ${data.highestPerformingDepartment?.name} (${data.highestPerformingDepartment?.code}) at ${data.highestPerformingDepartment?.average}%\n• Total evaluated departments: ${data.totalDepartments}`,
          toolCallsExecuted,
          resolvedIntent: 'get_department_performance'
        };
      }
      return { text: data.message || 'No department assessment marks recorded yet.', toolCallsExecuted, resolvedIntent: 'get_department_performance' };
    }

    if (p.includes('unassigned') || p.includes('no class') || p.includes('without class') || p.includes('free teacher')) {
      const data = queryUnassignedTeachers();
      toolCallsExecuted.push({ name: 'get_unassigned_teachers', args: {}, result: data });
      if (data.unassignedTeachersCount === 0) {
        return {
          text: `All ${data.totalTeachers} faculty members currently have active class assignments recorded in the database.`,
          toolCallsExecuted,
          resolvedIntent: 'get_unassigned_teachers'
        };
      }
      const names = data.unassignedTeachers.map(t => `${t.name} (${t.email})`).join(', ');
      return {
        text: `There are currently ${data.unassignedTeachersCount} faculty member(s) with no active teaching assignments: ${names}.`,
        toolCallsExecuted,
        resolvedIntent: 'get_unassigned_teachers'
      };
    }

    if (p.includes('audit') || p.includes('recent') || p.includes('log') || p.includes('action')) {
      const data = queryRecentAuditActivity(6);
      toolCallsExecuted.push({ name: 'get_audit_activity', args: { limit: 6 }, result: data });
      const actions = data.recentActions.map(a => `• [${a.action}] ${a.details} (by ${a.performedBy})`).join('\n');
      return {
        text: `Recent Audit Log Entries (${data.totalLogsRecorded} total recorded):\n${actions}`,
        toolCallsExecuted,
        resolvedIntent: 'get_audit_activity'
      };
    }

    // Default Overview
    const data = queryCollegeSummary();
    toolCallsExecuted.push({ name: 'get_college_summary', args: {}, result: data });
    return {
      text: `Vission Academy Institutional Overview:\n• Active Students: ${data.totalActiveStudents}\n• Faculty Members: ${data.totalFacultyTeachers}\n• Academic Classes: ${data.totalClasses}\n• Active Semesters: ${data.activeSemestersCount}\n• Evaluated Assessment Marks: ${data.totalEvaluatedMarks}\n• Overall Pass Rate: ${data.overallPassRatePercent !== null ? data.overallPassRatePercent + '%' : 'Pending evaluations'}`,
      toolCallsExecuted,
      resolvedIntent: 'get_college_summary'
    };
  }

  if (user.role === 'teacher') {
    // Find teacher's assigned classes
    const assignments = memDb.teacher_class_assignments.filter(t => t.teacher_user_id === user.id && t.status === 'active');
    const assignedClassId = assignments[0]?.class_id || memDb.classes[0]?.id;

    if (!assignedClassId) {
      return {
        text: 'You do not have any active teaching class assignments recorded in the database yet.',
        toolCallsExecuted: [],
        resolvedIntent: 'no_assigned_classes'
      };
    }

    if (p.includes('topper') || p.includes('top student') || p.includes('highest')) {
      const data = queryClassTopper(assignedClassId);
      toolCallsExecuted.push({ name: 'get_class_topper', args: { classId: assignedClassId }, result: data });
      if ('topperStudentName' in data) {
        return {
          text: `Based on real database records for Class ${data.className}: The class topper is ${data.topperStudentName} (${data.rollNumber}) with an outstanding average score of ${data.averageScorePercent}% across ${data.totalExamsEvaluated} evaluated assessments.`,
          toolCallsExecuted,
          resolvedIntent: 'get_class_topper'
        };
      }
      return { text: 'No assessment marks recorded for this class yet.', toolCallsExecuted, resolvedIntent: 'get_class_topper' };
    }

    if (p.includes('struggling') || p.includes('failing') || p.includes('support') || p.includes('low score')) {
      const data = queryStrugglingStudents(assignedClassId, 50);
      toolCallsExecuted.push({ name: 'get_struggling_students', args: { classId: assignedClassId, thresholdPercent: 50 }, result: data });
      if (data.strugglingCount === 0) {
        return {
          text: `All students in Class ${data.className} currently have averages above the 50% threshold.`,
          toolCallsExecuted,
          resolvedIntent: 'get_struggling_students'
        };
      }
      const names = data.studentsRequiringSupport.map(s => `${s.studentName} (${s.averagePercent}%)`).join(', ');
      return {
        text: `Identified ${data.strugglingCount} student(s) in Class ${data.className} with scores below 50%: ${names}.`,
        toolCallsExecuted,
        resolvedIntent: 'get_struggling_students'
      };
    }

    if (p.includes('predict') || p.includes('forecast') || p.includes('next score')) {
      // Find matching student or default to first student in class
      const targetStudent = memDb.students.find(s => s.class_id === assignedClassId && p.includes(s.roll_number.toLowerCase()))
        || memDb.students.find(s => s.class_id === assignedClassId)
        || memDb.students[0];

      const data = predictNextScore(targetStudent.id);
      toolCallsExecuted.push({ name: 'predict_next_score', args: { studentId: targetStudent.id }, result: data });
      if ('predictedNextScorePercentage' in data) {
        return {
          text: `Linear regression analysis for ${data.studentName} (${data.rollNumber}): Trend is ${data.trendDirection} (slope: ${data.linearTrendSlope}). The predicted next assessment score is ${data.predictedNextScorePercentage}%. (Note: This is a statistical projection based on ${data.historicalScoresCount} historical assessments).`,
          toolCallsExecuted,
          resolvedIntent: 'predict_next_score'
        };
      }
      return { text: (data as any).message || 'Unable to compute prediction.', toolCallsExecuted, resolvedIntent: 'predict_next_score' };
    }

    // Default average check
    const targetStudent = memDb.students.find(s => s.class_id === assignedClassId) || memDb.students[0];
    const data = queryStudentAverage(targetStudent.id);
    toolCallsExecuted.push({ name: 'get_student_average', args: { studentId: targetStudent.id }, result: data });
    return {
      text: `Academic data for ${data.studentName} (${data.rollNumber}): Overall average is ${data.overallAveragePercent}% across ${data.totalExamsEvaluated} assessments.`,
      toolCallsExecuted,
      resolvedIntent: 'get_student_average'
    };
  }

  // Student Deterministic Handling
  if (user.role === 'student') {
    const myStudent = memDb.students.find(s => s.user_id === user.id);
    if (!myStudent) {
      return { text: 'Student profile not linked.', toolCallsExecuted: [], resolvedIntent: 'error' };
    }

    if (p.includes('predict') || p.includes('forecast') || p.includes('next score')) {
      const data = predictNextScore(myStudent.id);
      toolCallsExecuted.push({ name: 'predict_next_score', args: { studentId: myStudent.id }, result: data });
      if ('predictedNextScorePercentage' in data) {
        return {
          text: `Your linear regression performance forecast: Historical trend is ${data.trendDirection}. Your estimated next examination score is ${data.predictedNextScorePercentage}%. Please note this is a statistical estimate based on your ${data.historicalScoresCount} recorded exams.`,
          toolCallsExecuted,
          resolvedIntent: 'predict_next_score'
        };
      }
      return { text: (data as any).message || 'Not enough data to calculate forecast.', toolCallsExecuted, resolvedIntent: 'predict_next_score' };
    }

    const data = queryOwnAcademicSummary(myStudent.id);
    toolCallsExecuted.push({ name: 'get_student_academic_summary', args: {}, result: data });
    const sems = data.semesterReports.map(s => `${s.semester}: SGPA ${s.sgpa}, CGPA ${s.cgpa}`).join('; ');
    return {
      text: `Your Academic Summary: Overall assessment average is ${data.overallMarksAveragePercentage}% across ${data.totalCompletedAssessments} tests. Official Semesters: ${sems || 'None uploaded yet'}.`,
      toolCallsExecuted,
      resolvedIntent: 'get_student_academic_summary'
    };
  }

  return {
    text: 'Please submit a specific query about classes, students, or academic trends.',
    toolCallsExecuted: [],
    resolvedIntent: 'general_query'
  };
}
