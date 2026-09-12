import { cn } from '../../lib/cn.js';
import Spinner from './Spinner.jsx';

const VARIANTS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger'
};

export default function Button({
  variant = 'primary',
  size,
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(VARIANTS[variant], size === 'sm' && 'btn-sm', className)}
      {...props}
    >
      {loading && <Spinner size={16} className={variant === 'secondary' || variant === 'ghost' ? 'text-primary-600' : 'text-white'} />}
      {children}
    </button>
  );
}
