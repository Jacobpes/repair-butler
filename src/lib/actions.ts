import { countryName } from "@/lib/countries";
import type { Intake, PathCard, PreparedAction, Source } from "@/lib/types";
import { clip, isNotFound } from "@/lib/text";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BLOCKED_HOSTS = ["example.com", "example.org", "sentry.io", "wixpress.com", "schema.org"];
const MAX_MAIL_BODY = 1400;

const URGENCY_LINE: Record<Intake["urgency"], string> = {
  emergency: "Line down",
  "this-week": "Needed this week",
  planned: "Planned stop",
};

export function findPublishedEmail(
  sources: Source[],
): { email: string; source: Source } | null {
  for (const source of sources) {
    const haystack = `${source.highlight ?? ""} ${source.summary ?? ""} ${source.title}`;
    const matches = haystack.match(EMAIL_RE) ?? [];
    for (const email of matches) {
      const host = email.split("@")[1]?.toLowerCase() ?? "";
      if (!host || BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) {
        continue;
      }
      if (host.endsWith(".png") || host.endsWith(".jpg") || host.endsWith(".webp")) continue;
      return { email, source };
    }
  }
  return null;
}

function sourcedLines(card: PathCard): string[] {
  return card.claims
    .filter((claim) => !isNotFound(claim.value) && claim.sources.length > 0)
    .map((claim) => {
      const source = claim.sources[0];
      return `- ${claim.label}: ${claim.value} (${source?.title ?? "source"} — ${source?.url ?? ""})`;
    });
}

function mailto(recipient: string, subject: string, body: string): string {
  const params = new URLSearchParams({ subject, body });
  return `mailto:${recipient}?${params.toString()}`;
}

export function buildAction(card: PathCard, intake: Intake): PreparedAction {
  const place = countryName(intake.country);
  const identity = `${intake.manufacturer} ${intake.partNumber}`;
  const facts = sourcedLines(card);
  const published = findPublishedEmail(card.sources);
  const links = card.sources.slice(0, 6);
  const factBlock = facts.length
    ? facts.join("\n")
    : "- No sourced price, lead time, or finding was returned for this path.";

  if (card.id === "used" || card.id === "new") {
    const steps = [
      `Confirm the listing is exactly ${intake.partNumber}, not a nearby family member.`,
      "Check condition, warranty, return window, and whether the unit was tested under load.",
      "Compare any price on the card with the figure on the listing before paying.",
      "Ask for a nameplate photo and a test report if the listing does not show them.",
      "Nothing has been purchased. Open the listing yourself.",
    ];
    const linkLines = links.length
      ? links.map((source) => `- ${source.title}: ${source.url}`).join("\n")
      : "- No listing URL was returned.";
    const full = [
      `Purchase checklist: ${identity}`,
      `Symptom: ${intake.symptom}`,
      `Ship to: ${place}`,
      `Urgency: ${URGENCY_LINE[intake.urgency]}`,
      "",
      "Sourced findings:",
      factBlock,
      "",
      "Listings:",
      linkLines,
      "",
      "Before paying:",
      ...steps.map((step) => `- ${step}`),
    ].join("\n");
    const body = clip(full, 4000);
    return {
      kind: "checklist",
      title: card.id === "used" ? "Purchase checklist" : "New-unit checklist",
      intro:
        "Review the listings yourself. Repair Butler does not add anything to a cart and does not send this anywhere.",
      recipient: "",
      recipientLabel: "No vendor email — open the listing",
      subject: `${card.id === "used" ? "Used" : "New"} ${identity}`,
      body,
      mailto: mailto("", `${card.title}: ${identity}`, clip(full, MAX_MAIL_BODY)),
      steps,
      links,
      clipped: body.length < full.length,
    };
  }

  const subject =
    card.id === "obsolete"
      ? `Replacement inquiry: ${identity}`
      : card.id === "diy"
        ? `Parts check: ${identity}`
        : `Repair inquiry: ${identity}`;
  const ask =
    card.id === "obsolete"
      ? "Please confirm whether this part is discontinued and which successor you supply, including any migration notes and lead time."
      : card.id === "diy"
        ? "Please confirm whether you can supply the parts for this failure, with price and lead time."
        : "Please confirm whether you repair this model, the price range, the turnaround, and the return shipping address.";
  const full = [
    "Hello,",
    "",
    "We have a faulty unit and would like your advice. This draft has not been sent.",
    "",
    `Manufacturer: ${intake.manufacturer}`,
    `Part number: ${intake.partNumber}`,
    `Symptom: ${intake.symptom}`,
    `Country: ${place}`,
    `Urgency: ${URGENCY_LINE[intake.urgency]}`,
    intake.notes ? `Note: ${intake.notes}` : "",
    "",
    "What a live search already sourced:",
    factBlock,
    "",
    ask,
    "",
    "A technician using Repair Butler will review this and send it themselves.",
  ]
    .filter((line) => line !== "")
    .join("\n");
  const body = clip(full, MAX_MAIL_BODY);

  return {
    kind: "email",
    title: card.id === "obsolete" ? "Replacement inquiry" : "Repair inquiry",
    intro: published
      ? `A published address was found on “${published.source.title}”. Check it before you send.`
      : "No published address was found. Paste the vendor email into your mail app. Nothing is sent from here.",
    recipient: published?.email ?? "",
    recipientLabel: published
      ? published.email
      : "No published address — you choose the recipient",
    subject,
    body,
    mailto: mailto(published?.email ?? "", subject, body),
    steps: [
      "Read the draft and delete anything you cannot stand behind.",
      "Paste the vendor address if the search did not find a published one.",
      "Attach the nameplate photo from this device if you have one.",
      "Send it yourself. Repair Butler does not send email.",
    ],
    links,
    clipped: full.length > MAX_MAIL_BODY,
  };
}
