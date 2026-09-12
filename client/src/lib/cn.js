import clsx from 'clsx';

// Thin wrapper so components read `cn(...)`. (No tailwind-merge to keep deps
// minimal; component class order is authored carefully.)
export const cn = (...args) => clsx(...args);
