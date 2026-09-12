import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export default function Spinner({ size = 20, className }) {
  return <Loader2 size={size} className={cn('animate-spin', className)} />;
}
