---
name: ui-buttons-and-interactions
description: Use when adding or changing any button, form, toggle, modal, or action. Enforces interaction states, double-submit prevention, confirmation dialogs, accessibility, and error feedback.
---

# UI Buttons and Interactions - Vission Academy

## Core Interaction Standards
Every interactive element across `src/views/` (`AdminView.tsx`, `TeacherView.tsx`, `PlacementView.tsx`, `StudentView.tsx`, `LoginView.tsx`) and `src/components/` must provide unambiguous tactile and visual feedback.

## 1. Button States & Double-Submit Prevention
- **Six Required States**: Every interactive button must support:
  1. `default`: Clear boundary, legible contrast.
  2. `hover`: Subtle brightness/background shift.
  3. `focus-visible`: High-contrast ring (`focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500`).
  4. `active`: Slight scale reduction or inset shadow.
  5. `disabled`: Reduced opacity (`opacity-50 cursor-not-allowed pointer-events-none`).
  6. `loading`: Disabled state with an inline spinning icon (`lucide-react` `Loader2` or `RefreshCw animate-spin`) replacing or accompanying the label.
- **Double-Submit Prevention**:
  - All asynchronous action triggers (e.g. "Save Marks", "Create Assessment", "Upload Marksheets", "Submit Project", "Login") MUST set local state `isSubmitting = true`.
  - The trigger button MUST be disabled immediately upon click until the Promise settles (resolves or catches).

## 2. Destructive Actions & Confirmation Dialogs
- Never execute irreversible or batch mutating actions on a single raw click:
  - Deleting a user account (Student, Faculty, Placement Officer) in `AdminView.tsx`.
  - Deactivating student or faculty access.
  - Bulk marksheet uploads overwriting semester records.
  - Administrative global action: "Sync All Analytics" (`/api/admin/analytics/sync-all`).
- **Confirmation Protocol**: Open a modal or explicit inline confirmation step ("Are you sure you want to delete this user? This action cannot be undone.") with clear "Cancel" and "Confirm [Action]" options.

## 3. Analytics Visibility Toggle Switches
- In `AdminView.tsx` (Faculty & Placement analytics visibility switches: Academic, GitHub, HackerRank, LinkedIn, LeetCode, Hackathons):
  - Provide optimistic UI update with visual loading indicator.
  - Display saved confirmation (toast or green badge pulse).
  - If the API call fails, immediately **roll back the toggle state** and display an alert toast explaining the failure. Never leave the UI showing "enabled" if the backend rejected the update.

## 4. Accessibility, Semantics & Keyboard Operability
- **Touch Target Size**: Minimum 44x44px clickable area (WCAG 2.5.5) for touch and mobile viewports.
- **HTML Semantics**:
  - Use `type="button"` for plain actions.
  - Use `type="submit"` ONLY for form submit triggers.
- **Icon-Only Buttons**: Any button containing solely an icon (e.g., search clear `X`, modal close, edit pen, delete trashcan) MUST include an accessible `aria-label` (e.g. `aria-label="Close dialog"`).
- **Modals & Drawers Keyboard Trap**:
  - `Escape` key closes active modals (`NotificationModal.tsx`, `ResetPasswordModal.tsx`, `AiAssistantDrawer.tsx`).
  - Traps tab focus inside active dialogs and restores focus to triggering element on exit.

## 5. API Error Feedback
- **Zero Silent Failures**: Every `catch(err)` block in `src/views/` or `src/lib/api.ts` must display a human-readable error banner or toast to the user.
- Never catch and log to `console.error` alone without alerting the user.

See [checklist.md](file:///c:/Users/Aryan/Downloads/vission-academy/.agent/skills/ui-buttons-and-interactions/references/checklist.md) for full audit criteria.
