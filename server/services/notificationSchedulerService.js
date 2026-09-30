import Doctor from '../models/Doctor.js';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import DailyCallReport from '../models/DailyCallReport.js';
import MonthlyTourPlan from '../models/MonthlyTourPlan.js';
import LeaveRequest from '../models/LeaveRequest.js';
import Expense from '../models/Expense.js';
import Notification from '../models/Notification.js';
import { dispatchNotification } from './notificationService.js';
import { buildReportingChainAbove } from '../middleware/fieldForceAuth.js';

const dateKeyOf = (d) => new Date(d).toISOString().slice(0, 10);

/**
 * Check and alert BDMs if any assigned doctor has a birthday today.
 * Redirects the BDM directly to "Today's plan" on BdmHomeScreen.
 */
export async function checkDoctorBirthdaysToday() {
  const now = new Date();
  const todayKey = dateKeyOf(now);
  const currentMonth = now.getUTCMonth();
  const currentDay = now.getUTCDate();

  // Find doctors with assigned BDM and valid dob
  const doctors = await Doctor.find({
    assignedTo: { $ne: null },
    dob: { $ne: null },
  }).select('name speciality area phone dob assignedTo companyId');

  const alertsSent = [];

  for (const doc of doctors) {
    const d = new Date(doc.dob);
    const isToday =
      (d.getUTCDate() === currentDay && d.getUTCMonth() === currentMonth) ||
      (d.getDate() === now.getDate() && d.getMonth() === now.getMonth());

    if (!isToday) continue;

    // Idempotency: verify not already notified today for this doctor
    const existing = await Notification.findOne({
      recipientId: doc.assignedTo,
      eventId: 'DOCTOR_BIRTHDAY_ALERT',
      entityId: doc._id,
      createdAt: {
        $gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
      },
    });

    if (existing) continue;

    const docName = doc.name.startsWith('Dr') ? doc.name : `Dr. ${doc.name}`;

    const sent = await dispatchNotification({
      companyId: doc.companyId,
      recipientIds: [doc.assignedTo],
      senderId: null,
      module: 'doctor',
      eventId: 'DOCTOR_BIRTHDAY_ALERT',
      title: '🎂 Doctor Birthday Today!',
      body: `Today is ${docName}'s birthday! View in Today's Plan to wish them.`,
      priority: 'high',
      deepLink: 'mirus://bdm/home?focus=todaysPlan',
      entityType: 'Doctor',
      entityId: doc._id,
      data: {
        screen: 'BdmHomeScreen',
        focus: 'todaysPlan',
        doctorId: doc._id,
        doctorName: doc.name,
        phone: doc.phone,
      },
    });

    alertsSent.push({ doctorId: doc._id, bdmId: doc.assignedTo, sentCount: sent.length });
  }

  return { success: true, alertsSent };
}

/**
 * Morning reminder (10:00 AM) for field reps who haven't punched in yet.
 */
export async function checkAttendancePunchInReminder() {
  const now = new Date();
  const todayKey = dateKeyOf(now);

  const activeBdms = await User.find({
    isActive: true,
    'employeeDetails.fieldForce.tier': 'BDM',
  }).select('_id personalDetails companyId');

  const attendanceRecords = await Attendance.find({
    dateKey: todayKey,
    punchInAt: { $ne: null },
  }).select('userId');

  const punchedUserIds = new Set(attendanceRecords.map((a) => String(a.userId)));
  const unpunchedBdms = activeBdms.filter((b) => !punchedUserIds.has(String(b._id)));

  let sentCount = 0;
  for (const bdm of unpunchedBdms) {
    const existing = await Notification.findOne({
      recipientId: bdm._id,
      eventId: 'ATTENDANCE_PUNCH_IN_REMINDER',
      createdAt: { $gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) },
    });
    if (existing) continue;

    const name = bdm.personalDetails?.firstName || 'there';
    await dispatchNotification({
      companyId: bdm.companyId,
      recipientIds: [bdm._id],
      module: 'attendance',
      eventId: 'ATTENDANCE_PUNCH_IN_REMINDER',
      title: 'Punch-In Reminder',
      body: `Good morning ${name}! You haven't punched in today (${todayKey}). Please record attendance.`,
      priority: 'medium',
      deepLink: 'mirus://bdm/home',
      data: { screen: 'BdmHomeScreen', focus: 'punch' },
    });
    sentCount++;
  }

  return { success: true, sentCount };
}

/**
 * Evening reminder (7:30 PM) for field reps who haven't punched out.
 */
export async function checkAttendancePunchOutReminder() {
  const now = new Date();
  const todayKey = dateKeyOf(now);

  const punchedInNoOut = await Attendance.find({
    dateKey: todayKey,
    punchInAt: { $ne: null },
    punchOutAt: null,
  }).populate('userId', 'personalDetails companyId');

  let sentCount = 0;
  for (const att of punchedInNoOut) {
    if (!att.userId) continue;

    const existing = await Notification.findOne({
      recipientId: att.userId._id,
      eventId: 'ATTENDANCE_PUNCH_OUT_REMINDER',
      createdAt: { $gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) },
    });
    if (existing) continue;

    await dispatchNotification({
      companyId: att.userId.companyId,
      recipientIds: [att.userId._id],
      module: 'attendance',
      eventId: 'ATTENDANCE_PUNCH_OUT_REMINDER',
      title: 'Punch-Out Reminder',
      body: 'Please punch out for today to complete your attendance log.',
      priority: 'medium',
      deepLink: 'mirus://bdm/home',
      data: { screen: 'BdmHomeScreen', focus: 'punch' },
    });
    sentCount++;
  }

  return { success: true, sentCount };
}

/**
 * Evening reminder (8:00 PM) for BDMs who have unsubmitted calls for today.
 */
export async function checkEveningDcrCutoff() {
  const now = new Date();
  const todayKey = dateKeyOf(now);

  const pendingDcrs = await DailyCallReport.find({
    dateKey: todayKey,
    submittedAt: null,
  }).distinct('userId');

  let sentCount = 0;
  for (const userId of pendingDcrs) {
    const user = await User.findById(userId).select('companyId');
    if (!user) continue;

    const existing = await Notification.findOne({
      recipientId: userId,
      eventId: 'DCR_REMINDER_CUTOFF',
      createdAt: { $gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) },
    });
    if (existing) continue;

    await dispatchNotification({
      companyId: user.companyId,
      recipientIds: [userId],
      module: 'dcr',
      eventId: 'DCR_REMINDER_CUTOFF',
      title: "Reminder: Submit Today's DCR",
      body: `You have unsubmitted calls for today (${todayKey}). Submit before cutoff.`,
      priority: 'high',
      deepLink: 'mirus://bdm/dcr',
      data: { screen: 'DcrListScreen', dateKey: todayKey },
    });
    sentCount++;
  }

  return { success: true, sentCount };
}

/**
 * Monthly reminder (25th) to submit next month's MTP.
 */
export async function checkMonthlyMtpCutoff() {
  const now = new Date();
  const nextMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const nextMonthKey = nextMonthDate.toISOString().slice(0, 7); // 'YYYY-MM'

  const activeBdms = await User.find({
    isActive: true,
    'employeeDetails.fieldForce.tier': 'BDM',
  }).select('_id companyId');

  let sentCount = 0;
  for (const bdm of activeBdms) {
    const existingMtp = await MonthlyTourPlan.findOne({
      userId: bdm._id,
      month: nextMonthKey,
      status: { $in: ['pending', 'approved'] },
    });

    if (existingMtp) continue;

    const notifiedThisMonth = await Notification.findOne({
      recipientId: bdm._id,
      eventId: 'MTP_SUBMISSION_REMINDER',
      createdAt: { $gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) },
    });
    if (notifiedThisMonth) continue;

    await dispatchNotification({
      companyId: bdm.companyId,
      recipientIds: [bdm._id],
      module: 'mtp',
      eventId: 'MTP_SUBMISSION_REMINDER',
      title: `Reminder: Submit MTP for ${nextMonthKey}`,
      body: `MTP submission cutoff is approaching. Please submit your tour plan for ${nextMonthKey}.`,
      priority: 'medium',
      deepLink: 'mirus://bdm/mtp',
      data: { screen: 'MtpScreen', month: nextMonthKey },
    });
    sentCount++;
  }

  return { success: true, sentCount };
}

/**
 * Multi-tier Approval Aging & Escalation Engine:
 * - 24h: Reminder to assigned approver
 * - 48h: SLA breach alert to approver and next manager tier
 * - 72h: Critical skip-level escalation to ZSM/NSM/Admin
 */
export async function checkApprovalAgingAndEscalations() {
  const now = new Date();
  const hours24 = 24 * 3600 * 1000;
  const hours48 = 48 * 3600 * 1000;
  const hours72 = 72 * 3600 * 1000;

  const results = {
    reminders24h: 0,
    escalations48h: 0,
    skipLevel72h: 0,
  };

  // 1. Pending Expenses
  const pendingExpenses = await Expense.find({ status: 'pending' })
    .populate('userId', 'personalDetails companyId employeeDetails.reportingManagerId')
    .populate('approverId', '_id');

  for (const exp of pendingExpenses) {
    const age = now - new Date(exp.createdAt);
    const employeeName = [exp.userId?.personalDetails?.firstName, exp.userId?.personalDetails?.lastName].filter(Boolean).join(' ') || 'Employee';
    const approverId = exp.approverId?._id || exp.userId?.employeeDetails?.reportingManagerId;
    if (!approverId) continue;

    if (age >= hours72) {
      const alreadySent = await Notification.findOne({
        eventId: 'APPROVAL_AGING_72H_SKIP_LEVEL',
        entityId: exp._id,
      });
      if (!alreadySent) {
        const chain = await buildReportingChainAbove(exp.userId._id);
        const chainArray = Array.from(chain);
        const skipLevelApprover = chainArray[1] || chainArray[0]; // Next supervisor up
        if (skipLevelApprover) {
          await dispatchNotification({
            companyId: exp.userId.companyId,
            recipientIds: [skipLevelApprover],
            module: 'expense',
            eventId: 'APPROVAL_AGING_72H_SKIP_LEVEL',
            title: '🚨 CRITICAL ESCALATION: Unreviewed Expense Claim',
            body: `Expense claim for ${employeeName} has aged >72h unreviewed. Transferred for skip-level action.`,
            priority: 'critical',
            deepLink: 'mirus://manager/approvals?tab=expenses',
            entityType: 'Expense',
            entityId: exp._id,
            data: { screen: 'ApprovalsScreen', tab: 'expenses', expenseId: exp._id },
          });
          results.skipLevel72h++;
        }
      }
    } else if (age >= hours48) {
      const alreadySent = await Notification.findOne({
        eventId: 'APPROVAL_AGING_48H_ESCALATION',
        entityId: exp._id,
      });
      if (!alreadySent) {
        await dispatchNotification({
          companyId: exp.userId.companyId,
          recipientIds: [approverId],
          module: 'expense',
          eventId: 'APPROVAL_AGING_48H_ESCALATION',
          title: '⚠️ SLA BREACH: Approval Pending >48h',
          body: `Expense claim for ${employeeName} pending approval >48h. Please take immediate action.`,
          priority: 'high',
          deepLink: 'mirus://manager/approvals?tab=expenses',
          entityType: 'Expense',
          entityId: exp._id,
          data: { screen: 'ApprovalsScreen', tab: 'expenses', expenseId: exp._id },
        });
        results.escalations48h++;
      }
    } else if (age >= hours24) {
      const alreadySent = await Notification.findOne({
        eventId: 'APPROVAL_AGING_24H_REMINDER',
        entityId: exp._id,
      });
      if (!alreadySent) {
        await dispatchNotification({
          companyId: exp.userId.companyId,
          recipientIds: [approverId],
          module: 'expense',
          eventId: 'APPROVAL_AGING_24H_REMINDER',
          title: 'Reminder: Pending Expense Awaiting Action',
          body: `Pending expense claim from ${employeeName} was submitted 24 hours ago.`,
          priority: 'medium',
          deepLink: 'mirus://manager/approvals?tab=expenses',
          entityType: 'Expense',
          entityId: exp._id,
          data: { screen: 'ApprovalsScreen', tab: 'expenses', expenseId: exp._id },
        });
        results.reminders24h++;
      }
    }
  }

  // 2. Pending Leaves
  const pendingLeaves = await LeaveRequest.find({ status: 'Pending' })
    .populate('userId', 'personalDetails companyId employeeDetails.reportingManagerId');

  for (const leave of pendingLeaves) {
    const age = now - new Date(leave.createdAt);
    const employeeName = [leave.userId?.personalDetails?.firstName, leave.userId?.personalDetails?.lastName].filter(Boolean).join(' ') || 'Employee';
    const approverId = leave.userId?.employeeDetails?.reportingManagerId;
    if (!approverId) continue;

    if (age >= hours72) {
      const alreadySent = await Notification.findOne({
        eventId: 'APPROVAL_AGING_72H_SKIP_LEVEL',
        entityId: leave._id,
      });
      if (!alreadySent) {
        const chain = await buildReportingChainAbove(leave.userId._id);
        const chainArray = Array.from(chain);
        const skipLevelApprover = chainArray[1] || chainArray[0];
        if (skipLevelApprover) {
          await dispatchNotification({
            companyId: leave.userId.companyId,
            recipientIds: [skipLevelApprover],
            module: 'leave',
            eventId: 'APPROVAL_AGING_72H_SKIP_LEVEL',
            title: '🚨 CRITICAL ESCALATION: Unreviewed Leave Request',
            body: `Leave request for ${employeeName} has aged >72h unreviewed. Transferred for skip-level action.`,
            priority: 'critical',
            deepLink: 'mirus://manager/approvals?tab=leaves',
            entityType: 'LeaveRequest',
            entityId: leave._id,
            data: { screen: 'ApprovalsScreen', tab: 'leaves', leaveId: leave._id },
          });
          results.skipLevel72h++;
        }
      }
    } else if (age >= hours48) {
      const alreadySent = await Notification.findOne({
        eventId: 'APPROVAL_AGING_48H_ESCALATION',
        entityId: leave._id,
      });
      if (!alreadySent) {
        await dispatchNotification({
          companyId: leave.userId.companyId,
          recipientIds: [approverId],
          module: 'leave',
          eventId: 'APPROVAL_AGING_48H_ESCALATION',
          title: '⚠️ SLA BREACH: Leave Pending >48h',
          body: `Leave request for ${employeeName} pending approval >48h.`,
          priority: 'high',
          deepLink: 'mirus://manager/approvals?tab=leaves',
          entityType: 'LeaveRequest',
          entityId: leave._id,
          data: { screen: 'ApprovalsScreen', tab: 'leaves', leaveId: leave._id },
        });
        results.escalations48h++;
      }
    } else if (age >= hours24) {
      const alreadySent = await Notification.findOne({
        eventId: 'APPROVAL_AGING_24H_REMINDER',
        entityId: leave._id,
      });
      if (!alreadySent) {
        await dispatchNotification({
          companyId: leave.userId.companyId,
          recipientIds: [approverId],
          module: 'leave',
          eventId: 'APPROVAL_AGING_24H_REMINDER',
          title: 'Reminder: Pending Leave Request',
          body: `Pending leave request from ${employeeName} was submitted 24 hours ago.`,
          priority: 'medium',
          deepLink: 'mirus://manager/approvals?tab=leaves',
          entityType: 'LeaveRequest',
          entityId: leave._id,
          data: { screen: 'ApprovalsScreen', tab: 'leaves', leaveId: leave._id },
        });
        results.reminders24h++;
      }
    }
  }

  // 3. Pending MTPs
  const pendingMtps = await MonthlyTourPlan.find({ status: 'pending' })
    .populate('userId', 'personalDetails companyId employeeDetails.reportingManagerId')
    .populate('approverId', '_id');

  for (const plan of pendingMtps) {
    const age = now - new Date(plan.submittedAt || plan.createdAt);
    const employeeName = [plan.userId?.personalDetails?.firstName, plan.userId?.personalDetails?.lastName].filter(Boolean).join(' ') || 'Employee';
    const approverId = plan.approverId?._id || plan.userId?.employeeDetails?.reportingManagerId;
    if (!approverId) continue;

    if (age >= hours72) {
      const alreadySent = await Notification.findOne({
        eventId: 'APPROVAL_AGING_72H_SKIP_LEVEL',
        entityId: plan._id,
      });
      if (!alreadySent) {
        const chain = await buildReportingChainAbove(plan.userId._id);
        const chainArray = Array.from(chain);
        const skipLevelApprover = chainArray[1] || chainArray[0];
        if (skipLevelApprover) {
          await dispatchNotification({
            companyId: plan.userId.companyId,
            recipientIds: [skipLevelApprover],
            module: 'mtp',
            eventId: 'APPROVAL_AGING_72H_SKIP_LEVEL',
            title: '🚨 CRITICAL ESCALATION: Unreviewed Tour Plan',
            body: `Tour plan for ${employeeName} has aged >72h unreviewed. Transferred for skip-level action.`,
            priority: 'critical',
            deepLink: 'mirus://manager/approvals?tab=mtp',
            entityType: 'MonthlyTourPlan',
            entityId: plan._id,
            data: { screen: 'ApprovalsScreen', tab: 'mtp', planId: plan._id },
          });
          results.skipLevel72h++;
        }
      }
    } else if (age >= hours48) {
      const alreadySent = await Notification.findOne({
        eventId: 'APPROVAL_AGING_48H_ESCALATION',
        entityId: plan._id,
      });
      if (!alreadySent) {
        await dispatchNotification({
          companyId: plan.userId.companyId,
          recipientIds: [approverId],
          module: 'mtp',
          eventId: 'APPROVAL_AGING_48H_ESCALATION',
          title: '⚠️ SLA BREACH: Tour Plan Pending >48h',
          body: `Tour plan for ${employeeName} pending approval >48h.`,
          priority: 'high',
          deepLink: 'mirus://manager/approvals?tab=mtp',
          entityType: 'MonthlyTourPlan',
          entityId: plan._id,
          data: { screen: 'ApprovalsScreen', tab: 'mtp', planId: plan._id },
        });
        results.escalations48h++;
      }
    } else if (age >= hours24) {
      const alreadySent = await Notification.findOne({
        eventId: 'APPROVAL_AGING_24H_REMINDER',
        entityId: plan._id,
      });
      if (!alreadySent) {
        await dispatchNotification({
          companyId: plan.userId.companyId,
          recipientIds: [approverId],
          module: 'mtp',
          eventId: 'APPROVAL_AGING_24H_REMINDER',
          title: 'Reminder: Pending Tour Plan',
          body: `Pending tour plan for ${employeeName} was submitted 24 hours ago.`,
          priority: 'medium',
          deepLink: 'mirus://manager/approvals?tab=mtp',
          entityType: 'MonthlyTourPlan',
          entityId: plan._id,
          data: { screen: 'ApprovalsScreen', tab: 'mtp', planId: plan._id },
        });
        results.reminders24h++;
      }
    }
  }

  return { success: true, results };
}

export default {
  checkDoctorBirthdaysToday,
  checkAttendancePunchInReminder,
  checkAttendancePunchOutReminder,
  checkEveningDcrCutoff,
  checkMonthlyMtpCutoff,
  checkApprovalAgingAndEscalations,
};
