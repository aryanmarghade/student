const BASE_URL = 'http://localhost:3000';
let adminToken = '';
let teacherToken = '';
let teacherClassId = '';
let teacherSubjectId = '';

async function runTests() {
  console.log('--- STARTING RUNTIME VERIFICATION ---');

  // 1. ADMIN LOGIN
  console.log('\n[1] Admin Login');
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@visionacademy.edu', password: 'password123' })
  });
  const adminData = await adminLoginRes.json();
  if (adminData.token) {
    adminToken = adminData.token;
    console.log('Admin login successful.');
  } else {
    console.error('Admin login failed:', adminData);
    return;
  }

  // 1b. TEACHER LOGIN
  console.log('\n[1b] Teacher Login');
  const teacherLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'qateacher1@test.com', password: 'password123' })
  });
  const teacherData = await teacherLoginRes.json();
  if (teacherData.token) {
    teacherToken = teacherData.token;
    console.log('Teacher login successful.');
    const assignmentsRes = await fetch(`${BASE_URL}/api/teacher/assignments`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    const assignmentsData = await assignmentsRes.json();
    if (assignmentsData.active && assignmentsData.active.length > 0) {
      teacherClassId = assignmentsData.active[0].class_id;
      teacherSubjectId = assignmentsData.active[0].subject_id;
      console.log(`Teacher context -> Class: ${teacherClassId}, Subject: ${teacherSubjectId}`);
    } else {
      console.log('No active teacher assignments found.');
    }
  } else {
    console.error('Teacher login failed:', teacherData);
    return;
  }

  // 2. ADMIN API GET
  console.log('\n[2] GET /api/admin/analytics-visibility (Admin)');
  const getRes = await fetch(`${BASE_URL}/api/admin/analytics-visibility`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  console.log('STATUS:', getRes.status);
  const getJson = await getRes.json();
  console.log('RESPONSE JSON:', getJson);

  // 3. SECURITY TEST: TEACHER ACCESS TO ADMIN API
  console.log('\n[3] GET /api/admin/analytics-visibility (Teacher)');
  const secRes = await fetch(`${BASE_URL}/api/admin/analytics-visibility`, {
    headers: { Authorization: `Bearer ${teacherToken}` }
  });
  console.log('STATUS:', secRes.status, '(Expected: 401/403)');
  const secJson = await secRes.json();
  console.log('RESPONSE JSON:', secJson);

  // 4. TEACHER ANALYTICS: INITIAL STATE (ALL TRUE)
  console.log('\n[4] Enabling all visibility via Admin...');
  await setVisibility({ github_enabled: true, hackathon_enabled: true, linkedin_enabled: true, academic_enabled: true });
  console.log('Fetching Teacher Analytics...');
  let analyticsRes = await fetchTeacherAnalytics();
  console.log('Teacher Analytics Keys:', Object.keys(analyticsRes));
  console.log('Teacher GitHub Data Source:', analyticsRes.githubDataSource);
  console.log('Teacher LinkedIn Posts Count:', analyticsRes.postsByMonth ? analyticsRes.postsByMonth.length : 'N/A');

  // 5. TEST GITHUB = OFF
  console.log('\n[5] Setting GitHub = OFF via Admin...');
  await setVisibility({ github_enabled: false, hackathon_enabled: true, linkedin_enabled: true, academic_enabled: true });
  analyticsRes = await fetchTeacherAnalytics();
  console.log('Teacher GitHub Data Source:', analyticsRes.githubDataSource);

  // 6. TEST HACKATHON = OFF
  console.log('\n[6] Setting Hackathon = OFF via Admin...');
  await setVisibility({ github_enabled: true, hackathon_enabled: false, linkedin_enabled: true, academic_enabled: true });
  analyticsRes = await fetchTeacherAnalytics();

  // 7. TEST LINKEDIN = OFF
  console.log('\n[7] Setting LinkedIn = OFF via Admin...');
  await setVisibility({ github_enabled: true, hackathon_enabled: true, linkedin_enabled: false, academic_enabled: true });
  analyticsRes = await fetchTeacherAnalytics();
  console.log('Teacher LinkedIn Posts Count:', analyticsRes.postsByMonth ? analyticsRes.postsByMonth.length : 'N/A');

  // 8. TEST ACADEMIC = OFF
  console.log('\n[8] Setting Academic = OFF via Admin...');
  await setVisibility({ github_enabled: true, hackathon_enabled: true, linkedin_enabled: true, academic_enabled: false });
  analyticsRes = await fetchTeacherAnalytics();
  console.log('Teacher Academic Data (Statistics count):', analyticsRes.statistics ? analyticsRes.statistics.count : 'Hidden');

  // Restore everything to true
  console.log('\n[9] Restoring all visibility to TRUE...');
  await setVisibility({ github_enabled: true, hackathon_enabled: true, linkedin_enabled: true, academic_enabled: true });
}

async function setVisibility(settings) {
  const putRes = await fetch(`${BASE_URL}/api/admin/analytics-visibility`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify(settings)
  });
  if (putRes.status !== 200) {
    console.error('Failed to update visibility:', await putRes.text());
  } else {
    console.log('Update success');
  }
}

async function fetchTeacherAnalytics() {
  const res = await fetch(`${BASE_URL}/api/teacher/analytics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
    body: JSON.stringify({
      classId: teacherClassId,
      subjectId: teacherSubjectId
    })
  });
  return res.json();
}

runTests().catch(console.error);
