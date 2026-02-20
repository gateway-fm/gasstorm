import { PropsWithChildren } from 'react';

interface Props {
  className?: string;
}

export function Card({ className, children }: PropsWithChildren<Props>) {
  return (
    <div
      className={`ops-card relative overflow-auto border border-primary-200/45 bg-slate-900/85 p-2 text-slate-100 shadow-[0_16px_44px_rgba(2,6,23,0.58)] backdrop-blur-md xs:p-2.5 sm:p-3.5 md:p-4 ${className}`}
    >
      {children}
    </div>
  );
}
