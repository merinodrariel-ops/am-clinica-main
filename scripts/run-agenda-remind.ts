import { runAgendaReminderCycle } from '../lib/am-scheduler/reminder-cycle';
export { runAgendaReminderCycle } from '../lib/am-scheduler/reminder-cycle';

if (process.argv[1]?.endsWith('run-agenda-remind.ts')) {
  runAgendaReminderCycle({ dryRun: process.env.AGENDA_REMIND_DRY_RUN === '1' })
    .then((result) => {
      // Only operational identifiers/counts; never print provider errors or patient data.
      console.log(JSON.stringify(result, null, 2));
      if (result.failed.length > 0) process.exitCode = 1;
    })
    .catch(() => {
      console.error('Agenda reminder cycle failed');
      process.exitCode = 1;
    });
}
