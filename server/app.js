import path from 'node:path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/authRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import userRoutes from './routes/userRoutes.js';
import salaryTemplateRoutes from './routes/salaryTemplateRoutes.js';
import salaryAssignmentRoutes from './routes/salaryAssignmentRoutes.js';
import payslipRoutes from './routes/payslipRoutes.js';
import offerRoutes from './routes/offerRoutes.js';
import candidateRoutes from './routes/candidateRoutes.js';
import onboardingRoutes from './routes/onboardingRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import selfServiceRoutes from './routes/selfServiceRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import tenantRoutes from './routes/tenantRoutes.js';
import companyRoutes from './routes/companyRoutes.js';
import employeeDocumentRoutes from './routes/employeeDocumentRoutes.js';
import uploadedDocumentRoutes from './routes/uploadedDocumentRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import performanceRoutes from './routes/performanceRoutes.js';
import trainingRoutes from './routes/trainingRoutes.js';
import assetRoutes from './routes/assetRoutes.js';
import exitRoutes from './routes/exitRoutes.js';
import letterTemplateRoutes from './routes/letterTemplateRoutes.js';
import cfTemplateRoutes from './routes/cfTemplateRoutes.js';
import cfIssueRoutes from './routes/cfIssueRoutes.js';
import jobRoleRoutes from './routes/jobRoleRoutes.js';
import departmentRoutes from './routes/departmentRoutes.js';
import fieldForceRoutes from './routes/fieldForceRoutes.js';
import doctorRoutes from './routes/doctorRoutes.js';
import dcrRoutes from './routes/dcrRoutes.js';
import mtpRoutes from './routes/mtpRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import managerFieldCallRoutes from './routes/managerFieldCallRoutes.js';
import workTypeRoutes from './routes/workTypeRoutes.js';
import stockistRoutes from './routes/stockistRoutes.js';
import secondarySaleRoutes from './routes/secondarySaleRoutes.js';
import fieldForceReportingRoutes from './routes/fieldForceReportingRoutes.js';
import adminHierarchyRoutes from './routes/adminHierarchyRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import legalRoutes from './routes/legalRoutes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { tenantContextMiddleware } from './utils/tenantContext.js';
import { corsOrigins } from './utils/clientOrigin.js';

const app = express();

const allowedOrigins = corsOrigins();
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow non-browser clients (no Origin) and configured SPA origins.
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    credentials: true // allow the HTTP-only auth cookie across origins
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Establish a per-request tenant context store (Epic T) before any route runs.
app.use(tenantContextMiddleware);

// Public static assets for generated documents, templates, avatars, and other
// user-facing files exposed through the browser.
app.use('/uploads', express.static(path.resolve('uploads')));

app.get('/', (req, res) => res.json({ success: true, message: 'HRMS API Server is running', health: '/api/health' }));
app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok' }));

// Public legal & compliance routes (Google Play Privacy Policy, Data Deletion, Terms)
app.use('/', legalRoutes);

app.use('/api/tenants', tenantRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/users', userRoutes);
app.use('/api/salary-templates', salaryTemplateRoutes);
app.use('/api/salary-assignments', salaryAssignmentRoutes);
app.use('/api/payslips', payslipRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/candidate', candidateRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/self-service', selfServiceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/employee-docs', employeeDocumentRoutes);
app.use('/api/uploaded-docs', uploadedDocumentRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/exits', exitRoutes);
app.use('/api/letter-templates', letterTemplateRoutes);
app.use('/api/cf-templates', cfTemplateRoutes);
app.use('/api/cf-issues', cfIssueRoutes);
app.use('/api/job-roles', jobRoleRoutes);
app.use('/api/departments', departmentRoutes);
// Attendance/leaves/holidays share one router with absolute subpaths.
app.use('/api', attendanceRoutes);
// Mobile field-force business-ops app (Milestone 4).
app.use('/api/field-force', fieldForceRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/dcr', dcrRoutes);
app.use('/api/mtp', mtpRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/manager-field-calls', managerFieldCallRoutes);
app.use('/api/work-type', workTypeRoutes);
app.use('/api/stockists', stockistRoutes);
app.use('/api/secondary-sales', secondarySaleRoutes);
app.use('/api/field-force', fieldForceReportingRoutes);
// Admin Dashboard — organization hierarchy, role/manager assignment, permissions catalog.
app.use('/api/admin', adminHierarchyRoutes);
app.use('/api/notifications', notificationRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
