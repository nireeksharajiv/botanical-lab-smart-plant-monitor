import React from 'react';
import { cn } from '@/lib/utils';

export type StatusType = 'live' | 'warning' | 'alert' | 'offline';

interface StatusIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  status: StatusType;
  label?: string;
  pulse?: boolean;
}

export function StatusIndicator({
  status,
  label,
  pulse = false,
  className,
  ...props
}: StatusIndicatorProps) {
  const statusColors = {
    live: 'bg-app-signal',
    warning: 'bg-app-warning',
    alert: 'bg-app-alert',
    offline: 'bg-app-muted',
  };

  const shadowColors = {
    live: 'shadow-[0_0_8px_rgba(182,240,74,0.4)]',
    warning: 'shadow-[0_0_8px_rgba(245,185,66,0.4)]',
    alert: 'shadow-[0_0_8px_rgba(229,103,91,0.4)]',
    offline: 'shadow-none',
  };

  return (
    <div className={cn("flex items-center space-x-2", className)} {...props}>
      <div className="relative flex h-2 w-2 items-center justify-center">
        {pulse && status !== 'offline' && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              statusColors[status]
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            statusColors[status],
            shadowColors[status]
          )}
        />
      </div>
      {label && (
        <span className="text-[10px] font-bold uppercase tracking-widest text-app-muted">
          {label}
        </span>
      )}
    </div>
  );
}
