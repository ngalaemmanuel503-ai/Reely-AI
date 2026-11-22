import React, { useCallback, useEffect, useState } from 'react';
import { AdminConsoleView } from './components/AdminConsoleView.tsx';
import { AppShell, type AppRoute } from './components/AppShell.tsx';
import { AuthView } from './components/AuthView.tsx';
import { BillingView } from './components/BillingView.tsx';
import { CreateWizard, type CatalogBundle } from './components/CreateWizard.tsx';
import { HomeView } from './components/HomeView.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { LibraryView } from './components/LibraryView.tsx';
import { OnboardingView } from './components/OnboardingView.tsx';
import { OfflineIndicator } from './components/PWAInstallButton.tsx';
import { PipelineProgress } from './components/PipelineProgress.tsx';
import { ReelStudioView } from './components/ReelStudioView.tsx';
import { HelpView, SettingsView } from './components/SettingsAndHelpView.tsx';
import { apiFetch, setAuthToken } from './lib/api.ts';
import { t } from './lib/i18n.ts';
import type { CreditBalance, ProjectItem, UserProfile } from './shared/types.ts';

type ScreenMode = 'loading' | 'landing' | 'auth' | 'phone_verify' | 'onboarding' | 'studio';

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center p-6">
          <div className="max-w-sm w-full p-6 rounded-2xl bg-white border border-[#EAE7E3] text-center space-y-4">
            <h1 className="font-display text-lg font-bold text-[#1C1917]">{t('brand.name')}</h1>
            <p className="text-sm text-[#6B6560]">{t('auth.errorGeneric')}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#E5540A] text-white text-sm font-semibold hover:bg-[#B8420A]"
            >
              {t('common.retry')}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [screen, setScreen] = useState<ScreenMode>('loading');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [balance, setBalance] = useState<CreditBalance | null>(null);

  const [catalog, setCatalog] = useState<(CatalogBundle & { whatsappSupportUrl: string }) | null>(
    null
  );
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [route, setRoute] = useState<AppRoute>('home');
  const [wizardInitialNiche, setWizardInitialNiche] = useState<string | undefined>(undefined);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const loadStudioData = useCallback(async () => {
    const [cat, projList] = await Promise.all([
      apiFetch<CatalogBundle & { whatsappSupportUrl: string }>('/api/catalog'),
      apiFetch<ProjectItem[]>('/api/projects'),
    ]);
    setCatalog(cat);
    setProjects(projList);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const me = await apiFetch<{ user: UserProfile | null; balance: CreditBalance | null }>(
        '/api/auth/me'
      );
      if (!me.user || !me.balance) {
        setUser(null);
        setBalance(null);
        setScreen('landing');
        return;
      }
      setUser(me.user);
      setBalance(me.balance);
      await loadStudioData();
      if (!me.user.onboarding_completed) {
        setScreen('onboarding');
      } else {
        setScreen('studio');
      }
    } catch {
      setUser(null);
      setBalance(null);
      setScreen('landing');
    }
  }, [loadStudioData]);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const handleAuthenticated = async (u: UserProfile, bal: CreditBalance) => {
    setUser(u);
    setBalance(bal);
    try {
      await loadStudioData();
      if (!u.phone_verified && authMode === 'signup') {
        setScreen('phone_verify');
      } else if (!u.onboarding_completed) {
        setScreen('onboarding');
      } else {
        setScreen('studio');
      }
    } catch {
      setScreen('landing');
    }
  };

  if (screen === 'loading') {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <div className="w-10 h-10 rounded-2xl bg-[#FF6A1A] animate-pulse" />
      </div>
    );
  }

  return (
    <AppErrorBoundary>
      <OfflineIndicator />

      {screen === 'landing' && (
        <LandingPage
          onStartAuth={(mode) => {
            setAuthMode(mode);
            setScreen('auth');
          }}
        />
      )}

      {screen === 'auth' && (
        <AuthView
          initialMode={authMode}
          onBack={() => setScreen('landing')}
          onAuthenticated={(u, b) => void handleAuthenticated(u, b)}
          onPhoneDone={(u, b) => {
            setUser(u);
            setBalance(b);
            setScreen(u.onboarding_completed ? 'studio' : 'onboarding');
          }}
        />
      )}

      {screen === 'phone_verify' && (
        <AuthView
          initialMode="phone"
          onAuthenticated={(u, b) => {
            setUser(u);
            setBalance(b);
          }}
          onPhoneDone={(u, b) => {
            setUser(u);
            setBalance(b);
            setScreen(u.onboarding_completed ? 'studio' : 'onboarding');
          }}
        />
      )}

      {screen === 'onboarding' && user && catalog && (
        <OnboardingView
          languages={catalog.languages}
          niches={catalog.niches}
          initialLang={user.default_reel_language}
          onComplete={(updated, startCreate) => {
            setUser(updated);
            if (startCreate && updated.interested_niches?.length) {
              setWizardInitialNiche(updated.interested_niches[0]);
            }
            setRoute(startCreate ? 'create' : 'home');
            setScreen('studio');
          }}
        />
      )}

      {screen === 'studio' && user && balance && catalog && (
        <AppShell
          route={route}
          onNavigate={(next) => {
            setWizardInitialNiche(undefined);
            setRoute(next);
          }}
          user={user}
          balance={balance}
        >
          {route === 'home' && (
            <HomeView
              user={user}
              balance={balance}
              niches={catalog.niches}
              projects={projects}
              onStartCreate={(nId) => {
                setWizardInitialNiche(nId);
                setRoute('create');
              }}
              onOpenProject={(proj) => {
                setActiveProjectId(proj.id);
                setRoute(proj.status === 'creating' ? 'progress' : 'reel');
              }}
              onGoCredits={() => setRoute('credits')}
              onGoLibrary={() => setRoute('library')}
              onVerifyPhone={() => setScreen('phone_verify')}
            />
          )}

          {route === 'create' && (
            <CreateWizard
              catalog={catalog}
              balance={balance}
              defaultLanguage={user.default_reel_language}
              initialNicheId={wizardInitialNiche}
              onCancel={() => setRoute('home')}
              onGoBilling={() => setRoute('credits')}
              onCharacterAdded={(c) =>
                setCatalog((prev) => (prev ? { ...prev, characters: [c, ...prev.characters] } : prev))
              }
              onCharacterUpdated={(c) =>
                setCatalog((prev) =>
                  prev
                    ? {
                        ...prev,
                        characters: prev.characters.map((item) => (item.id === c.id ? c : item)),
                      }
                    : prev
                )
              }
              onCharacterDeleted={(id) =>
                setCatalog((prev) =>
                  prev
                    ? {
                        ...prev,
                        characters: prev.characters.filter((item) => item.id !== id),
                      }
                    : prev
                )
              }
              onMusicUploaded={(m) =>
                setCatalog((prev) =>
                  prev ? { ...prev, musicTracks: [m, ...prev.musicTracks] } : prev
                )
              }
              onCreated={(projectId, nextBalance) => {
                setBalance(nextBalance);
                setActiveProjectId(projectId);
                void loadStudioData();
                setRoute('progress');
              }}
            />
          )}

          {route === 'progress' && activeProjectId && (
            <PipelineProgress
              projectId={activeProjectId}
              onFinished={(proj) => {
                setActiveProjectId(proj.id);
                void loadStudioData();
                void refreshMe();
                setRoute('reel');
              }}
              onLeaveToLibrary={() => {
                void loadStudioData();
                setRoute('library');
              }}
            />
          )}

          {route === 'reel' && activeProjectId && (
            <ReelStudioView
              projectId={activeProjectId}
              musicTracks={catalog.musicTracks}
              prices={catalog.prices}
              onBack={() => {
                void loadStudioData();
                setRoute('library');
              }}
              onDeleted={() => {
                void loadStudioData();
                setRoute('library');
              }}
              onBalanceChange={setBalance}
            />
          )}

          {route === 'library' && (
            <LibraryView
              projects={projects}
              characters={catalog.characters}
              styles={catalog.styles}
              onOpenProject={(proj) => {
                setActiveProjectId(proj.id);
                setRoute(proj.status === 'creating' ? 'progress' : 'reel');
              }}
              onRefreshProjects={() => void loadStudioData()}
              onCharactersChanged={() => loadStudioData()}
              onStartCreate={() => setRoute('create')}
            />
          )}

          {route === 'credits' && <BillingView onBalanceUpdate={setBalance} />}

          {route === 'profile' && (
            <SettingsView
              user={user}
              languages={catalog.languages}
              onUpdated={setUser}
              onVerifyPhone={() => setScreen('phone_verify')}
              onSignedOut={() => {
                setAuthToken(null);
                setUser(null);
                setBalance(null);
                setScreen('landing');
              }}
              onOpenAdmin={() => setRoute('admin')}
              onOpenHelp={() => setRoute('help')}
            />
          )}

          {route === 'help' && <HelpView whatsappUrl={catalog.whatsappSupportUrl} />}

          {route === 'admin' && (
            <AdminConsoleView
              niches={catalog.niches}
              languages={catalog.languages}
              onAdminClaimed={setUser}
              onCatalogMutated={() => void loadStudioData()}
            />
          )}
        </AppShell>
      )}
    </AppErrorBoundary>
  );
}
