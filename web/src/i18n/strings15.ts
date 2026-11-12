export const en15 = {
  offline_pack: 'Offline ready for the next few days',
  push_title: 'Reminders',
  push_on: 'Remind me once a day',
  push_quiet: 'Quiet hours: nothing before 07:00 or after 20:00. One reminder a day.'
} as const;
export const de15: Record<keyof typeof en15, string> = {
  offline_pack: 'Offline bereit für die nächsten Tage',
  push_title: 'Erinnerungen',
  push_on: 'Einmal am Tag erinnern',
  push_quiet: 'Ruhezeit: nichts vor 07:00 und nichts nach 20:00. Höchstens eine Erinnerung am Tag.'
};
