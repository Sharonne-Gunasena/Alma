import { useState } from 'react';
import { toast } from 'sonner';
import { Clock3, Funnel, MapPin, Plus, Trash, Upload } from 'lucide-react';
import { useApp, useLoad } from '../context.js';
import { isoDate, toMinutes, WEEKDAYS } from '../lib/time.js';
import TimetableImport from './TimetableImport.jsx';
import LeaveOut from './LeaveOut.jsx';
import { Button } from '../ui/Button.jsx';
import { Card, EmptyState, ModuleBadge, PageHeader, Skeleton } from '../ui/primitives.jsx';
import { Field, Input, ModuleSelect, Select } from '../ui/form.jsx';
import { Modal, useDialogs } from '../ui/dialog.jsx';
import { TimeGrid } from '../ui/TimeGrid.jsx';

const KINDS = ['lecture', 'tutorial', 'practical', 'lab', 'class'];

export default function Timetable() {
  const { db, moduleById } = useApp();
  const dialogs = useDialogs();
  const [events, reload, error] = useLoad(() => db.list('class_events'), [db]);
  const [showImport, setShowImport] = useState(false);
  const [showLeaveOut, setShowLeaveOut] = useState(false);
  const [adding, setAdding] = useState(null);
  const [selected, setSelected] = useState(null);

  if (error) return <p className="text-rose-600">{error}</p>;
  if (!events)
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-16 w-72" />
        <Skeleton className="h-[520px] rounded-2xl" />
      </div>
    );

  const today = isoDate(new Date());
  // One-off "busy" blocks from the planner aren't part of the weekly timetable.
  const current = events.filter((e) => e.kind !== 'busy' && (!e.end_date || e.end_date >= today));
  const days = [1, 2, 3, 4, 5, ...(current.some((e) => e.weekday === 6) ? [6] : []), ...(current.some((e) => e.weekday === 0) ? [0] : [])];
  const weekday = new Date().getDay();

  async function add(e) {
    e.preventDefault();
    await db.insert('class_events', { ...adding, weekday: Number(adding.weekday), location: adding.location || null });
    toast.success(`Added ${adding.title}`);
    setAdding(null);
    reload();
  }

  async function remove(ev) {
    if (!(await dialogs.confirm({ title: `Remove ${ev.title}?`, description: `This removes it from every ${WEEKDAYS[ev.weekday]}.`, confirmLabel: 'Remove', danger: true }))) return;
    await db.remove('class_events', ev.id);
    setSelected(null);
    reload();
  }

  const totalHours = current.reduce((s, e) => s + toMinutes(e.end_time) - toMinutes(e.start_time), 0) / 60;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Timetable"
        title="Your classes"
        description={current.length ? `${current.length} weekly classes · ${Math.round(totalHours)} hours a week. The planner never schedules study during these.` : 'Import your timetable or add classes by hand.'}
        actions={
          <>
            <Button onClick={() => setShowImport(true)}>
              <Upload /> Import .ics
            </Button>
            {current.length > 0 && (
              <Button onClick={() => setShowLeaveOut(true)}>
                <Funnel /> Leave out
              </Button>
            )}
            <Button variant="primary" onClick={() => setAdding({ title: '', module_id: null, kind: 'lecture', weekday: 1, start_time: '09:00', end_time: '10:00', location: '' })}>
              <Plus /> Class
            </Button>
          </>
        }
      />

      {current.length === 0 ? (
        <Card>
          <EmptyState icon={Clock3} title="No classes yet">
            Import the calendar file from Google Calendar, Outlook or Apple Calendar, and your modules are created automatically.
            <div className="mt-4">
              <Button variant="primary" onClick={() => setShowImport(true)}>
                <Upload /> Import timetable
              </Button>
            </div>
          </EmptyState>
        </Card>
      ) : (
        <Card className="p-4 sm:p-5">
          <TimeGrid
            columns={days.map((d) => ({ key: d, label: WEEKDAYS[d], today: d === weekday }))}
            blocks={current
              .filter((e) => days.includes(e.weekday))
              .map((e) => ({
                id: e.id,
                col: days.indexOf(e.weekday),
                kind: 'class',
                start: toMinutes(e.start_time),
                end: toMinutes(e.end_time),
                color: moduleById(e.module_id)?.color ?? '#64748b',
                title: moduleById(e.module_id)?.code ?? e.title,
                subtitle: `${e.kind} · ${e.start_time}`,
                onClick: () => setSelected(e),
              }))}
            startMin={Math.min(8 * 60, ...current.map((e) => toMinutes(e.start_time)))}
            endMin={Math.max(18 * 60, ...current.map((e) => toMinutes(e.end_time)))}
          />
        </Card>
      )}

      <Modal side="right" open={showImport} onOpenChange={setShowImport} title="Import timetable" description="Recurring classes become weekly slots, and a module is created for each module code.">
        <TimetableImport
          onDone={() => {
            setShowImport(false);
            reload();
          }}
        />
      </Modal>

      <Modal side="right" open={showLeaveOut} onOpenChange={setShowLeaveOut} title="Leave classes out" description="Say which classes to drop. You'll see the matches before anything is removed.">
        <LeaveOut
          events={current}
          onDone={() => {
            setShowLeaveOut(false);
            reload();
          }}
        />
      </Modal>

      <Modal
        side="right"
        open={!!adding}
        onOpenChange={(o) => !o && setAdding(null)}
        title="Add a class"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="class-form">
              Add class
            </Button>
          </>
        }
      >
        {adding && (
          <form id="class-form" onSubmit={add} className="flex flex-col gap-4">
            <Field label="Title">
              <Input autoFocus required value={adding.title} onChange={(e) => setAdding({ ...adding, title: e.target.value })} placeholder="e.g. Matrix Algebra lecture" />
            </Field>
            <ModuleSelect value={adding.module_id} onChange={(v) => setAdding({ ...adding, module_id: v })} />
            <Field label="Day">
              <Select value={adding.weekday} onChange={(e) => setAdding({ ...adding, weekday: e.target.value })}>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <option key={d} value={d}>
                    {WEEKDAYS[d]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts">
                <Input type="time" value={adding.start_time} onChange={(e) => setAdding({ ...adding, start_time: e.target.value })} />
              </Field>
              <Field label="Ends">
                <Input type="time" value={adding.end_time} onChange={(e) => setAdding({ ...adding, end_time: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <Select value={adding.kind} onChange={(e) => setAdding({ ...adding, kind: e.target.value })}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k[0].toUpperCase() + k.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Location">
                <Input value={adding.location} onChange={(e) => setAdding({ ...adding, location: e.target.value })} />
              </Field>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!selected} onOpenChange={(o) => !o && setSelected(null)} title={selected?.title ?? ''} description={selected && `Every ${WEEKDAYS[selected.weekday]}, ${selected.start_time}–${selected.end_time}`}>
        {selected && (
          <div className="flex flex-col gap-4 pb-2">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <ModuleBadge moduleId={selected.module_id} />
              <span className="capitalize text-muted">{selected.kind}</span>
              {selected.location && (
                <span className="flex items-center gap-1 text-muted">
                  <MapPin className="size-3.5" /> {selected.location}
                </span>
              )}
            </div>
            {selected.start_date && (
              <p className="text-sm text-muted">
                Runs {new Date(`${selected.start_date}T00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' })} –{' '}
                {new Date(`${selected.end_date}T00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' })}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {selected.module_id && (
                <Button href={`#/modules/${selected.module_id}`} onClick={() => setSelected(null)}>
                  Open module
                </Button>
              )}
              <Button variant="danger" onClick={() => remove(selected)}>
                <Trash /> Remove class
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
