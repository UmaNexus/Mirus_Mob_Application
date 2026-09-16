import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';
// mirus

const SampleGivenSchema = new mongoose.Schema({
  product: { type: String, trim: true, required: true },
  quantity: { type: Number, default: 1, min: 0 }
}, { _id: false });
/**
 * DailyCallReport (mobile field-force, Domain 3) — one row per logged
 * doctor-facing activity (individual call, joint call, camp, or a
 * directly-logged missed visit). A Meeting is deliberately NOT represented
 * here — it is an internal, non-doctor activity tracked only via WorkType
 * (see WorkType.js and workTypeController.js); confirming a meeting never
 * creates a DailyCallReport row. A BDM's "Daily DCR" for a day is not a
 * separate aggregate document — it is simply every DailyCallReport row
 * sharing that companyId+userId+dateKey. This is deliberate: a BDM+date
 * always maps to exactly the same set of rows, so there is nothing that
 * could ever be duplicated into "a second daily report" — submitting only
 * ever updates rows that already belong to that date, and adding a new log
 * (even after submission) only ever appends another row to the same dateKey.
 *
 * `type` is the activity's *category*, fixed at creation. `status`
 * (pending/completed/missed) is its independent per-row *lifecycle*. Every
 * individual/joint/camp row starts `pending` — the BDM completes or marks
 * it missed later via PATCH, the same consistent way regardless of
 * category. Only a directly-logged `missed` row has nothing left to
 * complete, so it alone is born already resolved.
 *
 * Whether "today's daily report" is Draft / Submitted / Needs Resubmission
 * is deliberately NOT a stored field — it is derived from the rows
 * themselves (do any have `submittedAt` unset while others are set?), so
 * there is no second source of truth to keep in sync with row-level
 * submission.
 */
const DailyCallReportSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // the BDM
  dateKey: { type: String, required: true }, // 'YYYY-MM-DD'
  date: { type: Date, required: true },
  // Meeting is deliberately NOT a DCR category — it is an internal activity
  // tracked only via WorkType, never a doctor call.
  type: { type: String, enum: ['individual', 'joint', 'missed', 'camp'], required: true },
  status: { type: String, enum: ['pending', 'completed', 'missed'], default: 'pending', index: true },
  // Required only for type: 'individual'/'joint' — a camp activity has no
  // associated doctor.
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },
  // Required only for type: 'joint' — validated server-side against the
  // submitter's own eligible participants (fieldForceAuth.isEligibleJointCallParticipant).
  accompaniedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Required only for type: 'camp' — the camp/event name (same concept
  // Today's Work Type already collects).
  activityName: { type: String, trim: true, default: '' },
  venue: { type: String, trim: true, default: '' },
  productsDetailed: { type: [String], default: [] },
  samplesGiven: { type: [SampleGivenSchema], default: [] },
  feedback: { type: String, trim: true, default: '' },
  // Legacy single-moment field, kept for backward compatibility with
  // records written before startTime/endTime existed — always still set
  // (mirrored from startTime when present) so existing sort/display code
  // (listMyDcr/listTeamDcr sort by visitTime, DcrListScreen row display)
  // keeps working unchanged for both old and new records.
  visitTime: { type: Date, default: Date.now },
  // Manually-selected call duration — both null until the BDM sets them on
  // the DCR detail screen; optional (a missed call has no visit duration).
  startTime: { type: Date, default: null },
  endTime: { type: Date, default: null },
  submittedAt: { type: Date, default: null }
}, { timestamps: true });

DailyCallReportSchema.index({ companyId: 1, userId: 1, dateKey: 1 });
DailyCallReportSchema.plugin(tenantScope);

export default mongoose.model('DailyCallReport', DailyCallReportSchema);
