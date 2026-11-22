import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Film,
  FolderUp,
  Pencil,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { ApiError, apiFetch } from '../lib/api.ts';
import { t } from '../lib/i18n.ts';
import type { CharacterItem, ProjectItem, StyleItem } from '../shared/types.ts';
import {
  EmptyState,
  ModalSheet,
  PrimaryButton,
  SecondaryButton,
  SegmentedControl,
  SelectField,
  TextInput,
} from './ui/Primitives.tsx';

interface UploadItem {
  id: string;
  kind: string;
  filename: string;
  mime: string;
  size: number;
  url: string;
  created_at: string;
}

type CharacterModalMode = 'create' | 'edit' | 'view_preset';

export const LibraryView: React.FC<{
  projects: ProjectItem[];
  characters: CharacterItem[];
  styles: StyleItem[];
  onOpenProject: (p: ProjectItem) => void;
  onRefreshProjects: () => void;
  onCharactersChanged: () => Promise<void> | void;
  onStartCreate: () => void;
}> = ({
  projects,
  characters,
  styles,
  onOpenProject,
  onRefreshProjects,
  onCharactersChanged,
  onStartCreate,
}) => {
  const [tab, setTab] = useState<'reels' | 'characters' | 'uploads'>('reels');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'creating' | 'failed'>('all');
  const [styleFilter, setStyleFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [rightsChecked, setRightsChecked] = useState(false);

  // Character CRUD modal state
  const [charModalOpen, setCharModalOpen] = useState(false);
  const [charModalMode, setCharModalMode] = useState<CharacterModalMode>('create');
  const [editingChar, setEditingChar] = useState<CharacterItem | null>(null);
  const [charName, setCharName] = useState('');
  const [charStyle, setCharStyle] = useState(styles[0]?.id ?? '');
  const [charAge, setCharAge] = useState('25-32');
  const [charGender, setCharGender] = useState('Neutral');
  const [charHair, setCharHair] = useState('Short curls');
  const [charOutfit, setCharOutfit] = useState('Dark jacket and scarf');
  const [charMood, setCharMood] = useState('Calm');
  const [charSig, setCharSig] = useState('Silver watch');
  const [charSaving, setCharSaving] = useState(false);
  const [charDeletingId, setCharDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [charError, setCharError] = useState<string | null>(null);
  const [charNotice, setCharNotice] = useState<string | null>(null);

  const styleMap = useMemo(() => {
    const map = new Map<string, StyleItem>();
    for (const st of styles) map.set(st.id, st);
    return map;
  }, [styles]);

  const loadUploads = async () => {
    const list = await apiFetch<UploadItem[]>('/api/uploads');
    setUploads(list);
  };

  useEffect(() => {
    if (tab === 'uploads') void loadUploads();
  }, [tab]);

  const filteredReels = projects.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return p.title.toLowerCase().includes(q) || p.topic.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredCharacters = characters.filter((c) => {
    if (styleFilter !== 'all' && c.style_id !== styleFilter) return false;
    return true;
  });

  const openCreateCharacter = () => {
    setCharModalMode('create');
    setEditingChar(null);
    setCharName('');
    setCharStyle(styles[0]?.id ?? '');
    setCharAge('25-32');
    setCharGender('Neutral');
    setCharHair('Short dark curls');
    setCharOutfit('Dark jacket and flowing scarf');
    setCharMood('Calm and focused');
    setCharSig('Silver watch');
    setCharError(null);
    setConfirmDeleteId(null);
    setCharModalOpen(true);
  };

  const openCharacterModal = (c: CharacterItem) => {
    setEditingChar(c);
    setCharModalMode(c.is_preset ? 'view_preset' : 'edit');
    setCharName(c.is_preset ? `${c.name} Custom` : c.name);
    setCharStyle(c.style_id || styles[0]?.id || '');
    setCharAge(c.age_range);
    setCharGender(c.gender);
    setCharHair(c.hair);
    setCharOutfit(c.outfit);
    setCharMood(c.mood);
    setCharSig(c.signature_item);
    setCharError(null);
    setConfirmDeleteId(null);
    setCharModalOpen(true);
  };

  const handleSubmitCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    setCharError(null);
    setCharSaving(true);
    try {
      const payload = {
        name: charName.trim(),
        style_id: charStyle,
        age_range: charAge.trim(),
        gender: charGender.trim(),
        hair: charHair.trim(),
        outfit: charOutfit.trim(),
        mood: charMood.trim(),
        signature_item: charSig.trim(),
      };

      if (charModalMode === 'edit' && editingChar && !editingChar.is_preset) {
        await apiFetch<CharacterItem>(`/api/characters/${editingChar.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        await onCharactersChanged();
        setCharNotice(t('library.characterUpdated'));
      } else {
        await apiFetch<CharacterItem>('/api/characters', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        await onCharactersChanged();
        setCharNotice(t('library.characterSaved'));
      }
      setCharModalOpen(false);
    } catch (err) {
      setCharError(err instanceof ApiError ? err.errorKey : 'library.characterError');
    } finally {
      setCharSaving(false);
    }
  };

  const handleDeleteCharacter = async (id: string) => {
    setCharError(null);
    setCharDeletingId(id);
    try {
      await apiFetch(`/api/characters/${id}`, { method: 'DELETE' });
      await onCharactersChanged();
      setConfirmDeleteId(null);
      if (editingChar?.id === id) {
        setCharModalOpen(false);
      }
      setCharNotice(t('library.characterDeleted'));
    } catch (err) {
      setCharError(err instanceof ApiError ? err.errorKey : 'library.characterError');
    } finally {
      setCharDeletingId(null);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !rightsChecked) return;
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.readAsDataURL(file);
    });
    const kind = file.type.startsWith('image/') ? 'image' : 'audio';
    await apiFetch('/api/uploads', {
      method: 'POST',
      body: JSON.stringify({
        kind,
        filename: file.name,
        mime: file.type,
        data_base64: base64,
        rights_confirmed: true,
      }),
    });
    void loadUploads();
  };

  const handleDeleteUpload = async (id: string) => {
    await apiFetch(`/api/uploads/${id}`, { method: 'DELETE' });
    void loadUploads();
  };

  const handleRetryProject = async (id: string) => {
    await apiFetch(`/api/projects/${id}/retry`, { method: 'POST' });
    onRefreshProjects();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold text-[#1C1917]">{t('library.title')}</h1>
        <SegmentedControl<'reels' | 'characters' | 'uploads'>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'reels', label: t('library.tabReels') },
            { value: 'characters', label: t('library.tabCharacters') },
            { value: 'uploads', label: t('library.tabUploads') },
          ]}
        />
      </div>

      {tab === 'reels' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="flex-1 max-w-sm">
              <TextInput
                id="lib-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('library.searchPlaceholder')}
              />
            </div>
            <SegmentedControl<'all' | 'ready' | 'creating' | 'failed'>
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: t('library.filterAll') },
                { value: 'ready', label: t('library.filterReady') },
                { value: 'creating', label: t('library.filterCreating') },
                { value: 'failed', label: t('library.filterFailed') },
              ]}
            />
          </div>

          {filteredReels.length === 0 ? (
            <EmptyState
              icon={<Film className="w-6 h-6" />}
              title={t('library.emptyReels')}
              body={t('home.emptyBody')}
              action={<PrimaryButton onClick={onStartCreate}>{t('nav.create')}</PrimaryButton>}
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredReels.map((proj) => (
                <div
                  key={proj.id}
                  className="rounded-2xl bg-white border border-[#EAE7E3] overflow-hidden flex flex-col justify-between"
                >
                  <button
                    type="button"
                    onClick={() => onOpenProject(proj)}
                    className="text-left flex-1"
                  >
                    <div className="aspect-[9/14] bg-[#1C1917] overflow-hidden">
                      {proj.thumbnail_url ? (
                        <img
                          src={proj.thumbnail_url}
                          alt={proj.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/50">
                          <Film className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <div className="p-3.5 space-y-1">
                      <p className="font-display text-sm font-semibold text-[#1C1917] truncate">
                        {proj.title}
                      </p>
                      <p className="text-xs text-[#6B6560] truncate">
                        {proj.length_tier}s · {proj.status}
                      </p>
                    </div>
                  </button>
                  {proj.status === 'failed' && (
                    <div className="px-3.5 pb-3.5">
                      <button
                        type="button"
                        onClick={() => void handleRetryProject(proj.id)}
                        className="w-full min-h-[38px] rounded-xl bg-[#FFF4EC] text-[#B8420A] text-xs font-semibold flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{t('common.retry')}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'characters' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="w-full sm:w-64">
              <SelectField
                id="char-style-filter"
                value={styleFilter}
                onChange={(e) => setStyleFilter(e.target.value)}
              >
                <option value="all">{t('library.filterAllStyles')}</option>
                {styles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectField>
            </div>
            <PrimaryButton onClick={openCreateCharacter}>
              <UserPlus className="w-4 h-4" />
              <span>{t('library.createCharacter')}</span>
            </PrimaryButton>
          </div>

          {charNotice && (
            <div className="p-3.5 rounded-xl bg-[#16A34A]/10 text-[#16A34A] text-sm font-medium flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{charNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setCharNotice(null)}
                className="text-xs font-semibold hover:underline"
              >
                {t('common.close')}
              </button>
            </div>
          )}

          {charError && !charModalOpen && (
            <div className="p-3.5 rounded-xl bg-[#DC2626]/10 text-[#DC2626] text-sm font-medium">
              {t(charError)}
            </div>
          )}

          {filteredCharacters.length === 0 ? (
            <EmptyState
              icon={<Users className="w-6 h-6" />}
              title={t('library.tabCharacters')}
              body={t('library.emptyCharacters')}
              action={
                <PrimaryButton onClick={openCreateCharacter}>
                  <UserPlus className="w-4 h-4" />
                  <span>{t('library.createCharacter')}</span>
                </PrimaryButton>
              }
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredCharacters.map((c) => {
                const stName = styleMap.get(c.style_id)?.name ?? '';
                const confirming = confirmDeleteId === c.id;
                return (
                  <div
                    key={c.id}
                    className="rounded-2xl bg-white border border-[#EAE7E3] overflow-hidden flex flex-col justify-between"
                  >
                    <button
                      type="button"
                      onClick={() => openCharacterModal(c)}
                      className="text-left flex-1 group"
                    >
                      <div className="aspect-[3/4] bg-[#FAFAF9] overflow-hidden">
                        <img
                          src={c.master_asset_url}
                          alt={c.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                      </div>
                      <div className="p-3.5 space-y-1">
                        <p className="font-display text-sm font-semibold text-[#1C1917] truncate">
                          {c.name}
                        </p>
                        <p className="text-xs text-[#6B6560] truncate">
                          {[
                            stName,
                            c.mood,
                            c.is_preset
                              ? t('library.characterPresetLabel')
                              : t('library.characterCustomLabel'),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                    </button>

                    <div className="px-3.5 pb-3.5 flex items-center justify-between gap-2">
                      {c.is_preset ? (
                        <button
                          type="button"
                          onClick={() => openCharacterModal(c)}
                          className="w-full min-h-[36px] px-3 rounded-xl bg-[#FAFAF9] border border-[#EAE7E3] text-xs font-semibold text-[#1C1917] hover:border-[#FFB27A] hover:bg-[#FFF4EC] inline-flex items-center justify-center gap-1.5"
                        >
                          <Copy className="w-3.5 h-3.5 text-[#E5540A]" />
                          <span>{t('library.customizePreset')}</span>
                        </button>
                      ) : confirming ? (
                        <div className="w-full flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleDeleteCharacter(c.id)}
                            disabled={charDeletingId === c.id}
                            className="flex-1 min-h-[36px] px-2.5 rounded-xl bg-[#DC2626] text-white text-xs font-semibold hover:bg-[#B91C1C] disabled:opacity-60"
                          >
                            {t('common.confirm')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[36px] px-2.5 rounded-xl bg-[#FAFAF9] border border-[#EAE7E3] text-xs font-semibold text-[#6B6560]"
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => openCharacterModal(c)}
                            className="flex-1 min-h-[36px] px-3 rounded-xl bg-[#FAFAF9] border border-[#EAE7E3] text-xs font-semibold text-[#1C1917] hover:border-[#FFB27A] hover:bg-[#FFF4EC] inline-flex items-center justify-center gap-1.5"
                          >
                            <Pencil className="w-3.5 h-3.5 text-[#E5540A]" />
                            <span>{t('library.editCharacter')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(c.id)}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl border border-[#EAE7E3] text-[#DC2626] hover:bg-[#DC2626]/5"
                            aria-label={t('common.delete')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'uploads' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-white border border-[#EAE7E3] space-y-3">
            <label className="flex items-start gap-2.5 text-sm text-[#6B6560] cursor-pointer">
              <input
                type="checkbox"
                checked={rightsChecked}
                onChange={(e) => setRightsChecked(e.target.checked)}
                className="mt-1 accent-[#E5540A]"
              />
              <span>{t('wizard.rightsCheckbox')}</span>
            </label>
            <label
              className={`inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#E5540A] text-white text-sm font-semibold ${
                rightsChecked ? 'cursor-pointer hover:bg-[#B8420A]' : 'opacity-50 pointer-events-none'
              }`}
            >
              <FolderUp className="w-4 h-4" />
              <span>{t('library.uploadAsset')}</span>
              <input
                type="file"
                accept="audio/mp3,audio/mpeg,audio/wav,audio/m4a,image/png,image/jpeg,image/webp"
                disabled={!rightsChecked}
                onChange={handleUploadFile}
                className="hidden"
              />
            </label>
          </div>

          {uploads.length === 0 ? (
            <EmptyState
              icon={<FolderUp className="w-6 h-6" />}
              title={t('library.tabUploads')}
              body={t('library.emptyUploads')}
            />
          ) : (
            <div className="divide-y divide-[#EAE7E3] rounded-2xl bg-white border border-[#EAE7E3]">
              {uploads.map((u) => (
                <div key={u.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1C1917] truncate">{u.filename}</p>
                    <p className="text-xs text-[#6B6560]">
                      {u.kind} · {Math.round(u.size / 1024)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteUpload(u.id)}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#DC2626] hover:bg-[#DC2626]/5"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ModalSheet
        open={charModalOpen}
        onClose={() => setCharModalOpen(false)}
        title={
          charModalMode === 'edit'
            ? t('library.editCharacter')
            : charModalMode === 'view_preset'
            ? t('library.viewCharacter')
            : t('library.createCharacter')
        }
      >
        <form onSubmit={handleSubmitCharacter} className="space-y-3.5">
          {editingChar && (
            <div className="flex items-center gap-3.5 p-3 rounded-xl bg-[#FAFAF9] border border-[#EAE7E3]">
              <img
                src={editingChar.master_asset_url}
                alt={editingChar.name}
                referrerPolicy="no-referrer"
                className="w-14 h-18 rounded-lg object-cover shrink-0 bg-[#EAE7E3]"
              />
              <p className="text-xs text-[#6B6560] leading-relaxed">
                {editingChar.description_card}
              </p>
            </div>
          )}

          {charError && (
            <div className="p-3 rounded-xl bg-[#DC2626]/10 text-[#DC2626] text-xs font-medium">
              {t(charError)}
            </div>
          )}

          <TextInput
            id="lib-char-name"
            label={t('wizard.characterName')}
            value={charName}
            onChange={(e) => setCharName(e.target.value)}
            required
          />
          <SelectField
            id="lib-char-style"
            label={t('wizard.lookHeading')}
            value={charStyle}
            onChange={(e) => setCharStyle(e.target.value)}
          >
            {styles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
          <div className="grid grid-cols-2 gap-3">
            <TextInput
              id="lib-char-age"
              label={t('wizard.characterAge')}
              value={charAge}
              onChange={(e) => setCharAge(e.target.value)}
              required
            />
            <TextInput
              id="lib-char-gender"
              label={t('wizard.characterGender')}
              value={charGender}
              onChange={(e) => setCharGender(e.target.value)}
              required
            />
          </div>
          <TextInput
            id="lib-char-hair"
            label={t('wizard.characterHair')}
            value={charHair}
            onChange={(e) => setCharHair(e.target.value)}
            required
          />
          <TextInput
            id="lib-char-outfit"
            label={t('wizard.characterOutfit')}
            value={charOutfit}
            onChange={(e) => setCharOutfit(e.target.value)}
            required
          />
          <TextInput
            id="lib-char-mood"
            label={t('wizard.characterMood')}
            value={charMood}
            onChange={(e) => setCharMood(e.target.value)}
            required
          />
          <TextInput
            id="lib-char-sig"
            label={t('wizard.characterSignature')}
            value={charSig}
            onChange={(e) => setCharSig(e.target.value)}
            required
          />

          <div className="flex gap-2.5 pt-1">
            {charModalMode === 'edit' && editingChar && !editingChar.is_preset && (
              <SecondaryButton
                type="button"
                disabled={charSaving || charDeletingId === editingChar.id}
                onClick={() => void handleDeleteCharacter(editingChar.id)}
                className="text-[#DC2626] border-[#DC2626]/30 hover:bg-[#DC2626]/5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{t('common.delete')}</span>
              </SecondaryButton>
            )}
            <PrimaryButton type="submit" loading={charSaving} className="flex-1">
              {charSaving
                ? t('library.savingChanges')
                : charModalMode === 'edit'
                ? t('library.updateCharacter')
                : charModalMode === 'view_preset'
                ? t('library.customizePreset')
                : t('wizard.characterSave')}
            </PrimaryButton>
          </div>
        </form>
      </ModalSheet>
    </div>
  );
};
