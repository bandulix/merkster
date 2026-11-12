/* Built-in companion faces. Original flat aliens, one colour each. */
import type { Preset } from '../../../shared/companions';

const FILL: Record<Preset, string> = {
  comet: '#7a8cff', moss: '#3dbe7a', ink: '#dfe3f5', sun: '#ffd23f', pebble: '#ff8fab', nova: '#c6f432'
};

export function CompanionFace({ name, preset, src, size = 96 }: { name: string; preset?: string | null; src?: string | null; size?: number }) {
  const kind = (preset && preset in FILL ? preset : 'comet') as Preset;
  if (src) return <img className="companion-face" src={src} width={size} height={size} alt="" data-testid="companion-face" data-name={name} />;
  return (
    <svg className="companion-face" width={size} height={size} viewBox="0 0 120 120" data-testid="companion-face" data-name={name} data-preset={kind} aria-hidden>
      <ellipse cx="60" cy="108" rx="26" ry="6" fill="rgba(13,15,30,.16)" />
      <ellipse cx="60" cy="62" rx="38" ry="34" fill={FILL[kind]} stroke="#12131f" strokeWidth="3" />
      <circle cx="44" cy="58" r="8" fill="#fff" stroke="#12131f" strokeWidth="2" />
      <circle cx="76" cy="58" r="8" fill="#fff" stroke="#12131f" strokeWidth="2" />
      <circle cx="46" cy="58" r="3" fill="#12131f" />
      <circle cx="78" cy="58" r="3" fill="#12131f" />
      <path d="M48 78c5 6 19 6 24 0" fill="none" stroke="#12131f" strokeWidth="3" strokeLinecap="round" />
      {kind === 'ink' && <path d="M28 54h64c-4 14-16 18-32 18S32 68 28 54z" fill="#c6f432" stroke="#12131f" strokeWidth="2" />}
      {kind === 'nova' && <circle cx="34" cy="18" r="5" fill="#ffd23f" stroke="#12131f" strokeWidth="2" />}
    </svg>
  );
}
