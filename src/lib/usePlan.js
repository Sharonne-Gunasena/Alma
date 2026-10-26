import { useMemo } from 'react';
import { useApp, useLoad } from '../context.js';
import { buildPlan, DEFAULT_STUDY_PREFS } from './planner.js';
import { isDue } from './srs.js';

// Loads everything the planner needs and builds today's plan from it.
export function usePlan() {
  const { db, profile } = useApp();
  const [data, reload, error] = useLoad(async () => {
    const [assignments, classEvents, cards] = await Promise.all([
      db.list('assignments'),
      db.list('class_events'),
      db.list('cards', {}, 'id, deck_id, due, topic, reviews, lapses'),
    ]);
    return { assignments, classEvents, cards };
  }, [db]);

  const studyPrefs = { ...DEFAULT_STUDY_PREFS, ...(profile?.study_prefs ?? {}) };
  const plan = useMemo(
    () =>
      data &&
      buildPlan({
        now: new Date(),
        assignments: data.assignments,
        classEvents: data.classEvents,
        prefs: studyPrefs,
        hasCards: data.cards.length > 0,
      }),
    [data, profile],
  );

  async function logStudy(assignmentId, minutes) {
    const a = data.assignments.find((x) => x.id === assignmentId);
    await db.update('assignments', assignmentId, { hours_done: Math.round(((a.hours_done ?? 0) + minutes / 60) * 100) / 100 });
    reload();
  }

  return {
    ...(data ?? {}),
    loading: !data && !error,
    error,
    plan,
    studyPrefs,
    dueCount: data ? data.cards.filter((c) => isDue(c)).length : 0,
    reload,
    logStudy,
  };
}
