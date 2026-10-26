import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { BookText, Layers, Printer } from 'lucide-react';
import { useApp, useLoad } from '../context.js';
import { Button } from '../ui/Button.jsx';
import { BackLink, Card, EmptyState, ModuleBadge, PageHeader, Skeleton, fadeUp } from '../ui/primitives.jsx';
import { cn } from '../ui/cn.js';

export default function Guide({ materialId }) {
  const { db } = useApp();
  const [material, , error] = useLoad(() => db.get('materials', materialId), [db, materialId]);
  const [active, setActive] = useState(0);
  const sections = material?.guide?.sections ?? [];

  // Highlight the section being read in the contents list.
  useEffect(() => {
    if (!sections.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(Number(visible.target.dataset.index));
      },
      { rootMargin: '-20% 0px -60% 0px' },
    );
    document.querySelectorAll('[data-guide-section]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections.length]);

  if (error) return <p className="text-rose-600">{error}</p>;
  if (!material)
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-20 w-96 max-w-full" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );

  const guide = material.guide;
  const terms = sections.reduce((n, s) => n + (s.key_terms?.length ?? 0), 0);

  return (
    <div className="flex flex-col gap-8">
      <BackLink href={material.module_id ? `#/modules/${material.module_id}` : '#/decks'}>Back</BackLink>
      <PageHeader
        eyebrow="Study guide"
        title={material.name}
        description={guide ? `${sections.length} topics · ${terms} key terms · from ${material.page_count ?? '?'} pages` : undefined}
        actions={
          guide && (
            <Button className="no-print" onClick={() => window.print()}>
              <Printer /> Print or save PDF
            </Button>
          )
        }
      >
        <ModuleBadge moduleId={material.module_id} className="w-fit" />
      </PageHeader>

      {!guide ? (
        <Card>
          <EmptyState icon={BookText} title="No study guide yet">
            Generate flashcards from this lecture with AI and a study guide is created alongside them.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
          <nav className="no-print hidden lg:block">
            <div className="sticky top-10 flex flex-col gap-1">
              <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Contents</p>
              {sections.map((s, i) => (
                <button
                  key={i}
                  onClick={() => document.getElementById(`s${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className={cn(
                    'relative rounded-lg py-1.5 pr-2 pl-4 text-left text-sm transition-colors',
                    active === i ? 'font-medium text-indigo-600 dark:text-indigo-400' : 'text-muted hover:text-fg',
                  )}
                >
                  {active === i && <motion.span layoutId="toc" className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-indigo-500" />}
                  {s.topic}
                </button>
              ))}
            </div>
          </nav>

          <article className="flex min-w-0 flex-col gap-5">
            {sections.map((s, i) => (
              <motion.section key={i} id={`s${i}`} data-guide-section data-index={i} custom={i} variants={fadeUp} initial="hidden" animate="show" className="scroll-mt-8">
                <Card className="flex flex-col gap-4 p-6 sm:p-8">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-sm text-indigo-500">{String(i + 1).padStart(2, '0')}</span>
                      <h2 className="text-xl font-semibold tracking-tight">{s.topic}</h2>
                    </div>
                    <span className="shrink-0 rounded-full bg-subtle px-2.5 py-0.5 font-mono text-[11px] text-muted">
                      p. {s.pages.length > 1 ? `${s.pages[0]}–${s.pages[s.pages.length - 1]}` : s.pages[0]}
                    </span>
                  </div>
                  <p className="text-[15px] leading-relaxed text-pretty">{s.summary}</p>
                  {s.key_terms?.length > 0 && (
                    <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {s.key_terms.map((t) => (
                        <div key={t.term} className="rounded-xl border border-line bg-subtle/60 px-4 py-3">
                          <dt className="text-sm font-semibold">{t.term}</dt>
                          <dd className="mt-0.5 text-[13px] leading-relaxed text-muted">{t.definition}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </Card>
              </motion.section>
            ))}
            <div className="no-print flex justify-center pt-2">
              <Button href="#/decks">
                <Layers /> Study the flashcards
              </Button>
            </div>
          </article>
        </div>
      )}
    </div>
  );
}
