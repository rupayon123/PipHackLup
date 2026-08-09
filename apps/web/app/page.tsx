import {
  ArrowRight,
  Bot,
  ClipboardCheck,
  Clock3,
  Github,
  LogIn,
  MessageCircleQuestion,
  Radio,
  Shield,
  Ticket,
  UserCheck,
  Users,
} from "lucide-react";

export default function HomePage() {
  const signInUrl = "/api/auth/discord/start";

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "PipHackLup",
    applicationCategory: "CommunicationApplication",
    operatingSystem: "Discord",
    url: "https://piphacklup.vercel.app",
    image: "https://piphacklup.vercel.app/piphacklup-site-hero.png",
    author: {
      "@type": "Person",
      name: "Rupayon Haldar",
      url: "https://github.com/rupayon123",
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    description:
      "PipHackLup is a hackathon Discord bot for staff-trained Q&A, onboarding, mentor queues, team formation, moderation cases, AutoMod setup, and organizer dashboards.",
  };

  const dispatchRows = [
    {
      icon: UserCheck,
      label: "Check-in line",
      title: "New hackers stop arriving lost.",
      copy: "PipHackLup points them to nickname setup, roles, rules, profiles, teams, and help without making staff repeat the same answer all morning.",
    },
    {
      icon: MessageCircleQuestion,
      label: "Q&A radio",
      title: "The bot answers what staff already taught it.",
      copy: "Load the schedule, food notes, judging rules, venue details, sponsor links, and escalation rules from Discord or the site.",
    },
    {
      icon: Ticket,
      label: "Help desk",
      title: "Mentor requests become a visible queue.",
      copy: "Participants open mentor, tech, staff, or judging tickets. Staff can claim, escalate, close, and keep the room moving.",
    },
    {
      icon: Users,
      label: "Team table",
      title: "Solo builders find the right group faster.",
      copy: "Profiles, recruiting teams, team listings, and matching keep team formation from turning into a chaotic introductions channel.",
    },
  ];

  const operatorSteps = [
    "Sign in with the Discord account you already use.",
    "Choose a server you own or have permission to manage.",
    "Add PipHackLup to that server with the guided install.",
    "Run setup, add event details, and try a participant check-in.",
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <main className="site">
        <section className="hero">
          <div className="hero-bg" aria-hidden="true" />
          <nav className="site-nav" aria-label="Public navigation">
            <a className="brand public" href="/">
              <span className="brand-mark" aria-hidden>
                P
              </span>
              <span>PipHackLup</span>
            </a>
            <div className="button-row">
              <a className="button primary" href={signInUrl}>
                <LogIn aria-hidden size={16} />
                Organizer sign in
              </a>
            </div>
          </nav>

          <div className="hero-content">
            <p className="eyebrow">8-bit hackathon operations bot</p>
            <h1>PipHackLup</h1>
            <p>
              When the Discord opens and hundreds of hackers ask where food,
              teams, judges, mentors, and rules are, PipHackLup handles the
              repeat traffic and calls staff when a human needs the wheel.
            </p>
            <div className="button-row">
              <a className="button primary large" href={signInUrl}>
                Continue with Discord
                <ArrowRight aria-hidden size={18} />
              </a>
              <a className="button large" href="#event-day">
                See how it helps
              </a>
            </div>
            <dl className="hero-proof" aria-label="Event day support">
              <div>
                <dt>4</dt>
                <dd>help lines</dd>
              </div>
              <div>
                <dt>1</dt>
                <dd>guided setup</dd>
              </div>
              <div>
                <dt>Human</dt>
                <dd>fallback built in</dd>
              </div>
            </dl>
          </div>
        </section>

        <section
          className="ops-board"
          id="event-day"
          aria-labelledby="ops-heading"
        >
          <div className="ops-intro">
            <p className="eyebrow">Event-day dispatch board</p>
            <h2 id="ops-heading">Built for the busiest parts of event day</h2>
            <p>
              PipHackLup gives staff a calm place to handle the first wave of
              questions, route the important requests, and see what still needs
              a person.
            </p>
          </div>
          <div className="dispatch-list">
            {dispatchRows.map((row) => {
              const Icon = row.icon;
              return (
                <article className="dispatch-row" key={row.title}>
                  <div className="dispatch-icon">
                    <Icon aria-hidden size={22} />
                  </div>
                  <div>
                    <p>{row.label}</p>
                    <h3>{row.title}</h3>
                  </div>
                  <p>{row.copy}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="radio-room" aria-labelledby="radio-heading">
          <div>
            <p className="eyebrow">Human fallback built in</p>
            <h2 id="radio-heading">
              Answers common questions. Pings staff for the rest.
            </h2>
            <p>
              Staff can train the bot from Discord or the PipHackLup site. If a
              question looks sensitive, low-confidence, mentor-needed, or
              prompt-injection shaped, the bot opens a follow-up path instead of
              pretending.
            </p>
          </div>
          <div className="radio-stack" aria-label="Q&A safety controls">
            <div>
              <Radio aria-hidden size={22} />
              <span>Staff-trained Q&A</span>
            </div>
            <div>
              <Shield aria-hidden size={22} />
              <span>Prompt-injection filter</span>
            </div>
            <div>
              <Clock3 aria-hidden size={22} />
              <span>Rate-limited commands</span>
            </div>
          </div>
        </section>

        <section className="operator-strip">
          <div>
            <p className="eyebrow">Setup path</p>
            <h2>From empty app to event bot</h2>
          </div>
          <ol>
            {operatorSteps.map((step) => (
              <li key={step}>
                <ClipboardCheck aria-hidden size={18} />
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="public-band">
          <div>
            <p className="eyebrow">Open source, public credit</p>
            <h2>Made by Rupayon Haldar for hackathon communities</h2>
            <p>
              The code, MIT license, security notes, setup docs, and install
              link are public so organizers can inspect the bot before adding it
              to their own Discord servers.
            </p>
          </div>
          <div className="button-row">
            <a className="button primary large" href={signInUrl}>
              Continue with Discord
              <Bot aria-hidden size={18} />
            </a>
            <a
              className="button large"
              href="https://github.com/rupayon123/PipHackLup"
            >
              Public repo
              <Github aria-hidden size={18} />
            </a>
          </div>
        </section>

        <footer className="site-footer">
          <span>PipHackLup by Rupayon Haldar</span>
          <nav aria-label="Footer navigation">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="https://github.com/rupayon123/PipHackLup/issues">
              Support
            </a>
            <a href="https://github.com/rupayon123/PipHackLup">GitHub</a>
          </nav>
        </footer>
      </main>
    </>
  );
}
