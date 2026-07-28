import type { Metadata } from "next";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Database,
  Eye,
  FileSearch,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "VALORANT Performance Review | We Are Still Here",
  description:
    "An opt-in, post-match performance review prototype for players, applicants, and coaches.",
  openGraph: {
    title: "VALORANT Performance Review",
    description:
      "Opt-in post-match insights with explainable signals and human review.",
    type: "website",
    url: "https://salary.wearestilllhere.com/valorant-review",
    images: ["https://salary.wearestilllhere.com/valorant-review/og.png"],
  },
};

const metrics = [
  { label: "Matches reviewed", value: "24", detail: "recent competitive matches" },
  { label: "K/D ratio", value: "1.18", detail: "within the selected period" },
  { label: "Avg. damage / round", value: "148", detail: "post-match aggregate" },
  { label: "Headshot distribution", value: "27%", detail: "context, not a verdict" },
];

const steps = [
  {
    icon: Fingerprint,
    title: "Player authorization",
    copy: "The player signs in with Riot Sign On and explicitly consents before any account data is requested.",
  },
  {
    icon: Database,
    title: "Post-match data",
    copy: "Only authorized account and completed match data required for the review is retrieved.",
  },
  {
    icon: BarChart3,
    title: "Explainable signals",
    copy: "The service summarizes trends such as consistency, map sample size, and performance changes.",
  },
  {
    icon: UserCheck,
    title: "Human interpretation",
    copy: "A qualified reviewer considers context. The system never automatically accuses, rejects, or penalizes a player.",
  },
];

export default function ValorantReviewPage() {
  return (
    <main
      data-no-translate
      className="min-h-screen bg-[#08131c] text-[#eef6f5] selection:bg-[#ff5d64] selection:text-white"
    >
      <div className="pointer-events-none fixed inset-0 opacity-70 [background-image:radial-gradient(circle_at_14%_12%,rgba(66,211,173,.12),transparent_28%),radial-gradient(circle_at_82%_8%,rgba(255,93,100,.13),transparent_25%),linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:auto,auto,48px_48px,48px_48px]" />

      <header className="relative z-10 border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <a href="#" className="flex items-center gap-3" aria-label="Back to top">
            <span className="grid size-10 place-items-center rounded-xl border border-[#56dab8]/35 bg-[#56dab8]/10">
              <Activity className="size-5 text-[#56dab8]" />
            </span>
            <span>
              <span className="block text-xs font-black tracking-[0.25em] text-white">
                WE ARE STILL HERE
              </span>
              <span className="block text-[10px] tracking-[0.18em] text-slate-400">
                PLAYER INSIGHT LAB
              </span>
            </span>
          </a>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-300 md:flex">
            <a className="transition hover:text-white" href="#workflow">Workflow</a>
            <a className="transition hover:text-white" href="#demo">Demo report</a>
            <a className="transition hover:text-white" href="#privacy">Privacy</a>
          </nav>
          <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-xs font-bold text-amber-200">
            Prototype · API access pending
          </span>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid max-w-7xl gap-14 px-6 pb-24 pt-20 lg:grid-cols-[1.15fr_.85fr] lg:px-10 lg:pt-28">
        <div>
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#56dab8]/25 bg-[#56dab8]/8 px-4 py-2 text-xs font-black tracking-[0.18em] text-[#76e6c7]">
            <Sparkles className="size-4" />
            OPT-IN · POST-MATCH · HUMAN REVIEW
          </div>
          <h1 className="max-w-4xl text-5xl font-black leading-[1.02] tracking-[-0.05em] text-white sm:text-6xl lg:text-7xl">
            Performance context,
            <span className="block text-[#ff6b72]">not automated judgment.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">
            A consent-based VALORANT review workspace for players, applicants,
            and coaches. It turns completed match data into explainable trends
            that support a careful, human-led conversation.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <a
              href="#demo"
              className="inline-flex items-center gap-2 rounded-xl bg-[#ff5d64] px-5 py-3.5 text-sm font-black text-white shadow-[0_16px_50px_rgba(255,93,100,.22)] transition hover:bg-[#ff7379]"
            >
              View synthetic demo <ArrowRight className="size-4" />
            </a>
            <a
              href="#privacy"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3.5 text-sm font-bold text-slate-100 transition hover:bg-white/10"
            >
              <ShieldCheck className="size-4 text-[#56dab8]" /> Review data policy
            </a>
          </div>
        </div>

        <div className="relative self-end rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-black tracking-[0.18em] text-[#56dab8]">REVIEW SNAPSHOT</p>
              <p className="mt-1 text-sm text-slate-400">Synthetic demonstration data</p>
            </div>
            <span className="rounded-full bg-[#56dab8]/10 px-3 py-1 text-xs font-bold text-[#76e6c7]">Completed matches</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-white/8 bg-[#0b1822]/80 p-4">
                <p className="text-xs text-slate-400">{metric.label}</p>
                <p className="mt-2 text-3xl font-black tracking-tight text-white">{metric.value}</p>
                <p className="mt-1 text-[11px] text-slate-500">{metric.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-2xl border border-[#ffb35c]/15 bg-[#ffb35c]/[0.07] p-4">
            <div className="flex gap-3">
              <FileSearch className="mt-0.5 size-5 shrink-0 text-[#ffc078]" />
              <div>
                <p className="font-bold text-[#ffd19b]">Human review recommended</p>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  Recent performance changed, but the sample is too small on two
                  maps. Ask for context before drawing any conclusion.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="relative z-10 border-y border-white/10 bg-white/[0.025]">
        <div className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
          <p className="text-xs font-black tracking-[0.22em] text-[#56dab8]">PRODUCT WORKFLOW</p>
          <h2 className="mt-4 max-w-2xl text-3xl font-black tracking-tight text-white sm:text-4xl">
            Consent first. Context at every step.
          </h2>
          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {steps.map((step, index) => (
              <article key={step.title} className="rounded-2xl border border-white/10 bg-[#0b1822] p-6">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-xl bg-[#56dab8]/10 text-[#56dab8]">
                    <step.icon className="size-5" />
                  </span>
                  <span className="font-mono text-xs text-slate-600">0{index + 1}</span>
                </div>
                <h3 className="mt-7 text-lg font-black text-white">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{step.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="demo" className="relative z-10 mx-auto max-w-7xl px-6 py-24 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[.82fr_1.18fr]">
          <div>
            <p className="text-xs font-black tracking-[0.22em] text-[#ff6b72]">DEMO REPORT</p>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Signals reviewers can explain.
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-400">
              The prototype presents observations with their sample size and
              limitations. Every demo value on this page is synthetic and does
              not represent a real Riot account.
            </p>
          </div>
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0b1822]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-5">
              <div>
                <p className="font-black text-white">Review ID: DEMO-VAL-024</p>
                <p className="mt-1 text-xs text-slate-500">Synthetic dataset · last 24 completed matches</p>
              </div>
              <span className="rounded-full border border-slate-600 px-3 py-1 text-xs font-bold text-slate-300">No determination</span>
            </div>
            <div className="divide-y divide-white/8">
              {[
                ["Performance consistency", "Stable across the full sample", "Sufficient sample"],
                ["Short-term change", "+14% over the most recent six matches", "Needs player context"],
                ["Map coverage", "Two maps have fewer than three matches", "Low confidence"],
                ["Review outcome", "Discuss recent practice or role changes", "Human follow-up"],
              ].map(([label, value, status]) => (
                <div key={label} className="grid gap-2 px-6 py-5 sm:grid-cols-[.8fr_1.35fr_.7fr] sm:items-center">
                  <p className="text-sm font-bold text-slate-300">{label}</p>
                  <p className="text-sm text-white">{value}</p>
                  <p className="text-xs font-semibold text-[#76e6c7] sm:text-right">{status}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24 lg:px-10">
        <div className="rounded-3xl border border-[#ff5d64]/20 bg-[#ff5d64]/[0.055] p-7 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[.7fr_1.3fr] lg:items-start">
            <div>
              <Eye className="size-8 text-[#ff6b72]" />
              <h2 className="mt-5 text-2xl font-black text-white">What this product does not do</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                "It does not detect or accuse players of cheating.",
                "It does not replace Riot Vanguard or Riot enforcement.",
                "It does not expose hidden MMR or non-public private data.",
                "It does not provide live scouting or real-time gameplay assistance.",
                "It does not automatically reject employment applicants.",
                "It does not profile players who have not opted in.",
              ].map((item) => (
                <p key={item} className="flex gap-3 text-sm leading-6 text-slate-300">
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-[#ff7a80]" />
                  {item}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="privacy" className="relative z-10 border-t border-white/10 bg-[#061019]">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-24 lg:grid-cols-[.75fr_1.25fr] lg:px-10">
          <div>
            <p className="text-xs font-black tracking-[0.22em] text-[#56dab8]">DATA & PRIVACY</p>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Built around player control.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              [LockKeyhole, "Explicit opt-in", "No player data is requested before authorization and consent."],
              [Trash2, "Deletion control", "Players can disconnect the service and request deletion of retained review data."],
              [ShieldCheck, "Server-side security", "Application credentials and API secrets are never exposed to the browser."],
              [Database, "Purpose limitation", "Data is used only for the review requested by the authorized player."],
            ].map(([Icon, title, copy]) => {
              const ItemIcon = Icon as typeof ShieldCheck;
              return (
                <article key={title as string} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
                  <ItemIcon className="size-5 text-[#56dab8]" />
                  <h3 className="mt-5 font-black text-white">{title as string}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{copy as string}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/10 bg-[#061019]">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-8 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <p>© 2026 We Are Still Here. Product review prototype.</p>
          <p>
            This service is not endorsed by Riot Games and does not represent
            Riot Games or its affiliates.
          </p>
        </div>
      </footer>
    </main>
  );
}
