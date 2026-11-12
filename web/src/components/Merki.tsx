/* Merki — an original alien. Young is round and bouncy, teen wears a hood and a visor. */
import type { AgeBand, MerkiPose } from '../../../shared/merki';

export function Merki({ band = 'mid', pose = 'happy', size = 96 }: { band?: AgeBand; pose?: MerkiPose; size?: number }) {
  const young = band === 'young';
  const teen = band === 'teen';
  const sleepy = pose === 'sleepy';
  const wink = pose === 'nudging';
  const think = pose === 'thinking';
  const cheer = pose === 'cheering' || pose === 'proud';
  return (
    <svg className={'merki merki-' + band + ' pose-' + pose} width={size} height={size} viewBox="0 0 120 120" data-testid="merki" data-variant={band} data-pose={pose} aria-hidden>
      <ellipse cx="60" cy="108" rx={teen ? 22 : 28} ry="6" className="merki-shadow" />
      {teen && <path d="M30 70c2 22 16 34 30 34s28-12 30-34v-6H30z" className="merki-hood" />}
      <ellipse cx="60" cy={young ? 62 : 58} rx={young ? 40 : 32} ry={young ? 36 : 30} className="merki-body" />
      {young && <ellipse cx="48" cy="50" rx="12" ry="7" className="merki-shine" />}
      <path d="M38 28c2-14 10-18 14-18" className="merki-ant" />
      <path d="M82 28c-2-14-10-18-14-18" className="merki-ant" />
      <circle cx="36" cy="12" r={young ? 6 : 4} className="merki-bulb" />
      <circle cx="84" cy="12" r={young ? 6 : 4} className="merki-bulb" />
      <g className={'merki-eyes' + (think ? ' up' : '')}>
        <ellipse cx="46" cy="58" rx={young ? 12 : 8} ry={sleepy ? 3 : young ? 14 : 9} className="merki-eye" />
        <ellipse cx="74" cy="58" rx={young ? 12 : 8} ry={sleepy || wink ? 3 : young ? 14 : 9} className="merki-eye" />
        {!sleepy && <circle cx={think ? 42 : 48} cy="58" r={young ? 4.5 : 3} className="merki-pupil" />}
        {!sleepy && !wink && <circle cx={think ? 70 : 76} cy="58" r={young ? 4.5 : 3} className="merki-pupil" />}
      </g>
      {teen && <path d="M26 52h68c-2 16-16 22-34 22S28 68 26 52z" className="merki-visor" />}
      <path d={cheer ? 'M46 78c6 10 22 10 28 0' : sleepy ? 'M52 80h16' : 'M48 80c5 5 18 5 24 0'} className="merki-mouth" />
      {young && <circle cx="30" cy="72" r="6" className="merki-cheek" />}
      {young && <circle cx="90" cy="72" r="6" className="merki-cheek" />}
      {cheer && !teen && <path d="M16 36l8 2-6 4 4-8z M102 32l7 2-5 4 3-7z" className="merki-spark" />}
    </svg>
  );
}
