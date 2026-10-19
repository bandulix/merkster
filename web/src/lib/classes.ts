/* Class groups on the client: the invite token stays in the URL fragment. */
import type { Format, Lang, Subject } from '../../../shared/types';

const KEY = 'merkster.classInvite';
export const classToken = {
  capture() {
    const m = /^#?([A-Za-z0-9_-]{32})$/.exec(location.hash || '');
    if (m && location.pathname === '/class') { sessionStorage.setItem(KEY, m[1]); history.replaceState(null, '', location.pathname + location.search); }
    return sessionStorage.getItem(KEY);
  },
  clear() { sessionStorage.removeItem(KEY); }
};

export interface ClassSummary {
  id: string; name: string; motto: string; cover: string | null; owner: boolean; members: number;
}
export interface BoardRow {
  id: string; name: string; avatar: string | null; owner: boolean; me: boolean; xp: number; level: number;
}
export interface ClassShare {
  id: string; name: string; subject: Subject; foreign: Lang | null; native: Lang; testDate: string;
  format: Format; articles: boolean; cards: number;
  author: { id: string; name: string; avatar: string | null }; mine: boolean;
  updatedAt: string; takenTestId: string | null; newer: boolean;
}
export interface ClassInviteRow { id: string; maxUses: number; uses: number; expiresAt: string; mine: boolean; }
export interface ClassDetail {
  class: ClassSummary; board: BoardRow[]; shares: ClassShare[]; invites: ClassInviteRow[];
}
export interface SharedCards {
  id: string; name: string; subject: Subject; foreign: Lang | null; native: Lang; testDate: string;
  format: Format; articles: boolean;
  cards: { type: 'pair' | 'qa' | 'cloze' | 'mc'; term: string; meaning: string; example: string; distractors: string[] }[];
  takenTestId: string | null; newer: boolean;
}

export interface BossContributor { id: string; name: string; avatar: string | null; damage: number; me: boolean }
export interface ClassBoss {
  id: string; shareId: string; shareName: string; cards: number; testDate: string | null;
  myTestId: string | null; maxHp: number; hp: number;
  status: 'open' | 'won' | 'cancelled' | 'expired';
  endsAt: string; wonAt: string | null; createdBy: string; contributors: BossContributor[];
}

export interface ClashPerson { id: string; name: string; avatar: string | null }
export interface ClashPlay { correct: number; ms: number; done: boolean }
export interface ClashPrompt { position: number; type: string; term: string; meaning?: string }
export interface ClassClash {
  id: string; shareId: string; shareName: string; cards: number;
  status: 'pending' | 'active' | 'done' | 'declined' | 'expired';
  expiresAt: string; createdAt: string;
  challenger: ClashPerson; opponent: ClashPerson;
  me: 'challenger' | 'opponent' | null;
  myPlay: ClashPlay | null; theirPlay: ClashPlay | null;
  prompts?: ClashPrompt[]; winnerId?: string | null;
}
