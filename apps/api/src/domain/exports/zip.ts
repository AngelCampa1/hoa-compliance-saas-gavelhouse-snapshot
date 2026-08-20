/**
 * ZIP builder using client-zip. Workers-safe: no Node.js built-ins.
 */
import { downloadZip } from "client-zip";

export type ZipPart = { name: string; content: Uint8Array | string };

/**
 * Normalize a zip entry name so it cannot escape the archive root (zip-slip).
 * Splits on both separators, drops empty / "." / ".." segments and any drive
 * or leading-slash anchor, and rejoins with "/". Falls back to "file" when
 * nothing safe remains so the archive never contains an unnamed entry.
 */
function sanitizeEntryName(name: string): string {
  const segments = name
    .split(/[/\\]+/)
    .filter((seg) => seg !== "" && seg !== "." && seg !== "..");
  const safe = segments.join("/");
  return safe === "" ? "file" : safe;
}

export async function buildZip(
  parts: ZipPart[],
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();

  const files = parts.map((part) => ({
    name: sanitizeEntryName(part.name),
    input:
      typeof part.content === "string"
        ? encoder.encode(part.content)
        : part.content,
  }));

  const response = downloadZip(files);
  if (!response.body) throw new Error("client-zip returned no body");
  return response.body as ReadableStream<Uint8Array>;
}
