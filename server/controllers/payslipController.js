import path from 'node:path';
import fs from 'node:fs';
import mongoose from 'mongoose';
import SalarySlip from '../models/SalarySlip.js';
import EmployeeSalaryAssignment from '../models/EmployeeSalaryAssignment.js';
import Attendance from '../models/Attendance.js';
import Company from '../models/Company.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { paisaToWords } from '../utils/numberToWords.js';
import { generatePayslipPdf } from '../services/pdfService.js';
import { sendPayslipNotice } from '../services/emailService.js';
import { queueMailJob } from '../services/mailQueue.js';
import { computeStatutoryDeductions } from '../utils/statutoryEngine.js';
import { logActivity } from '../services/activityService.js';

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const maskAccount = (acc) => (acc ? `****${String(acc).slice(-4)}` : '-');

const fmtJoinDate = (d) => {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  const dd = String(x.getDate()).padStart(2, '0');
  const mm = String(x.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${x.getFullYear()}`;
};

const prorate = (paisa, workDays, fullDays) => {
  const full = Math.max(1, Number(fullDays) || 30);
  const work = Math.min(full, Math.max(0, Number(workDays) || 0));
  if (work >= full) return Math.round(Number(paisa) || 0);
  return Math.round((Number(paisa) || 0) * (work / full));
};

/**
 * Build (or refresh) one employee's payslip for a period from their frozen
 * salary breakdown, render the PDF, and persist. Idempotent per (employee, month, year).
 */
const buildSlip = async (assignment, month, year, notify, { applyStatutory = false, workingDays = 30 } = {}) => {
  const user = assignment.userId; // populated
  const b = assignment.frozenMonthlyBreakdown;
  const fullDays = Math.max(1, Number(workingDays) || 30);

  const lop = await Attendance.countDocuments({
    userId: user._id,
    status: 'Absent',
    date: {
      $gte: new Date(Date.UTC(year, month - 1, 1)),
      $lt: new Date(Date.UTC(year, month, 1))
    }
  });
  const effectiveWorkDays = Math.max(0, fullDays - lop);

  const earningsLedger = (b.earnings || []).map((e) => {
    const fullAmount = Math.round(Number(e.monthlyAmount) || 0);
    return {
      label: e.label,
      fullAmount,
      amount: prorate(fullAmount, effectiveWorkDays, fullDays)
    };
  });
  const grossActual = earningsLedger.reduce((s, e) => s + e.amount, 0);

  let deductionsLedger = (b.deductions || []).map((d) => {
    const fullAmount = Math.round(Number(d.monthlyAmount) || 0);
    return {
      label: d.label,
      fullAmount,
      amount: fullAmount
    };
  });
  let totalDeductions = deductionsLedger.reduce((s, d) => s + d.amount, 0);
  let netPay = grossActual - totalDeductions;

  // Epic 16 — statutory run: recompute deductions (PF/ESI/PT/TDS) from actual earnings.
  if (applyStatutory) {
    const basicFull = (b.earnings.find((e) => /basic/i.test(e.key || e.label))?.monthlyAmount) || 0;
    const basicActual = prorate(basicFull, effectiveWorkDays, fullDays);
    const { deductions } = computeStatutoryDeductions({
      basicPaisa: basicActual,
      grossPaisa: grossActual,
      absentDays: lop,
      workingDays: fullDays
    });
    deductionsLedger = deductions.map((d) => ({
      label: d.label,
      fullAmount: d.amount,
      amount: d.amount
    }));
    totalDeductions = deductionsLedger.reduce((s, d) => s + d.amount, 0);
    netPay = grossActual - totalDeductions;
  }

  const bank = user.employeeDetails?.bankDetails || {};
  const slipData = {
    employeeId: user._id,
    month,
    year,
    metaSnapshot: {
      employeeDisplayId: user.employeeDetails?.employeeId || 'N/A',
      fullName: `${user.personalDetails.firstName} ${user.personalDetails.lastName}`,
      designation: user.employeeDetails?.designation || 'N/A',
      department: user.employeeDetails?.department || 'N/A',
      joiningDate: fmtJoinDate(user.employeeDetails?.dateOfJoining),
      location: user.employeeDetails?.workLocation || '',
      bankName: bank.bankName || '',
      bankAccountNo: bank.accountNumber || '',
      bankAccountHidden: maskAccount(bank.accountNumber),
      pan: user.employeeDetails?.panNumber || '',
      pfNumber: '',
      uan: user.employeeDetails?.uanNumber || '',
      effectiveWorkDays,
      lop
    },
    earningsLedger,
    deductionsLedger,
    financialSummary: {
      grossEarnings: grossActual,
      totalDeductions,
      netPay,
      netPayInWords: paisaToWords(netPay)
    },
    paymentStatus: 'Paid'
  };

  const company = await Company.findById(user.companyId);
  if (user.companyId) slipData.companyId = user.companyId;
  const pdfUrl = await generatePayslipPdf(slipData, company);
  slipData.pdfUrl = pdfUrl;

  const slip = await SalarySlip.findOneAndUpdate(
    { employeeId: user._id, month, year },
    slipData,
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );

  let email = null;
  if (notify) {
    const period = `${MONTHS[month]} ${year}`;
    const absPdf = path.resolve(process.cwd(), pdfUrl);
    const safeName = String(slipData.metaSnapshot.fullName || 'employee').replace(/[^\w.-]+/g, '-');
    email = await queueMailJob(() => sendPayslipNotice({
      to: user.email,
      fullName: slipData.metaSnapshot.fullName,
      period,
      pdfPath: fs.existsSync(absPdf) ? absPdf : undefined,
      fileName: `Payslip-${safeName}-${MONTHS[month]}-${year}.pdf`
    }));
    // Mark emailed when queued (async) or delivered inline (tests / sync).
    const delivered = Boolean(email?.result?.delivered || email?.queued);
    if (delivered) {
      slip.isEmailed = true;
      await slip.save();
    }
  }
  return { slip, email };
};

/** Eligible for payslip: active, not soft-deleted, has a non-empty employee code. */
const isPayslipEligibleUser = (user) => {
  if (!user) return false;
  if (user.deletedAt) return false;
  if (!user.isActive) return false;
  const code = String(user.employeeDetails?.employeeId || '').trim();
  return Boolean(code);
};

/**
 * POST /api/payslips/generate
 * US 4.2 — batch-process monthly payslips for selected employees (or all
 * employees that have a salary assignment).
 * Only active employees with an employee code are included.
 * Body: { month, year, employeeIds?: string[], notify?: boolean }
 */
export const generatePayslips = asyncHandler(async (req, res) => {
  const { month, year, employeeIds, notify = false, applyStatutory = false, workingDays = 30 } = req.body;

  const filter = {};
  if (Array.isArray(employeeIds) && employeeIds.length) {
    filter.userId = { $in: employeeIds.filter((id) => mongoose.isValidObjectId(id)) };
  }
  const assignments = await EmployeeSalaryAssignment.find(filter).populate('userId');

  const results = { generated: [], failed: [], skipped: [], emailed: 0 };
  for (const assignment of assignments) {
    const user = assignment.userId;
    if (!user) continue; // orphaned assignment
    if (!isPayslipEligibleUser(user)) {
      const reason = user.deletedAt
        ? 'Employee is deleted'
        : !user.isActive
          ? 'Employee is inactive'
          : 'Employee code is missing';
      results.skipped.push({ employeeId: user._id, reason });
      continue;
    }
    try {
      const { slip, email } = await buildSlip(assignment, month, year, notify, { applyStatutory, workingDays });
      results.generated.push({ employeeId: user._id, slipId: slip._id, emailed: Boolean(slip.isEmailed) });
      if (email?.queued || email?.result?.delivered) results.emailed += 1;
    } catch (err) {
      results.failed.push({ employeeId: user._id, error: err.message });
    }
  }

  if (results.generated.length) {
    await logActivity({
      actor: req.user,
      action: 'payslip.generate',
      entityType: 'SalarySlip',
      message: `${results.generated.length} payslip(s) issued for ${MONTHS[month]} ${year}`
    });
  }

  const skipNote = results.skipped.length
    ? ` (skipped ${results.skipped.length} inactive/missing employee code)`
    : '';
  const mailNote = notify
    ? ` — ${results.emailed} email(s) queued with PDF attached`
    : '';
  res.status(201).json({
    success: true,
    message: `Generated ${results.generated.length} payslip(s) for ${MONTHS[month]} ${year}${skipNote}${mailNote}`,
    ...results
  });
});

/** GET /api/payslips?month=&year=&page=&limit= — admin/HR ledger view (US 5 admin). */
export const listPayslips = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const filter = {};
  if (req.query.month) filter.month = Number(req.query.month);
  if (req.query.year) filter.year = Number(req.query.year);

  const [data, total] = await Promise.all([
    SalarySlip.find(filter).sort({ year: -1, month: -1 }).skip((page - 1) * limit).limit(limit),
    SalarySlip.countDocuments(filter)
  ]);
  res.status(200).json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
});

/**
 * GET /api/payslips/mine?year= — US 7.2, employee's own historical slips.
 */
export const listMyPayslips = asyncHandler(async (req, res) => {
  const filter = { employeeId: req.user._id };
  if (req.query.year) filter.year = Number(req.query.year);
  const data = await SalarySlip.find(filter).sort({ year: -1, month: -1 });
  res.status(200).json({ success: true, data });
});

/**
 * GET /api/payslips/:id/pdf — US 7.3, authorized PDF stream.
 * Employees may only download their own slips; admin/HR may download any.
 * Re-renders the PDF with the current company letter template + watermark so
 * downloads always match the latest Company Settings branding.
 */
export const downloadPayslipPdf = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid payslip id');
  const slip = await SalarySlip.findById(req.params.id);
  if (!slip) throw new ApiError(404, 'Payslip not found');

  const isOwner = slip.employeeId.equals(req.user._id);
  const isManager = ['admin', 'hr'].includes(req.user.role);
  if (!isOwner && !isManager) throw new ApiError(403, 'Not authorized to access this payslip');

  const company = await Company.findById(req.user.companyId || slip.companyId);
  try {
    const pdfUrl = await generatePayslipPdf(slip.toObject ? slip.toObject() : slip, company);
    slip.pdfUrl = pdfUrl;
    await slip.save();
  } catch (err) {
    console.warn('[payslip] re-render with company template failed:', err.message);
  }

  const abs = path.resolve(process.cwd(), slip.pdfUrl);
  if (!fs.existsSync(abs)) throw new ApiError(404, 'Payslip file is missing on disk');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="payslip-${slip.month}-${slip.year}.pdf"`);
  fs.createReadStream(abs).pipe(res);
});
