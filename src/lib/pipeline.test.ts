import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAction, findPublishedEmail } from "./actions";
import {
  buildAnswerPrompt,
  fallbackRecommendation,
  recommendationFromAnswer,
} from "./answer";
import { buildCard, mergeHitsIntoRaw } from "./claims";
import { parseIntake } from "./intake";
import { parseNameplateJson } from "./nameplate";
import { buildPathPlans } from "./paths";
import { consumeSseBuffer } from "./sse";
import type { Intake, PathCard, Source } from "./types";
import { looksQuantitative } from "./text";

const intake: Intake = {
  manufacturer: "Siemens",
  partNumber: "6AV6642-0BA01-1AX1",
  symptom: "TP177B black screen, backlight dead",
  country: "FI",
  urgency: "emergency",
};

const now = new Date("2026-11-14T00:00:00.000Z");

function diyPlan() {
  const plan = buildPathPlans(intake, now).find((item) => item.id === "diy");
  if (!plan) throw new Error("missing diy plan");
  return plan;
}

test("path plans use fast, auto, and deep with the filters each path needs", () => {
  const plans = buildPathPlans(intake, now);
  const byId = Object.fromEntries(plans.map((plan) => [plan.id, plan]));

  assert.equal(byId.diy?.searchType, "auto");
  assert.equal(byId.diy?.userLocation, undefined);
  assert.ok(byId.diy?.excludeDomains?.includes("ebay.com"));
  assert.match(byId.diy?.query ?? "", /6AV6642-0BA01-1AX1/);

  assert.equal(byId.repair?.searchType, "auto");
  assert.equal(byId.repair?.category, "company");
  assert.equal(byId.repair?.userLocation, "FI");

  assert.equal(byId.used?.searchType, "fast");
  assert.ok(byId.used?.includeDomains?.includes("ebay.com"));
  assert.ok(byId.used?.includeDomains?.includes("radwell.eu"));
  assert.equal(byId.used?.startPublishedDate, "2025-05-14T00:00:00.000Z");

  assert.equal(byId.new?.searchType, "fast");
  assert.equal(byId.new?.userLocation, "FI");
  assert.equal(byId.new?.includeDomains, undefined);

  assert.equal(byId.obsolete?.searchType, "deep");
  assert.equal(byId.obsolete?.additionalQueries?.length, 2);
  assert.ok(byId.obsolete?.excludeDomains?.includes("amazon.com"));
});

test("unsourced prices are withheld and overlapping failure notes are kept", () => {
  const card = buildCard(diyPlan(), {
    output: {
      content: {
        headline: "The backlight inverter fails and the screen stays black.",
        estimatedCost: "€400",
        leadTime: "2 weeks",
        risk: "medium",
        keyFacts: ["€400 from a forum post", "The backlight inverter fails on this panel."],
        pros: ["A board swap is often enough", "Costs €20"],
        cons: ["Needs the panel open"],
      },
    },
    grounding: [],
    results: [
      {
        url: "https://forum.example/tp177b",
        title: "TP177B black screen",
        highlights: [
          "6AV6642-0BA01-1AX1. The backlight inverter fails and the screen stays black.",
        ],
        publishedDate: "2024-04-02T00:00:00.000Z",
      },
    ],
  });

  assert.equal(card.estimatedCost, "not found");
  assert.equal(card.leadTime, "not found");
  assert.equal(card.status, "found");
  assert.equal(
    card.claims.some((claim) => claim.value.includes("€400")),
    false,
  );
  assert.equal(
    card.claims.some((claim) => claim.value.includes("backlight inverter")),
    true,
  );
  assert.deepEqual(card.pros, ["A board swap is often enough"]);
  assert.equal(card.claims.find((claim) => claim.label === "Finding")?.sources[0]?.quoteKind, "highlight");
});

test("a grounded price keeps its citation, quote, and date", () => {
  const fresh = buildPathPlans(intake, now).find((item) => item.id === "new");
  if (!fresh) throw new Error("missing new plan");
  const card = buildCard(fresh, {
    output: {
      content: {
        headline: "Refurbished stock is listed.",
        estimatedCost: "EUR 640",
        leadTime: "not found",
        risk: "low",
        keyFacts: [],
        pros: [],
        cons: [],
      },
    },
    grounding: [
      {
        field: "estimatedCost",
        confidence: "high",
        citations: [{ url: "https://shop.example/item", title: "Radwell listing" }],
      },
    ],
    results: [
      {
        url: "https://shop.example/item",
        title: "Radwell listing",
        highlights: ["6AV6642-0BA01-1AX1 refurbished unit, price EUR 640, tested."],
        publishedDate: "2026-03-01T00:00:00.000Z",
      },
    ],
  });

  const cost = card.claims.find((claim) => claim.label === "Estimated cost");
  assert.match(card.estimatedCost, /Refurbished/);
  assert.match(card.estimatedCost, /EUR 640/);
  assert.equal(cost?.sources[0]?.url, "https://shop.example/item");
  assert.match(cost?.sources[0]?.highlight ?? "", /EUR 640/);
  assert.equal(cost?.sources[0]?.publishedDate, "2026-03-01T00:00:00.000Z");
  assert.equal(card.leadTime, "not found");
});

test("contents highlights replace the search excerpt before the card is rebuilt", () => {
  const merged = mergeHitsIntoRaw(
    {
      results: [
        {
          url: "https://shop.example/item/",
          title: "Listing",
          highlights: ["short"],
        },
      ],
    },
    [
      {
        url: "https://shop.example/item",
        highlights: ["Price EUR 640 with a 12 month warranty."],
        summary: "A refurbished listing.",
        text: "Full page",
      },
    ],
  );
  assert.equal(merged.results?.[0]?.highlights?.[0], "Price EUR 640 with a 12 month warranty.");
  assert.equal(merged.results?.[0]?.summary, "A refurbished listing.");
});

test("intake rejects a missing symptom and accepts a workshop case", () => {
  assert.equal(parseIntake({ manufacturer: "Siemens" }).ok, false);
  const parsed = parseIntake({ ...intake, notes: "  24 V present  " });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.intake.notes, "24 V present");
});

test("answer prompt carries sourced figures only", () => {
  const card = buildCard(diyPlan(), {
    output: {
      content: {
        headline: "The backlight inverter fails.",
        estimatedCost: "EUR 9999",
        leadTime: "9 weeks",
        risk: "high",
        keyFacts: ["The backlight inverter fails on this panel."],
        pros: [],
        cons: [],
      },
    },
    grounding: [],
    results: [
      {
        url: "https://forum.example/tp177b",
        title: "Notes",
        highlights: ["6AV6642-0BA01-1AX1. The backlight inverter fails on this panel."],
      },
    ],
  });
  const prompt = buildAnswerPrompt(intake, [card]);
  assert.match(prompt, /6AV6642-0BA01-1AX1/);
  assert.equal(prompt.includes("9999"), false);
  assert.match(prompt, /backlight inverter/);
});

test("emergency fallback prefers a sourced used listing over an unsourced repair", () => {
  const used = buildCard(
    buildPathPlans(intake, now).find((plan) => plan.id === "used")!,
    {
      output: {
        content: {
          headline: "A refurbished unit is listed.",
          estimatedCost: "EUR 640",
          leadTime: "not found",
          risk: "medium",
          keyFacts: [],
          pros: [],
          cons: [],
        },
      },
      grounding: [
        {
          field: "estimatedCost",
          citations: [{ url: "https://shop.example/item", title: "Listing" }],
        },
      ],
      results: [
        {
          url: "https://shop.example/item",
          title: "Listing",
          highlights: ["6AV6642-0BA01-1AX1 EUR 640 in stock"],
        },
      ],
    },
  );
  const repair = buildCard(
    buildPathPlans(intake, now).find((plan) => plan.id === "repair")!,
    { error: "Exa timed out on this search." },
  );
  const recommendation = fallbackRecommendation(intake, [used, repair]);
  assert.equal(recommendation.pathId, "used");
  assert.equal(recommendation.via, "urgency-rule");
  assert.equal(recommendation.fastestPathId, "used");
  assert.match(recommendation.reason, /workshop rule/);
  assert.match(recommendation.fastestNote, /in stock/);
});

test("an answer that smuggles a price without citations loses the figure", () => {
  const repairPlan = buildPathPlans(intake, now).find((plan) => plan.id === "repair");
  if (!repairPlan) throw new Error("missing repair plan");
  const recommendation = recommendationFromAnswer(
    {
      recommendedPath: "repair",
      reason: "Use the repair shop at €400 because it is closest.",
      urgencyNote: "Line down.",
      caveats: ["Stock was not confirmed."],
    },
    [],
    intake,
    [buildCard(repairPlan, { results: [] })],
  );
  assert.equal(recommendation.via, "exa-answer");
  assert.equal(looksQuantitative(recommendation.reason), false);
  assert.match(recommendation.reason, /withheld/);
});

test("repair drafts stay on the technician and used drafts are checklists", () => {
  const repair = buildCard(diyPlan(), {
    results: [
      {
        url: "https://shop.example/repair",
        title: "Workshop",
        highlights: ["Email service@radwell.eu about 6AV6642-0BA01-1AX1 for a quote."],
      },
    ],
    output: { content: { headline: "not found", estimatedCost: "not found", leadTime: "not found", risk: "unknown", keyFacts: [], pros: [], cons: [] } },
  });
  const found = findPublishedEmail(repair.sources);
  assert.equal(found?.email, "service@radwell.eu");
  const email = buildAction({ ...repair, id: "repair", title: "Repair service" }, intake);
  assert.equal(email.kind, "email");
  assert.equal(email.recipient, "service@radwell.eu");
  assert.match(email.mailto, /^mailto:service@radwell\.eu\?/);
  assert.match(email.body, /6AV6642-0BA01-1AX1/);
  assert.match(email.body, /has not been sent/);

  const bare = buildAction(
    { ...repair, sources: repair.sources.map((source) => ({ ...source, highlight: "No address on the page." })) },
    intake,
  );
  assert.equal(bare.recipient, "");
  assert.match(bare.mailto, /^mailto:\?/);

  const usedCard: PathCard = {
    ...repair,
    id: "used",
    title: "Used or refurbished",
    sources: [{ url: "https://ebay.com/itm/1", title: "eBay listing" } satisfies Source],
  };
  const checklist = buildAction(usedCard, intake);
  assert.equal(checklist.kind, "checklist");
  assert.match(checklist.body, /https:\/\/ebay.com\/itm\/1/);
  assert.match(checklist.intro, /does not add anything to a cart/);
});

test("sse frames split cleanly and keep a partial frame", () => {
  const { events, rest } = consumeSseBuffer(
    'event: status\ndata: {"message":"Searching"}\n\nevent: path\ndata: {"id":"diy"}\n\nevent: report\ndata: {"in',
  );
  assert.equal(events.length, 2);
  assert.equal(events[0]?.event, "status");
  assert.equal(events[1]?.event, "path");
  assert.match(rest, /event: report/);
});

test("nameplate JSON can arrive fenced", () => {
  const reading = parseNameplateJson(
    '```json\n{"manufacturer":"Siemens","partNumber":"6AV6642-0BA01-1AX1","notes":"TP177B"}\n```',
  );
  assert.equal(reading?.manufacturer, "Siemens");
  assert.equal(reading?.partNumber, "6AV6642-0BA01-1AX1");
  assert.equal(parseNameplateJson('{"manufacturer":"","partNumber":""}'), null);
});
