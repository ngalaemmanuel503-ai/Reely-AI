import React from 'react';
import { CreditCard, FolderKanban, HelpCircle, Home, Plus, Shield, User } from 'lucide-react';
import { t } from '../lib/i18n.ts';
import type { CreditBalance, UserProfile } from '../shared/types.ts';
import { BrandMark } from './BrandMark.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';

export type AppRoute =
  | 'home'
  | 'library'
  | 'create'
  | 'credits'
  | 'profile'
  | 'help'
  | 'admin'
  | 'reel'
  | 'progress';

export const AppShell: React.FC<{
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  user: UserProfile;
  balance: CreditBalance;
  children: React.ReactNode;
}> = ({ route, onNavigate, user, balance, children }) => {
  const desktopItems: Array<{ id: AppRoute; label: string; icon: React.ReactNode }> = [
    { id: 'home', label: t('nav.home'), icon: <Home className="w-4 h-4" /> },
    { id: 'library', label: t('nav.library'), icon: <FolderKanban className="w-4 h-4" /> },
    { id: 'create', label: t('nav.create'), icon: <Plus className="w-4 h-4" /> },
    { id: 'credits', label: t('nav.credits'), icon: <CreditCard className="w-4 h-4" /> },
    { id: 'profile', label: t('nav.profile'), icon: <User className="w-4 h-4" /> },
    { id: 'help', label: t('nav.help'), icon: <HelpCircle className="w-4 h-4" /> },
    { id: 'admin', label: t('nav.admin'), icon: <Shield className="w-4 h-4" /> },
  ];

  const isWizard = route === 'create';

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-[#1C1917] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-[240px] md:flex-col md:fixed md:inset-y-0 bg-white border-r border-[#EAE7E3] z-30">
        <div className="h-16 px-5 flex items-center border-b border-[#EAE7E3]">
          <button type="button" onClick={() => onNavigate('home')} className="text-left">
            <BrandMark />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {desktopItems.map((item) => {
            const active = route === item.id;
            const isCreate = item.id === 'create';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`w-full min-h-[44px] px-3.5 rounded-xl flex items-center gap-3 text-sm font-medium transition-colors whitespace-nowrap ${
                  isCreate
                    ? 'bg-[#E5540A] text-white hover:bg-[#B8420A] my-2 font-semibold'
                    : active
                    ? 'bg-[#FFF4EC] text-[#B8420A] font-semibold'
                    : 'text-[#6B6560] hover:text-[#1C1917] hover:bg-[#FAFAF9]'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#EAE7E3] space-y-2">
          <div className="flex items-center justify-between text-xs text-[#6B6560]">
            <span>{t('home.balanceLabel')}</span>
            <span className="font-mono font-semibold tabular-nums text-[#1C1917]">
              {balance.total.toLocaleString('en-US')}
            </span>
          </div>
          <p className="text-xs text-[#6B6560] truncate">{user.email}</p>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 md:pl-[240px] flex flex-col min-w-0">
        {/* Sticky Top Bar (compact 52px on mobile so combined sticky height stays under 15%) */}
        <header className="sticky top-0 z-20 h-13 md:h-16 bg-white/95 backdrop-blur-md border-b border-[#EAE7E3] px-4 md:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 md:hidden">
            <button type="button" onClick={() => onNavigate('home')}>
              <BrandMark />
            </button>
          </div>
          <div className="hidden md:block text-sm font-medium text-[#6B6560]">
            {t('home.greeting', { name: user.display_name })}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <PWAInstallButton variant="ghost" />
            <button
              type="button"
              onClick={() => onNavigate('credits')}
              className="min-h-[40px] px-3 rounded-xl bg-[#FFF4EC] border border-[#FFE4D1] text-xs font-semibold text-[#B8420A] tabular-nums hover:bg-[#FFE4D1]/60 transition-colors whitespace-nowrap"
            >
              {balance.total.toLocaleString('en-US')} {t('common.creditsSuffix')}
            </button>
          </div>
        </header>

        <main className={`flex-1 max-w-[1200px] w-full mx-auto px-4 md:px-8 py-6 ${isWizard ? 'pb-28' : 'pb-24 md:pb-10'}`}>
          {children}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar (hidden inside full-screen create wizard so sticky quote bar owns bottom space) */}
      {!isWizard && (
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-30 h-16 pb-safe bg-white/95 backdrop-blur-md border-t border-[#EAE7E3] grid grid-cols-5 items-center px-1"
          aria-label="Primary navigation"
        >
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
              route === 'home' ? 'text-[#E5540A]' : 'text-[#6B6560]'
            }`}
          >
            <Home className="w-5 h-5" />
            <span>{t('nav.home')}</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('library')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
              route === 'library' ? 'text-[#E5540A]' : 'text-[#6B6560]'
            }`}
          >
            <FolderKanban className="w-5 h-5" />
            <span>{t('nav.library')}</span>
          </button>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => onNavigate('create')}
              className="w-12 h-12 -mt-4 rounded-2xl bg-[#E5540A] text-white shadow-md flex items-center justify-center active:scale-95 transition-transform"
              aria-label={t('nav.create')}
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('credits')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
              route === 'credits' ? 'text-[#E5540A]' : 'text-[#6B6560]'
            }`}
          >
            <CreditCard className="w-5 h-5" />
            <span>{t('nav.credits')}</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
              route === 'profile' ? 'text-[#E5540A]' : 'text-[#6B6560]'
            }`}
          >
            <User className="w-5 h-5" />
            <span>{t('nav.profile')}</span>
          </button>
        </nav>
      )}
    </div>
  );
};
