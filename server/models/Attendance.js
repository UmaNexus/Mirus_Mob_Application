import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';
// mirus and hrms
/**
 * Attendance (Epic 11) — one row per employee per day. `dateKey` (YYYY-MM-DD)
 * gives a stable unique key regardless of time-of-day. Overtime is a flag +
 * hours; LOP for payroll is derived from Absent days (Epic 16).
 */
const AttendanceSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  dateKey: { type: String, required: true }, // 'YYYY-MM-DD'
  date: { type: Date, required: true },
  checkIn: { type: String, trim: true },  // 'HH:mm'
  checkOut: { type: String, trim: true },
  // Real timestamped punch in/out for the mobile field-force app (additive;
  // existing checkIn/checkOut free-text fields and all HR bulk-marking logic
  // are untouched — see MOBILE_DATABASE_SAFETY.md).
  punchInAt: { type: Date, default: null },
  punchOutAt: { type: Date, default: null },
  status: { type: String, enum: ['Present', 'Absent', 'Half-Day', 'Leave', 'Holiday', 'WeekOff'], default: 'Present', index: true },
  workedHours: { type: Number, default: 0 },
  isOvertime: { type: Boolean, default: false },
  overtimeHours: { type: Number, default: 0 },
  notes: { type: String, trim: true },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

AttendanceSchema.index({ companyId: 1, userId: 1, dateKey: 1 }, { unique: true });
AttendanceSchema.plugin(tenantScope);

export default mongoose.model('Attendance', AttendanceSchema);
