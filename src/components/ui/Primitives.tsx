import React from 'react';
import { X } from 'lucide-react';
import { t } from '../../lib/i18n.ts';

export const PrimaryButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }
> = ({ children, className = '', loading, disabled, ...rest }) => (
  <button
    type="button"
    disabled={disabled || loading}
    className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#E5540A] text-white text-base font-semibold hover:bg-[#B8420A] active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5540A] ${className}`}
    {...rest}
  >
    {loading ? t('common.loading') : children}
  </button>
);

export const SecondaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  children,
  className = '',
  ...rest
}) => (
  <button
    type="button"
    className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-white border border-[#EAE7E3] text-[#1C1917] text-sm font-semibold hover:border-[#FFB27A] hover:bg-[#FFF4EC] transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5540A] ${className}`}
    {...rest}
  >
    {children}
  </button>
);

export const GhostButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  children,
  className = '',
  ...rest
}) => (
  <button
    type="button"
    className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 rounded-xl text-sm font-medium text-[#6B6560] hover:text-[#1C1917] hover:bg-[#FAFAF9] transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5540A] ${className}`}
    {...rest}
  >
    {children}
  </button>
);

export const TextInput: React.FC<
  React.InputHTMLAttributes<HTMLInputElement> & { label?: string }
> = ({ label, id, className = '', ...rest }) => (
  <div className="space-y-1.5">
    {label && (
      <label htmlFor={id} className="block text-sm font-medium text-[#1C1917]">
        {label}
      </label>
    )}
    <input
      id={id}
      className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-white border border-[#EAE7E3] text-sm text-[#1C1917] placeholder:text-[#6B6560]/60 focus:outline-none focus:border-[#E5540A] focus:ring-2 focus:ring-[#FFE4D1] transition-shadow ${className}`}
      {...rest}
    />
  </div>
);

export const SelectField: React.FC<
  React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }
> = ({ label, id, className = '', children, ...rest }) => (
  <div className="space-y-1.5">
    {label && (
      <label htmlFor={id} className="block text-sm font-medium text-[#1C1917]">
        {label}
      </label>
    )}
    <select
      id={id}
      className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-white border border-[#EAE7E3] text-sm text-[#1C1917] focus:outline-none focus:border-[#E5540A] focus:ring-2 focus:ring-[#FFE4D1] ${className}`}
      {...rest}
    >
      {children}
    </select>
  </div>
);

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#FAFAF9] border border-[#EAE7E3]">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
              active
                ? 'bg-white text-[#1C1917] shadow-xs border border-[#EAE7E3]'
                : 'text-[#6B6560] hover:text-[#1C1917]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export const ModalSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/45 p-0 md:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full md:max-w-lg rounded-t-3xl md:rounded-2xl bg-white border border-[#EAE7E3] shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white border-b border-[#EAE7E3]">
          <h3 className="font-display text-lg font-semibold text-[#1C1917]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-[#6B6560] hover:bg-[#FAFAF9]"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

export const SkeletonBox: React.FC<{ className?: string }> = ({ className = 'h-24 w-full' }) => (
  <div className={`animate-pulse rounded-2xl bg-[#EAE7E3]/70 ${className}`} />
);

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}> = ({ icon, title, body, action }) => (
  <div className="flex flex-col items-center justify-center text-center py-12 px-6 rounded-2xl bg-white border border-[#EAE7E3]">
    <div className="w-12 h-12 rounded-2xl bg-[#FFF4EC] text-[#FF6A1A] flex items-center justify-center mb-4">
      {icon}
    </div>
    <h3 className="font-display text-base font-semibold text-[#1C1917]">{title}</h3>
    <p className="mt-1.5 text-sm text-[#6B6560] max-w-sm">{body}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);
