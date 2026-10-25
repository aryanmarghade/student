# UI Buttons and Interactions Checklist - Vission Academy

## 1. Button Lifecycle & Async States
- [ ] Every asynchronous button sets a loading flag (`loading === true`) while the network request is in flight.
- [ ] During loading, the button displays a spinner (`Loader2` or `RefreshCw` with `animate-spin`) and has `disabled={true}`.
- [ ] Re-clicking rapidly does not generate concurrent requests or duplicate submissions.
- [ ] On completion, the button gracefully returns to its default state or presents a temporary checkmark indicator.

## 2. Destructive Action Verifications
- [ ] Admin user deactivation/deletion prompts a verification dialog before triggering `DELETE /api/admin/users/:id`.
- [ ] Marksheet bulk upload modal warns the admin when replacing existing semester marks.
- [ ] Triggering "Sync All Analytics" shows an informative modal explaining sync execution time and asks for confirmation.

## 3. Toggle Switches (Admin Visibility Settings)
- [ ] Toggling any of the 6 platforms (Academic, GitHub, HackerRank, LinkedIn, LeetCode, Hackathons) triggers `PATCH /api/admin/teachers/:id/analytics-visibility` or `/api/admin/placement/:id/analytics-visibility`.
- [ ] If network request throws an error or backend returns 4xx/5xx:
  - Toggle reverts back to previous position.
  - Toast error appears: `"Failed to update visibility setting. Please try again."`

## 4. Keyboard Navigation & Accessibility
- [ ] All interactive buttons and anchors are navigable using the `Tab` key.
- [ ] Focus rings are visible and prominent (`focus-visible:ring-2 focus-visible:ring-indigo-500`).
- [ ] Icon-only buttons have explicit `aria-label` attribute (e.g. `aria-label="Delete Student"`).
- [ ] Modals close when pressing `Escape`.
- [ ] Form submit buttons have `type="submit"`; non-form action buttons have `type="button"`.

## 5. Error & Notice Presentation
- [ ] API exceptions are intercepted and displayed in user-facing toasts or banner alerts.
- [ ] Error messages provide actionable instructions (e.g., "Invalid student roll number format", "Network error: server unreachable").
