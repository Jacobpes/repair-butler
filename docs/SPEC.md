# Repair Butler - spec (Exa "Internet Butler" challenge, Junction 2026)

Judging (20% each): use of Exa for live info not in model training data; usefulness to a specific real group; clarity of sources; originality; demo works on live queries judges type themselves.

## Product
Personal agent for maintenance technicians, small repair shops and plant engineers dealing with ANY broken industrial electronics (PLC modules, HMI panels, servo drives, frequency inverters, control boards, power supplies). Owner Jacob runs an industrial electronics repair company in Finland (JP Electronix AB); the demo will be a real case from his workshop.

### Flow
1. User describes the faulty unit: manufacturer + part number + symptom (e.g. "Siemens 6AV6643-0CD01-1AX1 TP177B, black screen, backlight dead"), optional country (default Finland/EU) and urgency. Nameplate photo upload is nice-to-have.
2. Agent uses Exa across the live web to work out ALL realistic resolution paths:
   - DIY repair: known failure modes and fixes from forums, repair blogs, manuals.
   - Repair service: who repairs this model, ideally near the user, prices/turnaround if published.
   - Used/refurbished: current listings (eBay, surplus dealers) with price and condition.
   - New: distributors, stock, price.
   - Obsolescence/replacement: discontinued? official successor or compatible replacement, migration notes.
3. Show options side by side as cards: estimated cost, lead time, risk/effort, pros/cons, and a recommendation given urgency. EVERY factual claim (price, stock, lead time, failure mode, discontinuation) has a clickable source with page title and a quoted highlight/date where possible. No unsourced numbers; say "not found" instead.
4. Approval step: user picks an option; agent prepares next action (drafted quote/repair inquiry email to that vendor, or purchase checklist with listing link). Nothing sent automatically; copy button or mailto: link.

## Exa usage (showcase)
- Official exa-js SDK, key from env EXA_API_KEY; never commit keys; provide .env.example.
- Use Search (fast/auto/deep), Contents (text, highlights, summaries), domain filters, date filters for fresh listings, category filters, structured JSON output (summary schema and/or Answer/Research with output schema) to extract price/stock/lead time.
- Run per-path sub-searches in parallel; stream progress to the UI so the demo feels alive.
- Synthesis should work with ONLY the Exa key (use Exa Answer/Research structured output). Optionally use OPENAI_API_KEY or ANTHROPIC_API_KEY if present.

## Tech and deliverables
- Next.js App Router + TypeScript + Tailwind, deployable on Vercel with zero config. Clean, professional, mobile-friendly UI.
- One-click example queries (real parts: a Siemens HMI, an Allen-Bradley PLC module, a Yaskawa or Danfoss drive) plus free-text input.
- Sources panel listing every URL used, grouped by path.
- Solid error handling; target full run under ~45 s.
- README: what, who for, how Exa is used (each endpoint/feature), setup, env vars, deploy, short pitch demo script.
- If EXA_API_KEY exists in your environment, test end to end live and include screenshots in the PR; otherwise say clearly that live testing still needs the key.

Done = PR against main with working app, README, and evidence of a live run (or clear note the key was missing). Architecture is your call.
