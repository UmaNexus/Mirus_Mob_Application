import { useSelector } from 'react-redux';
import { Navigate, useLocation } from 'react-router-dom';
import { selectAuth } from '../features/auth/authSlice.js';
import FullPageLoader from './ui/FullPageLoader.jsx';

/**
 * Gates routes by session + (optionally) role.
 * While the session is being bootstrapped we show a loader to avoid a flash of
 * the login screen for already-authenticated users.
 */
export default function ProtectedRoute({ children, roles }) {
  const { user, status } = useSelector(selectAuth);
  const location = useLocation();

  if (status === 'booting') return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
}
