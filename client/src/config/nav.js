import {
  LayoutDashboard, Users, FileText, Wallet, SlidersHorizontal,
  UserCircle, FileSignature, FolderLock, Users2, FileCheck2,
  CalendarCheck, Gauge, GraduationCap, Laptop, FileStack, DoorOpen, Building2
} from 'lucide-react';

// Manager (admin + HR) navigation. Admin additionally gets Company Settings.
const MANAGER_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/users', label: 'User Management', icon: Users },
  { to: '/offers', label: 'Offer Letters', icon: FileText },
  { to: '/payslips', label: 'Salary Slips', icon: Wallet },
  { to: '/attendance-admin', label: 'Attendance & Leave', icon: CalendarCheck },
  { to: '/performance', label: 'Performance', icon: Gauge },
  { to: '/training-admin', label: 'Training', icon: GraduationCap },
  { to: '/assets', label: 'Assets', icon: Laptop },
  { to: '/doc-center', label: 'Documents', icon: FileStack },
  { to: '/verifications', label: 'Verifications', icon: FileCheck2 },
  { to: '/exits', label: 'Exits', icon: DoorOpen },
  { to: '/templates', label: 'Setup Templates', icon: SlidersHorizontal }
];

export const NAV = {
  admin: [...MANAGER_NAV, { to: '/company', label: 'Company Settings', icon: Building2 }],
  hr: MANAGER_NAV,
  employee: [
    { to: '/me', label: 'My Profile', icon: UserCircle },
    { to: '/my-offer', label: 'Offer Letter', icon: FileSignature },
    { to: '/my-payslips', label: 'Salary Slips', icon: Wallet },
    { to: '/my-attendance', label: 'Attendance & Leave', icon: CalendarCheck },
    { to: '/my-documents', label: 'My Documents', icon: FileStack },
    { to: '/my-performance', label: 'Performance', icon: Gauge },
    { to: '/my-training', label: 'Training', icon: GraduationCap },
    { to: '/my-assets', label: 'My Assets', icon: Laptop },
    { to: '/documents', label: 'Document Vault', icon: FolderLock },
    { to: '/team', label: 'My Team', icon: Users2 }
  ]
};

export const navFor = (role) => NAV[role] || NAV.employee;
