import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { bootstrapAuth, selectUser } from './features/auth/authSlice.js';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import Toaster from './components/ui/Toaster.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Profile from './pages/Profile.jsx';
import CandidateOfferPage from './pages/public/CandidateOfferPage.jsx';
import SetupPasswordPage from './pages/public/SetupPasswordPage.jsx';

import UsersPage from './features/users/UsersPage.jsx';
import EmployeeDetailPage from './features/users/EmployeeDetailPage.jsx';
import OffersPage from './features/offers/OffersPage.jsx';
import TemplatesPage from './features/salary/TemplatesPage.jsx';
import PayslipsPage from './features/salary/PayslipsPage.jsx';
import VerificationsPage from './features/verifications/VerificationsPage.jsx';

import EmployeeHub from './features/employee/EmployeeHub.jsx';
import MyPayslipsPage from './features/employee/MyPayslipsPage.jsx';
import MyOfferPage from './features/employee/MyOfferPage.jsx';
import MyTeamPage from './features/employee/MyTeamPage.jsx';
import OnboardingPage from './features/onboarding/OnboardingPage.jsx';
import DocumentsPage from './features/documents/DocumentsPage.jsx';

// New modules
import CompanySettingsPage from './features/company/CompanySettingsPage.jsx';
import AttendanceAdminPage from './features/attendance/AttendanceAdminPage.jsx';
import MyAttendancePage from './features/attendance/MyAttendancePage.jsx';
import DocCenterPage from './features/documents/DocCenterPage.jsx';
import MyDocumentsPage from './features/documents/MyDocumentsPage.jsx';
import PerformancePage from './features/performance/PerformancePage.jsx';
import MyPerformancePage from './features/performance/MyPerformancePage.jsx';
import TrainingAdminPage from './features/training/TrainingAdminPage.jsx';
import MyTrainingPage from './features/training/MyTrainingPage.jsx';
import AssetsPage from './features/assets/AssetsPage.jsx';
import MyAssetsPage from './features/assets/MyAssetsPage.jsx';
import ExitsPage from './features/exits/ExitsPage.jsx';

const MANAGER = ['admin', 'hr'];

function RoleIndex() {
  const user = useSelector(selectUser);
  return <Navigate to={MANAGER.includes(user?.role) ? '/dashboard' : '/me'} replace />;
}

export default function App() {
  const dispatch = useDispatch();
  useEffect(() => { dispatch(bootstrapAuth()); }, [dispatch]);

  return (
    <>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/offer/:token" element={<CandidateOfferPage />} />
        <Route path="/setup-password/:token" element={<SetupPasswordPage />} />

        {/* Authenticated shell */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<RoleIndex />} />

          {/* Admin / HR */}
          <Route path="dashboard" element={<ProtectedRoute roles={MANAGER}><Dashboard /></ProtectedRoute>} />
          <Route path="users" element={<ProtectedRoute roles={MANAGER}><UsersPage /></ProtectedRoute>} />
          <Route path="users/:id" element={<ProtectedRoute roles={MANAGER}><EmployeeDetailPage /></ProtectedRoute>} />
          <Route path="offers" element={<ProtectedRoute roles={MANAGER}><OffersPage /></ProtectedRoute>} />
          <Route path="payslips" element={<ProtectedRoute roles={MANAGER}><PayslipsPage /></ProtectedRoute>} />
          <Route path="verifications" element={<ProtectedRoute roles={MANAGER}><VerificationsPage /></ProtectedRoute>} />
          <Route path="templates" element={<ProtectedRoute roles={MANAGER}><TemplatesPage /></ProtectedRoute>} />
          <Route path="attendance-admin" element={<ProtectedRoute roles={MANAGER}><AttendanceAdminPage /></ProtectedRoute>} />
          <Route path="performance" element={<ProtectedRoute roles={MANAGER}><PerformancePage /></ProtectedRoute>} />
          <Route path="training-admin" element={<ProtectedRoute roles={MANAGER}><TrainingAdminPage /></ProtectedRoute>} />
          <Route path="assets" element={<ProtectedRoute roles={MANAGER}><AssetsPage /></ProtectedRoute>} />
          <Route path="doc-center" element={<ProtectedRoute roles={MANAGER}><DocCenterPage /></ProtectedRoute>} />
          <Route path="exits" element={<ProtectedRoute roles={MANAGER}><ExitsPage /></ProtectedRoute>} />
          <Route path="company" element={<ProtectedRoute roles={['admin']}><CompanySettingsPage /></ProtectedRoute>} />

          {/* Shared */}
          <Route path="profile" element={<Profile />} />
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route path="documents" element={<DocumentsPage />} />

          {/* Employee */}
          <Route path="me" element={<EmployeeHub />} />
          <Route path="my-offer" element={<MyOfferPage />} />
          <Route path="my-payslips" element={<MyPayslipsPage />} />
          <Route path="team" element={<MyTeamPage />} />
          <Route path="my-attendance" element={<MyAttendancePage />} />
          <Route path="my-documents" element={<MyDocumentsPage />} />
          <Route path="my-training" element={<MyTrainingPage />} />
          <Route path="my-assets" element={<MyAssetsPage />} />
          <Route path="my-performance" element={<MyPerformancePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
