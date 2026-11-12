/* Another way to hear the same card. One style at a time. */
import { useState } from 'react';
import { EXPLAIN_STYLES, type ExplainStyle, type SketchStep } from '../../../shared/explain';
import { ageBand } from '../../../shared/merki';
import { useStore } from '../hooks';
import { api } from '../lib/api';
import { t, uiLang } from '../i18n';

function Sketch({ steps }: { steps: SketchStep[] }) {
  const w = 280, h = 36 + steps.length * 52;
  return (
    <svg className="explain-sketch" width="100%" viewBox={`0 0 ${w} ${h}`} role="img" data-testid="explain-sketch">
      {steps.map((s, i) => (
        <g key={i}>
          <rect x="20" y={12 + i * 52} width={w - 40} height="36" rx="12" fill="#fff" stroke="#12131f" strokeWidth="2" />
          <text x={w / 2} y={35 + i * 52} textAnchor="middle" fontSize="13" fontWeight="700" fill="#12131f">{s.label.slice(0, 32)}</text>
          {i < steps.length - 1 && <path d={`M${w / 2} ${48 + i * 52} v12`} stroke="#12131f" strokeWidth="2" markerEnd="" />}
        </g>
      ))}
    </svg>
  );
}

export function ExplainBox({ term, meaning }: { term: string; meaning: string }) {
  const d = useStore();
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<ExplainStyle>('example');
  const [text, setText] = useState('');
  const [sketch, setSketch] = useState<SketchStep[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async (next: ExplainStyle) => {
    setStyle(next); setBusy(true);
    const year = new Date().getFullYear();
    const band = ageBand({ schoolYear: d.settings.schoolYear, birthYear: d.settings.birthYear, nowYear: year }) || 'mid';
    try {
      const res = await api<{ text: string; sketch: SketchStep[] | null }>('/api/explain', { body: { term, meaning, style: next, band, lang: uiLang() === 'en' ? 'en' : 'de' } });
      setText(res.text); setSketch(res.sketch);
    } catch { setText(''); setSketch(null); }
    finally { setBusy(false); }
  };
  return (
    <div className="explain-box" data-testid="explain-box">
      {!open && <button type="button" className="btn ghost sm" data-testid="explain-open" onClick={() => { setOpen(true); void load(style); }}>{t('explain_open')}</button>}
      {open && <>
        <div className="chips">
          {EXPLAIN_STYLES.map(s => <button key={s} type="button" className={'pill sm' + (style === s ? ' on' : '')} data-testid={'explain-style-' + s} onClick={() => load(s)}>{t(('explain_' + s) as 'explain_example')}</button>)}
        </div>
        {sketch && sketch.length > 1 ? <Sketch steps={sketch} /> : <p className="explain-text" data-testid="explain-text">{busy ? '…' : text}</p>}
      </>}
    </div>
  );
}
