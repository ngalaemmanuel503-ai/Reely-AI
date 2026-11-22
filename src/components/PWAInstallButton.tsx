import React, { useState } from 'react';
import { Download, WifiOff, X } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';
import { t } from '../lib/i18n.ts';

export const PWAInstallButton: React.FC<{ variant?: 'ghost' | 'outline' }> = ({ variant = 'outline' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIosGuide, setShowIosGuide] = useState(false);

  if (isInstalled) return null;

  if (!isInstallable && !isIOS) return null;

  const btnClasses =
    variant === 'ghost'
      ? 'inline-flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-xl text-sm font-medium text-[#6B6560] hover:text-[#1C1917] hover:bg-[#FFF4EC] transition-colors whitespace-nowrap shrink-0'
      : 'inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-xl border border-[#EAE7E3] bg-white text-sm font-medium text-[#1C1917] hover:border-[#FFB27A] hover:bg-[#FFF4EC] transition-colors whitespace-nowrap shrink-0';

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isInstallable) {
            void install();
          } else {
            setShowIosGuide(true);
          }
        }}
        className={btnClasses}
      >
        <Download className="w-4 h-4 text-[#E5540A]" />
        <span>{t('common.installApp')}</span>
      </button>

      {showIosGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 border border-[#EAE7E3] shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-lg font-semibold text-[#1C1917]">
                {t('common.installIosTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="min-h-[44px] min-w-[44px] -mt-2 -mr-2 flex items-center justify-center rounded-xl text-[#6B6560] hover:bg-[#FAFAF9]"
                aria-label={t('common.close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <ol className="mt-4 space-y-2.5 text-sm text-[#6B6560]">
              <li>1. {t('common.installIosStep1')}</li>
              <li>2. {t('common.installIosStep2')}</li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="mt-6 w-full min-h-[44px] rounded-xl bg-[#E5540A] text-white text-sm font-semibold hover:bg-[#B8420A] transition-colors"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 z-50 flex items-center gap-2.5 rounded-xl bg-[#1C1917] px-4 py-2.5 text-xs font-medium text-white shadow-lg">
      <WifiOff className="w-4 h-4 text-[#FFB27A] shrink-0" />
      <span>{t('common.offlineBanner')}</span>
    </div>
  );
};
