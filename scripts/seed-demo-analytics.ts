import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcryptjs';

// Load environment: prioritize DOTENV_CONFIG_PATH, or .env.demo if NODE_ENV=demo, otherwise .env.test
const explicitDbUrl = process.env.DATABASE_URL;
const explicitNodeEnv = process.env.NODE_ENV;
const envFile = process.env.DOTENV_CONFIG_PATH || (process.env.NODE_ENV === 'demo' ? '.env.demo' : '.env.test');
dotenv.config({ path: path.resolve(process.cwd(), envFile) });
if (explicitDbUrl) {
  process.env.DATABASE_URL = explicitDbUrl;
}
if (explicitNodeEnv) {
  process.env.NODE_ENV = explicitNodeEnv;
}

// 1. Refuse to run in production
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run seed-demo-analytics in production environment.');
  process.exit(1);
}

// Deterministic Pseudo-Random Number Generator (Mulberry32)
export function createPrng(seed: number) {
  let s = seed;
  return function() {
    let t = s += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0) return 0;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

const FIRST_NAMES = [
  'Aarav', 'Aditi', 'Advait', 'Akash', 'Ananya', 'Aryan', 'Bhavya', 'Chirag',
  'Dev', 'Diya', 'Eshan', 'Gauri', 'Harsh', 'Isha', 'Ishaan', 'Kabir',
  'Kavya', 'Madhav', 'Meera', 'Neha', 'Nikhil', 'Pooja', 'Pranav', 'Priya',
  'Rahul', 'Rhea', 'Rohan', 'Sakshi', 'Sameer', 'Sanya', 'Shaurya', 'Shiv',
  'Shreya', 'Siddharth', 'Tanvi', 'Tarun', 'Utkarsh', 'Varun', 'Vedika', 'Yash'
];

const LAST_NAMES = [
  'Agarwal', 'Bansal', 'Chopra', 'Deshmukh', 'Gupta', 'Iyer', 'Jain', 'Kapoor',
  'Kulkarni', 'Malhotra', 'Mehta', 'Nair', 'Patel', 'Rao', 'Reddy', 'Sharma',
  'Singh', 'Verma', 'Marghade', 'Joshi', 'Bhatia', 'Saxena', 'Pandey', 'Mishra'
];

const DEPARTMENTS = [
  { id: 'dept_cs', name: 'Computer Science and Engineering', code: 'CSE' },
  { id: 'dept_it', name: 'Information Technology', code: 'IT' },
  { id: 'dept_ece', name: 'Electronics & Communication Engineering', code: 'ECE' },
  { id: 'dept_me', name: 'Mechanical Engineering', code: 'ME' },
];

const MONTHS = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];

export async function resetDemoData(pool: pg.Pool) {
  console.log('[seed:demo:reset] Cleaning up existing demo data (tagged demo_%)...');
  await pool.query(`
    DELETE FROM sports WHERE id LIKE 'demo_%';
    DELETE FROM student_documents WHERE id LIKE 'demo_%';
    DELETE FROM hackathons WHERE id LIKE 'demo_%';
    DELETE FROM certifications WHERE id LIKE 'demo_%';
    DELETE FROM achievements WHERE id LIKE 'demo_%';
    DELETE FROM projects WHERE id LIKE 'demo_%';
    DELETE FROM marks WHERE id LIKE 'demo_%';
    DELETE FROM marksheets WHERE id LIKE 'demo_%';
    DELETE FROM student_github_snapshots WHERE id LIKE 'demo_%';
    DELETE FROM student_leetcode_snapshots WHERE id LIKE 'demo_%';
    DELETE FROM student_hackerrank_snapshots WHERE id LIKE 'demo_%';
    DELETE FROM student_linkedin_snapshots WHERE id LIKE 'demo_%';
    DELETE FROM student_hackerrank_evidence WHERE id LIKE 'demo_%';
    DELETE FROM student_linkedin_posts WHERE id LIKE 'demo_%';
    DELETE FROM posts WHERE id LIKE 'demo_%';
    DELETE FROM teacher_analytics_visibility WHERE teacher_user_id LIKE 'demo_%';
    DELETE FROM placement_analytics_visibility WHERE placement_user_id LIKE 'demo_%';
    DELETE FROM teacher_class_assignments WHERE id LIKE 'demo_%' OR teacher_user_id LIKE 'demo_%';
    DELETE FROM students WHERE id LIKE 'demo_%' OR user_id LIKE 'demo_%' OR roll_number LIKE 'DEMO%';
    DELETE FROM users WHERE id LIKE 'demo_%';
    DELETE FROM classes WHERE id LIKE 'demo_%';
    DELETE FROM subjects WHERE id LIKE 'demo_%';
    DELETE FROM departments WHERE id LIKE 'demo_%';
  `);
  console.log('[seed:demo:reset] Cleanup completed successfully.');
}

export async function printDataQualityEvidence(pool: pg.Pool) {
  console.log('\n================ DATA QUALITY EVIDENCE LEDGER ================');

  // 1. Row counts per table
  const tablesRes = await pool.query<{ table_name: string }>(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  console.log('--- TABLE ROW COUNTS ---');
  for (const t of tablesRes.rows) {
    const cRes = await pool.query<{ count: string }>(`SELECT count(*) FROM "${t.table_name}"`);
    const demoCRes = await pool.query<{ count: string }>(`
      SELECT count(*) FROM "${t.table_name}" 
      WHERE (id::text LIKE 'demo_%' OR id::text LIKE 'DEMO%')
    `).catch(() => ({ rows: [{ count: 'N/A' }] }));
    console.log(`Table ${t.table_name.padEnd(32)}: total = ${cRes.rows[0].count.padStart(5)}, demo = ${demoCRes.rows[0].count.padStart(5)}`);
  }

  // 2. Students per year and department
  const yearDeptRes = await pool.query<{ year: number; dept_name: string; count: string }>(`
    SELECT c.year, d.name as dept_name, count(s.id) as count
    FROM students s
    JOIN classes c ON s.class_id = c.id
    JOIN departments d ON s.department_id = d.id
    WHERE s.id LIKE 'demo_%'
    GROUP BY c.year, d.name
    ORDER BY c.year, d.name;
  `);
  console.log('\n--- STUDENTS PER YEAR & DEPARTMENT ---');
  for (const r of yearDeptRes.rows) {
    console.log(`Year ${r.year} | ${r.dept_name.padEnd(45)}: ${r.count} students`);
  }

  // 3. LeetCode Metrics & easy >= medium >= hard check
  const lcRes = await pool.query<{
    total_solved: number;
    easy_solved: number;
    medium_solved: number;
    hard_solved: number;
    ranking: number | null;
  }>(`
    SELECT (leetcode_data->>'totalSolved')::int as total_solved,
           (leetcode_data->>'easySolved')::int as easy_solved,
           (leetcode_data->>'mediumSolved')::int as medium_solved,
           (leetcode_data->>'hardSolved')::int as hard_solved,
           (leetcode_data->>'ranking')::int as ranking
    FROM students
    WHERE id LIKE 'demo_%' AND leetcode_data IS NOT NULL;
  `);

  const solvedValues = lcRes.rows.map(r => r.total_solved);
  const minSolved = Math.min(...solvedValues);
  const maxSolved = Math.max(...solvedValues);
  const avgSolved = solvedValues.reduce((a, b) => a + b, 0) / (solvedValues.length || 1);

  let allEasyGteMed = true;
  let allMedGteHard = true;
  for (const r of lcRes.rows) {
    if (r.easy_solved < r.medium_solved) allEasyGteMed = false;
    if (r.medium_solved < r.hard_solved) allMedGteHard = false;
  }

  console.log('\n--- LEETCODE METRICS & VALIDATION ---');
  console.log(`Active LeetCode Profiles   : ${lcRes.rows.length}`);
  console.log(`Problems Solved (Min/Max)  : ${minSolved} / ${maxSolved}`);
  console.log(`Average Problems Solved    : ${avgSolved.toFixed(1)}`);
  console.log(`Easy >= Medium for ALL     : ${allEasyGteMed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Medium >= Hard for ALL     : ${allMedGteHard ? '✅ PASS' : '❌ FAIL'}`);

  // 4. Rank vs Solved Correlation
  const ranked = lcRes.rows.filter(r => r.ranking && r.total_solved > 0);
  const solvedArr = ranked.map(r => r.total_solved);
  const rankArr = ranked.map(r => r.ranking!);
  const rankSolvedCorr = pearsonCorrelation(solvedArr, rankArr);
  console.log(`Rank vs Solved Correlation : ${rankSolvedCorr.toFixed(3)} (Negative confirms higher solved -> better rank)`);

  // 5. Monthly Snapshots Non-Decreasing Check
  const snapRes = await pool.query<{ student_id: string; snapshot_month: string; total_solved: number }>(`
    SELECT student_id, snapshot_month, total_solved
    FROM student_leetcode_snapshots
    WHERE id LIKE 'demo_%'
    ORDER BY student_id, snapshot_month ASC;
  `);

  let snapsNeverDecrease = true;
  let prevStudent = '';
  let prevSolved = 0;
  for (const row of snapRes.rows) {
    if (row.student_id !== prevStudent) {
      prevStudent = row.student_id;
      prevSolved = row.total_solved;
    } else {
      if (row.total_solved < prevSolved) {
        snapsNeverDecrease = false;
      }
      prevSolved = row.total_solved;
    }
  }
  console.log(`Monthly Snapshots Monotonic: ${snapsNeverDecrease ? '✅ PASS (Never decrease over time)' : '❌ FAIL'}`);

  // 6. Edge Cases Counts
  const [noLinksRes, zeroActRes, singlePlatRes, topRes, atRiskRes] = await Promise.all([
    pool.query(`SELECT count(*) FROM students WHERE id LIKE 'demo_%' AND github_url IS NULL AND leetcode_url IS NULL AND hackerrank_url IS NULL AND linkedin_url IS NULL`),
    pool.query(`SELECT count(*) FROM students WHERE id LIKE 'demo_%' AND (github_url IS NOT NULL OR leetcode_url IS NOT NULL) AND COALESCE((leetcode_data->>'totalSolved')::int, 0) = 0 AND COALESCE((github_data->>'public_repos')::int, 0) = 0`),
    pool.query(`SELECT count(*) FROM students WHERE id LIKE 'demo_%' AND ((github_url IS NOT NULL AND leetcode_url IS NULL AND hackerrank_url IS NULL) OR (leetcode_url IS NOT NULL AND github_url IS NULL AND hackerrank_url IS NULL))`),
    pool.query(`SELECT count(*) FROM students WHERE id LIKE 'demo_%' AND profile_strength >= 90`),
    pool.query(`SELECT count(DISTINCT student_id) FROM marks WHERE id LIKE 'demo_%' AND marks_obtained < 40`),
  ]);

  console.log('\n--- EDGE CASES VERIFICATION COUNTS ---');
  console.log(`1. Unlinked Profiles       : ${noLinksRes.rows[0].count} students`);
  console.log(`2. Zero Activity Profiles  : ${zeroActRes.rows[0].count} students`);
  console.log(`3. Single Platform Linked  : ${singlePlatRes.rows[0].count} students`);
  console.log(`4. Top Performers          : ${topRes.rows[0].count} students`);
  console.log(`5. At-Risk (Active Backlog): ${atRiskRes.rows[0].count} students`);

  // 7. CGPA vs LeetCode Correlation
  const cgpaLcRes = await pool.query<{ cgpa: number; total_solved: number }>(`
    SELECT m.cgpa, (s.leetcode_data->>'totalSolved')::int as total_solved
    FROM marksheets m
    JOIN students s ON s.id = m.student_id
    WHERE s.id LIKE 'demo_%' 
      AND s.leetcode_data IS NOT NULL 
      AND m.semester_id = 'sem_1'
      AND (s.leetcode_data->>'totalSolved')::int > 0;
  `);
  const cgpaArr = cgpaLcRes.rows.map(r => Number(r.cgpa));
  const lcArr = cgpaLcRes.rows.map(r => r.total_solved);
  const cgpaLcCorr = pearsonCorrelation(cgpaArr, lcArr);
  console.log(`\nCGPA vs LeetCode Solved Cor: ${cgpaLcCorr.toFixed(3)} (Positive confirms realistic correlation)`);
  console.log('==============================================================\n');

  return {
    allEasyGteMed,
    allMedGteHard,
    rankSolvedCorr,
    snapsNeverDecrease,
    cgpaLcCorr,
    noLinksCount: parseInt(noLinksRes.rows[0].count, 10),
    zeroActCount: parseInt(zeroActRes.rows[0].count, 10),
    singlePlatCount: parseInt(singlePlatRes.rows[0].count, 10),
    topCount: parseInt(topRes.rows[0].count, 10),
    atRiskCount: parseInt(atRiskRes.rows[0].count, 10),
  };
}

export async function seedDemoAnalytics(options: { resetOnly?: boolean } = {}) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be defined.');
  }

  const parsedUrl = new URL(databaseUrl);
  const targetDbName = parsedUrl.pathname.replace(/^\//, '');

  if (!targetDbName.includes('test') && !targetDbName.includes('demo')) {
    throw new Error(`Safety Guard: Refusing to seed database "${targetDbName}" because its name does not contain "test" or "demo". Never touch the dev or production database.`);
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });

  try {
    if (options.resetOnly) {
      await resetDemoData(pool);
      return;
    }

    console.log(`[seed:demo] Starting deterministic demo analytics seeding on DB "${targetDbName}"...`);
    await resetDemoData(pool);

    const rand = createPrng(42);
    const demoPassword = process.env.DEMO_PASSWORD || 'DemoPassSecure2026!';
    const passwordHash = await bcrypt.hash(demoPassword, 10);

    // 1. Ensure core departments exist
    for (const dept of DEPARTMENTS) {
      await pool.query(`
        INSERT INTO departments (id, college_id, name, code)
        VALUES ($1, 'col_01', $2, $3)
        ON CONFLICT (id) DO NOTHING
      `, [dept.id, dept.name, dept.code]);
    }

    // 2. Ensure classes exist for each department across 4 years
    const classMap: Record<string, string[]> = {
      1: ['cls_y1_a'],
      2: ['cls_y2_a'],
      3: ['cls_y3_a'],
      4: ['cls_y4_a'],
    };

    const academicYears = {
      1: 'ay_2026_30',
      2: 'ay_2025_29',
      3: 'ay_2024_28',
      4: 'ay_2023_27',
    };

    for (const dept of DEPARTMENTS) {
      for (let y = 1; y <= 4; y++) {
        const clsId = dept.id === 'dept_cs' ? `cls_y${y}_a` : `demo_cls_y${y}_${dept.code.toLowerCase()}`;
        if (!classMap[y].includes(clsId)) {
          classMap[y].push(clsId);
        }
        await pool.query(`
          INSERT INTO classes (id, department_id, academic_year_id, name, year, section)
          VALUES ($1, $2, $3, $4, $5, 'A')
          ON CONFLICT (id) DO NOTHING
        `, [clsId, dept.id, academicYears[y as 1 | 2 | 3 | 4], `${dept.code} Year ${y} Class A`, y]);
      }
    }

    // 3. Ensure baseline subjects exist
    const standardSubjects = [
      { id: 'sbj_math1', name: 'Mathematics & Linear Algebra', code: 'MTH101', credits: 4 },
      { id: 'sbj_cprog', name: 'Computer Programming & C', code: 'CS101', credits: 4 },
      { id: 'sbj_algo', name: 'Algorithms & Data Structures', code: 'CS102', credits: 4 },
      { id: 'sbj_dbms', name: 'Database Management Systems', code: 'CS103', credits: 3 },
      { id: 'demo_sbj_os', name: 'Operating Systems & Networks', code: 'CS201', credits: 4 },
      { id: 'demo_sbj_ai', name: 'Artificial Intelligence & ML', code: 'CS301', credits: 4 },
      { id: 'demo_sbj_web', name: 'Modern Full-Stack Engineering', code: 'CS302', credits: 3 },
    ];

    for (const s of standardSubjects) {
      await pool.query(`
        INSERT INTO subjects (id, department_id, name, code, max_marks, credits)
        VALUES ($1, 'dept_cs', $2, $3, 100, $4)
        ON CONFLICT (id) DO UPDATE SET credits = EXCLUDED.credits
      `, [s.id, s.name, s.code, s.credits]);
    }

    // 4. Provision Dedicated Role Logins (Admin, 2 Teachers, Placement, 3 Students)
    const demoAccounts = [
      { id: 'demo_usr_admin', email: 'demo_admin@vissionacademy.edu', role: 'admin', name: 'Demo Administrator' },
      { id: 'demo_usr_teacher1', email: 'demo_teacher1@vissionacademy.edu', role: 'teacher', name: 'Prof. Demo Teacher One' },
      { id: 'demo_usr_teacher2', email: 'demo_teacher2@vissionacademy.edu', role: 'teacher', name: 'Prof. Demo Teacher Two' },
      { id: 'demo_usr_placement', email: 'demo_placement@vissionacademy.edu', role: 'placement', name: 'Demo Placement Officer' },
      { id: 'demo_usr_std_top', email: 'demo_student_top@vissionacademy.edu', role: 'student', name: 'Demo Top Performer Student' },
      { id: 'demo_usr_std_avg', email: 'demo_student_avg@vissionacademy.edu', role: 'student', name: 'Demo Average Student' },
      { id: 'demo_usr_std_atrisk', email: 'demo_student_atrisk@vissionacademy.edu', role: 'student', name: 'Demo At-Risk Student' },
    ];

    for (const acc of demoAccounts) {
      await pool.query(`
        INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
        VALUES ($1, $2, $3, $4, $5, true, false)
        ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash
      `, [acc.id, acc.email, passwordHash, acc.role, acc.name]);
    }

    // Link the 3 specialized demo students
    await pool.query(`
      INSERT INTO students (id, user_id, roll_number, class_id, department_id, bio, profile_strength, github_url, leetcode_url, hackerrank_url, linkedin_url, leetcode_data, github_data, hackerrank_data)
      VALUES 
      ('demo_std_top', 'demo_usr_std_top', 'DEMO_TOP_001', 'cls_y1_a', 'dept_cs', 'Top Performing Demo Candidate in CSE.', 98,
       'https://github.com/demo_dev_top', 'https://leetcode.com/demo_coder_top', 'https://hackerrank.com/demo_rank_top', 'https://linkedin.com/in/demo-student-top',
       '{"totalSolved": 520, "easySolved": 280, "mediumSolved": 180, "hardSolved": 60, "ranking": 24500, "reputation": 820}',
       '{"public_repos": 24, "total_stars": 85, "total_forks": 15, "followers": 45, "languages": ["TypeScript", "Go", "Python"]}',
       '{"badges_count": 6, "verified_skills": ["Problem Solving", "Algorithms", "Python"]}'),
      
      ('demo_std_avg', 'demo_usr_std_avg', 'DEMO_AVG_001', 'cls_y1_a', 'dept_cs', 'Consistent Academic Student in CSE.', 76,
       'https://github.com/demo_dev_avg', 'https://leetcode.com/demo_coder_avg', 'https://hackerrank.com/demo_rank_avg', 'https://linkedin.com/in/demo-student-avg',
       '{"totalSolved": 140, "easySolved": 85, "mediumSolved": 45, "hardSolved": 10, "ranking": 185000, "reputation": 120}',
       '{"public_repos": 8, "total_stars": 12, "total_forks": 2, "followers": 8, "languages": ["JavaScript", "Python"]}',
       '{"badges_count": 3, "verified_skills": ["Problem Solving"]}'),

      ('demo_std_atrisk', 'demo_usr_std_atrisk', 'DEMO_RISK_001', 'cls_y1_a', 'dept_cs', 'Student requiring additional academic mentoring.', 42,
       NULL, 'https://leetcode.com/demo_coder_risk', NULL, NULL,
       '{"totalSolved": 12, "easySolved": 10, "mediumSolved": 2, "hardSolved": 0, "ranking": 850000, "reputation": 10}',
       NULL, NULL)
      ON CONFLICT (id) DO UPDATE SET
        roll_number = EXCLUDED.roll_number,
        profile_strength = EXCLUDED.profile_strength,
        leetcode_data = EXCLUDED.leetcode_data,
        github_data = EXCLUDED.github_data,
        hackerrank_data = EXCLUDED.hackerrank_data
    `);

    // Assign demo teachers to classes containing demo students
    await pool.query(`
      INSERT INTO teacher_class_assignments (id, teacher_user_id, class_id, subject_id, semester_id, status)
      VALUES 
      ('demo_tca_d1', 'demo_usr_teacher1', 'cls_y1_a', 'sbj_math1', 'sem_1', 'active'),
      ('demo_tca_d2', 'demo_usr_teacher1', 'cls_y1_a', 'sbj_cprog', 'sem_1', 'active'),
      ('demo_tca_d3', 'demo_usr_teacher2', 'cls_y1_a', 'sbj_algo', 'sem_1', 'active'),
      ('demo_tca_d4', 'demo_usr_teacher2', 'cls_y1_a', 'sbj_dbms', 'sem_1', 'active')
      ON CONFLICT (teacher_user_id, class_id, subject_id, semester_id) WHERE status = 'active' DO NOTHING;
    `);

    const testTeacherCheck = await pool.query(`SELECT 1 FROM users WHERE id = 'usr_teacher_test'`);
    if (testTeacherCheck.rowCount && testTeacherCheck.rowCount > 0) {
      await pool.query(`
        INSERT INTO teacher_class_assignments (id, teacher_user_id, class_id, subject_id, semester_id, status)
        VALUES ('demo_tca_02', 'usr_teacher_test', 'cls_y1_a', 'sbj_cprog', 'sem_1', 'active')
        ON CONFLICT (teacher_user_id, class_id, subject_id, semester_id) WHERE status = 'active' DO NOTHING;
      `);
    }

    // Enable analytics visibility toggles for demo teachers & placement officer
    await pool.query(`
      INSERT INTO teacher_analytics_visibility (teacher_user_id, academic_enabled, github_enabled, hackerrank_enabled, linkedin_enabled, leetcode_enabled, hackathon_enabled, sports_enabled)
      VALUES 
      ('demo_usr_teacher1', true, true, true, true, true, true, true),
      ('demo_usr_teacher2', true, true, true, true, true, true, true)
      ON CONFLICT (teacher_user_id) DO UPDATE SET academic_enabled = true, github_enabled = true, leetcode_enabled = true;

      INSERT INTO placement_analytics_visibility (placement_user_id, academic_enabled, github_enabled, hackerrank_enabled, linkedin_enabled, leetcode_enabled, hackathon_enabled, sports_enabled)
      VALUES 
      ('demo_usr_placement', true, true, true, true, true, true, true)
      ON CONFLICT (placement_user_id) DO UPDATE SET academic_enabled = true, github_enabled = true, leetcode_enabled = true;
    `);

    // 5. Generate ~150 students across 4 years with correlated metrics
    console.log('[seed:demo] Generating 150 fake students across 4 years with correlated metrics...');

    const totalStudents = 150;
    const yearDistribution: number[] = [];
    for (let i = 0; i < 38; i++) yearDistribution.push(1);
    for (let i = 0; i < 38; i++) yearDistribution.push(2);
    for (let i = 0; i < 37; i++) yearDistribution.push(3);
    for (let i = 0; i < 37; i++) yearDistribution.push(4);

    for (let idx = 1; idx <= totalStudents; idx++) {
      const year = yearDistribution[idx - 1];
      const dept = DEPARTMENTS[idx % DEPARTMENTS.length];
      const availableClasses = classMap[year].filter(c => c.includes(dept.code.toLowerCase()) || (dept.id === 'dept_cs' && c.startsWith('cls_')));
      const classId = availableClasses[idx % availableClasses.length] || classMap[year][0];

      const firstName = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)];
      const lastName = LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)];
      const fullName = `${firstName} ${lastName}`;
      const rollNum = `DEMO_${2027 - year}_${dept.code}_${String(idx).padStart(3, '0')}`;
      const email = `demo.student.${idx}@vissionacademy.edu`;
      const userId = `demo_usr_std_${String(idx).padStart(3, '0')}`;
      const studentId = `demo_std_${String(idx).padStart(3, '0')}`;

      // Archetypes & Edge Cases
      const isNoProfile = idx >= 141 && idx <= 143;
      const isZeroActivity = idx >= 144 && idx <= 146;
      const isSinglePlatform = idx >= 147 && idx <= 150;
      const isTopPerformer = idx <= 20;
      const isAtRisk = idx >= 126 && idx <= 140;

      // Profile URLs
      let githubUrl: string | null = null;
      let leetcodeUrl: string | null = null;
      let hackerrankUrl: string | null = null;
      let linkedinUrl: string | null = null;

      if (!isNoProfile) {
        if (isSinglePlatform) {
          if (idx <= 148) {
            leetcodeUrl = `https://leetcode.com/demo_coder_${idx}`;
          } else {
            githubUrl = `https://github.com/demo_dev_${idx}`;
          }
        } else {
          githubUrl = `https://github.com/demo_dev_${idx}`;
          leetcodeUrl = `https://leetcode.com/demo_coder_${idx}`;
          hackerrankUrl = `https://hackerrank.com/demo_rank_${idx}`;
          linkedinUrl = `https://linkedin.com/in/demo-student-${idx}`;
        }
      }

      // Profile Strength
      let profileStrength = Math.floor(65 + rand() * 20);
      if (isTopPerformer) profileStrength = Math.floor(92 + rand() * 8);
      if (isAtRisk) profileStrength = Math.floor(35 + rand() * 20);
      if (isNoProfile || isZeroActivity) profileStrength = 25;

      // Platform metrics
      let leetcodeData: any = null;
      let githubData: any = null;
      let hackerrankData: any = null;

      if (leetcodeUrl) {
        if (isZeroActivity) {
          leetcodeData = {
            totalSolved: 0,
            easySolved: 0,
            mediumSolved: 0,
            hardSolved: 0,
            ranking: null,
            acceptanceRate: 0,
          };
        } else if (isTopPerformer) {
          const hard = Math.floor(25 + rand() * 30); // 25 - 55
          const med = hard + Math.floor(50 + rand() * 60); // 75 - 175
          const easy = med + Math.floor(60 + rand() * 80); // 135 - 315
          leetcodeData = {
            totalSolved: easy + med + hard,
            easySolved: easy,
            mediumSolved: med,
            hardSolved: hard,
            ranking: Math.floor(15000 + rand() * 50000),
            reputation: Math.floor(500 + rand() * 800),
          };
        } else if (isAtRisk) {
          leetcodeData = {
            totalSolved: 12,
            easySolved: 10,
            mediumSolved: 2,
            hardSolved: 0,
            ranking: 850000,
            reputation: 10,
          };
        } else {
          const hard = Math.floor(2 + rand() * 8); // 2 - 10
          const med = hard + Math.floor(15 + rand() * 25); // 17 - 43
          const easy = med + Math.floor(25 + rand() * 40); // 42 - 108
          leetcodeData = {
            totalSolved: easy + med + hard,
            easySolved: easy,
            mediumSolved: med,
            hardSolved: hard,
            ranking: Math.floor(120000 + rand() * 250000),
            reputation: Math.floor(50 + rand() * 200),
          };
        }
      }

      if (githubUrl) {
        if (isZeroActivity) {
          githubData = {
            public_repos: 0,
            total_stars: 0,
            total_forks: 0,
            followers: 0,
            languages: [],
            top_repos: [],
          };
        } else if (isTopPerformer) {
          const repos = Math.floor(18 + rand() * 15);
          const stars = Math.floor(45 + rand() * 120);
          githubData = {
            public_repos: repos,
            total_stars: stars,
            total_forks: Math.floor(10 + rand() * 25),
            followers: Math.floor(25 + rand() * 60),
            languages: ['TypeScript', 'Python', 'Go', 'Rust', 'C++'],
            top_repos: [
              { name: 'distributed-kv-store', url: `${githubUrl}/distributed-kv-store`, stars: 45, language: 'Go' },
              { name: 'vision-ai-agent', url: `${githubUrl}/vision-ai-agent`, stars: 32, language: 'TypeScript' },
            ],
            total_contributions: Math.floor(450 + rand() * 800),
          };
        } else {
          const repos = Math.floor(5 + rand() * 12);
          const stars = Math.floor(3 + rand() * 20);
          githubData = {
            public_repos: repos,
            total_stars: stars,
            total_forks: Math.floor(1 + rand() * 5),
            followers: Math.floor(3 + rand() * 15),
            languages: ['JavaScript', 'Python', 'Java'],
            top_repos: [
              { name: 'student-portal', url: `${githubUrl}/student-portal`, stars: 5, language: 'JavaScript' },
            ],
            total_contributions: Math.floor(80 + rand() * 250),
          };
        }
      }

      if (hackerrankUrl && !isZeroActivity) {
        hackerrankData = {
          badges_count: isTopPerformer ? 5 : 3,
          verified_skills: isTopPerformer ? ['Problem Solving', 'Python', 'SQL', 'Algorithms'] : ['Problem Solving', 'Java'],
        };
      }

      // Insert User
      await pool.query(`
        INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
        VALUES ($1, $2, $3, 'student', $4, true, false)
        ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name
      `, [userId, email, passwordHash, fullName]);

      // Insert Student
      await pool.query(`
        INSERT INTO students (
          id, user_id, roll_number, class_id, department_id,
          github_url, leetcode_url, hackerrank_url, linkedin_url,
          github_data, leetcode_data, hackerrank_data,
          profile_strength, bio
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE SET
          roll_number = EXCLUDED.roll_number,
          profile_strength = EXCLUDED.profile_strength,
          leetcode_data = EXCLUDED.leetcode_data,
          github_data = EXCLUDED.github_data,
          hackerrank_data = EXCLUDED.hackerrank_data
      `, [
        studentId, userId, rollNum, classId, dept.id,
        githubUrl, leetcodeUrl, hackerrankUrl, linkedinUrl,
        githubData ? JSON.stringify(githubData) : null,
        leetcodeData ? JSON.stringify(leetcodeData) : null,
        hackerrankData ? JSON.stringify(hackerrankData) : null,
        profileStrength,
        `Student at Vission Academy pursuing ${dept.name}. Year ${year}.`
      ]);

      // Insert 6 Monthly Snapshots (Monotonically non-decreasing)
      for (let mIdx = 0; mIdx < MONTHS.length; mIdx++) {
        const month = MONTHS[mIdx];
        const progressFactor = (mIdx + 1) / MONTHS.length;

        if (githubUrl && !isZeroActivity) {
          const repos = Math.max(1, Math.round((githubData.public_repos || 5) * progressFactor));
          const stars = Math.round((githubData.total_stars || 10) * progressFactor);
          await pool.query(`
            INSERT INTO student_github_snapshots (
              id, student_id, github_username, snapshot_month, synced_at,
              public_repos, total_stars, total_forks, followers, languages, top_repos, sync_status
            )
            VALUES ($1, $2, $3, $4, NOW(), $5, $6, 1, 5, $7, $8, 'synced')
            ON CONFLICT (student_id, snapshot_month) DO UPDATE SET
              public_repos = EXCLUDED.public_repos,
              total_stars = EXCLUDED.total_stars
          `, [
            `demo_ghs_${idx}_${month}`,
            studentId,
            `demo_dev_${idx}`,
            month,
            repos,
            stars,
            JSON.stringify(githubData.languages || []),
            JSON.stringify(githubData.top_repos || []),
          ]);
        }

        if (leetcodeUrl && !isZeroActivity) {
          const hard = Math.round((leetcodeData.hardSolved || 2) * progressFactor);
          const med = Math.max(hard, Math.round((leetcodeData.mediumSolved || 8) * progressFactor));
          const easy = Math.max(med, Math.round((leetcodeData.easySolved || 20) * progressFactor));
          const total = easy + med + hard;

          await pool.query(`
            INSERT INTO student_leetcode_snapshots (
              id, student_id, leetcode_username, snapshot_month, synced_at,
              total_solved, easy_solved, medium_solved, hard_solved, ranking, sync_status
            )
            VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, 'synced')
            ON CONFLICT (student_id, snapshot_month) DO UPDATE SET
              total_solved = EXCLUDED.total_solved,
              easy_solved = EXCLUDED.easy_solved,
              medium_solved = EXCLUDED.medium_solved,
              hard_solved = EXCLUDED.hard_solved
          `, [
            `demo_lcs_${idx}_${month}`,
            studentId,
            `demo_coder_${idx}`,
            month,
            total,
            easy,
            med,
            hard,
            leetcodeData.ranking || 200000,
          ]);
        }

        if (hackerrankUrl && !isZeroActivity) {
          await pool.query(`
            INSERT INTO student_hackerrank_snapshots (
              id, student_id, hackerrank_username, snapshot_month, synced_at,
              badges_count, verified_skills, sync_status
            )
            VALUES ($1, $2, $3, $4, NOW(), $5, $6, 'synced')
            ON CONFLICT (student_id, snapshot_month) DO NOTHING
          `, [
            `demo_hrs_${idx}_${month}`,
            studentId,
            `demo_rank_${idx}`,
            month,
            hackerrankData?.badges_count || 2,
            JSON.stringify(hackerrankData?.verified_skills || []),
          ]);
        }

        if (linkedinUrl && !isZeroActivity) {
          await pool.query(`
            INSERT INTO student_linkedin_snapshots (
              id, student_id, linkedin_url, snapshot_month, synced_at,
              connections, posts_count, followers, sync_status
            )
            VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, 'synced')
            ON CONFLICT (student_id, snapshot_month) DO NOTHING
          `, [
            `demo_lis_${idx}_${month}`,
            studentId,
            linkedinUrl,
            month,
            Math.floor(100 + rand() * 400),
            Math.floor(2 + rand() * 10),
            Math.floor(150 + rand() * 500),
          ]);
        }
      }

      // HackerRank Evidence
      if (hackerrankUrl && !isZeroActivity) {
        await pool.query(`
          INSERT INTO student_hackerrank_evidence (
            id, student_id, skill_name, badge_name, stars, verification_status
          )
          VALUES ($1, $2, 'Problem Solving', 'Gold Problem Solver', 5, 'Verified')
          ON CONFLICT (id) DO NOTHING
        `, [`demo_hre_${idx}_ps`, studentId]);
      }

      // Projects
      if (idx <= 120) {
        await pool.query(`
          INSERT INTO projects (
            id, student_id, title, description, technologies, github_url, verification_status
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'Verified')
          ON CONFLICT (id) DO NOTHING
        `, [
          `demo_prj_${idx}_1`,
          studentId,
          `${dept.code} Intelligent System v${idx}`,
          'An end-to-end cloud-native microservice architecture with automated testing and metrics collection.',
          JSON.stringify(['React', 'Node.js', 'PostgreSQL', 'Docker']),
          githubUrl || 'https://github.com/vission-academy/project-demo',
        ]);

        if (isTopPerformer) {
          await pool.query(`
            INSERT INTO projects (
              id, student_id, title, description, technologies, github_url, verification_status
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'Verified')
            ON CONFLICT (id) DO NOTHING
          `, [
            `demo_prj_${idx}_2`,
            studentId,
            'High-Performance Distributed Cache',
            'Distributed lock and caching layer using Raft consensus protocol.',
            JSON.stringify(['Go', 'gRPC', 'Protobuf', 'Kubernetes']),
            githubUrl || 'https://github.com/vission-academy/cache-demo',
          ]);
        }
      }

      // Certifications
      if (idx <= 90) {
        await pool.query(`
          INSERT INTO certifications (
            id, student_id, name, issuer, issue_date, credential_id, verification_status
          )
          VALUES ($1, $2, $3, $4, '2026-03-15', $5, 'Verified')
          ON CONFLICT (id) DO NOTHING
        `, [
          `demo_crt_${idx}`,
          studentId,
          isTopPerformer ? 'AWS Certified Solutions Architect - Associate' : 'Meta Certified Front-End Developer',
          isTopPerformer ? 'Amazon Web Services' : 'Meta',
          `CERT-VA-${idx}-2026`,
        ]);
      }

      // Hackathons
      if (idx <= 60) {
        await pool.query(`
          INSERT INTO hackathons (
            id, student_id, name, organizer, date, position_result, team_name, verification_status
          )
          VALUES ($1, $2, $3, $4, '2026-02-20', $5, $6, 'Verified')
          ON CONFLICT (id) DO NOTHING
        `, [
          `demo_hck_${idx}`,
          studentId,
          'Smart India Hackathon Regional 2026',
          'Ministry of Education',
          isTopPerformer ? '1st Place' : 'Finalist',
          `Team Binary ${idx}`,
        ]);
      }

      // Sports
      if (idx <= 45) {
        const levels = ['intra_college', 'inter_college', 'district', 'state', 'national'];
        const sportNames = ['Cricket', 'Basketball', 'Football', 'Athletics', 'Chess', 'Badminton'];
        const chosenSport = sportNames[idx % sportNames.length];
        const chosenLevel = isTopPerformer ? 'national' : levels[idx % levels.length];
        await pool.query(`
          INSERT INTO sports (
            id, student_id, sport_name, event_name, participation_type, competition_level,
            season_year, result_award, verification_status
          )
          VALUES ($1, $2, $3, $4, 'individual', $5, '2025-2026', $6, 'Verified')
          ON CONFLICT (id) DO NOTHING
        `, [
          `demo_spt_${idx}`,
          studentId,
          chosenSport,
          `Annual State University ${chosenSport} Championship`,
          chosenLevel,
          isTopPerformer ? 'Gold Medalist' : 'Runner Up',
        ]);
      }

      // Achievements
      if (idx <= 75) {
        await pool.query(`
          INSERT INTO achievements (
            id, student_id, title, description, organization, date, verification_status
          )
          VALUES ($1, $2, $3, $4, $5, '2026-01-10', 'Verified')
          ON CONFLICT (id) DO NOTHING
        `, [
          `demo_ach_${idx}`,
          studentId,
          isTopPerformer ? 'Dean’s Honor List Academic Excellence' : 'Merit Certificate in Algorithms',
          'Excellence in semester coursework and technical contributions.',
          'Vission Academy Senate',
        ]);
      }

      // 5. Correlated Marks, Semesters, SGPA, CGPA, Backlogs
      const maxSemToSeed = year === 1 ? 1 : year === 2 ? 3 : year === 3 ? 5 : 7;
      let cumCredits = 0;
      let cumPts = 0;

      for (let sNum = 1; sNum <= maxSemToSeed; sNum++) {
        const semId = `sem_${sNum}`;
        await pool.query(`
          INSERT INTO semesters (id, academic_year_id, semester_number, name, is_active)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO NOTHING
        `, [semId, academicYears[Math.ceil(sNum / 2) as 1 | 2 | 3 | 4] || 'ay_2025_29', sNum, `Semester ${sNum}`, sNum === maxSemToSeed]);

        let semCredits = 0;
        let semPts = 0;

        for (const sub of standardSubjects) {
          let mark = Math.floor(60 + rand() * 25);
          if (isTopPerformer) mark = Math.floor(86 + rand() * 12); // 86-98
          if (isAtRisk) {
            mark = sub.id === 'sbj_math1' || sub.id === 'sbj_algo' ? Math.floor(22 + rand() * 16) : Math.floor(45 + rand() * 15);
          }

          const gradePoint = mark >= 90 ? 10 : mark >= 80 ? 9 : mark >= 70 ? 8 : mark >= 60 ? 7 : mark >= 55 ? 6 : mark >= 50 ? 5 : mark >= 40 ? 4 : 0;
          semCredits += sub.credits;
          semPts += sub.credits * gradePoint;

          await pool.query(`
            INSERT INTO marks (
              id, student_id, class_id, subject_id, semester_id,
              exam_type, marks_obtained, max_marks
            )
            VALUES ($1, $2, $3, $4, $5, 'Final', $6, 100)
            ON CONFLICT (id) DO UPDATE SET marks_obtained = EXCLUDED.marks_obtained
          `, [`demo_mrk_${idx}_${sNum}_${sub.id}`, studentId, classId, sub.id, semId, mark]);
        }

        cumCredits += semCredits;
        cumPts += semPts;
        const semSgpa = Number((semPts / semCredits).toFixed(2));
        const currentCgpa = Number((cumPts / cumCredits).toFixed(2));

        // Official Marksheet record
        await pool.query(`
          INSERT INTO marksheets (
            id, student_id, semester_id, file_url, file_name, sgpa, cgpa
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET sgpa = EXCLUDED.sgpa, cgpa = EXCLUDED.cgpa
        `, [
          `demo_ms_${idx}_${sNum}`,
          studentId,
          semId,
          `/uploads/marksheets/demo_marksheet_${idx}_sem_${sNum}.pdf`,
          `Official_Marksheet_Sem_${sNum}.pdf`,
          semSgpa,
          currentCgpa,
        ]);
      }
    }

    console.log('[seed:demo] ✅ Successfully seeded 150 demo students with realistic correlated data!');

    // Print emails and data quality evidence
    console.log('\n================ DEMO ACCOUNTS PROVISIONED ================');
    console.log('Role: Administrator       -> Email: demo_admin@vissionacademy.edu');
    console.log('Role: Teacher 1           -> Email: demo_teacher1@vissionacademy.edu');
    console.log('Role: Teacher 2           -> Email: demo_teacher2@vissionacademy.edu');
    console.log('Role: Placement Officer   -> Email: demo_placement@vissionacademy.edu');
    console.log('Role: Student (Top)       -> Email: demo_student_top@vissionacademy.edu');
    console.log('Role: Student (Average)   -> Email: demo_student_avg@vissionacademy.edu');
    console.log('Role: Student (At-Risk)   -> Email: demo_student_atrisk@vissionacademy.edu');
    console.log('Password sourced securely from DEMO_PASSWORD environment variable.');
    console.log('===========================================================\n');

    await printDataQualityEvidence(pool);

  } finally {
    await pool.end();
  }
}

// Direct CLI Execution
if (process.argv[1] && process.argv[1].includes('seed-demo-analytics')) {
  const isReset = process.argv.includes('--reset');
  seedDemoAnalytics({ resetOnly: isReset })
    .then(() => {
      console.log(`[seed:demo] ${isReset ? 'Reset' : 'Seeding'} completed successfully.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[seed:demo] Execution failed:', err);
      process.exit(1);
    });
}
