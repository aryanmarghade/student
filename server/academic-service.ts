import { query } from './db.js';

export interface AcademicSemesterResult {
  semesterId: string;
  semesterName: string;
  semesterNumber: number;
  totalObtained: number;
  totalMax: number;
  percentage: number;
  sgpa: number | null;
  cgpa: number | null;
  result: 'Pass' | 'Fail';
  backlogCount: number;
  backlogSubjects: Array<{ subjectId: string; subjectName: string; subjectCode: string }>;
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
    cgpa: null
  };
}

export async function calculateAcademicHistoryBulk(studentIds: string[]): Promise<Record<string, StudentAcademicHistory>> {
  if (!studentIds.length) return {};

  const [marksRes, marksheetsRes, semestersRes] = await Promise.all([
    query<any>(
      `SELECT m.*, sem.semester_number, sem.name AS semester_name, sub.name AS subject_name, sub.code AS subject_code 
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
    query<any>(`SELECT * FROM semesters ORDER BY semester_number ASC`)
  ]);

  const allSemesters = semestersRes.rows;
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
      cgpa: null
    };
  }

  // Group marks by student -> semester -> subject
  const marksMap = new Map<string, Map<string, Map<string, {
    subjectName: string;
    subjectCode: string;
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
        semesterNumber: m.semester_number,
        semesterName: m.semester_name,
        totalObtained: 0,
        totalMax: 0
      });
    }
    const subjData = semSubjects.get(m.subject_id)!;
    subjData.totalObtained += Number(m.marks_obtained);
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
    let latestCgpa = null;
    
    const subjectLatestAttempt = new Map<string, { passed: boolean, semesterNumber: number, semesterName: string, subjectName: string, subjectCode: string }>();

    if (studentSems) {
      // Process semesters ordered by semester_number
      const sortedSemIds = Array.from(studentSems.keys()).sort((a, b) => {
        const sA = allSemesters.find(s => s.id === a);
        const sB = allSemesters.find(s => s.id === b);
        return (sA?.semester_number || 0) - (sB?.semester_number || 0);
      });

      for (const semId of sortedSemIds) {
        const sem = allSemesters.find(s => s.id === semId)!;
        const semSubjects = studentSems.get(semId)!;
        const ms = msMap.get(sId)?.get(semId);
        
        let semObtained = 0;
        let semMax = 0;
        let semBacklogs = 0;
        const backlogSubjects: any[] = [];
        let hasFailedSubject = false;
        
        for (const [subjId, subjData] of semSubjects.entries()) {
          semObtained += subjData.totalObtained;
          semMax += subjData.totalMax;
          const pct = subjData.totalMax > 0 ? (subjData.totalObtained / subjData.totalMax) : 0;
          const passed = pct >= 0.40;
          
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
        
        if (ms && ms.cgpa) latestCgpa = Number(ms.cgpa);
        
        studentHistory.semesters.push({
          semesterId: sem.id,
          semesterName: sem.name,
          semesterNumber: sem.semester_number,
          totalObtained: semObtained,
          totalMax: semMax,
          percentage: semPct,
          sgpa: ms ? Number(ms.sgpa) : null,
          cgpa: ms ? Number(ms.cgpa) : null,
          result: semResult,
          backlogCount: semBacklogs,
          backlogSubjects
        });
        
        if (!latestSemester || sem.semester_number > latestSemester.semester_number) {
          latestSemester = sem;
        }
      }
    }
    
    // Calculate current backlogs from subjectLatestAttempt
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
    
    if (latestSemester) {
      studentHistory.currentSemesterId = latestSemester.id;
      studentHistory.currentSemesterName = latestSemester.name;
      studentHistory.currentSemesterNumber = latestSemester.semester_number;
    }
    studentHistory.cgpa = latestCgpa;
  }

  return result;
}
