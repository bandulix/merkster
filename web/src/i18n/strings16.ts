export const en16 = {
  challenge_done: 'You did it together.',
  challenge_zero: 'The first unit counts for everyone. Start a round and the bar moves.',
  challenge_out: 'Sit this week out',
  challenge_in: 'I am in again'
} as const;
export const de16: Record<keyof typeof en16, string> = {
  challenge_done: 'Zusammen geschafft.',
  challenge_zero: 'Die erste Einheit zählt für alle. Eine Runde, und der Balken bewegt sich.',
  challenge_out: 'Diese Woche aussetzen',
  challenge_in: 'Ich mache wieder mit'
};
