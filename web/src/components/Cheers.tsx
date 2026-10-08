/* Cheers UI: what the student sees (who cheered) and what supporters tap (fixed emoji set + preset messages). */
import { useState } from 'react';
import type { Cheer, ReactionCount } from '../../../shared/supporters';
import { PRESET_MESSAGES, REACTION_EMOJI } from '../../../shared/supporters';
import { isMessage, reactionText, whoName } from '../lib/supporters';
import { t } from '../i18n';
import { Face } from './ui';

export function MiniAvatar({ src, name, size = 26 }: { src: string | null; name: string; size?: number }) {
  return <span className="mini-av" style={{ width: size, height: size }} title={name}><Face src={src} name={name} size={size} /></span>;
}
/** "Oma ❤️🎉 · Papa 👏 „Stolz auf dich!“" */
export function CheerChips({ groups, compact = false }: { groups: { from: Cheer['from']; reactions: string[] }[]; compact?: boolean }) {
  if (!groups.length) return null;
  return (
    <div className={'cheer-chips' + (compact ? ' compact' : '')} data-testid="cheer-chips">
      {groups.map(g => {
        const emo = g.reactions.filter(r => !isMessage(r)), msg = g.reactions.find(isMessage);
        return <span key={g.from.id} className="cheer-chip"><MiniAvatar src={g.from.avatar} name={g.from.name} size={compact ? 20 : 24} /><b>{whoName(g.from)}</b><span className="emo">{emo.join('')}</span>{msg && <i>„{reactionText(msg)}“</i>}</span>;
      })}
    </div>
  );
}
/** supporter side: toggle emoji (one of each per supporter) + optional preset message */
export function ReactionBar({ counts, onToggle, busy }: { counts: ReactionCount[]; onToggle: (reaction: string, on: boolean) => void; busy?: boolean }) {
  const [msgs, setMsgs] = useState(false);
  const mine = new Set(counts.filter(c => c.mine).map(c => c.reaction)), n = (r: string) => counts.find(c => c.reaction === r)?.n || 0;
  const myMsg = [...mine].find(isMessage);
  return (
    <div className="react-bar" data-testid="react-bar">
      <div className="react-emojis">
        {REACTION_EMOJI.map(e => (
          <button key={e} className={'react-btn' + (mine.has(e) ? ' on' : '')} disabled={busy} aria-pressed={mine.has(e)} data-testid={'react-' + e} onClick={() => onToggle(e, !mine.has(e))}>
            <span>{e}</span>{n(e) > 0 && <small>{n(e)}</small>}
          </button>))}
        <button className={'react-btn msg' + (myMsg ? ' on' : '')} aria-expanded={msgs} data-testid="react-msg" onClick={() => setMsgs(x => !x)}>💬</button>
      </div>
      {myMsg && !msgs && <p className="small react-mymsg">💬 „{reactionText(myMsg)}“</p>}
      {msgs && <div className="chips react-msgs">{PRESET_MESSAGES.map(m => { const r = 'msg:' + m, on = mine.has(r); return (
        <button key={m} className={'pill sm' + (on ? ' on' : '')} data-testid={'msg-' + m} disabled={busy} onClick={() => { onToggle(r, !on); setMsgs(false); }}>{t(('msg_' + m) as 'msg_proud')}</button>); })}</div>}
    </div>
  );
}
