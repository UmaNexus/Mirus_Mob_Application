import { APP_NAME, LOGO_MARK_URL, LOGO_URL } from '../../config/brand.js';
import { cn } from '../../lib/cn.js';

/**
 * @param {'full'|'mark'} variant
 * @param {'light'|'dark'} on — light = for dark backgrounds (wordmark text next to mark)
 * @param {string} [subtitle] — optional line under the title (e.g. "Admin Portal")
 */
export default function BrandLogo({
  variant = 'full',
  on = 'light',
  className,
  markClassName,
  showWordmark = true,
  subtitle
}) {
  if (variant === 'full') {
    return (
      <img
        src={LOGO_URL}
        alt={APP_NAME}
        className={cn('h-9 w-auto object-contain', className)}
      />
    );
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <img
        src={LOGO_MARK_URL}
        alt=""
        aria-hidden="true"
        className={cn('h-12 w-12 shrink-0 object-contain', markClassName)}
      />
      {showWordmark && (
        <div className="min-w-0 leading-tight">
          <p
            className={cn(
              'text-sm font-bold tracking-wide',
              on === 'dark' ? 'text-white' : 'text-ink'
            )}
          >
            {APP_NAME}
          </p>
          {subtitle && (
            <p
              className={cn(
                'mt-0.5 text-[11px] font-medium uppercase tracking-wide',
                on === 'dark' ? 'text-primary-300' : 'text-muted'
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
