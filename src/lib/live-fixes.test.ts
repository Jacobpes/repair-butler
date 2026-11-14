import assert from "node:assert/strict";
import { test } from "node:test";
import { recommendationFromAnswer } from "./answer";
import { buildCard } from "./claims";
import { EXAMPLES } from "./examples";
import { filterHits, numbersAreVerbatim, rehomeRepairHits } from "./evidence";
import { parseFreeText } from "./freetext";
import { parseIntake } from "./intake";
import { conflictsWithPart, familyTerms, mentionsPart } from "./part";
import { buildPathPlans, extraSearches } from "./paths";
import type { Intake, PathId, RawHit, RawSearch } from "./types";

const now = new Date("2026-11-14T00:00:00.000Z");

const allenBradley: Intake = {
  manufacturer: "Allen-Bradley",
  partNumber: "1756-L71",
  symptom: "ControlLogix 5571 controller. OK LED is solid red, major fault.",
  country: "FI",
  urgency: "emergency",
};

const siemens: Intake = {
  manufacturer: "Siemens",
  partNumber: "6AV6642-0BA01-1AX1",
  symptom: "TP177B 6 inch color. Black screen, backlight dead.",
  country: "FI",
  urgency: "emergency",
};

function plan(intake: Intake, id: PathId) {
  const found = buildPathPlans(intake, now).find((item) => item.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

function raw(results: RawHit[], content: Record<string, unknown> = {}, grounding: RawSearch["grounding"] = []): RawSearch {
  return {
    output: {
      content: {
        headline: "not found",
        estimatedCost: "not found",
        leadTime: "not found",
        risk: "unknown",
        keyFacts: [],
        pros: [],
        cons: [],
        ...content,
      },
    },
    grounding,
    results,
  };
}

test("the Siemens example is a TP177B, not the MP 277 MLFB", () => {
  const example = EXAMPLES.find((item) => item.id === "siemens-hmi");
  assert.equal(example?.partNumber, "6AV6642-0BA01-1AX1");
  assert.match(example?.symptom ?? "", /TP177B/);
  assert.equal((example?.partNumber ?? "").includes("6AV6643"), false);
});

test("part matching ignores separators and rejects a longer neighbour", () => {
  assert.equal(mentionsPart("Used 1756-L71 in stock", "1756-L71"), true);
  assert.equal(mentionsPart("Used 1756 L71 in stock", "1756-L71"), true);
  assert.equal(mentionsPart("1756-L710 DeWalt saw", "1756-L71"), false);
  assert.equal(mentionsPart("Manual 6AV6643-0CD01-1AX1 MP 277", "6AV6642-0BA01-1AX1"), false);
});

test("used listings keep the exact part and drop marketplace junk, news, and stale pages", () => {
  const hits: RawHit[] = [
    { url: "https://www.ebay.com/itm/1", title: "DeWalt circular saw", highlights: ["DeWalt saw for sale"] },
    { url: "https://www.ebay.com/itm/2", title: "Dell Latitude", highlights: ["Dell laptop"] },
    { url: "https://www.ebay.com/itm/3", title: "Brother printer", highlights: ["Brother toner"] },
    { url: "https://www.ebay.com/itm/4", title: "1756-L710", highlights: ["1756-L710 surplus"] },
    {
      url: "https://www.ebay.com/itm/5",
      title: "1756-L71 ended",
      highlights: ["1756-L71 listing has ended"],
    },
    {
      url: "https://www.reuters.com/news/controls",
      title: "1756-L71",
      highlights: ["1756-L71 market note"],
    },
    {
      url: "https://www.radwell.eu/old",
      title: "1756-L71",
      highlights: ["1756-L71 used EUR 400"],
      publishedDate: "2020-01-01T00:00:00.000Z",
    },
    {
      url: "https://www.radwell.eu/1756-L71",
      title: "Allen-Bradley 1756-L71",
      highlights: ["1756-L71 used EUR 900 in stock"],
      publishedDate: "2026-06-01T00:00:00.000Z",
    },
  ];
  const kept = filterHits(plan(allenBradley, "used"), hits);
  assert.deepEqual(
    kept.map((hit) => hit.url),
    ["https://www.radwell.eu/1756-L71"],
  );

  const card = buildCard(plan(allenBradley, "used"), raw(hits));
  assert.match(card.estimatedCost, /EUR 900/);
  assert.match(card.estimatedCost, /Used/);
  assert.equal(card.estimatedCost.includes("400"), false);
  assert.equal(card.sources.length, 1);
});

test("a surplus search is not limited to eBay", () => {
  const surplus = extraSearches(plan(allenBradley, "used"))[0];
  assert.equal(surplus?.includeDomains?.includes("ebay.com"), false);
  assert.ok(surplus?.includeDomains?.includes("radwell.eu"));
  assert.ok(surplus?.includeDomains?.includes("plc-city.com"));
  assert.ok(surplus?.includeDomains?.includes("euautomation.com"));
  assert.equal(surplus?.userLocation, undefined);
});

test("DIY and successor drop the wrong MLFB, social posts, and shop-only prices", () => {
  const diy = buildCard(
    plan(siemens, "diy"),
    raw([
      {
        url: "https://support.industry.siemens.com/mp277.pdf",
        title: "MP 277 6AV6643-0CD01-1AX1",
        highlights: ["6AV6643-0CD01-1AX1 MP 277 10 inch touch"],
      },
      {
        url: "https://www.linkedin.com/posts/s7",
        title: "S7-1200 tips",
        highlights: ["6AV6642-0BA01-1AX1 mentioned beside an S7-1200"],
      },
      {
        url: "https://forum.example/tp177b",
        title: "TP177B backlight",
        highlights: ["6AV6642-0BA01-1AX1 backlight inverter fails on this panel."],
      },
    ]),
  );
  assert.equal(diy.sources.length, 1);
  assert.match(diy.sources[0]?.url ?? "", /forum\.example/);

  const successor = buildCard(
    plan(allenBradley, "obsolete"),
    raw([
      {
        url: "https://shop.example/1756-l71",
        title: "Buy 1756-L71",
        highlights: ["1756-L71 price EUR 900, ships tomorrow"],
      },
      {
        url: "https://www.rockwellautomation.com/migration",
        title: "1756-L71 discontinuation",
        highlights: ["1756-L71 is discontinued. The successor is 1756-L81E."],
      },
    ]),
  );
  assert.equal(successor.sources.length, 1);
  assert.match(successor.sources[0]?.url ?? "", /rockwellautomation/);
  assert.equal(successor.estimatedCost, "not found");
  assert.equal(JSON.stringify(successor).includes("EUR 900"), false);
});

test("highlight prices and lead times are kept when structured grounding misses", () => {
  const card = buildCard(
    plan(allenBradley, "new"),
    raw([
      {
        url: "https://www.dosupply.com/allen-bradley/1756-l71",
        title: "1756-L71 ControlLogix",
        highlights: ["1756-L71 $1,358.95 3 in stock. Another offer $1,493.70 ships 3-5 days."],
      },
    ]),
  );
  assert.match(card.estimatedCost, /New/);
  assert.match(card.estimatedCost, /\$1,358\.95/);
  assert.match(card.estimatedCost, /about EUR 1,250 converted, not a price printed on the page/);
  assert.match(card.leadTime, /3 in stock/);
  assert.equal(card.estimatedCost.includes("1,493.70"), false);
  const quoted = card.claims.find((claim) => claim.label === "Estimated cost")?.sources[0]?.highlight ?? "";
  assert.match(quoted, /\$1,358\.95/);
  assert.match(quoted, /ships 3-5 days/);
});

test("a ships phrase is shown only when that page prints it", () => {
  const card = buildCard(
    plan(allenBradley, "new"),
    raw([
      {
        url: "https://www.dosupply.com/allen-bradley/1756-l71",
        title: "1756-L71",
        highlights: ["1756-L71 $1,493.70 ships 3-5 days."],
      },
    ]),
  );
  assert.match(card.leadTime, /ships 3-5 days/);
  assert.match(card.estimatedCost, /\$1,493\.70/);
});

test("a figure is dropped unless the cited text contains it, and a pack price is not the unit price", () => {
  const invented = buildCard(
    plan(siemens, "new"),
    raw(
      [
        {
          url: "https://mall.example/tp177b",
          title: "6AV6642-0BA01-1AX1",
          highlights: ["6AV6642-0BA01-1AX1 price on request"],
        },
      ],
      {
        headline: "The unit costs EUR 3,773 and ships in 8 business days.",
        estimatedCost: "EUR 3,773",
        leadTime: "8 business days",
      },
    ),
  );
  const blob = JSON.stringify(invented);
  assert.equal(blob.includes("3,773"), false);
  assert.equal(blob.includes("3773"), false);
  assert.equal(blob.includes("8 business days"), false);
  assert.equal(invented.estimatedCost, "not found");
  assert.equal(invented.leadTime, "not found");

  const pack = buildCard(
    plan(allenBradley, "used"),
    raw([
      {
        url: "https://www.radwell.eu/1756-L71",
        title: "1756-L71",
        highlights: ["1756-L71 5 pcs EUR 713. 1 pc EUR 808."],
      },
    ]),
  );
  assert.match(pack.estimatedCost, /EUR 808/);
  assert.equal(pack.estimatedCost.includes("713"), false);

  const onlyPack = buildCard(
    plan(allenBradley, "used"),
    raw([
      {
        url: "https://www.radwell.eu/1756-L71",
        title: "1756-L71",
        highlights: ["1756-L71 5 pcs EUR 713."],
      },
    ]),
  );
  assert.match(onlyPack.estimatedCost, /EUR 713/);
  assert.match(onlyPack.estimatedCost, /5 pcs/);
});

test("Finland prefers an EU seller and still shows the original price", () => {
  const card = buildCard(
    plan(allenBradley, "used"),
    raw([
      {
        url: "https://www.ebay.com/itm/9",
        title: "1756-L71",
        highlights: ["1756-L71 used $2,000"],
      },
      {
        url: "https://www.radwell.eu/1756-L71",
        title: "1756-L71",
        highlights: ["1756-L71 used EUR 900"],
      },
    ]),
  );
  assert.match(card.estimatedCost, /Used/);
  assert.match(card.estimatedCost, /EUR 900/);
  assert.equal(card.estimatedCost.includes("2,000"), false);
  assert.match(card.claims.find((claim) => claim.label === "Estimated cost")?.sources[0]?.url ?? "", /radwell\.eu/);
});

test("repair keeps a shop that names the family and drops a generic free-evaluation page", () => {
  const card = buildCard(
    plan(siemens, "repair"),
    raw(
      [
        {
          url: "https://generic.example/repair",
          title: "Industrial electronics repair",
          highlights: ["We repair all industrial electronics. Free evaluation on any board."],
        },
        {
          url: "https://bvs-electronics.com/siemens-tp177b",
          title: "TP177B repair",
          highlights: ["We repair Siemens TP177B panels in Europe."],
        },
      ],
      {
        pros: ["Free evaluation", "The shop repairs this model"],
        keyFacts: ["Free evaluation. The shop repairs this model."],
      },
    ),
  );
  assert.equal(card.sources.length, 1);
  assert.match(card.sources[0]?.url ?? "", /bvs-electronics/);
  assert.equal(card.pros.includes("Free evaluation"), false);
  assert.equal(card.pros.some((item) => /this model/i.test(item)), false);
  assert.equal(card.claims.some((claim) => /free evaluation/i.test(claim.value)), false);
  const europe = extraSearches(plan(siemens, "repair"))[0];
  assert.equal(europe?.userLocation, undefined);
  assert.match(europe?.query ?? "", /TP177B/);
});

test("a pasted sentence fills manufacturer, part, symptom, country, and urgency", () => {
  const parsed = parseFreeText("Danfoss FC302 131B0081 alarm 14 earth fault, Finland, urgent");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.intake.manufacturer, "Danfoss");
  assert.equal(parsed.intake.partNumber, "131B0081");
  assert.equal(parsed.intake.country, "FI");
  assert.equal(parsed.intake.urgency, "emergency");
  assert.match(parsed.intake.symptom, /FC302/);
  assert.match(parsed.intake.symptom, /earth fault/);
  assert.equal(parsed.intake.symptom.includes("131B0081"), false);
  assert.equal(parsed.intake.symptom.toLowerCase().includes("finland"), false);
});

test("emergency does not pick a thin repair card over an in-stock unit, and still names the fastest option", () => {
  const repair = buildCard(
    plan(allenBradley, "repair"),
    raw(
      [
        {
          url: "https://bvs-electronics.com/controllogix",
          title: "ControlLogix repair",
          highlights: ["We repair Allen-Bradley ControlLogix 1756 controllers."],
        },
      ],
      { keyFacts: ["We repair Allen-Bradley ControlLogix 1756 controllers."] },
    ),
  );
  const fresh = buildCard(
    plan(allenBradley, "new"),
    raw([
      {
        url: "https://www.dosupply.com/allen-bradley/1756-l71",
        title: "1756-L71",
        highlights: ["1756-L71 $1,358.95 3 in stock."],
      },
    ]),
  );
  assert.equal(repair.status, "found");
  assert.equal(repair.estimatedCost, "not found");
  const recommendation = recommendationFromAnswer(
    {
      recommendedPath: "repair",
      reason: "Send the controller to the nearest shop.",
      urgencyNote: "Line down.",
      caveats: ["The shop did not publish a turnaround."],
    },
    [],
    allenBradley,
    [repair, fresh],
  );
  assert.equal(recommendation.pathId, "new");
  assert.equal(recommendation.fastestPathId, "new");
  assert.equal(recommendation.via, "urgency-rule");
  assert.match(recommendation.reason, /in stock/);
  assert.match(recommendation.fastestNote, /\$1,358\.95/);

  const quotedRepair = buildCard(
    plan(allenBradley, "repair"),
    raw([
      {
        url: "https://bvs-electronics.com/1756-l71",
        title: "1756-L71 repair",
        highlights: ["We repair ControlLogix 1756-L71. Turnaround 10 business days."],
      },
    ]),
  );
  const kept = recommendationFromAnswer(
    {
      recommendedPath: "repair",
      reason: "The shop publishes a turnaround for this controller.",
      urgencyNote: "Line down.",
      caveats: [],
    },
    [],
    allenBradley,
    [quotedRepair, fresh],
  );
  assert.equal(kept.pathId, "repair");
  assert.equal(kept.fastestPathId, "new");
  assert.match(kept.fastestNote, /in stock/);
});

test("a grounding citation that is not in the filtered results is not shown", () => {
  const card = buildCard(
    plan(allenBradley, "new"),
    raw(
      [
        {
          url: "https://forum.example/1756-l71",
          title: "1756-L71 notes",
          highlights: ["1756-L71 fails to go to Run."],
        },
      ],
      { estimatedCost: "EUR 3,773" },
      [{ field: "estimatedCost", citations: [{ url: "https://evil.example/price", title: "Guess" }] }],
    ),
  );
  assert.equal(card.estimatedCost, "not found");
  assert.equal(card.sources.some((source) => source.url.includes("evil.example")), false);
});

const danfoss: Intake = {
  manufacturer: "Danfoss",
  partNumber: "131B0081",
  symptom: "FC302 alarm 14 earth fault on the drive",
  country: "FI",
  urgency: "emergency",
};

const omron: Intake = {
  manufacturer: "Omron",
  partNumber: "NX1P2-1140DT",
  symptom: "NX1P2 ERR LED flashing, CPU will not run",
  country: "FI",
  urgency: "emergency",
};

test("a price keeps every digit, and the cheapest comparable offer keeps its own lead", () => {
  assert.equal(numbersAreVerbatim("$319", "Airline Hydraulics $3190.00 /EA"), false);
  const airline = buildCard(
    plan(allenBradley, "new"),
    raw([
      {
        url: "https://www.airlinehydraulics.com/1756-l71",
        title: "1756-L71",
        highlights: ["1756-L71 $3190.00 /EA"],
      },
    ]),
  );
  assert.match(airline.estimatedCost, /\$3190\.00/);
  assert.equal(/\$319(?!\d)/.test(airline.estimatedCost), false);

  const siemensOffers = buildCard(
    plan(siemens, "new"),
    raw([
      {
        url: "https://www.discount-automation.de/6AV6642",
        title: "6AV6642-0BA01-1AX1",
        highlights: ["6AV6642-0BA01-1AX1 qty 1 EUR 698 in stock, ships in 2 days."],
      },
      {
        url: "https://shop.example.de/mp277",
        title: "6AV6642-0BA01-1AX1",
        highlights: ["6AV6642-0BA01-1AX1 EUR 2,299. Lead time 8 weeks."],
      },
    ]),
  );
  assert.match(siemensOffers.estimatedCost, /EUR 698/);
  assert.equal(siemensOffers.estimatedCost.includes("2,299"), false);
  assert.match(siemensOffers.leadTime, /in stock/);
  assert.equal(siemensOffers.leadTime.includes("8 weeks"), false);
  assert.match(
    siemensOffers.claims.find((claim) => claim.label === "Estimated cost")?.sources[0]?.url ?? "",
    /discount-automation/,
  );

  const danfossOffers = buildCard(
    plan(danfoss, "new"),
    raw([
      {
        url: "https://www.drive-outlet.co.uk/131B0081",
        title: "131B0081",
        highlights: ["131B0081 GBP 1,071.75 in stock"],
      },
      {
        url: "https://www.dosupply.com/131B0081",
        title: "131B0081",
        highlights: ["131B0081 $2,646.70 ships 3-5 days"],
      },
    ]),
  );
  assert.match(danfossOffers.estimatedCost, /GBP 1,071\.75/);
  assert.match(danfossOffers.leadTime, /in stock/);
  assert.equal(danfossOffers.estimatedCost.includes("2,646.70"), false);
});

test("DIY and successor match the family and the symptom, and they do not show shop prices", () => {
  const diy = buildCard(
    plan(danfoss, "diy"),
    raw([
      {
        url: "https://forum.example/fc302-alarm-14",
        title: "FC 302 alarm 14",
        highlights: ["FC 302 alarm 14 is an earth fault. Check the motor cable."],
      },
      {
        url: "https://www.radwell.eu/131B0081",
        title: "131B0081 for sale",
        highlights: ["131B0081 used EUR 900 in stock"],
      },
    ]),
  );
  assert.equal(diy.sources.length, 1);
  assert.match(diy.sources[0]?.url ?? "", /forum\.example/);
  assert.equal(diy.estimatedCost, "not found");
  assert.equal(JSON.stringify(diy).includes("EUR 900"), false);

  const omronDiy = buildCard(
    plan(omron, "diy"),
    raw([
      {
        url: "https://forum.example/nx1p2",
        title: "NX1P2 ERR LED",
        highlights: ["NX1P2 ERR LED flashing means the CPU has a fault."],
      },
    ]),
  );
  assert.equal(omronDiy.sources.length, 1);
  assert.equal(omronDiy.estimatedCost, "not found");

  const panel = buildCard(
    plan(siemens, "diy"),
    raw([
      {
        url: "https://support.example/tp177b",
        title: "TP177B backlight",
        highlights: ["TP177B backlight failure leaves the screen black."],
      },
    ]),
  );
  assert.equal(panel.sources.length, 1);

  const successor = buildCard(
    plan(danfoss, "obsolete"),
    raw([
      {
        url: "https://www.danfoss.com/fc302-successor",
        title: "FC302 migration",
        highlights: ["FC302 is discontinued. The successor is the iC7 series."],
      },
      {
        url: "https://www.dosupply.com/fc302",
        title: "Buy FC302",
        highlights: ["FC302 price EUR 500, in stock."],
      },
    ]),
  );
  assert.equal(successor.sources.length, 1);
  assert.match(successor.sources[0]?.url ?? "", /danfoss\.com/);
  assert.equal(successor.estimatedCost, "not found");
  assert.equal(JSON.stringify(successor).includes("EUR 500"), false);
});

test("used keeps a surplus product URL, and the surplus search is not date-locked", () => {
  const kept = filterHits(plan(danfoss, "used"), [
    {
      url: "https://www.radwell.eu/Buy/DANFOSS/131B0081",
      title: "Danfoss drive",
      highlights: ["In stock. Call for the latest price."],
    },
  ]);
  assert.equal(kept.length, 1);

  const surplus = extraSearches(plan(allenBradley, "used"));
  assert.ok(surplus.length >= 2);
  assert.ok(surplus.every((item) => item.startPublishedDate === undefined));
  assert.ok(surplus.every((item) => item.numResults >= 12));
  assert.match(surplus.map((item) => item.query).join(" "), /1756-L71/);
  assert.match(surplus.map((item) => item.query).join(" "), /1756L71/);
});

test("a specialist repair offer moves to the repair card with its flat rate", () => {
  const plans = buildPathPlans(allenBradley, now);
  const raws = new Map(plans.map((item) => [item.id, { results: [] as RawHit[] }]));
  raws.set("diy", {
    results: [
      {
        url: "https://www.controlboardlab.com/1756-l71",
        title: "1756-L71 repair",
        highlights: ["Flat rate repair $349 for the 1756-L71."],
      },
      {
        url: "https://forum.example/1756-l71",
        title: "1756-L71 major fault",
        highlights: ["1756-L71 major fault after a power dip. The OK LED stays red."],
      },
    ],
  });
  rehomeRepairHits(plans, raws);
  const diy = buildCard(plan(allenBradley, "diy"), raws.get("diy") ?? { results: [] });
  const repair = buildCard(plan(allenBradley, "repair"), raws.get("repair") ?? { results: [] });
  assert.equal(diy.sources.some((source) => source.url.includes("controlboardlab")), false);
  assert.match(diy.sources[0]?.url ?? "", /forum\.example/);
  assert.equal(diy.estimatedCost, "not found");
  assert.match(repair.estimatedCost, /\$349/);
  assert.match(repair.estimatedCost, /Repair service/);
  assert.match(repair.sources[0]?.url ?? "", /controlboardlab/);
});

test("condition follows the words next to the price", () => {
  const card = buildCard(
    plan(allenBradley, "new"),
    raw([
      {
        url: "https://www.vb-automation.com/1756-l71",
        title: "Surplus inventory",
        highlights: ["1756-L71 Condition: New $1,358.95"],
      },
    ]),
  );
  assert.match(card.estimatedCost, /New/);
  assert.match(card.estimatedCost, /\$1,358\.95/);
  assert.equal(/^Used/.test(card.estimatedCost), false);
});

test("recommendation citations have to mention this unit", () => {
  const recommendation = recommendationFromAnswer(
    {
      recommendedPath: "new",
      reason: "Buy the drive that is in stock.",
      urgencyNote: "Line down.",
      caveats: [],
    },
    [
      { url: "https://www.rgb-automatyka.com/siemens", title: "Siemens Eurotherm spares" },
      { url: "https://www.danfoss.com/fc302", title: "Danfoss FC302 alarm 14 notes" },
    ],
    danfoss,
    [buildCard(plan(danfoss, "new"), raw([]))],
  );
  assert.equal(recommendation.sources.length, 1);
  assert.match(recommendation.sources[0]?.url ?? "", /danfoss\.com/);
});

test("live price strings keep every digit, prefer the cheaper EU unit, and ignore a repair price", () => {
  const spaced = buildCard(
    plan(allenBradley, "new"),
    raw([
      {
        url: "https://www.dosupply.com/automation/allen-bradley-plc/controllogix/1756-L71",
        title: "1756-L71",
        highlights: ["Refurbished Ships Mon $1731 .00 9 in stock"],
      },
    ]),
  );
  assert.match(spaced.estimatedCost, /\$1731\.00/);
  assert.match(spaced.estimatedCost, /Refurbished/);
  assert.equal(/\$731(?!\d)/.test(spaced.estimatedCost), false);

  const european = buildCard(
    plan(siemens, "new"),
    raw([
      {
        url: "https://www.unisgroup.com/products/6av6642-0ba01-1ax1/",
        title: "6AV6642-0BA01-1AX1",
        highlights: [
          "Used Refurbished Warranty 2 year € 890, 00 (€ 1.076, 90 incl. VAT). You can send it to us for repair. € 728, 00",
        ],
      },
      {
        url: "https://shop.example.de/6AV6642-0BA01-1AX1",
        title: "6AV6642-0BA01-1AX1",
        highlights: ["6AV6642-0BA01-1AX1 new €1.290,00 in stock"],
      },
      {
        url: "https://surplusrecord.com/listing/6AV6642-0BA01-1AX1",
        title: "6AV6642-0BA01-1AX1",
        highlights: ["6AV6642-0BA01-1AX1 Precio: $449 USD"],
      },
    ]),
  );
  assert.match(european.estimatedCost, /€1\.290,00/);
  assert.match(european.estimatedCost, /New/);
  assert.equal(european.estimatedCost.includes("728"), false);
  assert.equal(european.estimatedCost.includes("890"), false);
  assert.equal(european.estimatedCost.includes("449"), false);
  assert.equal(european.estimatedCost.includes("1.076"), false);
  assert.match(
    european.claims.find((claim) => claim.label === "Estimated cost")?.sources[0]?.url ?? "",
    /shop\.example\.de/,
  );

  const cheaperEu = buildCard(
    plan(siemens, "used"),
    raw([
      {
        url: "https://www.ebay.com/itm/6AV6642-0BA01-1AX1",
        title: "6AV6642-0BA01-1AX1",
        highlights: ["6AV6642-0BA01-1AX1 used $400"],
      },
      {
        url: "https://shop.example.de/6AV6642-0BA01-1AX1",
        title: "6AV6642-0BA01-1AX1",
        highlights: ["6AV6642-0BA01-1AX1 used 1.100,00 EUR in stock"],
      },
    ]),
  );
  assert.match(cheaperEu.estimatedCost, /1\.100,00 EUR/);
  assert.equal(cheaperEu.estimatedCost.includes("400"), false);

  const krona = buildCard(
    plan(schneider(), "new"),
    raw([
      {
        url: "https://j-automatic.se/produkt/atv320u15n4c/",
        title: "ATV320U15N4",
        highlights: ["ATV320U15N4 5 880 kr inkl. moms"],
      },
    ]),
  );
  assert.match(krona.estimatedCost, /5 880 kr/);
  assert.match(krona.estimatedCost, /SEK|kr/);
});

test("a discount, a stray low figure, and a silent listing are not sold as the unit price", () => {
  const omron: Intake = {
    manufacturer: "Omron",
    partNumber: "NX1P2-1140DT",
    symptom: "NX1P2 ERR LED flashing",
    country: "FI",
    urgency: "emergency",
  };
  const cpu = buildCard(
    plan(omron, "used"),
    raw([
      {
        url: "https://iainventory.com/products/nx1p2-1140dt",
        title: "NX1P2-1140DT",
        highlights: [
          "Save $111.45 New Surplus - $742.93 Refurbished - $646.03 Used - $561.77 Sale price $742.93",
        ],
      },
    ]),
  );
  assert.match(cpu.estimatedCost, /\$561\.77/);
  assert.equal(cpu.estimatedCost.includes("111.45"), false);

  const abb: Intake = {
    manufacturer: "ABB",
    partNumber: "ACS580-01-012A-4",
    symptom: "ACS580 overcurrent",
    country: "FI",
    urgency: "emergency",
  };
  const drive = buildCard(
    plan(abb, "used"),
    raw([
      {
        url: "https://priceofparts.com/part/acs580-01-012a-4/",
        title: "ACS580-01-012A-4",
        highlights: ["ACS580-01-012A-4 used $82.36. Refurbished $1,663.00"],
      },
    ]),
  );
  assert.match(drive.estimatedCost, /\$1,663\.00/);
  assert.equal(drive.estimatedCost.includes("82.36"), false);

  const listed = buildCard(
    plan(schneider(), "used"),
    raw([
      {
        url: "https://j-automatic.se/produkt/atv320u15n4c/",
        title: "ATV320U15N4",
        highlights: ["ATV320U15N4 5 880 kr inkl. moms"],
      },
    ]),
  );
  assert.match(listed.estimatedCost, /^Listed/);
  assert.equal(listed.estimatedCost.startsWith("Used"), false);

  const repair = buildCard(
    plan(omron, "repair"),
    raw([
      {
        url: "https://classicautomation.com/nx1p2-1140dt",
        title: "NX1P2-1140DT",
        highlights: ["NX1P2-1140DT for sale $1,606.00 In stock"],
      },
    ]),
  );
  assert.equal(repair.estimatedCost, "not found");
  assert.equal(repair.leadTime, "not found");

  const related = buildCard(
    plan(abb, "used"),
    raw([
      {
        url: "https://texnite.com/acs580-01-012a-4-never-used-surplus/",
        title: "ACS580-01-012A-4 Never Used Surplus",
        highlights: [
          "ACS580-01-012A-4 Condition: New 7 in stock $2,755.98 Related Products ACS580-01-026A-4 Never Used Surplus $1,374.46",
        ],
      },
    ]),
  );
  assert.match(related.estimatedCost, /\$2,755\.98/);
  assert.match(related.estimatedCost, /^New/);
  assert.equal(related.estimatedCost.includes("1,374.46"), false);

  const surplus = buildCard(
    plan(siemens, "new"),
    raw([
      {
        url: "https://www.s7automation.com/product/siemens-6av6642-0ba01-1ax1-4/",
        title: "SIEMENS 6AV6642-0BA01-1AX1",
        highlights: [
          "6AV6642-0BA01-1AX1 € 863.00 13 in stock. Product Condition: PKX (Surplus in S7Automation package).",
        ],
      },
    ]),
  );
  assert.match(surplus.estimatedCost, /863/);
  assert.match(surplus.estimatedCost, /^Listed/);
  assert.equal(surplus.estimatedCost.startsWith("New"), false);

  const inflated = buildCard(
    plan(siemens, "new"),
    raw([
      {
        url: "https://shop.example.com/6AV6642-0BA01-1AX1",
        title: "6AV6642-0BA01-1AX1",
        highlights: ["6AV6642-0BA01-1AX1 New $780.00 10000 in stock"],
      },
    ]),
  );
  assert.equal(inflated.leadTime, "in stock");
  assert.equal(inflated.leadTime.includes("10000"), false);
});

function schneider(): Intake {
  return {
    manufacturer: "Schneider",
    partNumber: "ATV320U15N4",
    symptom: "Altivar fault code OCF",
    country: "FI",
    urgency: "emergency",
  };
}

test("a new listing stays new, and a generic module range is not this CPU's repair price", () => {
  const fresh = buildCard(
    plan(allenBradley, "new"),
    raw([
      {
        url: "https://www.mroelectric.com/product/1756-L71",
        title: "1756-L71",
        highlights: ["1756-L71 New $1,816.00 Ships Today. Often used in a ControlLogix rack."],
      },
    ]),
  );
  assert.match(fresh.estimatedCost, /New/);
  assert.match(fresh.estimatedCost, /\$1,816\.00/);
  assert.equal(/^Used/.test(fresh.estimatedCost), false);

  const repair = buildCard(
    plan(allenBradley, "repair"),
    raw([
      {
        url: "https://www.controlboardlab.com/parts/1756-l71/",
        title: "1756-L71 Repair",
        highlights: ["1756-L71 processor. Replacement: ~$1,690 sealed surplus. CPUs are test-and-verify."],
      },
      {
        url: "https://www.controlboardlab.com/services/plc-module-repair/",
        title: "PLC Module Repair",
        highlights: ["ControlLogix (1756) modules. Free evaluation, typical repairs $250–$650."],
      },
    ]),
  );
  assert.equal(repair.estimatedCost, "not found");
  assert.equal(
    repair.claims.some((claim) => /250|1,690|1690/.test(claim.value)),
    false,
  );
  assert.equal(repair.sources.length, 2);

  const sale = buildCard(
    plan(siemens, "repair"),
    raw([
      {
        url: "https://eshop.foxon.eu/p/6av6642-0ba01-1ax1-repair-and-sale",
        title: "6AV6642-0BA01-1AX1",
        highlights: ["Sales, Repair, Purchase from 956 EUR excl. VAT. Total in stock: 77 pcs."],
      },
      {
        url: "https://www.controlboardlab.com/parts/6av6642-0ba01-1ax1/",
        title: "6AV6642-0BA01-1AX1 Repair",
        highlights: ["Flat repair price $349 for the 6AV6642-0BA01-1AX1. 3–5 business days in lab."],
      },
    ]),
  );
  assert.match(sale.estimatedCost, /\$349/);
  assert.equal(sale.estimatedCost.includes("956"), false);
  assert.match(sale.leadTime, /3–5 business days/);
});

test("a different order number is not this unit, and a failed path is not the recommendation", () => {
  assert.equal(
    conflictsWithPart("datasheet 6AV6642-0DA01-1AX1", "6AV6642-0BA01-1AX1"),
    true,
  );
  assert.equal(
    conflictsWithPart("https://example.com/1756-L9S/faults", "1756-L71"),
    true,
  );
  assert.equal(conflictsWithPart("manual 1756-L71 and 1756-L72", "1756-L71"), false);
  assert.equal(conflictsWithPart("FX3U-64MT/ESS sales", "FX3U-64MR/ES"), true);
  assert.equal(conflictsWithPart("https://example.com/atv320u15n4c", "ATV320U15N4"), false);
  const terms = familyTerms({
    manufacturer: "Siemens",
    partNumber: "6AV6642-0BA01-1AX1",
    symptom: "TP177B black screen",
  });
  assert.equal(terms.includes("6AV6642"), false);
  assert.ok(terms.includes("TP177B"));

  const cards = [
    buildCard(plan(siemens, "repair"), { error: "Exa rate-limited this search.", results: [] }),
    buildCard(
      plan(siemens, "used"),
      raw([
        {
          url: "https://www.unisgroup.com/products/6av6642-0ba01-1ax1/",
          title: "6AV6642-0BA01-1AX1",
          highlights: ["6AV6642-0BA01-1AX1 used € 890, 00 in stock"],
        },
      ]),
    ),
  ];
  const cited = recommendationFromAnswer(
    {
      recommendedPath: "used",
      reason: "Buy the used panel that is in stock.",
      urgencyNote: "Line down.",
      caveats: [],
    },
    [
      {
        url: "https://mall.industry.siemens.com/teddatasheet/?mlfbs=6AV6642-0DA01-1AX1",
        title: "mall.industry.siemens.com",
      },
      {
        url: "https://www.rockwellautomation.com/docs/1756-l9s/clear-controller-faults.html",
        title: "Clear controller faults",
      },
      {
        url: "https://support.industry.siemens.com/forum/tp177b",
        title: "TP177B backlight dead on 6AV6642-0BA01-1AX1",
      },
    ],
    siemens,
    cards,
  );
  assert.equal(cited.pathId, "used");
  assert.equal(cited.sources.length, 1);
  assert.match(cited.sources[0]?.title ?? "", /6AV6642-0BA01-1AX1/);
  assert.equal(cited.sources.some((source) => source.url.includes("0DA01")), false);
  assert.equal(cited.sources.some((source) => source.url.includes("1756-l9s")), false);

  const recommendation = recommendationFromAnswer(
    {
      recommendedPath: "repair",
      reason: "The unit is obsolete, so send it to a shop.",
      urgencyNote: "Line down.",
      caveats: [],
    },
    [],
    siemens,
    cards,
  );
  assert.equal(recommendation.pathId, "used");
  assert.equal(recommendation.via, "urgency-rule");
  assert.equal(
    recommendation.sources.some((source) => source.url.includes("0DA01")),
    false,
  );
  assert.equal(recommendation.sources.some((source) => source.url.includes("1756-l9s")), false);
  assert.match(recommendation.caveats.join(" "), /discontinuation notice/);
});

test("repair-shop pages leave DIY, and unseen families still match the symptom", () => {
  const plans = buildPathPlans(siemens, now);
  const raws = new Map(plans.map((item) => [item.id, { results: [] as RawHit[] }]));
  raws.set("diy", {
    results: [
      {
        url: "https://www.spea-servis.cz/en/servisujeme/siemens/6av6642-0ba01-1ax1",
        title: "Siemens 6AV6642-0BA01-1AX1 repair",
        highlights: ["Repair service for 6AV6642-0BA01-1AX1."],
      },
      {
        url: "https://support.industry.siemens.com/forum/tp177b",
        title: "TP177B backlight",
        highlights: ["6AV6642-0BA01-1AX1 backlight stays dark."],
      },
    ],
  });
  rehomeRepairHits(plans, raws);
  const diy = buildCard(plan(siemens, "diy"), raws.get("diy") ?? { results: [] });
  const repair = buildCard(plan(siemens, "repair"), raws.get("repair") ?? { results: [] });
  assert.match(diy.sources[0]?.url ?? "", /forum/);
  assert.equal(diy.sources.some((source) => source.url.includes("spea")), false);
  assert.match(repair.sources[0]?.url ?? "", /spea/);

  const schneider: Intake = {
    manufacturer: "Schneider",
    partNumber: "ATV320U15N4",
    symptom: "Altivar fault code OCF at start",
    country: "FI",
    urgency: "emergency",
  };
  const abb: Intake = {
    manufacturer: "ABB",
    partNumber: "ACS580-01-012A-4",
    symptom: "ACS580 drive fault overcurrent at start",
    country: "FI",
    urgency: "emergency",
  };
  const mitsubishi: Intake = {
    manufacturer: "Mitsubishi",
    partNumber: "FX3U-64MR/ES",
    symptom: "FX3U PLC outputs dead",
    country: "FI",
    urgency: "this-week",
  };
  assert.ok(familyTerms(schneider).includes("ATV320"));
  assert.ok(familyTerms(schneider).includes("Altivar"));
  assert.ok(familyTerms(abb).includes("ACS580"));
  assert.ok(familyTerms(mitsubishi).includes("FX3U"));

  const drive = buildCard(
    plan(schneider, "diy"),
    raw([
      {
        url: "https://www.se.com/altivar-320-ocf",
        title: "Altivar 320 OCF",
        highlights: ["ATV320 OCF is an overcurrent fault. Check the motor cable."],
      },
    ]),
  );
  assert.equal(drive.sources.length, 1);
  assert.equal(drive.estimatedCost, "not found");
});

test("the research API accepts a one-sentence query", () => {
  const parsed = parseIntake({
    query: "Omron NX1P2-1140DT ERR LED flashing, Finland, urgent",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.intake.manufacturer, "Omron");
  assert.equal(parsed.intake.partNumber, "NX1P2-1140DT");
  assert.equal(parsed.intake.country, "FI");
  assert.equal(parsed.intake.urgency, "emergency");
  assert.match(parsed.intake.symptom, /ERR LED/);
});
