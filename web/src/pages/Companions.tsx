/* Gallery and the short create flow. Merki stays one tap away. */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PERSONALITY_MAX, PRESETS, TRAITS, isTrait, previewLine, randomBio, type Preset, type Trait } from '../../../shared/companions';
import { useConfig } from '../hooks';
import { api } from '../lib/api';
import { toast } from '../lib/util';
import { t, uiLang } from '../i18n';
import { TopBar } from '../components/ui';
import { CompanionFace } from '../components/CompanionFace';

type Card = {
  id: string; name: string; personality?: string; preset: string | null; picture: string | null;
  shared: boolean; code: string | null; creator: string; mine: boolean; access: string;
};

async function circlePng(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = () => rej(new Error('img'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('canvas');
    g.beginPath();
    g.arc(128, 128, 128, 0, Math.PI * 2);
    g.clip();
    const side = Math.min(img.width, img.height);
    g.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(b => r(b), 'image/png'));
    if (!blob) throw new Error('blob');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

export function CompanionsPage() {
  const qc = useQueryClient();
  const cfg = useConfig();
  const list = useQuery({ queryKey: ['companions'], queryFn: () => api<{ companions: Card[]; image: boolean }>('/api/companions') });
  const active = useQuery({ queryKey: ['companion-active'], queryFn: () => api<{ companion: Card | null }>('/api/companions/active') });
  const [step, setStep] = useState<'gallery' | 'intro' | 'look' | 'name' | 'voice'>('gallery');
  const [preset, setPreset] = useState<Preset>('moss');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [trait, setTrait] = useState<Trait>('playful');
  const [bio, setBio] = useState('');
  const [bioN, setBioN] = useState(0);
  const [codeIn, setCodeIn] = useState('');
  const [sharing, setSharing] = useState<Card | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const lang = uiLang() === 'en' ? 'en' : 'de';
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['companions'] }); void qc.invalidateQueries({ queryKey: ['companion-active'] }); void qc.invalidateQueries({ queryKey: ['merki'] }); };

  const useOne = useMutation({
    mutationFn: (id: string | null) => api('/api/me/companion', { method: 'PUT', body: { id } }),
    onSuccess: () => { refresh(); toast(t('comp_saved'), 'ok'); }
  });
  const save = useMutation({
    mutationFn: async () => {
      const made = await api<{ companion: Card }>('/api/companions', { body: { name, personality: bio, preset } });
      if (photo && made.companion) {
        const form = new FormData();
        form.append('file', photo, 'face.png');
        await api('/api/companions/' + made.companion.id + '/picture', { form });
      }
      await api('/api/me/companion', { method: 'PUT', body: { id: made.companion.id } });
      return made.companion;
    },
    onSuccess: () => { refresh(); setStep('gallery'); setPhoto(null); setPhotoUrl(null); toast(t('comp_saved'), 'ok'); },
    onError: () => toast(t('comp_bad'), 'bad')
  });

  const cards = list.data?.companions || [];
  const activeId = active.data?.companion?.id || null;
  const preview = previewLine(name, trait, lang);

  return (
    <section className="page narrow" data-testid="companions">
      <TopBar title={t('comp_title')} back="/" />
      {step === 'gallery' && <>
        <p className="lead">{t('comp_lead')}</p>
        <button className="btn primary big wide" data-testid="companion-create" onClick={() => setStep('intro')}>{t('comp_new')}</button>
        <div className="card" data-testid="companion-redeem">
          <h3>{t('comp_redeem')}</h3>
          <div className="row-btns">
            <input data-testid="redeem-code" value={codeIn} maxLength={12} onChange={e => setCodeIn(e.target.value.toUpperCase())} placeholder={t('comp_code')} />
            <button className="btn" data-testid="redeem-add" onClick={() => api('/api/companions/redeem', { body: { code: codeIn } }).then(() => { setCodeIn(''); refresh(); }).catch(() => toast(t('comp_bad'), 'bad'))}>{t('comp_add')}</button>
          </div>
        </div>
        {!cards.length && <p className="muted" data-testid="companion-empty">{t('comp_empty')}</p>}
        <div className="companion-grid">
          {cards.map(c => (
            <article key={c.id} className="card companion-card" data-testid="companion-card">
              <CompanionFace name={c.name} preset={c.preset} src={c.picture} size={72} />
              <div>
                <b>{c.name}</b>
                <p className="small muted">{c.mine ? t('comp_who_me') : t('comp_by', { name: c.creator })}</p>
                {activeId === c.id && <span className="chip" data-testid="companion-active">{t('comp_using')}</span>}
              </div>
              <div className="row-btns wrap">
                {activeId !== c.id && <button className="btn sm" data-testid={'use-' + c.name} onClick={() => useOne.mutate(c.id)}>{t('comp_use')}</button>}
                {c.mine && <button className="btn ghost sm" data-testid={'share-' + c.name} onClick={() => setSharing(c)}>{t('comp_share')}</button>}
                {!c.mine && <button className="btn ghost sm" onClick={() => api('/api/companions/' + c.id + '/duplicate', { body: {} }).then(refresh)}>{t('comp_dup')}</button>}
                {!c.mine && <button className="btn ghost sm" data-testid={'hide-' + c.name} onClick={() => api('/api/companions/' + c.id + '/hide', { body: {} }).then(refresh)}>{t('comp_hide')}</button>}
                <button className="btn link sm" onClick={() => api('/api/companions/' + c.id, { method: 'DELETE' }).then(refresh)}>{c.mine ? t('comp_remove') : t('comp_remove')}</button>
              </div>
            </article>
          ))}
        </div>
        <button className="btn ghost wide" data-testid="use-merki" onClick={() => useOne.mutate(null)}>{t('comp_merki')}</button>
        {sharing && (
          <div className="card" data-testid="share-sheet">
            <h3>{t('comp_share')} · {sharing.name}</h3>
            <p className="muted small">{t('comp_who_note')}</p>
            {sharing.code && <p className="big-num" data-testid="share-code">{sharing.code}</p>}
            <div className="row-btns">
              {!sharing.shared && <button className="btn primary" data-testid="share-on" onClick={() => api<{ companion: Card }>('/api/companions/' + sharing.id + '/share', { body: {} }).then(r => { setSharing(r.companion); refresh(); }).catch(() => toast(t('comp_bad'), 'bad'))}>{t('comp_share')}</button>}
              {sharing.shared && <button className="btn" data-testid="share-copy" onClick={() => { void navigator.clipboard?.writeText(sharing.code || ''); toast(t('comp_copied'), 'ok'); }}>{t('comp_copy')}</button>}
              {sharing.shared && <button className="btn ghost" data-testid="share-revoke" onClick={() => api('/api/companions/' + sharing.id + '/revoke', { body: {} }).then(() => { setSharing(null); refresh(); })}>{t('comp_revoke')}</button>}
            </div>
          </div>
        )}
      </>}
      {step === 'intro' && (
        <div className="merki-moment" data-testid="companion-intro">
          <CompanionFace name="Merki" preset="nova" size={180} />
          <h2>{t('comp_intro_title')}</h2>
          <p className="muted">{t('comp_intro')}</p>
          <button className="btn primary big wide" data-testid="companion-next" onClick={() => setStep('look')}>{t('comp_new')}</button>
        </div>
      )}
      {step === 'look' && (
        <div data-testid="companion-look">
          <h2>{t('comp_look')}</h2>
          <div className="preset-grid">
            {PRESETS.map(p => (
              <button key={p} type="button" className={'preset-btn' + (preset === p && !photoUrl ? ' on' : '')} data-testid={'preset-' + p} onClick={() => { setPreset(p); setPhoto(null); setPhotoUrl(null); }}>
                <CompanionFace name={p} preset={p} size={72} />
              </button>
            ))}
          </div>
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => {
            const f = e.target.files?.[0];
            if (!f) return;
            void circlePng(f).then(blob => { setPhoto(blob); setPhotoUrl(URL.createObjectURL(blob)); }).catch(() => toast(t('avatar_bad'), 'bad'));
          }} />
          <div className="row-btns">
            <button className="btn ghost" data-testid="companion-upload" onClick={() => file.current?.click()}>{t('comp_upload')}</button>
            {(list.data?.image || cfg.data?.ai.image) && <button className="btn ghost" data-testid="companion-imagine" onClick={() => api<{ dataUrl: string }>('/api/companions/imagine', { body: { preset } }).then(r => { setPhotoUrl(r.dataUrl); setPhoto(null); })}>{t('comp_imagine')}</button>}
          </div>
          {photoUrl && <img className="companion-face" src={photoUrl} width={120} height={120} alt="" data-testid="upload-preview" />}
          <button className="btn primary big wide" data-testid="look-next" onClick={() => setStep('name')}>{t('next')}</button>
        </div>
      )}
      {step === 'name' && (
        <div data-testid="companion-name-step">
          <CompanionFace name={name || '…'} preset={preset} src={photoUrl} size={96} />
          <label className="field"><span>{t('comp_name')}</span>
            <input data-testid="companion-name" value={name} maxLength={24} onChange={e => setName(e.target.value)} />
          </label>
          <p className="small">{t('comp_who')}</p>
          <button type="button" className="pill on" data-testid="who-me">{t('comp_who_me')}</button>
          <p className="muted small">{t('comp_who_note')}</p>
          <button className="btn primary big wide" data-testid="name-next" disabled={name.trim().length < 2} onClick={() => setStep('voice')}>{t('next')}</button>
        </div>
      )}
      {step === 'voice' && (
        <div data-testid="companion-voice">
          <h2>{t('comp_voice')}</h2>
          <div className="comp-preview" data-testid="companion-preview">
            <CompanionFace name={name} preset={preset} src={photoUrl} size={72} />
            <p className="merki-bubble">{preview}</p>
          </div>
          <div className="chips">
            {TRAITS.map(id => (
              <button key={id} type="button" className={'pill sm' + (trait === id ? ' on' : '')} data-testid={'trait-' + id} onClick={() => { if (isTrait(id)) { setTrait(id); if (!bio) setBio(randomBio(lang, TRAITS.indexOf(id))); } }}>{t(('trait_' + id) as 'trait_playful')}</button>
            ))}
          </div>
          <label className="field"><span>{t('comp_bio')}</span>
            <textarea data-testid="companion-bio" value={bio} maxLength={PERSONALITY_MAX} rows={4} onChange={e => setBio(e.target.value)} />
          </label>
          <div className="row-btns">
            <button type="button" className="btn ghost sm" data-testid="companion-random" onClick={() => { const n = bioN + 1; setBioN(n); setBio(randomBio(lang, n)); }}>{t('comp_random')}</button>
            <span className="small muted">{bio.length}/{PERSONALITY_MAX}</span>
          </div>
          <button className="btn primary big wide" data-testid="companion-save" disabled={bio.trim().length < 2 || save.isPending} onClick={() => save.mutate()}>{t('comp_save')}</button>
        </div>
      )}
    </section>
  );
}
