import connectDB from '../config/db.js';
import mongoose from 'mongoose';
import User from '../models/User.js';
import SalarySlip from '../models/SalarySlip.js';
import OfferLetter from '../models/OfferLetter.js';
import EmployeeDocument from '../models/EmployeeDocument.js';
import EmployeeDocumentRecord from '../models/EmployeeDocumentRecord.js';
import EmployeeSalaryAssignment from '../models/EmployeeSalaryAssignment.js';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import ExitRecord from '../models/ExitRecord.js';
import PerformanceReview from '../models/PerformanceReview.js';
import Asset from '../models/Asset.js';
import Activity from '../models/Activity.js';
import CFIssue from '../models/CFIssue.js';
import { Incentive, Appraisal, TrainingRecord } from '../models/performanceExtras.js';
import { TrainingProgress } from '../models/trainingLibrary.js';

const argv = process.argv.slice(2).reduce((acc, cur) => {
  const [k, v] = cur.split('=');
  if (v === undefined) acc[k.replace(/^--/, '')] = true;
  else acc[k.replace(/^--/, '')] = v;
  return acc;
}, {});

const email = argv.email || argv.e;
const empId = argv.employeeId || argv.emp || argv.employee || argv.id;
const execute = Boolean(argv.execute || argv.yes);
const dryRun = !execute;

if (!email && !empId) {
  console.error('Usage: node delete-user-payslips.js --email=foo@example.com | --employeeId=EMP123 [--execute]');
  process.exit(1);
}

(async () => {
  try {
    await connectDB();

    let user = null;
    if (email) {
      user = await User.findOne({ email: String(email).toLowerCase().trim() });
    }
    if (!user && empId) {
      user = await User.findOne({ 'employeeDetails.employeeId': String(empId).toUpperCase().trim() });
    }

    if (!user) {
      // If there's no User row, but an email was provided, allow email-keyed cleanup
      if (email) {
        console.warn('No User document found for that email — will check email-keyed records (offers, CFIssues).');
        const offerCount = await OfferLetter.countDocuments({ candidateEmail: String(email).toLowerCase().trim() });
        const cfCount = await CFIssue.countDocuments({ recipientEmail: String(email).toLowerCase().trim() });
        console.log(`\nEmail-keyed matches:`);
        console.log(`  OfferLetter: ${offerCount}`);
        console.log(`  CFIssue: ${cfCount}`);

        console.log('\nMongo shell commands (dry-run shows these; running with --execute will perform deletions):');
        console.log(`  db.offerletters.deleteMany({ candidateEmail: "${String(email).toLowerCase().trim()}" })`);
        console.log(`  db.cfiissues.deleteMany({ recipientEmail: "${String(email).toLowerCase().trim()}" })`);

        if (dryRun) {
          console.log('\nDRY RUN: no records were deleted. Run with --execute to delete email-keyed records.');
          process.exit(0);
        }

        // execute email-keyed deletions
        const resOffers = await OfferLetter.deleteMany({ candidateEmail: String(email).toLowerCase().trim() });
        const resCfs = await CFIssue.deleteMany({ recipientEmail: String(email).toLowerCase().trim() });
        console.log('\nEmail-keyed deletion complete:');
        console.log(`  OfferLetter deleted: ${resOffers.deletedCount || 0}`);
        console.log(`  CFIssue deleted: ${resCfs.deletedCount || 0}`);
        process.exit(0);
      }

      console.error('User not found for provided identifier');
      process.exit(2);
    }

    console.log('Found user:');
    console.log(`  _id: ${user._id}`);
    console.log(`  email: ${user.email}`);
    console.log(`  employeeId: ${user.employeeDetails?.employeeId || '<none>'}`);

    const payslipCount = await SalarySlip.countDocuments({ employeeId: user._id });
    const slips = await SalarySlip.find({ employeeId: user._id }).select('_id month year pdfUrl').lean();

    console.log(`\nAffected payslips: ${payslipCount}`);
    if (slips.length) {
      slips.forEach((s) => console.log(`  - ${s._id}  ${s.year}-${String(s.month).padStart(2,'0')}  ${s.pdfUrl || ''}`));
    }

    console.log('\nMongo shell commands (dry-run shows these; running with --execute will perform deletions):');
    console.log(`  // remove payslips for user`);
    console.log(`  db.salaryslips.deleteMany({ employeeId: ObjectId("${String(user._id)}") })`);
    console.log(`  // remove salary assignments`);
    console.log(`  db.employeesalaryassignments.deleteMany({ userId: ObjectId("${String(user._id)}") })`);
    console.log(`  // remove employee documents`);
    console.log(`  db.employeedocuments.deleteMany({ userId: ObjectId("${String(user._id)}") })`);
    console.log(`  db.employeedocumentrecords.deleteMany({ userId: ObjectId("${String(user._id)}") })`);
    console.log(`  // remove offers by email`);
    console.log(`  db.offerletters.deleteMany({ candidateEmail: "${user.email}" })`);
    console.log(`  // remove other related records and finally the user`);
    console.log(`  db.users.deleteOne({ _id: ObjectId("${String(user._id)}") })`);

    if (dryRun) {
      console.log('\nDRY RUN: no records were deleted. Run with --execute to delete.');
      process.exit(0);
    }

    // Build list of delete/update operations across models
    const deleteSpecs = [
      { name: 'SalarySlip', model: SalarySlip, query: { employeeId: user._id } },
      { name: 'EmployeeSalaryAssignment', model: EmployeeSalaryAssignment, query: { userId: user._id } },
      { name: 'EmployeeDocument', model: EmployeeDocument, query: { userId: user._id } },
      { name: 'EmployeeDocumentRecord', model: EmployeeDocumentRecord, query: { userId: user._id } },
      { name: 'Attendance', model: Attendance, query: { userId: user._id } },
      { name: 'LeaveRequest', model: LeaveRequest, query: { userId: user._id } },
      { name: 'ExitRecord', model: ExitRecord, query: { userId: user._id } },
      { name: 'PerformanceReview', model: PerformanceReview, query: { userId: user._id } },
      { name: 'Incentive', model: Incentive, query: { userId: user._id } },
      { name: 'Appraisal', model: Appraisal, query: { userId: user._id } },
      { name: 'TrainingRecord', model: TrainingRecord, query: { userId: user._id } },
      { name: 'TrainingProgress', model: TrainingProgress, query: { userId: user._id } },
      { name: 'OfferLetter_byEmail', model: OfferLetter, query: { candidateEmail: user.email } },
      { name: 'CFIssue_byEmail', model: CFIssue, query: { recipientEmail: user.email } },
      { name: 'Activity', model: Activity, query: { actorId: user._id } }
    ];

    const updateSpecs = [
      { name: 'Asset.assignedTo', model: Asset, query: { assignedTo: user._id }, update: { $unset: { assignedTo: '' } } },
      { name: 'LeaveRequest.approverId', model: LeaveRequest, query: { approverId: user._id }, update: { $unset: { approverId: '' } } },
      { name: 'PerformanceReview.reviewerId', model: PerformanceReview, query: { reviewerId: user._id }, update: { $unset: { reviewerId: '' } } },
      { name: 'ExitRecord.exitInterview.conductedById', model: ExitRecord, query: { 'exitInterview.conductedById': user._id }, update: { $unset: { 'exitInterview.conductedById': '' } } },
      { name: 'EmployeeDocument.issuedBy', model: EmployeeDocument, query: { issuedBy: user._id }, update: { $unset: { issuedBy: '' } } },
      { name: 'EmployeeDocumentRecord.uploadedBy', model: EmployeeDocumentRecord, query: { uploadedBy: user._id }, update: { $unset: { uploadedBy: '' } } },
      { name: 'OfferLetter.approvedBy', model: OfferLetter, query: { approvedBy: user._id }, update: { $unset: { approvedBy: '' } } },
      { name: 'CFIssue.createdBy', model: CFIssue, query: { createdBy: user._id }, update: { $unset: { createdBy: '' } } }
    ];

    // Summarize affected counts
    console.log('\nAffected records summary:');
    for (const s of deleteSpecs) {
      const c = await s.model.countDocuments(s.query);
      console.log(`  ${s.name}: ${c}`);
    }
    for (const u of updateSpecs) {
      const c = await u.model.countDocuments(u.query);
      console.log(`  (will unset) ${u.name}: ${c}`);
    }

    console.log('\nMongo shell commands (dry-run shows these; running with --execute will perform deletions):');
    console.log(`  // remove payslips for user`);
    console.log(`  db.salaryslips.deleteMany({ employeeId: ObjectId("${String(user._id)}") })`);
    console.log(`  // remove salary assignments`);
    console.log(`  db.employeesalaryassignments.deleteMany({ userId: ObjectId("${String(user._id)}") })`);
    console.log(`  // remove employee documents`);
    console.log(`  db.employeedocuments.deleteMany({ userId: ObjectId("${String(user._id)}") })`);
    console.log(`  db.employeedocumentrecords.deleteMany({ userId: ObjectId("${String(user._id)}") })`);
    console.log(`  // remove offers by email`);
    console.log(`  db.offerletters.deleteMany({ candidateEmail: "${user.email}" })`);
    console.log(`  // unset assigned assets`);
    console.log(`  db.assets.updateMany({ assignedTo: ObjectId("${String(user._id)}") }, { $unset: { assignedTo: "" } })`);
    console.log(`  // unset approver/reviewer/issuedBy fields where applicable`);
    console.log(`  db.leaverequests.updateMany({ approverId: ObjectId("${String(user._id)}") }, { $unset: { approverId: "" } })`);
    console.log(`  db.performancereviews.updateMany({ reviewerId: ObjectId("${String(user._id)}") }, { $unset: { reviewerId: "" } })`);
    console.log(`  // finally remove the user`);
    console.log(`  db.users.deleteOne({ _id: ObjectId("${String(user._id)}") })`);
    let deleted = { payslips: 0, users: 0 };
    const admin = mongoose.connection.db.admin();
    let isReplicaSet = false;
    try {
      // 'ismaster' / 'hello' response contains setName when running as a replica set member
      // prefer 'hello' then fallback to 'ismaster'
      let helloRes;
      try { helloRes = await admin.command({ hello: 1 }); } catch (e) { helloRes = await admin.command({ ismaster: 1 }); }
      if (helloRes && helloRes.setName) isReplicaSet = true;
    } catch (e) {
      // ignore; assume standalone
      isReplicaSet = false;
    }

    const results = {};
    if (isReplicaSet) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          // perform updates (unset references)
          for (const u of updateSpecs) {
            const r = await u.model.updateMany(u.query, u.update).session(session);
            results[u.name] = { updated: r.modifiedCount || 0 };
          }
          // perform deletions
          for (const s of deleteSpecs) {
            const r = await s.model.deleteMany(s.query).session(session);
            results[s.name] = { deleted: r.deletedCount || 0 };
          }
          // finally delete the user
          const ur = await User.deleteOne({ _id: user._id }).session(session);
          results['User'] = { deleted: ur.deletedCount || 0 };
        });
      } finally {
        session.endSession();
      }
    } else {
      console.warn('MongoDB deployment does not support transactions (standalone). Proceeding without transaction.');
      // updates
      for (const u of updateSpecs) {
        const r = await u.model.updateMany(u.query, u.update);
        results[u.name] = { updated: r.modifiedCount || 0 };
      }
      // deletions
      for (const s of deleteSpecs) {
        const r = await s.model.deleteMany(s.query);
        results[s.name] = { deleted: r.deletedCount || 0 };
      }
      const ur = await User.deleteOne({ _id: user._id });
      results['User'] = { deleted: ur.deletedCount || 0 };
    }

    console.log('\nDeletion complete:');
    for (const k of Object.keys(results)) {
      const v = results[k];
      if (v.deleted !== undefined) console.log(`  ${k} deleted: ${v.deleted}`);
      if (v.updated !== undefined) console.log(`  ${k} updated (unset): ${v.updated}`);
    }
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(3);
  }
})();
