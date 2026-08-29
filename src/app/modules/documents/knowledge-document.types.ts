export type KnowledgeDocumentType =
  | "guideline"
  | "report"
  | "study"
  | "manual"
  | "other";

export type KnowledgeIngestionStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export type KnowledgeIngestionStage =
  | "queued"
  | "fetching"
  | "extracting"
  | "persisting"
  | "completed"
  | "failed";

export type CreateKnowledgeDocumentInput = {
  url: string;
  documentType?: KnowledgeDocumentType;
  language?: string;
  publisher?: string;
  tags?: readonly string[];
  priority?: number;
};

export type ExtractedPdfPage = {
  pageNumber: number;
  printedPageNumber?: number;
  text: string;
};

export type PdfOutlineEntry = {
  title: string;
  pageNumber: number;
  level: number;
  /** Full outline ancestry, including this entry, for editorial context. */
  path?: string[];
};

export type ExtractedKnowledgeSection = {
  ordinal: number;
  heading: string;
  pageStart: number;
  pageEnd: number;
  printedPageStart?: number;
  printedPageEnd?: number;
  text: string;
  textHash: string;
  characterCount: number;
};

export type ExtractedPdfDocument = {
  title: string;
  author?: string;
  subject?: string;
  pageCount: number;
  sections: ExtractedKnowledgeSection[];
};

export type KnowledgeDocumentSummary = {
  topicDocumentId: string;
  documentId: string;
  canonicalUrl: string;
  documentType: KnowledgeDocumentType;
  language: string;
  publisher?: string;
  enabled: boolean;
  tags: string[];
  priority: number;
  createdAt: string;
  latestVersion?: {
    id: string;
    title: string;
    pageCount: number;
    sectionCount: number;
    extractedAt: string;
  };
  latestRun?: {
    id: string;
    status: KnowledgeIngestionStatus;
    stage: KnowledgeIngestionStage;
    pagesProcessed: number;
    pagesTotal?: number;
    error?: string;
    startedAt: string;
    finishedAt?: string;
    updatedAt: string;
  };
};

export class KnowledgeDocumentValidationError extends Error {}
export class KnowledgeDocumentNotFoundError extends Error {}
export class KnowledgeDocumentFetchError extends Error {}
export class KnowledgeDocumentExtractionError extends Error {}
