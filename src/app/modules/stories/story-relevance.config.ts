export type RelevanceField = "title" | "content" | "tags";

export type RelevanceKeywordRule = {
  id: string;
  terms: readonly string[];
  weight: number;
  fields: readonly RelevanceField[];
};

export type HardRejectRule = {
  id: string;
  terms: readonly string[];
  fields: readonly RelevanceField[];
};

export type StoryRelevanceConfig = {
  baseScore: number;
  readyScore: number;
  reviewScore: number;
  sourcePriorityMaxBonus: number;
  fieldMultipliers: Record<RelevanceField, number>;
  recencyBonuses: readonly {
    maxAgeHours: number;
    score: number;
  }[];
  sourceWeights: Readonly<Record<string, number>>;
  positive: readonly RelevanceKeywordRule[];
  negative: readonly RelevanceKeywordRule[];
  hardReject: readonly HardRejectRule[];
};

export type StoryKeywordPreferences = {
  favoredTerms: string[];
  unfavoredTerms: string[];
};

export const DEFAULT_STORY_KEYWORD_PREFERENCES: StoryKeywordPreferences = {
  favoredTerms: [
    "canada",
    "canadian",
    "toronto",
    "ontario",
    "quebec",
    "vancouver",
  ],
  unfavoredTerms: ["india"],
};

export const FAVORED_TERM_WEIGHT = 15;
export const UNFAVORED_TERM_WEIGHT = -15;

// This is deliberately code-owned for the first phase: changes are reviewed,
// versioned and deterministic. It can move to an admin table later.
export const storyRelevanceConfig: StoryRelevanceConfig = {
  baseScore: 8,
  readyScore: 50,
  reviewScore: 25,
  // Topic source priority is a candidacy signal, not an automatic approval.
  // Even priority 100 contributes only 40 points, leaving the content and
  // recency signals responsible for crossing the ready threshold.
  sourcePriorityMaxBonus: 40,
  fieldMultipliers: {
    title: 2,
    content: 1,
    tags: 0.25,
  },
  recencyBonuses: [
    { maxAgeHours: 24, score: 8 },
    { maxAgeHours: 72, score: 4 },
  ],
  sourceWeights: {
    "openai-news": 8,
    "google-ai": 6,
    "microsoft-ai": 6,
    "nvidia-ai": 6,
    "google-deepmind": 8,
    "github-copilot": 5,
  },
  positive: [
    {
      id: "agents",
      terms: [
        "ai agent",
        "ai agents",
        "agentic ai",
        "autonomous agent",
        "autonomous agents",
      ],
      weight: 22,
      fields: ["title", "content", "tags"],
    },
    {
      id: "generative-models",
      terms: [
        "generative ai",
        "large language model",
        "large language models",
        "llm",
        "llms",
        "multimodal",
        "foundation model",
        "foundation models",
      ],
      weight: 18,
      fields: ["title", "content", "tags"],
    },
    {
      id: "major-ai-products",
      terms: [
        "openai",
        "chatgpt",
        "gemini",
        "deepmind",
        "claude",
        "anthropic",
        "copilot",
        "mistral",
        "llama",
        "perplexity",
        "grok",
        "groq",
        "cursor",
        "openrouter",
        "nvidia",
      ],
      weight: 16,
      fields: ["title", "content"],
    },
    {
      id: "explicit-ai-topic",
      terms: ["ai", "artificial intelligence"],
      weight: 10,
      fields: ["title"],
    },
    {
      id: "product-change",
      terms: [
        "launch",
        "launched",
        "release",
        "released",
        "introduces",
        "introduced",
        "announces",
        "announced",
        "new model",
        "product update",
      ],
      weight: 10,
      fields: ["title"],
    },
    {
      id: "automation-productivity",
      terms: [
        "automation",
        "automate",
        "workflow",
        "workflows",
        "productivity",
      ],
      weight: 12,
      fields: ["title", "content", "tags"],
    },
    {
      id: "developer-tools",
      terms: [
        "developer",
        "developers",
        "coding",
        "code generation",
        "api",
        "sdk",
      ],
      weight: 10,
      fields: ["title", "content", "tags"],
    },
    {
      id: "enterprise-adoption",
      terms: [
        "enterprise ai",
        "enterprise automation",
        "business ai",
        "ai adoption",
      ],
      weight: 9,
      fields: ["title", "content"],
    },
    {
      id: "research-safety",
      terms: [
        "ai research",
        "model research",
        "ai safety",
        "alignment",
        "reasoning model",
      ],
      weight: 9,
      fields: ["title", "content", "tags"],
    },
  ],
  negative: [
    {
      id: "events",
      terms: ["webinar", "conference ticket", "event registration"],
      weight: -15,
      fields: ["title", "content"],
    },
    {
      id: "careers",
      terms: ["job opening", "job openings", "we are hiring", "apply now"],
      weight: -30,
      fields: ["title", "content"],
    },
    {
      id: "financial-noise",
      terms: [
        "earnings call",
        "stock price",
        "investor relations",
        "annualized revenue",
        "funding round",
        "valuation",
        "raises",
        "acquisition",
        "acquire",
      ],
      weight: -8,
      fields: ["title"],
    },
    {
      id: "promotional",
      terms: ["discount code", "limited time offer", "buy now"],
      weight: -30,
      fields: ["title", "content"],
    },
    {
      id: "marketing-operations",
      terms: [
        "conversion tracking",
        "drip marketing",
        "email marketing",
        "social media marketing",
      ],
      weight: -15,
      fields: ["title", "content"],
    },
  ],
  hardReject: [
    {
      id: "sponsored",
      terms: ["sponsored post", "sponsored content", "paid promotion"],
      fields: ["title", "content"],
    },
    {
      id: "low-value-promotion",
      terms: ["coupon code", "casino bonus", "giveaway winner"],
      fields: ["title", "content"],
    },
  ],
};
