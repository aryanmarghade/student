# Web Design Quality Checklist - Vission Academy

## 1. Visual Hierarchy & Tokens
- [ ] Primary action per view is singular and distinct (solid accent color); secondary actions use subtle borders or ghost styles.
- [ ] Typography uses modern sans-serif for UI labels and monospace for roll numbers, marks, and code identifiers.
- [ ] No hardcoded colors; all backgrounds and text classes use consistent palette shades.
- [ ] No generic purple/pink gradients or unstyled card grids.
- [ ] Lucide icons used consistently with standard size (16px, 18px, or 20px) and appropriate stroke width.

## 2. Responsive Layouts
- [ ] **Mobile (375px)**:
  - Header collapses into clean menu or compact actions.
  - Tables provide horizontal scrolling container or convert into stacked cards.
  - Modals and drawers fill width with safe-area padding.
- [ ] **Tablet (768px)**:
  - Multi-column grids collapse gracefully (e.g., 4 columns -> 2 columns).
  - Filter bars wrap cleanly without clipping controls.
- [ ] **Desktop (1440px)**:
  - Maximum content constraint prevents over-stretched wide tables.
  - Sidebar and navigation remain stable and proportional.

## 3. Data Tables & Lists
- [ ] Header cells have uppercase muted styling (`text-xs font-semibold text-slate-500 uppercase tracking-wider`).
- [ ] Number columns are right-aligned; text columns are left-aligned; badge pills are centered.
- [ ] Empty state renders when filtered array length is 0, showing an icon, a descriptive label, and a "Clear Filters" button.
- [ ] Pagination or scroll virtualization functions smoothly for rosters (>100 students).

## 4. Charts & Analytics
- [ ] `Chart.js` canvas instances resize cleanly without infinite growth or canvas clipping.
- [ ] Color legends match institutional palette with sufficient contrast.
- [ ] Tooltip formatters render readable student scores, percentages, and semester names.

## 5. Animation & Accessibility
- [ ] Transitions are subtle (150ms - 250ms), avoiding sluggish bounce or layout shifts.
- [ ] `motion` components and CSS transitions respect `prefers-reduced-motion`.
- [ ] Color contrast passes WCAG AA 4.5:1 for body copy and 3:1 for large display titles.
