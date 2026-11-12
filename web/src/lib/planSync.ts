/* Talk to the shared-plan API. Failures stay local: the student's own cards still work offline. */
import type { GradeEntry } from '../../../shared/gradebook';
import type { StudyTask } from '../../../shared/goals';
import type { LearningGoal, Subject } from '../../../shared/types';
import { api } from './api';

export interface PlanMatch { planId: string; title: string; similarity: number; strong: boolean; ownerName: string; memberCount: number; examDate: string | null; already: boolean }
export interface PlanContent { goals?: LearningGoal[]; tasks?: StudyTask[]; cards?: { type: string; term: string; meaning: string; example?: string; distractors?: string[] }[] }
export async function matchPlan(body: { kind: 'goals' | 'cards'; subject: string; texts: string[]; examDate: string }) {
  return api<{ match: PlanMatch | null }>('/api/plans/match', { body });
}
export async function publishPlan(body: { kind: 'goals' | 'cards'; subject: Subject | string; title: string; texts: string[]; examDate: string; testId: string; content: PlanContent }) {
  return api<{ planId: string }>('/api/plans', { body });
}
export async function joinPlan(planId: string, testId: string, examDate: string) {
  return api<{ planId: string; title: string; content: PlanContent; examDate: string }>(`/api/plans/${planId}/join`, { body: { testId, examDate } });
}
export interface PlanMember { id: string; name: string; me: boolean; hidden: boolean; examDate: string; mastery: number | null; streak: number | null; didToday: boolean | null; goals: { id: string; title: string; pct: number }[] }
export interface PlanEvent { kind: string; at: string; name?: string; goal?: string }
export async function loadPlan(planId: string) {
  return api<{ planId: string; title: string; subject: string; members: PlanMember[]; events: PlanEvent[] }>(`/api/plans/${planId}`);
}
export async function postProgress(planId: string, body: { mastery: number; streak: number; didToday: boolean; goals: { id: string; title: string; pct: number }[] }) {
  return api(`/api/plans/${planId}/progress`, { body });
}
export async function nudgePlan(planId: string) { return api(`/api/plans/${planId}/nudge`, { body: {} }); }
export async function cheerPlan(planId: string, goal?: string) { return api(`/api/plans/${planId}/cheer`, { body: { goal } }); }
export async function hidePlan(planId: string, hidden: boolean) { return api(`/api/plans/${planId}/hide`, { body: { hidden } }); }
export async function leavePlan(planId: string) { return api(`/api/plans/${planId}/leave`, { body: {} }); }

export async function pushGrades(grades: GradeEntry[]) {
  return api('/api/grades', { body: { grades } });
}
export async function pullGrades() {
  return api<{ grades: GradeEntry[] }>('/api/grades');
}
export async function saveGradePrivacy(privacy: string, targets: Record<string, number>) {
  return api('/api/me/grade-privacy', { body: { privacy, targets } });
}
export interface CompareView {
  id: string; privacy: 'hide' | 'summary' | 'grades'; name: string;
  summary?: { n: number; avg: number; rate: number; trend: 'up' | 'down' | 'flat' | null; best: number; system: string };
  grades?: { date: string; subject: string; title: string; kind: string; system: string; value: number; score: number; metTarget: boolean }[];
}
export async function compareWith(userId: string) {
  return api<CompareView>('/api/social/compare/' + userId);
}
export async function connectedPeople() {
  return api<{ people: { id: string; name: string; privacy: string }[] }>('/api/social/people');
}
