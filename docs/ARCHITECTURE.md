# PocketBill — service and architecture

## Purpose and audience

PocketBill helps students, young professionals, and households track rent, utilities, subscriptions, and occasional bills. It reduces the effort of remembering due dates and reconciling a list of expenses. The central question is: “What do I still need to pay, and when?”

The service offers one monthly overview, a calendar, searchable bill rules, and independent payment occurrences. It does not require bank access. Private groups organise household costs without exposing data to other people.

## Architecture

```text
Browser: React components + pure business logic
   |                  |
Firebase Auth     Cloud Firestore
   |                  |
UID identity     Owner-only Security Rules

Firebase Hosting serves dist/index.html and compiled assets.
```

React owns transient interface state. Firebase Authentication owns credentials and supplies the UID. Firestore listeners update the signed-in workspace. Transactions create invoices only when absent and update individual payment flags. The browser-only demo uses a separate localStorage key and is explicitly labelled.

## Database structure

| Path                        | Identifier / relationship                  | Fields                                                            |
| --------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `users/{uid}`               | Firebase Authentication UID                | name, reminders, reminderDays, dark                               |
| `users/{uid}/bills/{id}`    | Bill document ID; optional groupId         | name, amountCents, startDate, repeat, category, groupId, archived |
| `users/{uid}/invoices/{id}` | `billId_dueDate`; billId references a bill | billId, name, amountCents, dueDate, category, groupId, paid       |
| `users/{uid}/groups/{id}`   | Group document ID                          | name, members                                                     |

Firestore is document-oriented: conceptual PK/FK relationships are represented by document IDs and strings, not SQL constraints. The UID in the path identifies the owner. Rules check related bills/groups within that UID, avoiding cross-user references. A bill without a group has an empty groupId.

Group members are a bounded array of reference names (up to 20 including the owner). This deliberately embeds the small member entity rather than adding a separate collection. They have no authentication IDs, permissions or invitation flow. The project diagram should reflect this implementation choice.

## Recurrence and history

- Monetary values are integer cents to avoid total-rounding drift.
- Calendar strings use local dates; UTC is used only for day-difference arithmetic to avoid DST errors.
- January 31 becomes February's final day, then March 31.
- A yearly February 29 rule becomes February 28 in a non-leap year.
- Opening the app catches up historical occurrences and next month. Selecting a month materializes its occurrences.
- Existing invoice snapshots survive bill edits. Only the `paid` field can be updated in Firestore.
- Archive is reversible and preserves paid/overdue history. There is no permanent-delete UI.

## Scope and future work

This course-sized service supports EUR, monthly/yearly recurrence, manual bill entry, owner-only groups, and in-app reminders. Email reminders, OCR extraction, shared-account collaboration, bank payments, per-member settlement, and multi-currency conversion are not implemented.

The current listener strategy loads a user's collections and is suitable for a modest personal coursework dataset. A larger service should paginate historical invoices, generate occurrences on a backend schedule, add automated Rules Emulator coverage, and rate-limit background generation. No server process runs while the app is closed.

## Design and content

The supplied prototype provides the visual direction: paper background, dark green totals, lime actions, and coloured status cards. UI text and FAQ explain the product value, payment semantics, privacy model and limitations. Icons come from `lucide-react`; decorative marks use system glyphs. No external photography, paid assets or font network requests are required.
