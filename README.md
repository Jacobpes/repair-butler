# Repair Butler

Repair Butler is a workshop tool for maintenance technicians, small repair shops, and plant engineers. Describe a broken industrial electronic — a PLC, HMI, servo, inverter, control board, or power supply — and it searches the live web for every realistic way forward:

- DIY repair, from failure notes and manuals
- a repair service, biased to the technician’s country
- a used or refurbished unit, from current listings
- a new unit, from distributors and the manufacturer
- a successor, when the part is discontinued

The options sit side by side with cost, lead time, and risk. Every price, stock note, lead time, failure mode, and discontinuation is clickable back to a page, with a quoted highlight and a date when Exa returned one. If the web did not say it, the card says **not found**.

Nothing is ordered and nothing is emailed. The technician picks a path, gets a draft inquiry or a purchase checklist, and sends it themselves.

The demo cases are real parts a Finnish shop would actually have on the bench. The Siemens example is a TP177B, MLFB `6AV6642-0BA01-1AX1`. The Junction brief’s `6AV6643-0CD01-1AX1` is an MP 277 10 inch Touch, so the app does not use it as the TP177B. JP Electronix AB is the kind of workshop this is for. A judge can also paste one sentence, such as `Danfoss FC302 131B0081 alarm 14 earth fault, Finland, urgent`, and the form fills manufacturer, part number, symptom, country, and urgency.

## How Exa is used

The official `exa-js` SDK (2.28) is the only search backend. One `EXA_API_KEY` is enough. The Research API in this SDK is retired: every Research call rejects with HTTP 410 and tells you to use the Agent API. A full Agent run is a long job and would miss the demo’s timing, so synthesis uses **Exa Answer** with an output schema, which the brief allows, plus a structured schema on every search.

Five searches run in parallel. The UI streams server-sent events as each one returns.

| Path | Search type | Why this type | Filters and contents |
| --- | --- | --- | --- |
| DIY repair | `auto` | Failure notes are spread across forums and manuals | `excludeDomains` drops marketplaces. Highlights steered at failure modes. |
| Repair service | `auto` | Company pages, not a keyword dump | `category: "company"` and `userLocation` for a local shop, plus a second search with no country bias so an EU specialist is still found. A page is kept only when it names the part or its family and actually talks about repair. |
| Used or refurbished | `fast` | Listings should come back quickly, and `fast` still accepts a schema | One search covers marketplaces and surplus dealers. A second search is surplus only (Radwell, PLC City, EU Automation, and similar), so eBay cannot fill every slot. `startPublishedDate` is 18 months back. |
| New unit | `fast` | Distributor pages, same reason | `userLocation` for the technician’s country. No domain lock, so a local distributor is not dropped. |
| Successor | `deep` | Discontinuation is a multi-step question | `additionalQueries` for the discontinuation notice and the official replacement. A page can name the family plus a successor note or the symptom. A shop price is not shown on this card. |

Used and new listings must show the exact part number, including in the product URL (spaces and dashes ignored, so `1756-L71` does not match `1756-L710`). DIY and successor pages can name the family together with the symptom or alarm, such as FC 302 with alarm 14, NX1P2 with an ERR LED, or TP177B. Specialist repair shops such as Control Board Lab and FOXON are routed to the repair card. Shop prices stay off the DIY and successor cards. The cheapest comparable offer is shown with that vendor’s own stock and lead time; for Finland an EU offer wins before a cheaper non-EU one. The condition is the one printed beside the price. `POST /api/research` also accepts `{ "query": "..." }` and parses it on the server. A repair page can name the family instead, and it still has to be about repair. Social posts and, on the buy paths, news URLs and listings older than the stale cutoff are dropped too. A price or lead time is shown only when that string is in the quoted highlight. For Finland the original price stays, with a labeled EUR conversion when the page used another currency, and every price is marked new, used, refurbished, or repair. A pack price is labeled with its quantity. On a line-down job, a repair card with no sourced price and no sourced turnaround does not outrank an in-stock buy, and the banner always names the fastest sourced purchase.

`fast` is the low-latency type the brief names. Exa’s newer `lite` type is cheaper, but it rejects `outputSchema`, summaries, and several other fields. Listings stay on `fast` so each path can return structured JSON.

On every search:

- `contents.highlights` with a query aimed at price, stock, lead time, condition, and replacement
- `outputSchema` (object, under the 10-property limit) for headline, cost, lead time, risk, findings, pros, and cons
- `systemPrompt` that forbids invented figures
- `objective` describing the technician’s decision

After the five searches, one `getContents` call reads the best URL from each path with **text** (capped), **highlights**, and a **summary**. Those excerpts replace the thinner search highlights before the cards are rebuilt.

Finally `exa.answer` takes only the figures that survived the source check, with `outputSchema` for `recommendedPath`, `reason`, `urgencyNote`, and `caveats`, plus `userLocation`. If Answer fails or does not name a path, a visible workshop rule ranks the paths that already have sources. That rule is labeled as a rule, not as a web fact.

A cost or lead time is shown when the quoted highlight contains that string. Structured grounding is used when it cites one of those pages, and a highlight is used when grounding misses a figure that is already printed there. A number that is not in the quoted text is dropped, including a model figure and a grounding link that is not in the filtered results. Pros and cons that contain a number are kept only when that number is in a kept page. Assessments that remain are labeled as a reading of the linked pages.

## Setup

Node 20 or newer.

```bash
npm install
cp .env.example .env.local
# set EXA_API_KEY in .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm test
npm run lint
npm run build
```

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `EXA_API_KEY` | Yes | Search, Contents, and Answer |
| `OPENAI_API_KEY` | No | Read a nameplate photo. Used first if both vision keys are set. |
| `ANTHROPIC_API_KEY` | No | Nameplate photo when OpenAI is unset |
| `OPENAI_VISION_MODEL` | No | Defaults to `gpt-4o-mini` |
| `ANTHROPIC_VISION_MODEL` | No | Defaults to `claude-sonnet-4-5` |

Do not commit `.env.local`. `.env.example` lists the names only.

Without `EXA_API_KEY` the page loads, and a search returns a clear 503 instead of fake options. The photo stays in the browser unless a vision key is set, and the form says so.

## Deploy

The app is Next.js App Router, TypeScript, and Tailwind, with no custom server. Import the repo in Vercel, set `EXA_API_KEY`, and deploy.

`app/api/research/route.ts` sets `maxDuration` to 60 seconds. A full run is aimed at under 45 seconds (parallel searches, then one contents call, then Answer). Vercel only honors that duration on a plan that allows it. Hobby’s shorter limit will cut the stream off; run it locally or on a plan that allows 60 seconds for the demo.

## Pitch script

1. Open the app. Click **Siemens TP177B** (`6AV6642-0BA01-1AX1`). Say this is a dead HMI on a running line in Finland, the sort of job JP Electronix actually gets.
2. Watch five paths light up. Point at the search type on each card: auto, fast, and deep, running together.
3. Open a price or a lead time. It links to a page title, a quoted highlight, and a date. If that slot says **not found**, say the model was not allowed to invent it.
4. Scroll the sources panel. The same URLs are grouped by path.
5. Click **Prepare this option** on the used unit or the repair shop. Show the checklist or the mailto draft. Copy it. Say nothing left the browser.
6. Hand the keyboard over. The judge pastes one sentence, or types a manufacturer, part number, and symptom, and the same five searches run.

## Live run

A live Exa run with a real key is already done: three searches, HTTP 200, about 8.6–12.3 seconds, no crashes. The follow-up fixes in this branch were checked here with unit tests and fixtures, because this environment still has no `EXA_API_KEY`. The live searches need to be run again after these filters, on a machine that has the key.
