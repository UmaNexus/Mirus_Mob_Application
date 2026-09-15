import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';
// mirus

const SampleGivenSchema = new mongoose.Schema({
  product: { type: String, trim: true, required: true },
  quantity: { type: Number, default: 1, min: 0 }
}, { _id: false });
/**
 * DailyCallReport (mobile field-force, Domain 3) — one row per logged
 * activity (individual call, joint call, camp, meeting, or a directly-logged
 * missed visit). A BDM's "Daily DCR" for a day is not a separate aggregate
 * document — it is simply every DailyCallReport row sharing that
 * companyId+userId+dateKey. This is deliberate: a BDM+date always maps to
 * exactly the same set of rows, so there is nothing that could ever be
 * duplicated into "a second daily report" — submitting only ever updates
 * rows that already belong to that date, and adding a new log (even after
 * submission) only ever appends another row to the same dateKey.
 *
 * `type` is the activity's *category*, fixed at creation. `status`
 * (pending/completed/missed) is its independent per-row *lifecycle*. An
 * individual/joint row starts `pending` — the BDM fills in visit detail
 * later via PATCH. A `missed` row and a camp/meeting row are born with
 * nothing further required (camp/meeting are fully described by Today's
 * Work Type already), so they start life already resolved (`missed` /
 * `completed`) — the BDM may still revise the status later if needed.
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
  type: { type: String, enum: ['individual', 'joint', 'missed', 'camp', 'meeting'], required: true },
  status: { type: String, enum: ['pending', 'completed', 'missed'], default: 'pending', index: true },
  // Required only for type: 'individual'/'joint' — a camp/meeting activity
  // has no associated doctor.
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },
  // Required only for type: 'joint' — validated server-side against the
  // submitter's own reporting chain (see fieldForceAuth.buildReportingChainAbove).
  accompaniedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Required only for type: 'camp'/'meeting' — the camp/event name or the
  // meeting agenda (same concept Today's Work Type already collects).
  activityName: { type: String, trim: true, default: '' },
  venue: { type: String, trim: true, default: '' },
  productsDetailed: { type: [String], default: [] },
  samplesGiven: { type: [SampleGivenSchema], default: [] },
  feedback: { type: String, trim: true, default: '' },
  visitTime: { type: Date, default: Date.now },
  submittedAt: { type: Date, default: null }
}, { timestamps: true });

DailyCallReportSchema.index({ companyId: 1, userId: 1, dateKey: 1 });
DailyCallReportSchema.plugin(tenantScope);

export default mongoose.model('DailyCallReport', DailyCallReportSchema);
