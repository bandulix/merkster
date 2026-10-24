/* 1v1 vocab clash on a shared class deck. Server grades answers. */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import type { ClassClash, ClashPrompt } from '../lib/classes';
import { store } from '../lib/store';
import { confetti, now, toast } from '../lib/util';
import { Face, TopBar } from '../components/ui';
import { t, tp, type Key } from '../i18n';

function VersusBar({ clash, answered, onNudge, onCheer }: { clash: ClassClash; answered: number; onNudge: () => void; onCheer: () => void }) {
  const me = clash.me === 'opponent' ? clash.opponent : clash.challenger;
  const them = clash.me === 'opponent' ? clash.challenger : clash.opponent;
  const total = Math.max(1, clash.cards);
  const mineKnown = !!clash.myPlay?.done || answered > 0;
  const theirKnown = !!clash.theirPlay?.done;
  const mineN = clash.myPlay?.done ? clash.myPlay.correct : answered;
  const theirN = clash.theirPlay?.done ? clash.theirPlay.correct : 0;
  const width = (n: number) => Math.max(0, Math.min(50, n / total * 50)) + '%';
  return (
    <div className="versus" data-testid="clash-versus">
      <div className="versus-row">
        <span className="versus-face"><Face src={me.avatar} name={me.name} size={48} /></span>
        <div className="versus-mid">
          <div className="versus-track" aria-hidden="true">
            <i className="you" style={{ width: width(mineN) }} />
            <i className="gap" />
            <i className="them" style={{ width: width(theirN) }} />
          </div>
          <div className="versus-legend">
            <span><b>{clash.me ? t('clash_you') : me.name}</b> {mineKnown ? `${mineN}/${clash.cards}` : t('clash_waiting_short')}</span>
            <span><b>{them.name}</b> {theirKnown ? `${theirN}/${clash.cards}` : t('clash_waiting_short')}</span>
          </div>
        </div>
        <span className="versus-face"><Face src={them.avatar} name={them.name} size={48} /></span>
      </div>
      <div className="versus-actions">
        <button type="button" className="btn ghost" data-testid="clash-nudge" onClick={onNudge}>👋 {t('clash_nudge')}</button>
        <button type="button" className="btn primary" data-testid="clash-cheer" onClick={onCheer}>📣 {t('clash_cheer')}</button>
      </div>
    </div>
  );
}

const errText = (e: unknown) => {
  const code = (e as ApiError).code || 'not_found';
  const k = ('clash_err_' + code) as Key;
  const s = t(k);
  return s !== k ? s : t('class_err_not_found');
};

export function ClashPage() {
  const { id = '', clashId = '' } = useParams();
  const nav = useNavigate(), qc = useQueryClient();
  const q = useQuery({
    queryKey: ['clash', id, clashId],
    queryFn: () => api<{ clash: ClassClash }>('/api/classes/' + id + '/clashes/' + clashId).then(r => r.clash),
    enabled: !!id && !!clashId && !!store.userId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === 'pending' || s === 'active' ? 2500 : false;
    }
  });
  const clash = q.data;
  const [i, setI] = useState(0);
  const [value, setValue] = useState('');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [started, setStarted] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (clash && !started) setStarted(now()); }, [clash?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const prompts: ClashPrompt[] = clash?.prompts || [];
  const card = prompts[i];
  const other = clash ? (clash.me === 'challenger' ? clash.opponent : clash.challenger) : null;
  const canPlay = !!clash && !clash.myPlay?.done && (clash.status === 'active' || (clash.status === 'pending' && clash.me === 'challenger'));

  const resultLine = useMemo(() => {
    if (!clash || clash.status !== 'done' || !clash.myPlay) return null;
    if (!clash.winnerId) return t('clash_draw');
    if (clash.winnerId === store.userId) return t('clash_you_won');
    return t('clash_you_lost', { name: other?.name || '' });
  }, [clash, other?.name]);

  if (q.isError) return <section className="page narrow"><TopBar title={t('clash_title')} back={'/classes/' + id} /><p className="err">{errText(q.error)}</p></section>;
  if (!clash) return <section className="page narrow"><TopBar title={t('clash_title')} back={'/classes/' + id} /><p className="muted">{t('loading')}</p></section>;

  const accept = async () => {
    setBusy(true);
    try { await api('/api/classes/' + id + '/clashes/' + clashId + '/accept', { body: {} }); await q.refetch(); }
    catch (e) { toast(errText(e), 'bad'); }
    finally { setBusy(false); }
  };
  const decline = async () => {
    setBusy(true);
    try { await api('/api/classes/' + id + '/clashes/' + clashId + '/decline', { body: {} }); nav('/classes/' + id, { replace: true }); }
    catch (e) { toast(errText(e), 'bad'); }
    finally { setBusy(false); }
  };
  const saveAnswer = () => {
    if (!card) return;
    setAnswers(a => ({ ...a, [card.position]: value }));
    setValue('');
    if (i + 1 < prompts.length) setI(i + 1);
    else void submit({ ...answers, [card.position]: value });
  };
  const submit = async (map: Record<number, string>) => {
    setBusy(true);
    try {
      const payload = prompts.map(p => ({ position: p.position, value: map[p.position] || '' }));
      await api('/api/classes/' + id + '/clashes/' + clashId + '/submit', { body: { answers: payload, ms: Math.max(0, now() - started) } });
      await q.refetch();
      qc.invalidateQueries({ queryKey: ['class-clashes', id] });
    } catch (e) { toast(errText(e), 'bad'); }
    finally { setBusy(false); }
  };
  const nudge = async (name: string) => {
    const text = t('clash_nudge_text', { name });
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ text, url }); toast(t('clash_nudged'), 'ok'); return; }
    } catch (e) { if ((e as Error).name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text + ' ' + url); toast(t('clash_nudged'), 'ok'); }
    catch { toast(text, 'ok'); }
  };
  const cheer = (name: string) => { confetti(); toast(t('clash_cheered', { name }), 'ok'); };

  return (
    <section className="page narrow clash-page" data-testid="clash-page">
      <TopBar title={t('clash_title')} back={'/classes/' + id} />
      <div className="clash-head card">
        {other ? <VersusBar clash={clash} answered={Object.keys(answers).length} onNudge={() => void nudge(other.name)} onCheer={() => cheer(other.name)} /> : (
          <div className="clash-faces">
            <Face src={clash.challenger.avatar} name={clash.challenger.name} size={48} />
            <span className="muted">vs</span>
            <Face src={clash.opponent.avatar} name={clash.opponent.name} size={48} />
          </div>
        )}
        <small className="muted">{clash.shareName} · {tp('class_cards_n', clash.cards)}</small>
      </div>

      {clash.status === 'pending' && clash.me === 'opponent' && (
        <div className="card">
          <p>{t('clash_vs', { a: clash.challenger.name, b: clash.opponent.name })}</p>
          <div className="row-btns">
            <button className="btn primary" data-testid="clash-accept" disabled={busy} onClick={() => void accept()}>{t('clash_accept')}</button>
            <button className="btn ghost" data-testid="clash-decline" disabled={busy} onClick={() => void decline()}>{t('clash_decline')}</button>
          </div>
        </div>
      )}

      {clash.status === 'pending' && clash.me === 'challenger' && !canPlay && (
        <p className="muted" data-testid="clash-waiting">{t('clash_pending', { name: other?.name || '' })}</p>
      )}

      {canPlay && card && (
        <div className="card clash-quiz" data-testid="clash-quiz">
          <p className="muted small">{t('clash_your_turn')} · {i + 1}/{prompts.length}</p>
          <div className="clash-term" data-testid="clash-term">{card.term}</div>
          <p className="muted">{t('clash_prompt')}</p>
          <input
            data-testid="clash-answer"
            className="wide"
            value={value}
            autoFocus
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveAnswer(); } }}
          />
          <button className="btn primary big wide" data-testid="clash-next" disabled={busy} onClick={saveAnswer}>
            {i + 1 < prompts.length ? t('clash_next') : t('clash_submit')}
          </button>
        </div>
      )}

      {clash.myPlay?.done && clash.status !== 'done' && other && (
        <p className="muted" data-testid="clash-wait-opp">{t('clash_waiting', { name: other.name })}</p>
      )}

      {clash.status === 'done' && clash.myPlay && (
        <div className="card clash-result" data-testid="clash-result">
          <h2>{resultLine}</h2>
          <p>{t('clash_score', { n: clash.myPlay.correct, total: clash.cards })}
            {clash.theirPlay ? ` · ${other?.name}: ${clash.theirPlay.correct}/${clash.cards}` : ''}</p>
          <Link className="btn primary wide" to={'/classes/' + id} data-testid="clash-back">{t('classes_title')}</Link>
        </div>
      )}
    </section>
  );
}
