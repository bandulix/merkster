/* Supporters: shared constants + API shapes (server validates against these lists). */
import type { ExamResult, GradeSystem, Subject } from './types';
import type { ReportCard } from './reportcards';

export const RELATIONS = ['mum', 'dad', 'grandma', 'grandpa', 'aunt', 'uncle', 'coach', 'other'] as const;
export type Relation = (typeof RELATIONS)[number];
export const REACTION_EMOJI = ['👍', '❤️', '🎉', '🔥', '💪', '👏', '⭐', '🤩'] as const;
/** preset messages (no free text in v1 – nothing to moderate); stored as 'msg:<key>' */
export const PRESET_MESSAGES = ['proud', 'keep_going', 'well_done', 'you_got_this', 'great_effort'] as const;
export type PresetMessage = (typeof PRESET_MESSAGES)[number];
export const REACTIONS: readonly string[] = [...REACTION_EMOJI, ...PRESET_MESSAGES.map(m => 'msg:' + m)];
export const TARGET_KINDS = ['result', 'level', 'badge', 'report'] as const;   // streak milestones are the streak badges
export type TargetKind = (typeof TARGET_KINDS)[number];
export const INVITE_DAYS_DEFAULT = 7, INVITE_DAYS_MAX = 14, INVITE_USES_MAX = 5, MAX_OPEN_INVITES = 10, MAX_SUPPORTERS = 20;

export interface Invite { id: string; relation: Relation; label: string; maxUses: number; uses: number; expiresAt: string; createdAt: string; status: 'open' | 'used' | 'expired' | 'revoked' }
export interface CreatedInvite extends Invite { token: string; url: string }
export interface InvitePreview { valid: boolean; reason?: 'expired' | 'used' | 'revoked' | 'not_found'; studentName?: string; studentAvatar?: string | null; relation?: Relation }
export interface Supporter { id: string; name: string; avatar: string | null; relation: Relation; label: string; showResults: boolean; showPractice: boolean; showPhotos: boolean; since: string }
/** a reaction as the student sees it */
export interface Cheer { id: string; from: { id: string; name: string; avatar: string | null; relation: Relation; label: string }; targetKind: TargetKind; targetId: string; reaction: string; at: number; seen: boolean }
export interface ReactionCount { reaction: string; n: number; mine: boolean }

/* what a supporter gets (only what the student allowed) */
export interface KidResult { testId: string; name: string; subject: Subject; testDate: string; result: ExamResult; practice?: { sessions: number; days: number; minutes: number }; reactions: ReactionCount[];
  verified?: boolean;   // verified by ME (the supporter asking)
  photo?: boolean;      // a photo of the graded test exists AND the student shares photos with me
}
export interface KidUpcoming { name: string; subject: Subject; testDate: string; daysLeft: number; practisedDays?: number }
export interface KidMilestone { kind: 'level' | 'badge'; id: string; at: number; reactions: ReactionCount[] }
export interface KidSummary {
  id: string; name: string; avatar: string | null; relation: Relation; label: string; showResults: boolean; showPractice: boolean; showPhotos?: boolean;
  grading: GradeSystem;   // the student's grading system – rewards and results are shown in it
  practice?: { level: number; rankId: string; xp: number; streak: number; bestStreak: number; weekMinutes: number; weekSessions: number; badges: number; upcoming: KidUpcoming[]; milestones: KidMilestone[] };
  results?: KidResult[];   // newest first
  reportCards?: (ReportCard & { reactions: ReactionCount[] })[];   // newest first (with results shared); hasPhoto only if photos are shared
}

/** a stable key for a cheerable target */
export const targetKey = (kind: TargetKind, id: string) => `${kind}:${id}`;
/** display name the student gave a supporter, else their Google first name */
export const supporterName = (s: { label?: string; name: string }) => (s.label || '').trim() || s.name.split(/\s+/)[0] || '?';
