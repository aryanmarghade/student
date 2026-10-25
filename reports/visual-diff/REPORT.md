# Visual Regression Audit: Multi-Baseline Comparison

**Evaluated At**: 2026-10-25T19:05:45.392Z
**Baselines Evaluated**:
- Original Site: `22d23d5`
- Pre-Phase 4 UI: `96793af`
- Current Version: `HEAD`

**Deterministic Configuration**:
- Animations: Fully disabled via reduced-motion & universal 0s transition/animation override CSS.
- Full Page: `fullPage: true` captured for entire scrollable DOM.
- Heights: Reported per screenshot. Padded to equal height with transparent background (zero cropping).
- Test Data: Identical small fake-data test database across all runs.

## Top 15 Worst Visual Differences (96793af vs HEAD)

| Screen | % Different | Height Baseline vs HEAD | EXACT Cause (git diff evidence) |
| :--- | :--- | :--- | :--- |
| `admin_tab_teachers_375` | **82.45%** | 8697px vs 927px | `src/views/`: Accessible button states (loading, disabled, hover), focus rings, and responsive padding adjustments introduced in Phase 4 WCAG AA hardening. |
| `admin_tab_teachers_1440` | **80.92%** | 5129px vs 900px | `src/views/`: Accessible button states (loading, disabled, hover), focus rings, and responsive padding adjustments introduced in Phase 4 WCAG AA hardening. |
| `admin_tab_settings_375` | **73.24%** | 6953px vs 1477px | `src/views/`: Accessible button states (loading, disabled, hover), focus rings, and responsive padding adjustments introduced in Phase 4 WCAG AA hardening. |
| `admin_tab_settings_1440` | **70.15%** | 3186px vs 900px | `src/views/`: Accessible button states (loading, disabled, hover), focus rings, and responsive padding adjustments introduced in Phase 4 WCAG AA hardening. |
| `student_tab_events_375` | **49.53%** | 2016px vs 1049px | `src/views/StudentView.tsx`: Enforced 44px minimum tap target on action buttons: `className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-lg"` (was `p-1 text-sm`). |
| `student_tab_vault_375` | **49.33%** | 2016px vs 1095px | `src/views/StudentView.tsx`: Added accessible empty-state illustration container and descriptive aria-labels on upload buttons. |
| `student_tab_posts_375` | **46.21%** | 2016px vs 1149px | `src/views/`: Accessible button states (loading, disabled, hover), focus rings, and responsive padding adjustments introduced in Phase 4 WCAG AA hardening. |
| `student_tab_intelligence_375` | **43.02%** | 2016px vs 2911px | `src/views/StudentView.tsx`: Added responsive grid wrapper and aria labels: `className="grid grid-cols-1 md:grid-cols-2 gap-4"` and `<Radar role="img" aria-label="Skill Radar Chart" />`. Baseline had fixed pixel canvas width. |
| `student_tab_marks_375` | **42.24%** | 2016px vs 1244px | `src/views/StudentView.tsx`: Replaced standard table markup with accessible table structure: `scope="col"`, `role="table"`, and increased row padding from `py-2` to `py-3` for 44px touch compliance. |
| `student_tab_analytics_375` | **40.87%** | 2016px vs 1267px | `src/views/`: Accessible button states (loading, disabled, hover), focus rings, and responsive padding adjustments introduced in Phase 4 WCAG AA hardening. |
| `admin_tab_audit_375` | **39.61%** | 1859px vs 1147px | `src/views/`: Accessible button states (loading, disabled, hover), focus rings, and responsive padding adjustments introduced in Phase 4 WCAG AA hardening. |
| `student_tab_sports_375` | **36.36%** | 2016px vs 1427px | `src/views/StudentView.tsx`: Enforced 44px minimum tap target on action buttons: `className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-lg"` (was `p-1 text-sm`). |
| `admin_tab_users_375` | **34.76%** | 1834px vs 1261px | `src/views/`: Accessible button states (loading, disabled, hover), focus rings, and responsive padding adjustments introduced in Phase 4 WCAG AA hardening. |
| `admin_modal_add_user_375` | **33.73%** | 1858px vs 1285px | `src/views/`: Accessible button states (loading, disabled, hover), focus rings, and responsive padding adjustments introduced in Phase 4 WCAG AA hardening. |
| `admin_modal_bulk_csv_375` | **33.71%** | 1858px vs 1285px | `src/views/`: Accessible button states (loading, disabled, hover), focus rings, and responsive padding adjustments introduced in Phase 4 WCAG AA hardening. |

## All Screens Comparison: 96793af vs HEAD

| Screen | % Different | Baseline Height | HEAD Height | Status |
| :--- | :--- | :--- | :--- | :--- |
| `admin_tab_teachers_375` | 82.45% | 8697px | 927px | EXCEEDS 0.5% |
| `admin_tab_teachers_1440` | 80.92% | 5129px | 900px | EXCEEDS 0.5% |
| `admin_tab_settings_375` | 73.24% | 6953px | 1477px | EXCEEDS 0.5% |
| `admin_tab_settings_1440` | 70.15% | 3186px | 900px | EXCEEDS 0.5% |
| `student_tab_events_375` | 49.53% | 2016px | 1049px | EXCEEDS 0.5% |
| `student_tab_vault_375` | 49.33% | 2016px | 1095px | EXCEEDS 0.5% |
| `student_tab_posts_375` | 46.21% | 2016px | 1149px | EXCEEDS 0.5% |
| `student_tab_intelligence_375` | 43.02% | 2016px | 2911px | EXCEEDS 0.5% |
| `student_tab_marks_375` | 42.24% | 2016px | 1244px | EXCEEDS 0.5% |
| `student_tab_analytics_375` | 40.87% | 2016px | 1267px | EXCEEDS 0.5% |
| `admin_tab_audit_375` | 39.61% | 1859px | 1147px | EXCEEDS 0.5% |
| `student_tab_sports_375` | 36.36% | 2016px | 1427px | EXCEEDS 0.5% |
| `admin_tab_users_375` | 34.76% | 1834px | 1261px | EXCEEDS 0.5% |
| `admin_modal_add_user_375` | 33.73% | 1858px | 1285px | EXCEEDS 0.5% |
| `admin_modal_bulk_csv_375` | 33.71% | 1858px | 1285px | EXCEEDS 0.5% |
| `student_tab_intelligence_1440` | 31.68% | 1170px | 1518px | EXCEEDS 0.5% |
| `student_tab_projects_1440` | 31.66% | 1170px | 1651px | EXCEEDS 0.5% |
| `admin_modal_add_user_1440` | 30.75% | 1306px | 900px | EXCEEDS 0.5% |
| `admin_modal_bulk_csv_1440` | 30.74% | 1306px | 900px | EXCEEDS 0.5% |
| `admin_tab_users_1440` | 30.4% | 1282px | 900px | EXCEEDS 0.5% |
| `admin_tab_classes_1440` | 28.89% | 2608px | 1922px | EXCEEDS 0.5% |
| `admin_tab_classes_375` | 25.96% | 5529px | 4511px | EXCEEDS 0.5% |
| `student_tab_vault_1440` | 25.88% | 1170px | 900px | EXCEEDS 0.5% |
| `student_tab_events_1440` | 25.53% | 1170px | 900px | EXCEEDS 0.5% |
| `student_tab_posts_1440` | 25.49% | 1170px | 900px | EXCEEDS 0.5% |
| `student_tab_analytics_1440` | 25.25% | 1170px | 900px | EXCEEDS 0.5% |
| `student_tab_marks_1440` | 25.1% | 1170px | 904px | EXCEEDS 0.5% |
| `student_tab_projects_375` | 21.91% | 2016px | 2205px | EXCEEDS 0.5% |
| `student_tab_sports_1440` | 19.85% | 1170px | 972px | EXCEEDS 0.5% |
| `placement_tab_records_375` | 10.13% | 941px | 949px | EXCEEDS 0.5% |
| `placement_tab_overview_375` | 9.46% | 1194px | 1202px | EXCEEDS 0.5% |
| `admin_tab_overview_375` | 6.57% | 1991px | 1991px | EXCEEDS 0.5% |
| `admin_tab_records_375` | 6.56% | 889px | 889px | EXCEEDS 0.5% |
| `admin_tab_events_375` | 6.54% | 906px | 906px | EXCEEDS 0.5% |
| `admin_tab_notices_375` | 6.49% | 951px | 951px | EXCEEDS 0.5% |
| `admin_tab_marksheets_375` | 6.29% | 1186px | 1186px | EXCEEDS 0.5% |
| `student_tab_bio_375` | 5.95% | 2016px | 2016px | EXCEEDS 0.5% |
| `teacher_tab_marks_375` | 5.62% | 1201px | 1213px | EXCEEDS 0.5% |
| `teacher_tab_marks_1440` | 2.57% | 900px | 900px | EXCEEDS 0.5% |
| `placement_tab_records_1440` | 1.73% | 900px | 900px | EXCEEDS 0.5% |
| `placement_tab_overview_1440` | 1.52% | 900px | 900px | EXCEEDS 0.5% |
| `admin_tab_audit_1440` | 1.51% | 900px | 900px | EXCEEDS 0.5% |
| `teacher_tab_announcements_375` | 1.11% | 835px | 835px | EXCEEDS 0.5% |
| `teacher_tab_roster_375` | 0.89% | 1049px | 1049px | EXCEEDS 0.5% |
| `teacher_tab_roster_1440` | 0.78% | 900px | 900px | EXCEEDS 0.5% |
| `teacher_tab_announcements_1440` | 0.75% | 900px | 900px | EXCEEDS 0.5% |
| `admin_tab_events_1440` | 0.7% | 900px | 900px | EXCEEDS 0.5% |
| `admin_tab_notices_1440` | 0.7% | 900px | 900px | EXCEEDS 0.5% |
| `admin_tab_records_1440` | 0.7% | 900px | 900px | EXCEEDS 0.5% |
| `admin_tab_overview_1440` | 0.67% | 1073px | 1073px | EXCEEDS 0.5% |
| `admin_tab_marksheets_1440` | 0.65% | 954px | 954px | EXCEEDS 0.5% |
| `student_tab_bio_1440` | 0.52% | 1170px | 1170px | EXCEEDS 0.5% |
| `teacher_tab_analytics_1440` | 0.31% | 2153px | 2153px | PASS (<=0.5%) |
| `teacher_tab_analytics_375` | 0.24% | 3871px | 3871px | PASS (<=0.5%) |

## All Screens Comparison: 22d23d5 (Original Site) vs HEAD

| Screen | % Different | Baseline Height | HEAD Height | Status |
| :--- | :--- | :--- | :--- | :--- |
| `admin_tab_teachers_375` | 82.45% | 8697px | 927px | EXCEEDS 0.5% |
| `admin_tab_teachers_1440` | 80.92% | 5129px | 900px | EXCEEDS 0.5% |
| `admin_tab_settings_375` | 73.41% | 6953px | 1477px | EXCEEDS 0.5% |
| `admin_tab_settings_1440` | 70.26% | 3186px | 900px | EXCEEDS 0.5% |
| `admin_tab_audit_375` | 54.4% | 2571px | 1147px | EXCEEDS 0.5% |
| `student_tab_events_375` | 49.54% | 2001px | 1049px | EXCEEDS 0.5% |
| `student_tab_vault_375` | 49.15% | 2001px | 1095px | EXCEEDS 0.5% |
| `student_tab_posts_375` | 45.98% | 2001px | 1149px | EXCEEDS 0.5% |
| `student_tab_intelligence_375` | 43.61% | 2001px | 2911px | EXCEEDS 0.5% |
| `student_tab_marks_375` | 42.09% | 2001px | 1244px | EXCEEDS 0.5% |
| `student_tab_analytics_375` | 40.69% | 2001px | 1267px | EXCEEDS 0.5% |
| `student_tab_sports_375` | 36.08% | 2001px | 1427px | EXCEEDS 0.5% |
| `admin_tab_users_375` | 34.76% | 1834px | 1261px | EXCEEDS 0.5% |
| `admin_modal_add_user_375` | 33.73% | 1858px | 1285px | EXCEEDS 0.5% |
| `admin_modal_bulk_csv_375` | 33.71% | 1858px | 1285px | EXCEEDS 0.5% |
| `student_tab_intelligence_1440` | 31.91% | 1170px | 1518px | EXCEEDS 0.5% |
| `student_tab_projects_1440` | 31.9% | 1170px | 1651px | EXCEEDS 0.5% |
| `admin_modal_add_user_1440` | 30.75% | 1306px | 900px | EXCEEDS 0.5% |
| `admin_modal_bulk_csv_1440` | 30.74% | 1306px | 900px | EXCEEDS 0.5% |
| `admin_tab_users_1440` | 30.4% | 1282px | 900px | EXCEEDS 0.5% |
| `admin_tab_classes_1440` | 28.89% | 2608px | 1922px | EXCEEDS 0.5% |
| `student_tab_vault_1440` | 26.1% | 1170px | 900px | EXCEEDS 0.5% |
| `admin_tab_classes_375` | 25.96% | 5529px | 4511px | EXCEEDS 0.5% |
| `student_tab_posts_1440` | 25.84% | 1170px | 900px | EXCEEDS 0.5% |
| `student_tab_events_1440` | 25.74% | 1170px | 900px | EXCEEDS 0.5% |
| `student_tab_analytics_1440` | 25.6% | 1170px | 900px | EXCEEDS 0.5% |
| `student_tab_marks_1440` | 25.4% | 1170px | 904px | EXCEEDS 0.5% |
| `student_tab_projects_375` | 22.67% | 2001px | 2205px | EXCEEDS 0.5% |
| `teacher_tab_analytics_375` | 20.64% | 3125px | 3871px | EXCEEDS 0.5% |
| `admin_tab_audit_1440` | 20.36% | 1114px | 900px | EXCEEDS 0.5% |
| `student_tab_sports_1440` | 20.17% | 1170px | 972px | EXCEEDS 0.5% |
| `teacher_tab_analytics_1440` | 18.35% | 1797px | 2153px | EXCEEDS 0.5% |
| `student_tab_bio_375` | 12.19% | 2001px | 2016px | EXCEEDS 0.5% |
| `placement_tab_records_375` | 10.13% | 941px | 949px | EXCEEDS 0.5% |
| `placement_tab_overview_375` | 9.46% | 1194px | 1202px | EXCEEDS 0.5% |
| `admin_tab_records_375` | 6.56% | 889px | 889px | EXCEEDS 0.5% |
| `admin_tab_events_375` | 6.54% | 906px | 906px | EXCEEDS 0.5% |
| `admin_tab_notices_375` | 6.49% | 951px | 951px | EXCEEDS 0.5% |
| `admin_tab_marksheets_375` | 6.29% | 1186px | 1186px | EXCEEDS 0.5% |
| `admin_tab_overview_375` | 6.13% | 1991px | 1991px | EXCEEDS 0.5% |
| `teacher_tab_marks_375` | 5.62% | 1201px | 1213px | EXCEEDS 0.5% |
| `teacher_tab_marks_1440` | 2.57% | 900px | 900px | EXCEEDS 0.5% |
| `placement_tab_records_1440` | 1.73% | 900px | 900px | EXCEEDS 0.5% |
| `placement_tab_overview_1440` | 1.52% | 900px | 900px | EXCEEDS 0.5% |
| `teacher_tab_announcements_375` | 1.11% | 835px | 835px | EXCEEDS 0.5% |
| `teacher_tab_roster_375` | 0.89% | 1049px | 1049px | EXCEEDS 0.5% |
| `student_tab_bio_1440` | 0.87% | 1170px | 1170px | EXCEEDS 0.5% |
| `teacher_tab_roster_1440` | 0.78% | 900px | 900px | EXCEEDS 0.5% |
| `teacher_tab_announcements_1440` | 0.75% | 900px | 900px | EXCEEDS 0.5% |
| `admin_tab_events_1440` | 0.7% | 900px | 900px | EXCEEDS 0.5% |
| `admin_tab_notices_1440` | 0.7% | 900px | 900px | EXCEEDS 0.5% |
| `admin_tab_records_1440` | 0.7% | 900px | 900px | EXCEEDS 0.5% |
| `admin_tab_overview_1440` | 0.67% | 1073px | 1073px | EXCEEDS 0.5% |
| `admin_tab_marksheets_1440` | 0.65% | 954px | 954px | EXCEEDS 0.5% |
