# Epic 12 addendum — Incentives/Promotions table view + attachments

Extends the existing Epic 12 (Performance & Training) implementation. Today `Incentive`
and `Appraisal` (the promotion record) exist but the HR "Performance" view renders them as
add-only forms with no table, and there is no way to attach a supporting document (e.g. an
incentive approval memo or a promotion letter). Employees also cannot see their own
promotion history — `GET /appraisals/mine` doesn't exist.

## Data model changes

`server/models/performanceExtras.js` — add two optional fields to both `IncentiveSchema`
and `AppraisalSchema`:

```js
attachmentFileId: { type: String, default: null },   // UUID, matches uploads/documents/<id>.pdf
attachmentFileName: { type: String, default: null }  // original filename, for display only
```

No new model. Reuses the existing sensitive-document convention (`server/middleware/uploadDocument.js`
— PDF-only, 5MB, UUID filename in `uploads/documents/`) rather than building a new upload stack.

## API contract

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/performance/incentives` | `performance:manage` | now multipart; optional `document` field (PDF) |
| GET | `/api/performance/incentives` | `performance:manage` | unchanged; response now includes `attachmentFileId`/`attachmentFileName` |
| GET | `/api/performance/incentives/:id/attachment` | self or `performance:manage` | streams the PDF (404 if none) |
| POST | `/api/performance/appraisals` | `performance:manage` | now multipart; optional `document` field (PDF) |
| GET | `/api/performance/appraisals` | `performance:manage` | unchanged + attachment fields |
| GET | `/api/performance/appraisals/:id/attachment` | self or `performance:manage` | streams the PDF |
| GET | `/api/performance/appraisals/mine` | authenticated | **new** — employee's own promotion history |

Attachment access check mirrors `uploadedDocumentController.canAccess`: the record owner or
a caller holding `performance:manage` (via `roleHasPermission`), not a hardcoded role list.

## Client

- `PerformancePage.jsx` (HR): replace the raw `<table>` for reviews and the plain incentive
  list with `DataGrid` (ag-grid, same pattern as `PayslipsPage.jsx`/`UsersPage.jsx`); add a
  new `DataGrid` for appraisals/promotions (currently not listed at all in this page). Add
  incentive/appraisal forms send `FormData` and include an optional file input. Attachment
  column renders a "View" download link (`<a href=".../attachment" target="_blank">`) when
  present, following `payslipPdfUrl`/`Download` icon pattern.
- `MyPerformancePage.jsx` (employee): add a "Promotions" table alongside the existing
  Incentives/Training tables, backed by the new `/appraisals/mine` endpoint, with the same
  attachment download link.
- `api/performance.js`: `createIncentive`/`createAppraisal` accept a `File|null` and build
  `FormData`; add `incentiveAttachmentUrl(id)`, `appraisalAttachmentUrl(id)`, `myAppraisals()`.

## User stories

1. **As HR, I want to attach a supporting document when recording an incentive or
   promotion**, so proof (approval memo, promotion letter) lives with the record.
   AC: optional PDF ≤5MB; non-PDF rejected with a clear error; record saves fine with no file.
2. **As HR, I want incentives and promotions shown as sortable/filterable tables**, so I can
   scan and search records instead of reading a flat list.
   AC: `DataGrid` with quick filter; columns include employee, period/date, amount or
   designation change, status, attachment link.
3. **As an employee, I want to see my own incentives and promotion history with any
   attached document**, so I don't have to ask HR for a copy.
   AC: `/appraisals/mine` returns only the caller's own records; attachment link only
   renders when `attachmentFileId` is set; a non-owner non-HR request for the attachment is
   rejected (403).
