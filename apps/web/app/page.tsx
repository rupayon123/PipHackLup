import {
  ArrowRight,
  Bot,
  Github,
  LayoutDashboard,
  MessageCircleQuestion,
  Shield,
  Ticket,
  Users,
} from "lucide-react";

export default function HomePage() {
  const installUrl =
    "https://discord.com/oauth2/authorize?client_id=1512918151313231983&scope=bot+applications.commands&permissions=1117094267958";

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
              <span className="brand-mark">P</span>
              <span>PipHackLup</span>
            </a>
            <div className="button-row">
              <a
                className="button"
                href="https://github.com/rupayon123/PipHackLup"
              >
                <Github aria-hidden size={16} />
                GitHub
              </a>
              <a className="button primary" href={installUrl}>
                <Bot aria-hidden size={16} />
                Add to Discord
              </a>
            </div>
          </nav>

          <div className="hero-content">
            <p className="eyebrow">Hackathon Discord bot</p>
            <h1>PipHackLup</h1>
            <p>
              A public Discord bot for hackathon organizers who need smoother
              onboarding, staff-trained Q&A, mentor queues, team formation,
              moderation workflows, AutoMod setup, and an event-day dashboard.
            </p>
            <div className="button-row">
              <a className="button primary large" href={installUrl}>
                Add PipHackLup to Discord
                <ArrowRight aria-hidden size={18} />
              </a>
              <a className="button large" href="/dashboard">
                View dashboard
                <LayoutDashboard aria-hidden size={18} />
              </a>
            </div>
          </div>
        </section>

        <section className="public-section">
          <div>
            <p className="eyebrow">Built for real event chaos</p>
            <h2>Everything a hackathon Discord server needs in one bot</h2>
          </div>
          <div className="feature-grid">
            <article className="feature">
              <MessageCircleQuestion aria-hidden size={22} />
              <h3>Staff-trained Q&A</h3>
              <p>
                Train event details from Discord or the website, answer
                questions instantly, and ping humans when confidence is low.
              </p>
            </article>
            <article className="feature">
              <Ticket aria-hidden size={22} />
              <h3>Mentor and tech queues</h3>
              <p>
                Open, claim, escalate, and close mentor, tech help, and
                judging/demo tickets.
              </p>
            </article>
            <article className="feature">
              <Users aria-hidden size={22} />
              <h3>Team formation</h3>
              <p>
                Help solo hackers create profiles, join teams, recruit
                teammates, and match by skills.
              </p>
            </article>
            <article className="feature">
              <Shield aria-hidden size={22} />
              <h3>Moderation cases</h3>
              <p>
                Track reports, warnings, timeouts, audit logs, and Discord
                AutoMod setup guidance.
              </p>
            </article>
            <article className="feature">
              <LayoutDashboard aria-hidden size={22} />
              <h3>Organizer dashboard</h3>
              <p>
                Give staff a public web dashboard for Q&A training, queues,
                teams, moderation, setup, and CSV exports.
              </p>
            </article>
          </div>
        </section>

        <section className="public-band">
          <div>
            <p className="eyebrow">Open source</p>
            <h2>Made by Rupayon Haldar for hackathon communities</h2>
            <p>
              PipHackLup is public on GitHub under an MIT license so organizers
              can inspect, fork, contribute, and deploy it for their own events.
            </p>
          </div>
          <a
            className="button primary large"
            href="https://github.com/rupayon123/PipHackLup"
          >
            Open the public repo
            <Github aria-hidden size={18} />
          </a>
        </section>
      </main>
    </>
  );
}
