import { useState } from 'react';
import { toast } from 'sonner';
import { Brain, Check, ExternalLink, Eye, EyeOff, KeyRound, LogOut, RotateCcw, Sparkles, Trophy, UserRound, Zap } from 'lucide-react';
import { hubApi } from '../lib/hubs.js';
import { badgeFor, nextBadge } from '../lib/hubRules.js';
import { PROVIDERS, listModels } from '../ai/providers.js';
import { prefs } from '../lib/prefs.js';
import { useApp, useLoad } from '../context.js';
import { Button } from '../ui/Button.jsx';
import { Card, CardHeader, PageHeader, Pill } from '../ui/primitives.jsx';
import { ChoiceCard, Field, Input, Select } from '../ui/form.jsx';
import { useDialogs } from '../ui/dialog.jsx';
import { cn } from '../ui/cn.js';

const ICONS = { gemini: Sparkles, groq: Zap, anthropic: Brain };

export default function Settings() {
  const { db, profile, reloadProfile, user, signOut } = useApp();
  const dialogs = useDialogs();
  const [provider, setProvider] = useState(prefs.getProvider());
  const [form, setForm] = useState({ display_name: profile?.display_name ?? '', university: profile?.university ?? '', course: profile?.course ?? '', year: profile?.year ?? 1 });

  async function saveProfile(e) {
    e.preventDefault();
    await db.saveProfile({ ...form, year: Number(form.year) || null });
    await reloadProfile();
    toast.success('Profile saved');
  }

  async function resetOnboarding() {
    const ok = await dialogs.confirm({ title: 'Redo setup?', description: 'You will go through the profile, timetable and study-hours steps again. Nothing is deleted.', confirmLabel: 'Redo setup' });
    if (!ok) return;
    await db.saveProfile({ onboarded: false });
    reloadProfile();
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Settings" title="Settings" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="flex flex-col gap-5 p-5 sm:p-6">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">AI provider</h2>
            <p className="mt-1 text-sm text-muted">
              Alma uses your own key. Gemini and Groq give free keys. Keys stay in this browser and are only ever sent to that provider.
            </p>
          </div>
          <div className="flex flex-col gap-2.5">
            {Object.entries(PROVIDERS).map(([id, p]) => (
              <ChoiceCard
                key={id}
                selected={provider === id}
                onSelect={() => {
                  setProvider(id);
                  prefs.setProvider(id);
                }}
                icon={ICONS[id]}
                title={p.label}
                badge={
                  <>
                    {p.free ? <Pill tone="emerald">Free</Pill> : <Pill tone="slate">Paid</Pill>}
                    {p.vision && <Pill>Reads slides</Pill>}
                    {prefs.getKey(id) && (
                      <Pill tone="emerald">
                        <Check /> Key saved
                      </Pill>
                    )}
                  </>
                }
                description={p.keyHelp}
              />
            ))}
          </div>
          <ProviderKey key={provider} provider={provider} />
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Profile" icon={UserRound} />
            <form onSubmit={saveProfile} className="flex flex-col gap-4 p-5 pt-4">
              <Field label="Name">
                <Input value={form.display_name} onChange={set('display_name')} />
              </Field>
              <Field label="University">
                <Input value={form.university} onChange={set('university')} />
              </Field>
              <div className="grid grid-cols-[1fr_90px] gap-3">
                <Field label="Course">
                  <Input value={form.course} onChange={set('course')} />
                </Field>
                <Field label="Year">
                  <Select value={form.year} onChange={set('year')}>
                    {[1, 2, 3, 4, 5].map((y) => (
                      <option key={y}>{y}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button variant="primary" className="w-fit">
                Save profile
              </Button>
            </form>
          </Card>

          {user && <ContributionCard />}
          <Card className="flex flex-col gap-4 p-5">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">Account</h2>
              <p className="mt-1 text-sm text-muted">{user ? `Signed in as ${user.email}.` : 'Guest mode: your data is stored in this browser only.'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={resetOnboarding}>
                <RotateCcw /> Redo setup
              </Button>
              <Button variant="danger" onClick={signOut}>
                <LogOut /> {user ? 'Sign out' : 'Exit guest mode'}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ProviderKey({ provider }) {
  const info = PROVIDERS[provider];
  const saved = prefs.getModels(provider);
  const [key, setKey] = useState(prefs.getKey(provider));
  const [show, setShow] = useState(false);
  const [models, setModels] = useState(saved.length ? saved : null);
  const [model, setModel] = useState(prefs.getModel(provider) || info.defaultModel);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  async function saveAndTest(e) {
    e.preventDefault();
    prefs.setKey(provider, key);
    if (!key.trim()) return setStatus({ kind: 'ok', text: 'Key removed.' });
    setBusy(true);
    setStatus(null);
    try {
      const list = await listModels(provider, key.trim());
      setModels(list);
      prefs.setModels(provider, list);
      if (!list.includes(model)) {
        setModel(list[0]);
        prefs.setModel(provider, list[0]);
      }
      setStatus({ kind: 'ok', text: 'Key works. You can now generate flashcards with AI.' });
      toast.success(`${info.label} is ready`);
    } catch (err) {
      setStatus({ kind: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={saveAndTest} className="flex flex-col gap-4 rounded-2xl border border-line bg-subtle/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4 text-indigo-500" /> {info.label} key
        </p>
        <Button size="sm" href={info.keyUrl} target="_blank" rel="noreferrer">
          Get a {info.free ? 'free ' : ''}key <ExternalLink />
        </Button>
      </div>
      <Field label="API key" hint="Paste it here, then click Save & test.">
        <div className="relative">
          <Input type={show ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" placeholder="Paste your key" className="pr-11 font-mono" />
          <button type="button" onClick={() => setShow(!show)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:text-fg" aria-label={show ? 'Hide key' : 'Show key'}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      <Field label="Model">
        <Select
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            prefs.setModel(provider, e.target.value);
          }}
        >
          {(models ?? info.models ?? [model]).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </Field>
      {status && (
        <p
          className={cn(
            'flex items-center gap-2 rounded-xl px-3 py-2 text-sm',
            status.kind === 'error' ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
          )}
        >
          {status.kind !== 'error' && <Check className="size-4" />} {status.text}
        </p>
      )}
      <Button variant="primary" disabled={busy} className="w-fit">
        {busy ? 'Checking…' : 'Save & test'}
      </Button>
    </form>
  );
}

// Points from sharing to module hubs, and the badge they earn.
function ContributionCard() {
  const [mine] = useLoad(() => hubApi.mine().catch(() => null), []);
  if (!mine) return null;
  const pts = Number(mine.points);
  const badge = badgeFor(pts);
  const next = nextBadge(pts);
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <Trophy className="size-4 text-amber-500" /> Your contributions
      </h2>
      <p className="text-3xl font-semibold tracking-tight tabular-nums">
        {pts} <span className="text-sm font-normal text-muted">points</span>
      </p>
      <p className="text-sm">{badge ? `${badge.emoji} ${badge.label}` : 'No badge yet'}</p>
      <p className="text-xs text-muted">
        {mine.items} shared · {mine.helpful} 👍 received · {mine.copies} copies
        {next ? ` · ${next.needed} more points for ${next.emoji} ${next.label}` : ''}
      </p>
    </Card>
  );
}
