import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcryptjs';

// Load test environment by default
dotenv.config({ path: path.resolve(process.cwd(), '.env.test'), override: true });

// 1. Refuse to run in production or against non-test databases
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run seed-demo-analytics in production environment.');
  process.exit(1);
}

// Deterministic Pseudo-Random Number Generator (Mulberry32)
function createPrng(seed: number) {
  let s = seed;
  return function() {
    let t = s += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
    DELETE FROM students WHERE id LIKE 'demo_%' OR roll_number LIKE 'DEMO%';
    DELETE FROM users WHERE id LIKE 'demo_%';
    DELETE FROM teacher_class_assignments WHERE id LIKE 'demo_%';
    DELETE FROM classes WHERE id LIKE 'demo_%';
    DELETE FROM subjects WHERE id LIKE 'demo_%';
    DELETE FROM departments WHERE id LIKE 'demo_%';
  `);
  console.log('[seed:demo:reset] Cleanup completed successfully.');
}

export async function seedDemoAnalytics(options: { resetOnly?: boolean } = {}) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be defined.');
  }

  const parsedUrl = new URL(databaseUrl);
  const targetDbName = parsedUrl.pathname.replace(/^\//, '');

  if (!targetDbName.includes('test')) {
    throw new Error(`Safety Guard: Refusing to seed database "${targetDbName}" because its name does not contain "test". Never touch the dev or production database.`);
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });

  try {
    if (options.resetOnly) {
      await resetDemoData(pool);
      return;
    }

    console.log('[seed:demo] Starting deterministic demo analytics seeding...');
    await resetDemoData(pool);

    const rand = createPrng(42);
    const passwordHash = await bcrypt.hash('password123', 10);

    // 1. Ensure core departments exist
    for (const dept of DEPARTMENTS) {
      await pool.query(`
        INSERT INTO departments (id, college_id, name, code)
        VALUES ($1, 'col_01', $2, $3)
        ON CONFLICT (id) DO NOTHING
      `, [dept.id, dept.name, dept.code]);
    }

    // 2. Ensure classes exist for each department across 4 years
    // We utilize cls_y1_a..cls_y4_a for CS and demo_cls_yX_dept for others
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

    // 3. Ensure subjects exist
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

    // 4. Generate 150 students
    console.log('[seed:demo] Generating 150 fake students across 4 years with correlated metrics...');

    const totalStudents = 150;
    // Distribution: Y1: 38, Y2: 38, Y3: 37, Y4: 37
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

      // Insert 6 Monthly Snapshots
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
      // Semesters to populate for this student:
      const maxSemToSeed = year === 1 ? 1 : year === 2 ? 3 : year === 3 ? 5 : 7;
      let cumCredits = 0;
      let cumPts = 0;

      for (let sNum = 1; sNum <= maxSemToSeed; sNum++) {
        const semId = `sem_${sNum}`;
        // Ensure semester exists
        await pool.query(`
          INSERT INTO semesters (id, academic_year_id, semester_number, name, is_active)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO NOTHING
        `, [semId, academicYears[Math.ceil(sNum / 2) as 1 | 2 | 3 | 4] || 'ay_2025_29', sNum, `Semester ${sNum}`, sNum === maxSemToSeed]);

        let semObtained = 0;
        let semMax = 0;
        let semCredits = 0;
        let semPts = 0;

        for (const sub of standardSubjects) {
          let mark = Math.floor(60 + rand() * 25);
          if (isTopPerformer) mark = Math.floor(86 + rand() * 12); // 86-98
          if (isAtRisk) {
            // Give failed mark (<40) in 1 or 2 subjects
            mark = sub.id === 'sbj_math1' || sub.id === 'sbj_algo' ? Math.floor(22 + rand() * 16) : Math.floor(45 + rand() * 15);
          }

          const gradePoint = mark >= 90 ? 10 : mark >= 80 ? 9 : mark >= 70 ? 8 : mark >= 60 ? 7 : mark >= 55 ? 6 : mark >= 50 ? 5 : mark >= 40 ? 4 : 0;
          semObtained += mark;
          semMax += 100;
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

    // 6. Ensure default test teacher is assigned to Year 1 Class A and subjects so they see the demo students
    await pool.query(`
      INSERT INTO teacher_class_assignments (id, teacher_user_id, class_id, subject_id, semester_id, status)
      VALUES 
      ('demo_tca_02', 'usr_teacher_test', 'cls_y1_a', 'sbj_cprog', 'sem_1', 'active')
      ON CONFLICT (teacher_user_id, class_id, subject_id, semester_id) WHERE status = 'active' DO NOTHING
    `);

    console.log('[seed:demo] ✅ Successfully seeded 150 demo students with realistic correlated data!');
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
