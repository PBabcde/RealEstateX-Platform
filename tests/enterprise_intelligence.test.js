import assert from "node:assert/strict";
import { calculateDealScore } from "../artifacts/api-server/src/lib/deal-score.ts";
import { analyseEnergy } from "../artifacts/api-server/src/lib/energy-analysis.ts";
import { createInvestorReadySheet } from "../artifacts/api-server/src/lib/investor-ready-sheet.ts";
import {
  parseGoogleNewsRss,
  scoreDutchSentiment,
  scoreSentimentSnapshot,
} from "../artifacts/api-server/src/lib/sentiment-engine.ts";
import { hasTrainingQualityGatePassed } from "../artifacts/api-server/src/lib/training-quality-gate.ts";
import {
  aggregateDealSalesActivity,
  aggregateVisitorIntent,
} from "../artifacts/api-server/src/lib/visitor-intelligence.ts";

assert.ok(scoreDutchSentiment("De groei en stijging verbeteren de wijk.") > 0);
assert.ok(scoreDutchSentiment("Daling, crisis en leegstand drukken het gebied.") < 0);

const articles = parseGoogleNewsRss(`
  <rss><channel>
    <item>
      <title><![CDATA[Groei en duurzame verbetering in de wijk]]></title>
      <link>https://news.example/nl/wijk-1</link>
      <description><![CDATA[Nieuwe investeringen en bereikbaarheid verbeteren.]]></description>
      <source>Nieuwsbron A</source>
      <pubDate>Wed, 23 Sep 2026 10:00:00 GMT</pubDate>
      <media:content url="https://images.example/wijk.jpg" />
    </item>
    <item>
      <title>Ongeldige artikel-link</title>
      <link>javascript:alert(1)</link>
    </item>
  </channel></rss>
`);
assert.equal(articles.length, 1, "unsafe article links must be discarded");
assert.equal(articles[0].source, "Nieuwsbron A");
assert.equal(articles[0].imageUrl, "https://images.example/wijk.jpg");

const sampledAt = new Date("2026-09-24T10:00:00.000Z");
const sentiment = scoreSentimentSnapshot("Utrecht", articles, undefined, sampledAt);
assert.equal(sentiment.articleCount, 1);
assert.equal(sentiment.confidence, 15);
assert.ok(sentiment.gutFeelingScore > 50);
assert.equal(sentiment.sampledAt, sampledAt.toISOString());
assert.ok(sentiment.narrativeSummary.includes("Nieuwsbron A"));
assert.equal(
  scoreSentimentSnapshot("Utrecht", [], undefined, sampledAt).confidence,
  0,
  "an empty feed must not claim confidence",
);

assert.equal(hasTrainingQualityGatePassed(80), true);
assert.equal(hasTrainingQualityGatePassed(79.99), false);
assert.equal(hasTrainingQualityGatePassed(Number.NaN), false);
assert.equal(hasTrainingQualityGatePassed(100.01), false);

const now = new Date("2026-09-24T12:00:00.000Z");
const event = (eventId, visitorId, eventType, occurredAt, extra = {}) => ({
  eventId,
  visitorId,
  eventType,
  occurredAt,
  consent: true,
  ...extra,
});
const visitorEvents = [
  event("1", "visitor-a", "DEAL_VIEW", "2026-09-24T11:00:00.000Z", {
    dealId: "deal-a",
    investorId: "investor-a",
  }),
  event("2", "visitor-a", "ROI_CALCULATOR", "2026-09-24T11:05:00.000Z", {
    dealId: "deal-a",
    investorId: "investor-a",
  }),
  event("3", "visitor-a", "SUBSIDY_CALCULATOR", "2026-09-24T11:10:00.000Z", {
    dealId: "deal-a",
  }),
  event("4", "visitor-a", "PDF_DOWNLOAD", "2026-09-24T11:15:00.000Z", {
    dealId: "deal-a",
  }),
  event("5", "visitor-b", "DEAL_VIEW", "2026-09-24T11:20:00.000Z", {
    dealId: "deal-a",
  }),
  {
    ...event("6", "visitor-c", "PDF_DOWNLOAD", "2026-09-24T11:25:00.000Z"),
    consent: false,
  },
];
const summary = aggregateVisitorIntent(visitorEvents, { now, windowDays: 30 });
assert.equal(summary.eventsCount, 5, "events without consent must be excluded");
assert.equal(summary.uniqueVisitors, 2);
assert.equal(summary.uniqueInvestors, 1, "anonymous visitors must not count as investors");
assert.equal(summary.leads[0].visitorId, "visitor-a");
assert.equal(summary.leads[0].score, 90);
assert.equal(summary.leads[0].intentLevel, "HIGH");

const activity = aggregateDealSalesActivity("deal-a", visitorEvents, {
  now,
  windowHours: 24,
});
assert.equal(activity.uniqueVisitors, 2);
assert.equal(activity.uniqueInvestors, 1);
assert.equal(activity.dealViews, 2);
assert.equal(activity.pdfDownloads, 1);
assert.equal(activity.urgencyLevel, "MEDIUM");
assert.ok(activity.investorViewText.includes("1 investeerder"));

const scoreInput = {
  askingPrice: 300_000,
  renovationCost: 50_000,
  expectedValue: 400_000,
  monthlyRent: 1_500,
  energyScore: 70,
  subsidyAmount: 10_000,
};
const legacyScore = calculateDealScore(scoreInput);
const noConfidenceScore = calculateDealScore({
  ...scoreInput,
  gutFeelingScore: 100,
  gutFeelingConfidence: 0,
});
assert.equal(
  legacyScore.totalScore,
  noConfidenceScore.totalScore,
  "a zero-confidence news signal must preserve the legacy objective score",
);
const confidentScore = calculateDealScore({
  ...scoreInput,
  gutFeelingScore: 100,
  gutFeelingConfidence: 100,
});
assert.ok(confidentScore.gutFeelingContribution > 0);
assert.equal(confidentScore.gutFeelingConfidence, 100);

const pdfDeal = {
  dealId: "deal-pdf-test",
  propertyId: "property-pdf-test",
  title: "Utrecht renovation opportunity",
  region: "Utrecht",
  propertyType: "Appartement",
  energyLabel: "C",
  woonoppervlak: 85,
  askingPrice: scoreInput.askingPrice,
  renovationCost: scoreInput.renovationCost,
  expectedValue: scoreInput.expectedValue,
  monthlyRent: scoreInput.monthlyRent,
  status: "GO",
  ownerId: "owner-test",
  score: confidentScore,
  gutFeeling: {
    score: 100,
    confidence: 100,
    summary: "Real news sources report neighborhood improvement.",
    sourceCount: 4,
    region: "Utrecht",
    observedAt: "2026-09-24T10:00:00.000Z",
    staleAt: "2026-09-24T16:00:00.000Z",
  },
  createdAt: "2026-09-24T09:00:00.000Z",
  updatedAt: "2026-09-24T10:00:00.000Z",
};
const energy = analyseEnergy({
  energyLabel: pdfDeal.energyLabel,
  woonoppervlak: pdfDeal.woonoppervlak,
  renovationCost: pdfDeal.renovationCost,
  expectedValue: pdfDeal.expectedValue,
});
const pdf = createInvestorReadySheet({
  deal: pdfDeal,
  energy,
  subsidies: [],
}).toString("utf8");
assert.ok(pdf.includes("Gut Feeling: 100/100"));
assert.ok(pdf.includes("Gut Feeling vertrouwen: 100%"));
assert.ok(pdf.includes(`+${confidentScore.gutFeelingContribution} punten`));
assert.ok(pdf.includes("Nieuwsbronnen: 4"));
assert.ok(pdf.includes(pdfDeal.gutFeeling.observedAt));
assert.ok(pdf.includes(pdfDeal.gutFeeling.staleAt));
const legacyPdf = createInvestorReadySheet({
  deal: { ...pdfDeal, gutFeeling: undefined },
  energy,
  subsidies: [],
}).toString("utf8");
assert.ok(legacyPdf.includes("geen recent sentimentsignaal"));

console.log("Enterprise intelligence and server-side quality-gate checks passed.");