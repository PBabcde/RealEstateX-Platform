export const GOOGLE_NEWS_NL_RSS_URL =
  "https://news.google.com/rss?hl=nl&gl=NL&ceid=NL:nl";

export interface SentimentArticle {
  articleId: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  summary: string;
  sentimentScore: number;
  topics: string[];
  imageUrl: string | null;
}

export interface NeighborhoodTrend {
  topic: string;
  articleCount: number;
  deltaPercent: number;
  direction: "RISING" | "STABLE" | "COOLING" | "NEW";
}

export interface NeighborhoodSentimentSnapshot {
  snapshotId: string;
  region: string;
  sentimentScore: number;
  gutFeelingScore: number;
  confidence: number;
  articleCount: number;
  sampledAt: string;
  staleAt: string;
  source: string;
  narrativeTitle: string;
  narrativeSummary: string;
  scoreExplanation: string;
  articles: SentimentArticle[];
  trends: NeighborhoodTrend[];
}

export interface PreviousSentimentSnapshot {
  trends: NeighborhoodTrend[];
}

const POSITIVE_WORDS = [
  "groei", "groeit", "groeiende", "stijging", "stijgt", "verbetering",
  "verbeterd", "succes", "succesvol", "investering", "investeringen",
  "nieuw", "nieuwe", "duurzaam", "verduurzaming", "bloei", "kans",
  "kansen", "veilig", "veiligheid", "bereikbaar", "werkgelegenheid",
];
const NEGATIVE_WORDS = [
  "daling", "daalt", "krimp", "krimpt", "verlies", "problemen",
  "probleem", "crisis", "onveilig", "onveiligheid", "overlast", "tekort",
  "tekorten", "duurder", "stijgende kosten", "vertraging", "vervuiling",
  "leegstand", "protest", "bezwaar",
];
const TOPICS: ReadonlyArray<[string, string[]]> = [
  ["woningmarkt", ["woning", "huizen", "huis", "vastgoed", "bouw"]],
  ["bereikbaarheid", ["ov", "trein", "metro", "bus", "verkeer", "weg"]],
  ["duurzaamheid", ["duurzaam", "energie", "isolatie", "klimaat", "warmte"]],
  ["veiligheid", ["veilig", "politie", "criminaliteit", "overlast"]],
  ["economie", ["bedrijf", "werk", "economie", "investering", "ondernemer"]],
];

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function tagValue(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function attributeValue(xml: string, tag: string, attribute: string): string {
  const match = xml.match(
    new RegExp(`<${tag}\\b[^>]*\\b${attribute}=["']([^"']+)["']`, "i"),
  );
  return match ? decodeXml(match[1]) : "";
}

function validArticleUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function scoreDutchSentiment(text: string): number {
  const normalized = text.toLocaleLowerCase("nl-NL");
  const positive = POSITIVE_WORDS.reduce(
    (count, word) => count + (normalized.includes(word) ? 1 : 0),
    0,
  );
  const negative = NEGATIVE_WORDS.reduce(
    (count, word) => count + (normalized.includes(word) ? 1 : 0),
    0,
  );
  return Number(clamp((positive - negative) / 4, -1, 1).toFixed(3));
}

export function parseGoogleNewsRss(xml: string): SentimentArticle[] {
  const articles: SentimentArticle[] = [];
  for (const item of xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []) {
    const title = tagValue(item, "title");
    const url = tagValue(item, "link");
    if (!title || !validArticleUrl(url)) continue;
    const summary = tagValue(item, "description");
    const source = tagValue(item, "source") || "Google News";
    const publishedAtRaw = tagValue(item, "pubDate");
    const publishedAt =
      publishedAtRaw && !Number.isNaN(Date.parse(publishedAtRaw))
        ? new Date(publishedAtRaw).toISOString()
        : null;
    const imageUrl = attributeValue(item, "media:content", "url") ||
      attributeValue(item, "enclosure", "url");
    const text = `${title} ${summary}`;
    const topics = TOPICS.filter(([, words]) =>
      words.some((word) => text.toLocaleLowerCase("nl-NL").includes(word)),
    ).map(([topic]) => topic);
    articles.push({
      articleId: url,
      title,
      url,
      source,
      publishedAt,
      summary,
      sentimentScore: scoreDutchSentiment(text),
      topics,
      imageUrl: imageUrl && validArticleUrl(imageUrl) ? imageUrl : null,
    });
  }
  return articles;
}

export function scoreSentimentSnapshot(
  region: string,
  articles: SentimentArticle[],
  previous?: PreviousSentimentSnapshot,
  now = new Date(),
): NeighborhoodSentimentSnapshot {
  const sentimentScore = articles.length
    ? Number(
        (articles.reduce((sum, article) => sum + article.sentimentScore, 0) /
          articles.length).toFixed(3),
      )
    : 0;
  const gutFeelingScore = Math.round(50 + sentimentScore * 50);
  const confidence = Math.round(clamp(articles.length * 15, 0, 100));
  const counts = new Map<string, number>();
  for (const article of articles) {
    for (const topic of article.topics) counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }
  const previousCounts = new Map(
    (previous?.trends ?? []).map((trend) => [trend.topic, trend.articleCount]),
  );
  const trends = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(
    ([topic, articleCount]) => {
      const old = previousCounts.get(topic) ?? 0;
      const deltaPercent = old ? Number((((articleCount - old) / old) * 100).toFixed(1)) : 0;
      return {
        topic,
        articleCount,
        deltaPercent,
        direction: old === 0 ? "NEW" : deltaPercent > 10 ? "RISING" : deltaPercent < -10 ? "COOLING" : "STABLE",
      } satisfies NeighborhoodTrend;
    },
  );
  const sampledAt = now.toISOString();
  const staleAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
  const narrativeTitle = articles.length ? `Nieuwsbeeld ${region}` : `Geen recent nieuws over ${region}`;
  const narrativeSummary = articles.length
    ? `${articles.length} bron${articles.length === 1 ? "" : "nen"} van ${[...new Set(articles.map((article) => article.source))].join(", ")} geven een ${sentimentScore >= 0.15 ? "overwegend positief" : sentimentScore <= -0.15 ? "overwegend negatief" : "gemengd"} beeld.`
    : `Er zijn geen valide artikelen gevonden; er wordt geen verhaal of trend ingevuld.`;
  return {
    snapshotId: `news-${region.toLocaleLowerCase("nl-NL").replace(/[^a-z0-9]+/g, "-")}-${sampledAt}`,
    region,
    sentimentScore,
    gutFeelingScore,
    confidence,
    articleCount: articles.length,
    sampledAt,
    staleAt,
    source: "Google News NL RSS",
    narrativeTitle,
    narrativeSummary,
    scoreExplanation: `Gut Feeling is gebaseerd op ${articles.length} valide artikel${articles.length === 1 ? "" : "en"} en heeft ${confidence}% vertrouwen.`,
    articles,
    trends,
  };
}

export async function fetchNeighborhoodSentiment(
  region: string,
  options: { timeoutMs?: number; previous?: PreviousSentimentSnapshot } = {},
): Promise<NeighborhoodSentimentSnapshot> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  try {
    const query = encodeURIComponent(region.trim());
    const response = await fetch(`${GOOGLE_NEWS_NL_RSS_URL}&q=${query}`, {
      signal: controller.signal,
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
    });
    if (!response.ok) throw new Error(`Google News RSS returned HTTP ${response.status}.`);
    return scoreSentimentSnapshot(
      region,
      parseGoogleNewsRss(await response.text()),
      options.previous,
    );
  } catch (error) {
    throw new Error(`Neighborhood news fetch failed: ${error instanceof Error ? error.message : "unknown error"}`);
  } finally {
    clearTimeout(timeout);
  }
}