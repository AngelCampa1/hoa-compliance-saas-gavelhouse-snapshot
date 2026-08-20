type PostizEntry = {
  id?: string;
  file?: string;
  scheduledAt: string;
};

type UploadOptions = {
  args?: string[];
  env?: Record<string, string | undefined>;
  root?: string;
  manifestPath?: string;
  readFile?: (path: string, encoding?: BufferEncoding) => string;
  writeFile?: (path: string, data: string, encoding?: BufferEncoding) => void;
  exists?: (path: string) => boolean;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<unknown> | unknown;
  now?: () => Date;
  log?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  exit?: (code?: number | string | null) => void;
};

export function getFlag(args: string[], name: string): string | null;
export function getApiKey(options: {
  args: string[];
  env: Record<string, string | undefined>;
  credentialsFile?: string;
  exists?: (path: string) => boolean;
  readFile?: (path: string, encoding?: BufferEncoding) => string;
}): string | null;
export function getIntegrationId(
  args: string[],
  env: Record<string, string | undefined>,
): string | null;
export function filterPosts<T extends PostizEntry>(
  posts: T[],
  fromDate: string | null,
): T[];
export function receiptPath(filePath: string, root?: string): string;
export function isUploaded(
  filePath: string,
  root?: string,
  exists?: (path: string) => boolean,
): boolean;
export function readPostBody(
  filePath: string,
  root?: string,
  readFile?: (path: string, encoding?: BufferEncoding) => string,
): string;
export function writeReceipt(
  filePath: string,
  data: unknown,
  root?: string,
  writeFile?: (path: string, data: string, encoding?: BufferEncoding) => void,
): void;
export function formatDuration(ms: number): string;
export function createPostizPayload(
  integrationId: string,
  entry: PostizEntry,
  body: string,
): unknown;
export function extractPostizId(result: unknown): string | null;
export function nextDelayAfterSuccess(currentDelay: number): number;
export function nextDelayAfterRateLimit(
  currentDelay: number,
  retryAfterSeconds: number,
): number;
export function postToPostiz(options: {
  apiKey: string;
  integrationId: string;
  entry: PostizEntry;
  body: string;
  fetchImpl?: typeof fetch;
}): Promise<unknown>;
export function runUpload(options?: UploadOptions): Promise<void>;
