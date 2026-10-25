# Visual Regression Audit: 96793af vs HEAD

**Evaluated At**: 2026-10-25T18:09:00.810Z
**Baseline Commit**: `96793af` (port 3006)
**HEAD Commit**: `HEAD` (port 3000)
**Total Screens Compared**: 60
**Screens Exceeding 0.5% Diff**: 52

## Full Screen Comparison

| Screen | % Different | Status |
| :--- | :--- | :--- |
| `admin_modal_add_user_1440` | 0.34% | PASS (<=0.5%) |
| `admin_modal_add_user_375` | 0.43% | PASS (<=0.5%) |
| `admin_modal_advance_term_1440` | 0.33% | PASS (<=0.5%) |
| `admin_modal_advance_term_375` | 0.37% | PASS (<=0.5%) |
| `admin_modal_assign_teacher_1440` | 0.34% | PASS (<=0.5%) |
| `admin_modal_assign_teacher_375` | 0.38% | PASS (<=0.5%) |
| `admin_modal_bulk_csv_1440` | 0.34% | PASS (<=0.5%) |
| `admin_modal_bulk_csv_375` | 0.38% | PASS (<=0.5%) |
| `admin_tab_audit_1440` | 0.91% | **EXCEEDS 0.5%** |
| `admin_tab_audit_375` | 1.88% | **EXCEEDS 0.5%** |
| `admin_tab_classes_1440` | 4.37% | **EXCEEDS 0.5%** |
| `admin_tab_classes_375` | 4.37% | **EXCEEDS 0.5%** |
| `admin_tab_events_1440` | 0.7% | **EXCEEDS 0.5%** |
| `admin_tab_events_375` | 1.31% | **EXCEEDS 0.5%** |
| `admin_tab_marksheets_1440` | 0.69% | **EXCEEDS 0.5%** |
| `admin_tab_marksheets_375` | 1.31% | **EXCEEDS 0.5%** |
| `admin_tab_notices_1440` | 0.7% | **EXCEEDS 0.5%** |
| `admin_tab_notices_375` | 1.33% | **EXCEEDS 0.5%** |
| `admin_tab_overview_1440` | 0.79% | **EXCEEDS 0.5%** |
| `admin_tab_overview_375` | 1.73% | **EXCEEDS 0.5%** |
| `admin_tab_records_1440` | 0.7% | **EXCEEDS 0.5%** |
| `admin_tab_records_375` | 1.31% | **EXCEEDS 0.5%** |
| `admin_tab_settings_1440` | 0.69% | **EXCEEDS 0.5%** |
| `admin_tab_settings_375` | 1.3% | **EXCEEDS 0.5%** |
| `admin_tab_teachers_1440` | 0.69% | **EXCEEDS 0.5%** |
| `admin_tab_teachers_375` | 1.3% | **EXCEEDS 0.5%** |
| `admin_tab_users_1440` | 0.69% | **EXCEEDS 0.5%** |
| `admin_tab_users_375` | 1.31% | **EXCEEDS 0.5%** |
| `placement_tab_overview_1440` | 1.5% | **EXCEEDS 0.5%** |
| `placement_tab_overview_375` | 3.33% | **EXCEEDS 0.5%** |
| `placement_tab_records_1440` | 1.5% | **EXCEEDS 0.5%** |
| `placement_tab_records_375` | 3.39% | **EXCEEDS 0.5%** |
| `student_tab_analytics_1440` | 3.25% | **EXCEEDS 0.5%** |
| `student_tab_analytics_375` | 5.36% | **EXCEEDS 0.5%** |
| `student_tab_bio_1440` | 0.68% | **EXCEEDS 0.5%** |
| `student_tab_bio_375` | 1.15% | **EXCEEDS 0.5%** |
| `student_tab_events_1440` | 3.62% | **EXCEEDS 0.5%** |
| `student_tab_events_375` | 21.62% | **EXCEEDS 0.5%** |
| `student_tab_intelligence_1440` | 14.36% | **EXCEEDS 0.5%** |
| `student_tab_intelligence_375` | 42.56% | **EXCEEDS 0.5%** |
| `student_tab_marks_1440` | 3.42% | **EXCEEDS 0.5%** |
| `student_tab_marks_375` | 21.24% | **EXCEEDS 0.5%** |
| `student_tab_posts_1440` | 3.57% | **EXCEEDS 0.5%** |
| `student_tab_posts_375` | 7.12% | **EXCEEDS 0.5%** |
| `student_tab_projects_1440` | 4.08% | **EXCEEDS 0.5%** |
| `student_tab_projects_375` | 8% | **EXCEEDS 0.5%** |
| `student_tab_sports_1440` | 3.98% | **EXCEEDS 0.5%** |
| `student_tab_sports_375` | 23.26% | **EXCEEDS 0.5%** |
| `student_tab_vault_1440` | 4.08% | **EXCEEDS 0.5%** |
| `student_tab_vault_375` | 24.7% | **EXCEEDS 0.5%** |
| `teacher_modal_batch_csv_1440` | 0.67% | **EXCEEDS 0.5%** |
| `teacher_modal_batch_csv_375` | 1.59% | **EXCEEDS 0.5%** |
| `teacher_tab_analytics_1440` | 0.75% | **EXCEEDS 0.5%** |
| `teacher_tab_analytics_375` | 1.56% | **EXCEEDS 0.5%** |
| `teacher_tab_announcements_1440` | 0.75% | **EXCEEDS 0.5%** |
| `teacher_tab_announcements_375` | 1.04% | **EXCEEDS 0.5%** |
| `teacher_tab_marks_1440` | 2.36% | **EXCEEDS 0.5%** |
| `teacher_tab_marks_375` | 5.63% | **EXCEEDS 0.5%** |
| `teacher_tab_roster_1440` | 0.75% | **EXCEEDS 0.5%** |
| `teacher_tab_roster_375` | 1.55% | **EXCEEDS 0.5%** |

## Screens Exceeding 0.5% Diff

### `admin_tab_audit_1440` (0.91% different)
- **Pixels Differing**: 11805 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/admin_tab_audit_1440.png`

### `admin_tab_audit_375` (1.88% different)
- **Pixels Differing**: 5734 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/admin_tab_audit_375.png`

### `admin_tab_classes_1440` (4.37% different)
- **Pixels Differing**: 56581 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/admin_tab_classes_1440.png`

### `admin_tab_classes_375` (4.37% different)
- **Pixels Differing**: 13305 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/admin_tab_classes_375.png`

### `admin_tab_events_1440` (0.7% different)
- **Pixels Differing**: 9086 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/admin_tab_events_1440.png`

### `admin_tab_events_375` (1.31% different)
- **Pixels Differing**: 3988 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/admin_tab_events_375.png`

### `admin_tab_marksheets_1440` (0.69% different)
- **Pixels Differing**: 8909 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/admin_tab_marksheets_1440.png`

### `admin_tab_marksheets_375` (1.31% different)
- **Pixels Differing**: 3987 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/admin_tab_marksheets_375.png`

### `admin_tab_notices_1440` (0.7% different)
- **Pixels Differing**: 9055 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/admin_tab_notices_1440.png`

### `admin_tab_notices_375` (1.33% different)
- **Pixels Differing**: 4064 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/admin_tab_notices_375.png`

### `admin_tab_overview_1440` (0.79% different)
- **Pixels Differing**: 10217 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/admin_tab_overview_1440.png`

### `admin_tab_overview_375` (1.73% different)
- **Pixels Differing**: 5256 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/admin_tab_overview_375.png`

### `admin_tab_records_1440` (0.7% different)
- **Pixels Differing**: 9066 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/admin_tab_records_1440.png`

### `admin_tab_records_375` (1.31% different)
- **Pixels Differing**: 3979 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/admin_tab_records_375.png`

### `admin_tab_settings_1440` (0.69% different)
- **Pixels Differing**: 8929 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/admin_tab_settings_1440.png`

### `admin_tab_settings_375` (1.3% different)
- **Pixels Differing**: 3963 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/admin_tab_settings_375.png`

### `admin_tab_teachers_1440` (0.69% different)
- **Pixels Differing**: 8925 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/admin_tab_teachers_1440.png`

### `admin_tab_teachers_375` (1.3% different)
- **Pixels Differing**: 3972 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/admin_tab_teachers_375.png`

### `admin_tab_users_1440` (0.69% different)
- **Pixels Differing**: 8903 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/admin_tab_users_1440.png`

### `admin_tab_users_375` (1.31% different)
- **Pixels Differing**: 3992 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/admin_tab_users_375.png`

### `placement_tab_overview_1440` (1.5% different)
- **Pixels Differing**: 19487 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/placement_tab_overview_1440.png`

### `placement_tab_overview_375` (3.33% different)
- **Pixels Differing**: 10136 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/placement_tab_overview_375.png`

### `placement_tab_records_1440` (1.5% different)
- **Pixels Differing**: 19436 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/placement_tab_records_1440.png`

### `placement_tab_records_375` (3.39% different)
- **Pixels Differing**: 10330 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/placement_tab_records_375.png`

### `student_tab_analytics_1440` (3.25% different)
- **Pixels Differing**: 42168 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/student_tab_analytics_1440.png`

### `student_tab_analytics_375` (5.36% different)
- **Pixels Differing**: 16320 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/student_tab_analytics_375.png`

### `student_tab_bio_1440` (0.68% different)
- **Pixels Differing**: 8785 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/student_tab_bio_1440.png`

### `student_tab_bio_375` (1.15% different)
- **Pixels Differing**: 3508 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/student_tab_bio_375.png`

### `student_tab_events_1440` (3.62% different)
- **Pixels Differing**: 46945 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/student_tab_events_1440.png`

### `student_tab_events_375` (21.62% different)
- **Pixels Differing**: 65822 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/student_tab_events_375.png`

### `student_tab_intelligence_1440` (14.36% different)
- **Pixels Differing**: 186084 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/student_tab_intelligence_1440.png`

### `student_tab_intelligence_375` (42.56% different)
- **Pixels Differing**: 129587 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/student_tab_intelligence_375.png`

### `student_tab_marks_1440` (3.42% different)
- **Pixels Differing**: 44304 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/student_tab_marks_1440.png`

### `student_tab_marks_375` (21.24% different)
- **Pixels Differing**: 64686 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/student_tab_marks_375.png`

### `student_tab_posts_1440` (3.57% different)
- **Pixels Differing**: 46253 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/student_tab_posts_1440.png`

### `student_tab_posts_375` (7.12% different)
- **Pixels Differing**: 21693 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/student_tab_posts_375.png`

### `student_tab_projects_1440` (4.08% different)
- **Pixels Differing**: 52923 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/student_tab_projects_1440.png`

### `student_tab_projects_375` (8% different)
- **Pixels Differing**: 24372 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/student_tab_projects_375.png`

### `student_tab_sports_1440` (3.98% different)
- **Pixels Differing**: 51613 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/student_tab_sports_1440.png`

### `student_tab_sports_375` (23.26% different)
- **Pixels Differing**: 70841 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/student_tab_sports_375.png`

### `student_tab_vault_1440` (4.08% different)
- **Pixels Differing**: 52904 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/student_tab_vault_1440.png`

### `student_tab_vault_375` (24.7% different)
- **Pixels Differing**: 75201 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/student_tab_vault_375.png`

### `teacher_modal_batch_csv_1440` (0.67% different)
- **Pixels Differing**: 8664 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/teacher_modal_batch_csv_1440.png`

### `teacher_modal_batch_csv_375` (1.59% different)
- **Pixels Differing**: 4837 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/teacher_modal_batch_csv_375.png`

### `teacher_tab_analytics_1440` (0.75% different)
- **Pixels Differing**: 9659 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/teacher_tab_analytics_1440.png`

### `teacher_tab_analytics_375` (1.56% different)
- **Pixels Differing**: 4745 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/teacher_tab_analytics_375.png`

### `teacher_tab_announcements_1440` (0.75% different)
- **Pixels Differing**: 9737 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/teacher_tab_announcements_1440.png`

### `teacher_tab_announcements_375` (1.04% different)
- **Pixels Differing**: 3162 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/teacher_tab_announcements_375.png`

### `teacher_tab_marks_1440` (2.36% different)
- **Pixels Differing**: 30557 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/teacher_tab_marks_1440.png`

### `teacher_tab_marks_375` (5.63% different)
- **Pixels Differing**: 17136 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/teacher_tab_marks_375.png`

### `teacher_tab_roster_1440` (0.75% different)
- **Pixels Differing**: 9742 / 1296000
- **Diff Artifact**: `reports/visual-diff/diff/teacher_tab_roster_1440.png`

### `teacher_tab_roster_375` (1.55% different)
- **Pixels Differing**: 4732 / 304500
- **Diff Artifact**: `reports/visual-diff/diff/teacher_tab_roster_375.png`

