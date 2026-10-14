import { query } from './db.js';

export interface InstitutionalGradeRule {
  grade: string;
  minPercentage: number;
  maxPercentage: number;
  gradePoint: number;
  description: string;
  isPassing: boolean;
}

export interface AcademicSubjectResult {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  credits: number;
  obtained: number;
  max: number;
  percentage: number;
  grade: string;
  gradePoint: number;
  creditPoints: number;
  status: 'Pass' | 'Fail';
}

export interface AcademicSemesterResult {
  semesterId: string;
  semesterName: string;
  semesterNumber: number;
  totalObtained: number;
  totalMax: number;
  percentage: number;
  sgpa: number | null;
  cgpa: number | null;
  isOfficialSgpa: boolean;
  isOfficialCgpa: boolean;
  calculationMethod: string;
  ruleVersion: string;
  totalCredits: number;
  totalCreditPoints: number;
  result: 'Pass' | 'Fail';
  backlogCount: number;
  backlogSubjects: Array<{ subjectId: string; subjectName: string; subjectCode: string }>;
  subjects: AcademicSubjectResult[];
}

export interface StudentAcademicHistory {
  studentId: string;
  currentSemesterId: string | null;
  currentSemesterName: string | null;
  currentSemesterNumber: number | null;
  currentBacklogsCount: number;
  totalBacklogsCount: number;
  currentBacklogSubjects: Array<{ subjectId: string; subjectName: string; subjectCode: string; semesterName: string }>;
  semesters: AcademicSemesterResult[];
  cgpa: number | null;
  isOfficialCgpa: boolean;
  gradingScale: string;
}

const DEFAULT_GRADING_RULES: InstitutionalGradeRule[] = [
  { grade: 'O', minPercentage: 90.0, maxPercentage: 100.0, gradePoint: 10.0, description: 'Outstanding', isPassing: true },
  { grade: 'A+', minPercentage: 80.0, maxPercentage: 89.99, gradePoint: 9.0, description: 'Excellent', isPassing: true },
  { grade: 'A', minPercentage: 70.0, maxPercentage: 79.99, gradePoint: 8.0, description: 'Very Good', isPassing: true },
  { grade: 'B+', minPercentage: 60.0, maxPercentage: 69.99, gradePoint: 7.0, description: 'Good', isPassing: true },
  { grade: 'B', minPercentage: 55.0, maxPercentage: 59.99, gradePoint: 6.0, description: 'Above Average', isPassing: true },
  { grade: 'C', minPercentage: 50.0, maxPercentage: 54.99, gradePoint: 5.0, description: 'Average', isPassing: true },
  { grade: 'P', minPercentage: 40.0, maxPercentage: 49.99, gradePoint: 4.0, description: 'Pass', isPassing: true },
  { grade: 'F', minPercentage: 0.0, maxPercentage: 39.99, gradePoint: 0.0, description: 'Fail (Backlog)', isPassing: false },
];

export function lookupGrade(percentage: number, rules: InstitutionalGradeRule[] = DEFAULT_GRADING_RULES): { grade: string; gradePoint: number; isPassing: boolean; description: string } {
  for (const r of rules) {
    if (percentage >= r.minPercentage && percentage <= r.maxPercentage) {
      return { grade: r.grade, gradePoint: Number(r.gradePoint), isPassing: r.isPassing, description: r.description };
    }
  }
  if (percentage < 40) {
    return { grade: 'F', gradePoint: 0.0, isPassing: false, description: 'Fail (Backlog)' };
  }
  return { grade: 'P', gradePoint: 4.0, isPassing: true, description: 'Pass' };
}

export async function getInstitutionalGradingRules(): Promise<InstitutionalGradeRule[]> {
  try {
    const res = await query<any>(`SELECT grade, min_percentage, max_percentage, grade_point, description, is_passing FROM institutional_grading_rules ORDER BY min_percentage DESC`);
    if (res.rows.length > 0) {
      return res.rows.map(r => ({
        grade: r.grade,
        minPercentage: Number(r.min_percentage),
        maxPercentage: Number(r.max_percentage),
        gradePoint: Number(r.grade_point),
        description: r.description || '',
        isPassing: Boolean(r.is_passing)
      }));
    }
  } catch (_err) {}
  return DEFAULT_GRADING_RULES;
}

export async function calculateAcademicHistory(studentId: string): Promise<StudentAcademicHistory> {
  const historyMap = await calculateAcademicHistoryBulk([studentId]);
  return historyMap[studentId] || {
    studentId,
    currentSemesterId: null,
    currentSemesterName: null,
    currentSemesterNumber: null,
    currentBacklogsCount: 0,
    totalBacklogsCount: 0,
    currentBacklogSubjects: [],
    semesters: [],
    cgpa: null,
    isOfficialCgpa: false,
    gradingScale: 'UGC 10-Point Credit-Weighted Scale'
  };
}

export async function calculateAcademicHistoryBulk(studentIds: string[]): Promise<Record<string, StudentAcademicHistory>> {
  if (!studentIds.length) return {};

  const [studentsRes, marksRes, marksheetsRes, semestersRes, rules] = await Promise.all([
    query<any>(
      `SELECT s.id, s.class_id, c.year AS class_year
       FROM students s
       LEFT JOIN classes c ON s.class_id = c.id
       WHERE s.id = ANY($1)`,
      [studentIds]
    ),
    query<any>(
      `SELECT m.*, sem.semester_number, sem.name AS semester_name, sub.name AS subject_name, sub.code AS subject_code, COALESCE(sub.credits, 3) AS subject_credits
       FROM marks m
       JOIN semesters sem ON sem.id = m.semester_id
       JOIN subjects sub ON sub.id = m.subject_id
       WHERE m.student_id = ANY($1)
       ORDER BY sem.semester_number ASC`,
      [studentIds]
    ),
    query<any>(
      `SELECT * FROM marksheets WHERE student_id = ANY($1) ORDER BY created_at ASC`,
      [studentIds]
    ),
    query<any>(`SELECT * FROM semesters ORDER BY semester_number ASC`),
    getInstitutionalGradingRules()
  ]);

  const allSemesters = semestersRes.rows;
  const studentYearMap = new Map<string, number>();
  for (const st of studentsRes.rows) {
    if (st.class_year) studentYearMap.set(st.id, Number(st.class_year));
  }

  const result: Record<string, StudentAcademicHistory> = {};
  
  for (const sId of studentIds) {
    result[sId] = {
      studentId: sId,
      currentSemesterId: null,
      currentSemesterName: null,
      currentSemesterNumber: null,
      currentBacklogsCount: 0,
      totalBacklogsCount: 0,
      currentBacklogSubjects: [],
      semesters: [],
      cgpa: null,
      isOfficialCgpa: false,
      gradingScale: 'UGC 10-Point Credit-Weighted Scale (AICTE/UGC Guidelines)'
    };
  }

  // Group marks by student -> semester -> subject
  const marksMap = new Map<string, Map<string, Map<string, {
    subjectName: string;
    subjectCode: string;
    credits: number;
    semesterNumber: number;
    semesterName: string;
    totalObtained: number;
    totalMax: number;
  }>>>();

  for (const m of marksRes.rows) {
    if (!marksMap.has(m.student_id)) marksMap.set(m.student_id, new Map());
    const studentSems = marksMap.get(m.student_id)!;
    if (!studentSems.has(m.semester_id)) studentSems.set(m.semester_id, new Map());
    const semSubjects = studentSems.get(m.semester_id)!;
    
    if (!semSubjects.has(m.subject_id)) {
      semSubjects.set(m.subject_id, {
        subjectName: m.subject_name,
        subjectCode: m.subject_code,
        credits: Number(m.subject_credits) || 3,
        semesterNumber: m.semester_number,
        semesterName: m.semester_name,
        totalObtained: 0,
        totalMax: 0
      });
    }
    const subjData = semSubjects.get(m.subject_id)!;
    if (m.marks_obtained !== null && m.marks_obtained !== undefined) {
      subjData.totalObtained += Number(m.marks_obtained);
    }
    subjData.totalMax += Number(m.max_marks);
  }

  // Group marksheets by student -> semester
  const msMap = new Map<string, Map<string, any>>();
  for (const ms of marksheetsRes.rows) {
    if (!msMap.has(ms.student_id)) msMap.set(ms.student_id, new Map());
    msMap.get(ms.student_id)!.set(ms.semester_id, ms);
  }

  for (const sId of studentIds) {
    const studentHistory = result[sId];
    const studentSems = marksMap.get(sId);
    
    let latestSemester: any = null;
    let latestCgpa: number | null = null;
    let isLatestOfficialCgpa = false;
    
    const subjectLatestAttempt = new Map<string, { passed: boolean, semesterNumber: number, semesterName: string, subjectName: string, subjectCode: string }>();

    if (studentSems) {
      const sortedSemIds = Array.from(studentSems.keys()).sort((a, b) => {
        const sA = allSemesters.find(s => s.id === a);
        const sB = allSemesters.find(s => s.id === b);
        return (sA?.semester_number || 0) - (sB?.semester_number || 0);
      });

      let cumulativeCredits = 0;
      let cumulativeCreditPoints = 0;

      for (const semId of sortedSemIds) {
        const sem = allSemesters.find(s => s.id === semId)!;
        const semSubjects = studentSems.get(semId)!;
        const ms = msMap.get(sId)?.get(semId);
        
        let semObtained = 0;
        let semMax = 0;
        let semCredits = 0;
        let semCreditPoints = 0;
        let semBacklogs = 0;
        const backlogSubjects: any[] = [];
        const subjects: AcademicSubjectResult[] = [];
        let hasFailedSubject = false;
        
        for (const [subjId, subjData] of semSubjects.entries()) {
          semObtained += subjData.totalObtained;
          semMax += subjData.totalMax;
          const pct = subjData.totalMax > 0 ? (subjData.totalObtained / subjData.totalMax) * 100 : 0;
          const gradeInfo = lookupGrade(pct, rules);
          const passed = gradeInfo.isPassing;
          const credits = subjData.credits;
          const creditPts = credits * gradeInfo.gradePoint;
          
          semCredits += credits;
          semCreditPoints += creditPts;

          subjects.push({
            subjectId: subjId,
            subjectName: subjData.subjectName,
            subjectCode: subjData.subjectCode,
            credits,
            obtained: Number(subjData.totalObtained.toFixed(2)),
            max: Number(subjData.totalMax.toFixed(2)),
            percentage: Number(pct.toFixed(2)),
            grade: gradeInfo.grade,
            gradePoint: gradeInfo.gradePoint,
            creditPoints: Number(creditPts.toFixed(2)),
            status: passed ? 'Pass' : 'Fail'
          });

          if (!passed) {
            hasFailedSubject = true;
            semBacklogs++;
            studentHistory.totalBacklogsCount++;
            backlogSubjects.push({ subjectId: subjId, subjectName: subjData.subjectName, subjectCode: subjData.subjectCode });
          }
          
          subjectLatestAttempt.set(subjId, {
            passed,
            semesterNumber: sem.semester_number,
            semesterName: sem.name,
            subjectName: subjData.subjectName,
            subjectCode: subjData.subjectCode
          });
        }
        
        const semPct = semMax > 0 ? (semObtained / semMax) * 100 : 0;
        const semResult = hasFailedSubject ? 'Fail' : 'Pass';
        
        // Exact Institutional Credit-Weighted SGPA
        const calculatedSgpa = semCredits > 0 ? Number((semCreditPoints / semCredits).toFixed(2)) : null;
        const isOfficialSgpa = Boolean(ms && ms.sgpa && Number(ms.sgpa) > 0);
        const finalSgpa = isOfficialSgpa ? Number(Number(ms.sgpa).toFixed(2)) : calculatedSgpa;

        cumulativeCredits += semCredits;
        cumulativeCreditPoints += semCreditPoints;
        const calculatedCgpa = cumulativeCredits > 0 ? Number((cumulativeCreditPoints / cumulativeCredits).toFixed(2)) : null;
        const isOfficialCgpa = Boolean(ms && ms.cgpa && Number(ms.cgpa) > 0);
        const finalCgpa = isOfficialCgpa ? Number(Number(ms.cgpa).toFixed(2)) : calculatedCgpa;

        studentHistory.semesters.push({
          semesterId: sem.id,
          semesterName: sem.name,
          semesterNumber: sem.semester_number,
          totalObtained: Number(semObtained.toFixed(2)),
          totalMax: Number(semMax.toFixed(2)),
          percentage: Number(semPct.toFixed(2)),
          sgpa: finalSgpa,
          cgpa: finalCgpa,
          isOfficialSgpa,
          isOfficialCgpa,
          calculationMethod: isOfficialSgpa ? 'OFFICIAL_UPLOADED_MARKSHEET' : 'CREDIT_WEIGHTED_UGC_10_POINT_SCALE',
          ruleVersion: 'VISSION_UGC_2026_V1',
          totalCredits: semCredits,
          totalCreditPoints: Number(semCreditPoints.toFixed(2)),
          result: semResult,
          backlogCount: semBacklogs,
          backlogSubjects,
          subjects
        });
        
        if (!latestSemester || sem.semester_number > latestSemester.semester_number) {
          latestSemester = sem;
          latestCgpa = finalCgpa;
          isLatestOfficialCgpa = isOfficialCgpa;
        }
      }
    }
    
    // Calculate current active backlogs from subjectLatestAttempt
    for (const [subjId, attempt] of subjectLatestAttempt.entries()) {
      if (!attempt.passed) {
        studentHistory.currentBacklogsCount++;
        studentHistory.currentBacklogSubjects.push({
          subjectId: subjId,
          subjectName: attempt.subjectName,
          subjectCode: attempt.subjectCode,
          semesterName: attempt.semesterName
        });
      }
    }
    
    // Derive current semester from student's class year level
    const classYear = studentYearMap.get(sId);
    if (classYear) {
      const expectedSemNum = (classYear * 2) - 1;
      const targetSem = allSemesters.find(s => s.semester_number === expectedSemNum);
      if (targetSem) {
        studentHistory.currentSemesterId = targetSem.id;
        studentHistory.currentSemesterName = targetSem.name;
        studentHistory.currentSemesterNumber = targetSem.semester_number;
      }
    } else if (latestSemester) {
      studentHistory.currentSemesterId = latestSemester.id;
      studentHistory.currentSemesterName = latestSemester.name;
      studentHistory.currentSemesterNumber = latestSemester.semester_number;
    }
    studentHistory.cgpa = latestCgpa;
    studentHistory.isOfficialCgpa = isLatestOfficialCgpa;
  }

  return result;
}
