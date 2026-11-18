# Verification and course demo

## Delivery verification — 18 November 2026

- `npm test`: 8/8 business-rule tests passed.
- `npm run validate`: entry and nine rendered view/form cases passed HTML checks; CSS parsed without syntax errors.
- `npm run check`: all checked source files follow Prettier formatting.
- `npm run build`: production build succeeded without chunk warnings.
- Browser demo: payment totals/reminders updated, the next month's invoice remained unpaid, bill creation/search/edit/archive succeeded, and data survived a reload and demo re-entry.
- Desktop and 390 × 844 mobile overview/calendar layouts were visually checked. Final desktop capture: `pocketbill-preview.jpg`.
- Live Firebase registration, password-reset delivery, cloud persistence and Rules execution have not been tested because no Firebase project configuration was supplied. Follow the two-account checklist below before submission as a hosted service.
- Dependency audit after the gRPC fix reported 4 high-severity findings in the picomatch/Vite development-tool chain; details and scope appear below.

## Automated checks

Run `npm test` for month-end/leap-year recurrence, one-time/yearly schedules, independent payment flags, immutable historical snapshots, archive behavior, amount/date validation, daylight-saving boundaries and missed-month catch-up.

Run `npm run validate` for local HTML and CSS syntax checks, `npm run check` for readable formatting, and `npm run build` for production compilation.

## Browser acceptance checklist

1. Enter the explicitly labelled demo workspace.
2. Mark one invoice as paid; confirm the dashboard totals, counts and reminders change.
3. Move to the following month; the corresponding recurring payment must remain unpaid.
4. Add a bill, search for its name, edit its rule, archive it and find Restore under Archived.
5. Existing invoice snapshots retain their previous values after editing a bill rule.
6. Select a calendar day and check that only its invoices are listed.
7. Create/edit a group with member names. Assign a bill to the group and filter by it.
8. Change reminders and display name; leave and re-enter demo to verify persistence.
9. Check narrow/mobile layout and keyboard focus, including closing a modal with Escape.
10. Try blank names, zero/negative amounts and invalid dates; saving must be prevented.

## Firebase checks required after project configuration

The local demo cannot prove Firebase access isolation or delivery of password-reset emails. After deployment:

1. Register two disposable test accounts, A and B.
2. With A, create a group and bill, mark one invoice paid and reload; verify persistence.
3. Open A on another device/tab and verify listener synchronization.
4. Sign out; verify the workspace disappears. Sign in with B and verify A's records never appear.
5. In Firebase Rules Playground, verify unauthenticated requests to A's paths fail.
6. With B's UID, verify read/write requests to A's user, bills, invoices and groups paths fail.
7. With A's UID, verify invalid/negative amounts and arbitrary invoice snapshot changes fail, while updating only paid succeeds.
8. Verify password reset arrives at the controlled test inbox and the reset link works.

## Suggested presentation (3–5 minutes)

Explain the audience and problem; show overview and reminders; add a monthly bill; pay this month only; move to next month to demonstrate independence; show calendar and private group semantics; finish with the architecture and Rules access model.

## Dependencies

Use the committed package lock for reproducible installation. A compatible gRPC override addresses an advisory in Firebase's Node-side dependency. The browser application does not operate a gRPC server. Review the latest `npm audit` before public deployment. The current audit also reports an upstream picomatch ReDoS advisory with no patched release in its reported range; this is in the Vite build-tool dependency path, not user-entered bill processing. Do not blindly run `npm audit fix --force`: the suggested downgrade changes major Firebase/Vite versions.
