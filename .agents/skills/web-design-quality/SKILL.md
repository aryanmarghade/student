---
name: web-design-quality
description: Use when building or restyling any UI in src/views or src/components. Enforces institutional dashboard design tokens, accessibility, and component standards.
---

# Web Design Quality - Vission Academy

## Core Philosophy & Design Brief
- **Target Users**: Institutional Administrators, Department Faculty/Teachers, Undergraduate/Graduate Students, and Corporate Placement Officers.
- **Tone**: Clean, authoritative, modern institutional academic dashboard. Inspires trust, readability, and high data density without clutter.
- **Scope**: All UI components in `src/views/` (`AdminView.tsx`, `TeacherView.tsx`, `PlacementView.tsx`, `StudentView.tsx`, `LoginView.tsx`) and `src/components/` (`Header.tsx`, `AiAssistantDrawer.tsx`, `NotificationModal.tsx`, `ResetPasswordModal.tsx`, `PostCard.tsx`).

## Design Tokens & Styling (Tailwind CSS v4)
- **Token Source**: Define tokens in `src/index.css` via `@theme` (colors, typography, spacing, border-radius, shadows).
- **Colors**: Slate/Indigo/Emerald academic palette (primary: deep indigo/navy `#1e293b` & `#312e81`, accent: `#4f46e5`, success: `#059669`, danger: `#dc2626`, muted: `#64748b`).
- **Typography**: Dual font system (Inter/Outfit for headings & body, JetBrains Mono for roll numbers, GPA, code, and hashes).
- **Prohibited Patterns**:
  - ❌ NO hardcoded hex codes or arbitrary values like `bg-[#8234ea]` inside view templates. Use semantic tokens.
  - ❌ NO generic purple/pink gradients (`bg-gradient-to-r from-purple-500 to-pink-500`).
  - ❌ NO identical repetitive card grids without information hierarchy.
  - ❌ NO raw emoji as icons (e.g. 📊, 🎓, ⚠️). Always use SVG icons from `lucide-react`.
  - ❌ NO "Lorem ipsum" or placeholder filler. Use realistic institutional data (e.g., Course Codes, SGPA, Roll Numbers).

## Component Guidelines
1. **Views & Visual Hierarchy**:
   - Exactly **one primary action button** per view (e.g., "Add User" in Admin, "Enter Marks" in Teacher, "Submit Project" in Student). Secondary actions must use outline/ghost variants.
   - Page header with breadcrumbs/context, status indicators, and clean action clusters.
2. **Data Tables & Filters**:
   - Fixed table headers, alternating row hover highlights, alignment: text left, numbers right, status badges centered.
   - Filter dropdowns and live search inputs must show instant clear buttons and count badges (e.g., "Showing 42 of 400 students").
3. **Charts (`chart.js` & `react-chartjs-2`)**:
   - Maintain accessible palette with high contrast against container backgrounds.
   - Always display tooltips, legible axis labels, and responsive canvas sizing.
4. **Modals & Drawers**:
   - Backdrop blur (`backdrop-blur-sm bg-slate-900/50`), visible close `X` button, sticky header and footer, scrollable modal body.
5. **States (Empty, Loading, Error)**:
   - **Empty States**: Meaningful illustration/icon from `lucide-react`, clear title (e.g., "No students match current filters"), explanation, and reset action.
   - **Loading Skeletons**: Use animated pulse skeletons matching layout geometry; avoid full-screen blocking spinners where content skeletons fit.
   - **Error Banners**: Non-blocking toast or banner with specific diagnostic message and retry button.

## Accessibility & Responsiveness
- **Contrast**: Minimum 4.5:1 text-to-background contrast ratio (WCAG AA compliant).
- **Responsive Breakpoints**: Check layout behavior at 375px (mobile), 768px (tablet/iPad), and 1440px (desktop dashboard).
- **Motion**: Transitions between 150ms–250ms with `ease-out`. Always respect `@media (prefers-reduced-motion: reduce)`.

See [checklist.md](file:///c:/Users/Aryan/Downloads/vission-academy/.agent/skills/web-design-quality/references/checklist.md) for detailed audit criteria.
