export interface LinkedInReviewPost {
  id?: string;
  content: string;
  attachments?: unknown[];
  metadata?: Record<string, unknown>;
  source?: string;
}

export interface LinkedInReviewResult {
  id: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function normalizeLinkedInContent(value: string): string;
export function reviewLinkedInPost(post: LinkedInReviewPost): LinkedInReviewResult;
export function assertLinkedInPostsReviewed(posts: LinkedInReviewPost[]): { warnings: string[] };
