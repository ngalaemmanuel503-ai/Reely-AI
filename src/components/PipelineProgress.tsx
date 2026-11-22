import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { t } from '../lib/i18n.ts';
import type { ProjectItem } from '../shared/types.ts';
import { PrimaryButton, SecondaryButton } from './ui/Primitives.tsx';

const PIPELINE_STEPS = [
  'validate',
  'moderate',
  'hooks',
  'script',
  'editor',
  'scenes',
  'visuals',
  'voice',
  'timeline',
  'render',
  'finish',
];

export const PipelineProgress: React.FC<{
  projectId: string;
  onFinished: (project: ProjectItem) => void;
  onLeaveToLibrary: () => void;
}> = ({ projectId, onFinished, onLeaveToLibrary }) => {
  const [project, setProject] = useState<ProjectItem | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const data = await apiFetch<ProjectItem>(`/api/projects/${projectId}`);
        if (!active) return;
        setProject(data);
        if (data.status === 'ready') {
          onFinished(data);
        }
      } catch {
        // Keep polling gracefully on transient hiccups
      }
    };
    void poll();
    const interval = setInterval(() => {
      void poll();
    }, 1500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [projectId, onFinished]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await apiFetch(`/api/projects/${projectId}/retry`, { method: 'POST' });
    } finally {
      setRetrying(false);
    }
  };

  const job = project?.job;
  const currentStep = job?.current_step ?? 'validate';
  const currentIdx = PIPELINE_STEPS.indexOf(currentStep);
  const isFailed = project?.status === 'failed' || job?.status === 'failed';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="p-6 sm:p-8 rounded-2xl bg-white border border-[#EAE7E3] space-y-6">
        {!isFailed ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#1C1917]">
                  {t('pipeline.heading')}
                </h1>
                <p className="mt-1 text-sm text-[#6B6560]">{t('pipeline.subheading')}</p>
              </div>
              <span className="font-mono text-sm font-semibold tabular-nums text-[#B8420A]">
                {job?.progress_pct ?? 5}%
              </span>
            </div>

            <div className="h-2.5 rounded-full bg-[#FAFAF9] border border-[#EAE7E3] overflow-hidden">
              <div
                className="h-full bg-[#FF6A1A] transition-all duration-500"
                style={{ width: `${job?.progress_pct ?? 5}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-2 font-semibold text-[#1C1917]">
                <Loader2 className="w-4 h-4 text-[#FF6A1A] animate-spin" />
                <span>{t(job?.message_key ?? 'pipeline.step_validate')}</span>
              </span>
              <span className="text-xs text-[#6B6560]">{t('pipeline.estimatedTime')}</span>
            </div>

            {/* Condensed milestone checklist */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
              {[
                { key: 'pipeline.step_hooks', idx: 2 },
                { key: 'pipeline.step_editor', idx: 4 },
                { key: 'pipeline.step_visuals', idx: 6 },
                { key: 'pipeline.step_voice', idx: 7 },
              ].map((m) => {
                const done = currentIdx > m.idx;
                return (
                  <div
                    key={m.key}
                    className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                      done
                        ? 'border-[#16A34A]/30 bg-[#16A34A]/5 text-[#16A34A]'
                        : 'border-[#EAE7E3] bg-[#FAFAF9] text-[#6B6560]'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t(m.key)}</span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="w-11 h-11 rounded-2xl bg-[#DC2626]/10 text-[#DC2626] flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h1 className="font-display text-2xl font-bold text-[#1C1917]">
              {t('pipeline.failedHeading')}
            </h1>
            <p className="text-sm text-[#1C1917]">
              {t(job?.error_key ?? 'pipeline.errorGeneric')}
            </p>
            <p className="text-xs text-[#16A34A] font-medium">
              {t('pipeline.failedRefundNote')}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <PrimaryButton onClick={handleRetry} loading={retrying}>
                {t('common.retry')}
              </PrimaryButton>
              <SecondaryButton onClick={onLeaveToLibrary}>
                {t('pipeline.leaveToLibrary')}
              </SecondaryButton>
            </div>
          </div>
        )}
      </div>

      {/* Partial Results Preview as scenes complete */}
      {project?.scenes && project.scenes.length > 0 && (
        <div className="p-6 rounded-2xl bg-white border border-[#EAE7E3] space-y-4">
          <h2 className="font-display text-base font-semibold text-[#1C1917]">
            {t('pipeline.partialScript')}
          </h2>
          <div className="space-y-2.5">
            {project.scenes.map((sc) => (
              <div
                key={sc.id}
                className="flex items-start gap-3 p-3 rounded-xl bg-[#FAFAF9] border border-[#EAE7E3]"
              >
                {sc.image_url && (
                  <img
                    src={sc.image_url}
                    alt={sc.narration_text}
                    referrerPolicy="no-referrer"
                    className="w-10 h-16 rounded-lg object-cover shrink-0 bg-[#EAE7E3]"
                  />
                )}
                <p className="text-sm text-[#1C1917] leading-relaxed">{sc.narration_text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isFailed && (
        <div className="flex justify-center">
          <SecondaryButton onClick={onLeaveToLibrary}>
            {t('pipeline.leaveToLibrary')}
          </SecondaryButton>
        </div>
      )}
    </div>
  );
};
