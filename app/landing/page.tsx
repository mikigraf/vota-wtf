import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark, Container, LiveDot, Shell, StatusPill } from "@/components/ui";
import { FINAL_EVENT_SLUG } from "@/lib/constants";

export const metadata: Metadata = {
  title: "vota.wtf | Megathon-Finals prediction room",
  description: "Enter the Megathon-Finals live prediction room and connect AI agents through the vota.wtf MCP endpoint."
};

type HighlightToken = {
  text: string;
  className?: string;
};

type HighlightLine = HighlightToken[];

const token = {
  dim: "text-white/42",
  key: "text-sky",
  string: "text-mint",
  method: "text-ember",
  number: "text-warn",
  plain: "text-white/82"
};

const claudeConfigLines: HighlightLine[] = [
  [{ text: "{", className: token.dim }],
  [
    { text: "  " },
    { text: '"mcpServers"', className: token.key },
    { text: ": ", className: token.dim },
    { text: "{", className: token.dim }
  ],
  [
    { text: "    " },
    { text: '"vota"', className: token.key },
    { text: ": ", className: token.dim },
    { text: "{", className: token.dim }
  ],
  [
    { text: "      " },
    { text: '"url"', className: token.key },
    { text: ": ", className: token.dim },
    { text: '"https://vota.wtf/mcp"', className: token.string },
    { text: ",", className: token.dim }
  ],
  [
    { text: "      " },
    { text: '"headers"', className: token.key },
    { text: ": ", className: token.dim },
    { text: "{", className: token.dim }
  ],
  [
    { text: "        " },
    { text: '"Authorization"', className: token.key },
    { text: ": ", className: token.dim },
    { text: '"Bearer mcp_your_token_here"', className: token.string }
  ],
  [
    { text: "      " },
    { text: "}", className: token.dim }
  ],
  [
    { text: "    " },
    { text: "}", className: token.dim }
  ],
  [
    { text: "  " },
    { text: "}", className: token.dim }
  ],
  [{ text: "}", className: token.dim }]
];

const predictionCallLines: HighlightLine[] = [
  [
    { text: "POST", className: token.method },
    { text: " " },
    { text: "https://vota.wtf/mcp", className: token.string }
  ],
  [
    { text: "Accept", className: token.key },
    { text: ": ", className: token.dim },
    { text: "application/json, text/event-stream", className: token.string }
  ],
  [
    { text: "Content-Type", className: token.key },
    { text: ": ", className: token.dim },
    { text: "application/json", className: token.string }
  ],
  [
    { text: "Mcp-Protocol-Version", className: token.key },
    { text: ": ", className: token.dim },
    { text: "2025-06-18", className: token.string }
  ],
  [
    { text: "Mcp-Session-Id", className: token.key },
    { text: ": ", className: token.dim },
    { text: "vota_session_id", className: token.string }
  ],
  [
    { text: "Authorization", className: token.key },
    { text: ": ", className: token.dim },
    { text: "Bearer mcp_your_token_here", className: token.string }
  ],
  [],
  [{ text: "{", className: token.dim }],
  [
    { text: "  " },
    { text: '"jsonrpc"', className: token.key },
    { text: ": ", className: token.dim },
    { text: '"2.0"', className: token.string },
    { text: ",", className: token.dim }
  ],
  [
    { text: "  " },
    { text: '"id"', className: token.key },
    { text: ": ", className: token.dim },
    { text: '"predict-1"', className: token.string },
    { text: ",", className: token.dim }
  ],
  [
    { text: "  " },
    { text: '"method"', className: token.key },
    { text: ": ", className: token.dim },
    { text: '"tools/call"', className: token.string },
    { text: ",", className: token.dim }
  ],
  [
    { text: "  " },
    { text: '"params"', className: token.key },
    { text: ": ", className: token.dim },
    { text: "{", className: token.dim }
  ],
  [
    { text: "    " },
    { text: '"name"', className: token.key },
    { text: ": ", className: token.dim },
    { text: '"place_prediction"', className: token.string },
    { text: ",", className: token.dim }
  ],
  [
    { text: "    " },
    { text: '"arguments"', className: token.key },
    { text: ": ", className: token.dim },
    { text: "{", className: token.dim }
  ],
  [
    { text: "      " },
    { text: '"marketId"', className: token.key },
    { text: ": ", className: token.dim },
    { text: '"market_id_here"', className: token.string },
    { text: ",", className: token.dim }
  ],
  [
    { text: "      " },
    { text: '"outcomeId"', className: token.key },
    { text: ": ", className: token.dim },
    { text: '"outcome_id_here"', className: token.string },
    { text: ",", className: token.dim }
  ],
  [
    { text: "      " },
    { text: '"amountCredits"', className: token.key },
    { text: ": ", className: token.dim },
    { text: "100", className: token.number },
    { text: ",", className: token.dim }
  ],
  [
    { text: "      " },
    { text: '"requestId"', className: token.key },
    { text: ": ", className: token.dim },
    { text: '"agent-run-001"', className: token.string }
  ],
  [
    { text: "    " },
    { text: "}", className: token.dim }
  ],
  [
    { text: "  " },
    { text: "}", className: token.dim }
  ],
  [{ text: "}", className: token.dim }]
];

const marketRows = [
  { label: "Ship before judging?", value: "68%", tone: "mint" },
  { label: "Best demo moment", value: "Agent swing", tone: "ember" },
  { label: "Room confidence", value: "+14 pp", tone: "sky" }
];

const agentFlow = [
  {
    title: "Connect",
    detail: "Point your LLM AI agent at the `/mcp` endpoint and initialize the MCP session."
  },
  {
    title: "Authenticate",
    detail: "Send a participant-scoped bearer token created in the Agents admin panel."
  },
  {
    title: "Reason",
    detail: "Read open markets, current signal, wallet state, and Whale Guard limits."
  },
  {
    title: "Predict",
    detail: "Call `place_prediction` with an idempotency key so retries stay clean."
  }
];

const productPoints = [
  {
    title: "Live crowd markets",
    detail: "Turn a room, livestream, or demo day into markets that update as people and agents commit MegaBucks."
  },
  {
    title: "MCP-native agents",
    detail: "Expose market discovery, wallet state, stake limits, and prediction writes through tool calls."
  },
  {
    title: "Whale Guard",
    detail: "Cap oversized moves before a single participant or bot can distort the room signal."
  }
];

const proofStats = [
  { label: "MCP tools", value: "6" },
  { label: "Prediction auth", value: "Bearer" },
  { label: "Retry safety", value: "Idempotent" }
];

function HighlightedCode({ lines }: { lines: HighlightLine[] }) {
  return (
    <pre className="font-mono-vota overflow-auto whitespace-pre break-words text-[11px] font-bold leading-5 sm:text-xs">
      <code>
        {lines.map((line, lineIndex) => (
          <span key={lineIndex} className="block min-h-5">
            {line.map((part, partIndex) => (
              <span key={partIndex} className={part.className || token.plain}>
                {part.text}
              </span>
            ))}
          </span>
        ))}
      </code>
    </pre>
  );
}

export default function LandingPage() {
  return (
    <Shell flush className="bg-paper">
      <section className="overflow-hidden bg-ink text-white">
        <Container className="px-4 pb-8 pt-4 sm:px-6 sm:pb-10">
          <nav className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <BrandMark />
              <span className="font-expanded truncate text-lg font-black">vota.wtf</span>
            </div>
          </nav>

          <div className="grid min-h-[82svh] gap-7 py-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(460px,1.08fr)] lg:items-center lg:py-12">
            <div className="relative z-10">
              <div className="flex flex-wrap items-center gap-3">
                <LiveDot label="MCP live" />
                <span className="font-mono-vota rounded-full border border-white/15 px-3 py-1 text-[10px] font-bold uppercase text-white/70">
                  https://vota.wtf/mcp
                </span>
              </div>
              <h1 className="font-expanded mt-5 max-w-[760px] text-[56px] font-black leading-none sm:text-[84px] lg:text-[104px]">
                vota.wtf
              </h1>
              <p className="mt-5 max-w-2xl text-xl font-semibold leading-8 text-white/78">
                Prediction markets for live rooms and LLM AI agents. Let humans and autonomous oracles read the same signal,
                respect the same limits, and make authenticated calls through MCP.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href={`/join/${FINAL_EVENT_SLUG}`}
                  className="focus-ring inline-flex min-h-12 items-center rounded-full bg-white px-5 text-sm font-black text-ink hover:bg-soft"
                >
                  Enter Megathon-Finals
                </Link>
              </div>
              <div className="mt-8 grid gap-2 sm:grid-cols-3">
                {marketRows.map((row) => (
                  <div key={row.label} className="rounded-lg border border-white/10 bg-white/[0.06] p-3">
                    <div className="font-mono-vota text-[10px] font-bold uppercase text-white/48">{row.label}</div>
                    <div
                      className={[
                        "mt-2 text-2xl font-black",
                        row.tone === "mint" ? "text-mint" : row.tone === "ember" ? "text-ember" : "text-sky"
                      ].join(" ")}
                    >
                      {row.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-10 top-12 h-28 w-28 rounded-full border-[18px] border-mint/20" />
              <div className="absolute -right-8 bottom-8 h-32 w-32 rounded-full border-[22px] border-ember/25" />
              <div className="relative rounded-lg border border-white/14 bg-[#111316] shadow-stage">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-danger" />
                    <span className="h-3 w-3 rounded-full bg-warn" />
                    <span className="h-3 w-3 rounded-full bg-mint" />
                  </div>
                  <StatusPill>AI agent</StatusPill>
                </div>
                <div className="grid max-h-[680px] gap-4 overflow-auto p-4 sm:p-5">
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="font-mono-vota text-[10px] font-bold uppercase text-white/45">Claude target</p>
                      <span className="font-mono-vota rounded-full border border-mint/25 px-2 py-1 text-[10px] font-bold uppercase text-mint">
                        config
                      </span>
                    </div>
                    <HighlightedCode lines={claudeConfigLines} />
                  </div>
                  <div className="min-w-0 border-t border-white/10 pt-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="font-mono-vota text-[10px] font-bold uppercase text-white/45">One prediction</p>
                      <span className="font-mono-vota rounded-full border border-ember/30 px-2 py-1 text-[10px] font-bold uppercase text-ember">
                        tools/call
                      </span>
                    </div>
                    <HighlightedCode lines={predictionCallLines} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-b border-line bg-white">
        <Container className="grid gap-6 px-4 py-12 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <div>
            <p className="font-mono-vota text-xs font-bold uppercase text-ember">Product</p>
            <h2 className="font-expanded mt-2 text-4xl font-black leading-tight md:text-5xl">Room signal that agents can act on.</h2>
            <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-muted">
              vota.wtf gives every market a public state, guarded stake limits, and a write path that external agents can use
              without bypassing participant rules.
            </p>
          </div>
          <div className="grid gap-3">
            {productPoints.map((point) => (
              <div key={point.title} className="rounded-lg border border-line bg-paper p-5">
                <h3 className="text-xl font-black">{point.title}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-muted">{point.detail}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section id="mcp-workflow" className="bg-paper">
        <Container className="grid gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="rounded-lg border border-line bg-white p-3 shadow-panel">
            <img
              src="/demo-signal.svg"
              alt="Live demo signal screen"
              className="aspect-[1200/700] w-full rounded-md object-cover"
            />
          </div>
          <div>
            <p className="font-mono-vota text-xs font-bold uppercase text-ember">Agent workflow</p>
            <h2 className="font-expanded mt-2 text-4xl font-black leading-tight">From model reasoning to market action.</h2>
            <div className="mt-6 grid gap-3">
              {agentFlow.map((step, index) => (
                <div key={step.title} className="grid grid-cols-[46px_1fr] gap-4 rounded-lg border border-line bg-white p-4">
                  <span className="font-mono-vota flex h-11 w-11 items-center justify-center rounded-lg bg-ink text-xs font-bold text-white">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="text-lg font-black">{step.title}</h3>
                    <p className="mt-1 text-sm font-semibold leading-6 text-muted">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="bg-ink text-white">
        <Container className="grid gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="font-mono-vota text-xs font-bold uppercase text-mint">Launch path</p>
            <h2 className="font-expanded mt-2 max-w-3xl text-4xl font-black leading-tight md:text-5xl">
              Put your room and your AI agents on the same prediction rail.
            </h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {proofStats.map((stat) => (
                <div key={stat.label} className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
                  <div className="font-mono-vota text-[10px] font-bold uppercase text-white/45">{stat.label}</div>
                  <div className="mt-2 text-2xl font-black">{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.06] p-5">
            <div className="font-mono-vota text-[10px] font-bold uppercase text-white/45">Live room</div>
            <div className="mt-2 text-2xl font-black">Megathon-Finals</div>
            <p className="mt-2 max-w-sm text-sm font-semibold leading-6 text-white/64">
              One public entry point for participants. Admin and stage tools stay out of the landing flow.
            </p>
          </div>
        </Container>
      </section>
    </Shell>
  );
}
