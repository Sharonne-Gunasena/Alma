// Privacy policy, cookies and storage, and terms of use. Public pages: they open
// at #/privacy, #/cookies and #/terms whether or not someone is signed in.
//
// Keep these in step with the code. If Alma starts storing something new, sending
// data to a new service, or charging money, update the matching section and the
// UPDATED date. Written in plain English as a starting point; it is not legal advice.
import { LogoMark } from './Shell.jsx';
import { CONTACT_EMAIL, OWNER_NAME, SOURCE_URL } from '../config.js';

const UPDATED = '31 October 2026';

const PAGES = { privacy: Privacy, cookies: Cookies, terms: Terms };
const TITLES = { privacy: 'Privacy policy', cookies: 'Cookies and local storage', terms: 'Terms of use' };

export default function Legal({ page }) {
  const Body = PAGES[page] ?? Privacy;
  return (
    <div className="min-h-screen bg-bg">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 pt-8">
        <a href="#/" className="flex items-center gap-2.5 font-semibold tracking-tight text-fg no-underline">
          <LogoMark className="size-8" /> Alma
        </a>
        <nav aria-label="Legal" className="flex gap-4 text-sm text-muted">
          {Object.keys(PAGES).map((p) => (
            <a key={p} href={`#/${p}`} aria-current={p === page ? 'page' : undefined} className={p === page ? 'font-medium text-fg' : 'hover:text-fg'}>
              {p === 'privacy' ? 'Privacy' : p === 'cookies' ? 'Cookies' : 'Terms'}
            </a>
          ))}
        </nav>
      </header>
      <main id="main" className="prose prose-slate mx-auto max-w-3xl px-5 py-10 dark:prose-invert prose-headings:tracking-tight prose-a:text-indigo-700 dark:prose-a:text-indigo-300">
        <h1>{TITLES[page] ?? TITLES.privacy}</h1>
        <p className="text-sm text-muted">Last updated {UPDATED}</p>
        <Body />
        <h2>Who runs Alma</h2>
        <p>
          Alma is a free, non-commercial student project run by {OWNER_NAME}, an individual based in Ireland. It is not a company and has no
          registered business address. <Contact />
        </p>
        <p>
          <a href="#/">← Back to Alma</a>
        </p>
      </main>
    </div>
  );
}

// How to reach the person in charge of the data.
function Contact() {
  if (CONTACT_EMAIL)
    return (
      <>
        Contact: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </>
    );
  return (
    <>
      Contact: open an issue on <a href={SOURCE_URL}>Alma's GitHub page</a>.
    </>
  );
}

function Privacy() {
  return (
    <>
      <p>
        This page explains what Alma stores about you, why, who else is involved, and the choices you have. Alma has no adverts, no analytics and
        no tracking.
      </p>

      <h2>Using Alma without an account</h2>
      <p>
        In guest mode ("Try it without an account") everything you add stays in your own browser. Nothing is sent to Alma's database. Clearing
        your browser's site data deletes it.
      </p>

      <h2>What Alma stores when you have an account</h2>
      <ul>
        <li>
          <strong>Account:</strong> your email address and password. Passwords are stored only as a secure hash by our authentication provider,
          Supabase, never in plain text.
        </li>
        <li>
          <strong>Profile:</strong> the name, university, course and year you enter.
        </li>
        <li>
          <strong>Study data:</strong> modules, timetable classes, deadlines, flashcards and your review history, study guides, practice exam
          attempts, and files you upload (such as lecture slides).
        </li>
        <li>
          <strong>Shared spaces:</strong> chat messages, study groups and workspaces (whiteboards, notes and files), and anything you share in a
          module hub. These are visible to the other members of that chat, group, workspace or hub.
        </li>
        <li>
          <strong>Safety:</strong> people you block, and reports you send about messages or people.
        </li>
      </ul>
      <p>We only ask for what Alma needs to work. Your university and course are used to suggest your modules.</p>

      <h2>Why we use it</h2>
      <p>
        To provide the service you signed up for: your planner, flashcards, guides and chats (GDPR Article 6(1)(b), performing our agreement
        with you). Blocks and reports are kept to keep chats safe (Article 6(1)(f), legitimate interests). We don't sell your data or use it for
        advertising.
      </p>

      <h2>Where it is stored</h2>
      <p>
        Account and study data are stored by <a href="https://supabase.com/privacy">Supabase</a> in a project hosted in the European Union.
        Access is limited by database rules, so other users can only see what you share with them. The website itself is hosted on{' '}
        <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">GitHub Pages</a>, which may log your IP
        address when you load it.
      </p>

      <h2>AI features</h2>
      <p>
        AI features only work after you add your own key from Google Gemini, Groq or Anthropic in Settings. When you use one, the content
        involved (for example slide text and images, notes, flashcards or a typed answer) is sent straight from your browser to the provider you
        chose, under that provider's own terms. Your key is stored only in your browser. Google's free tier may use what you send to improve its
        products; read the provider's terms before choosing one.
      </p>

      <h2>Other services</h2>
      <p>When you open a workspace whiteboard, its drawing fonts load from esm.sh, which receives your IP address.</p>

      <h2>How long we keep it</h2>
      <p>
        Your data is kept while you have an account. To delete your account and everything in it, contact us (see below) and it will be removed
        within 30 days. Messages you sent are removed with your account. Study groups and workspaces you created stay for their other members, without your name on them.
      </p>

      <h2>Your rights</h2>
      <p>
        Under the GDPR you can ask for a copy of your data, ask us to correct or delete it, ask for it in a portable format, or object to how it
        is used. You can also complain to Ireland's{' '}
        <a href="https://www.dataprotection.ie">Data Protection Commission</a>.
      </p>

      <h2>Age</h2>
      <p>Alma is for students aged 16 or over.</p>

      <h2>Cookies</h2>
      <p>
        Alma doesn't use cookies. It saves a few things in your browser's local storage so it can work; see{' '}
        <a href="#/cookies">Cookies and local storage</a>.
      </p>

      <h2>Changes</h2>
      <p>If this policy changes, the date at the top changes too.</p>
    </>
  );
}

const STORAGE = [
  ['Your sign-in session', 'Keeps you signed in (set by Supabase).'],
  ['Guest data', 'Everything you add in guest mode.'],
  ['AI provider, key and model', 'Your AI settings, so the key never leaves your browser except to that provider.'],
  ['Appearance', 'Light, dark or automatic, if you choose one.'],
  ['Small preferences', 'Flip or type answers, whether you hid the guest banner, and which planned study sessions the dashboard has already asked you about.'],
];

function Cookies() {
  return (
    <>
      <p>
        Alma does not use cookies, adverts, analytics or tracking. It uses your browser's local storage only for the things below, which are
        needed for Alma to work or which you chose yourself. That is why Alma doesn't show a cookie banner.
      </p>
      <table>
        <thead>
          <tr>
            <th>What</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          {STORAGE.map(([what, why]) => (
            <tr key={what}>
              <td>{what}</td>
              <td>{why}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>All of it stays on your device. You can remove it at any time by signing out and clearing this site's data in your browser settings.</p>
    </>
  );
}

function Terms() {
  return (
    <>
      <p>By creating an account or using Alma you agree to these terms. If you don't agree, please don't use Alma.</p>

      <h2>The service</h2>
      <p>
        Alma is free. It's provided as is, by one student, without guarantees: it may change, have bugs, be unavailable at times, or close. Keep
        your own copies of anything important.
      </p>

      <h2>Your account</h2>
      <p>You must be 16 or over. Keep your password private; you're responsible for what happens under your account.</p>

      <h2>Your content</h2>
      <p>
        You keep ownership of what you add. You give Alma permission to store and display it so the service works, including showing what you
        share to the people you share it with. Only upload or share material you have the right to share. Lecture slides and notes written by
        your lecturers usually belong to them or your university, so check before sharing them in a module hub.
      </p>

      <h2>Acceptable use</h2>
      <p>Don't use Alma to:</p>
      <ul>
        <li>harass, threaten or bully anyone, or post hateful, sexual or illegal content;</li>
        <li>share other people's work or personal information without permission;</li>
        <li>cheat in assessed work where your university doesn't allow help;</li>
        <li>spam, break the service, or try to access data that isn't yours.</li>
      </ul>
      <p>
        You can report a message or person from the chat menu. Content or accounts that break these rules may be removed. If your content is
        removed, you can ask us why and ask us to reconsider.
      </p>

      <h2>AI features</h2>
      <p>
        AI-made flashcards, guides, grades and explanations can be wrong. Check them against your course material. When you use your own AI key,
        the provider's terms also apply.
      </p>

      <h2>Liability</h2>
      <p>
        As far as the law allows, Alma isn't liable for lost data, missed deadlines or results that come from using it. Nothing here limits
        rights you have by law as a consumer.
      </p>

      <h2>Payments and refunds</h2>
      <p>Alma doesn't charge for anything, so there is nothing to refund.</p>

      <h2>Ending</h2>
      <p>You can stop using Alma at any time and ask for your account to be deleted. These terms are governed by the law of Ireland.</p>
    </>
  );
}
