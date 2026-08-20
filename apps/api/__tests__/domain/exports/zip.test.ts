import { describe, it, expect, vi } from "vitest";
import { buildZip } from "../../../src/domain/exports/zip";

vi.mock("client-zip", async (importOriginal) => {
  const original = await importOriginal<typeof import("client-zip")>();
  return { ...original };
});

async function collectStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function findFilenameInZip(bytes: Uint8Array, filename: string): boolean {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(filename);
  outer: for (let i = 0; i <= bytes.length - nameBytes.length; i++) {
    for (let j = 0; j < nameBytes.length; j++) {
      if (bytes[i + j] !== nameBytes[j]) continue outer;
    }
    return true;
  }
  return false;
}

describe("buildZip", () => {
  it("returns a ReadableStream", async () => {
    const stream = await buildZip([
      { name: "hello.txt", content: "hello world" },
    ]);
    expect(stream).toBeInstanceOf(ReadableStream);
  });

  it("produces bytes that start with the PK magic bytes (0x50 0x4B)", async () => {
    const stream = await buildZip([{ name: "a.txt", content: "aaa" }]);
    const bytes = await collectStream(stream);
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
  });

  it("includes both file names in the raw ZIP bytes when given two parts", async () => {
    const stream = await buildZip([
      { name: "report.csv", content: "col1,col2\r\nval1,val2" },
      { name: "summary.txt", content: "Summary text" },
    ]);
    const bytes = await collectStream(stream);

    expect(findFilenameInZip(bytes, "report.csv")).toBe(true);
    expect(findFilenameInZip(bytes, "summary.txt")).toBe(true);
  });

  it("accepts Uint8Array content as well as string content", async () => {
    const encoder = new TextEncoder();
    const stream = await buildZip([
      { name: "binary.bin", content: encoder.encode("binary data") },
    ]);
    const bytes = await collectStream(stream);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  it("sanitizes path-traversal entry names so a zip entry cannot escape its directory", async () => {
    // ZipPart.name has no caller-side contract, so a future caller passing a
    // user-derived name must not be able to write entries outside the archive
    // root (zip-slip). Leading slashes and ".." segments must be stripped.
    const stream = await buildZip([
      { name: "../../etc/passwd", content: "x" },
      { name: "/abs.txt", content: "y" },
    ]);
    const bytes = await collectStream(stream);
    // The dangerous prefixes must not survive into the archive.
    expect(findFilenameInZip(bytes, "../")).toBe(false);
    expect(findFilenameInZip(bytes, "/abs.txt")).toBe(false);
    // The safe remainder is preserved.
    expect(findFilenameInZip(bytes, "etc/passwd")).toBe(true);
    expect(findFilenameInZip(bytes, "abs.txt")).toBe(true);
  });

  it("falls back to a safe name when sanitization leaves nothing", async () => {
    const stream = await buildZip([{ name: "../..", content: "z" }]);
    const bytes = await collectStream(stream);
    expect(findFilenameInZip(bytes, "..")).toBe(false);
    expect(findFilenameInZip(bytes, "file")).toBe(true);
  });

  it("throws if client-zip returns no body", async () => {
    const clientZip = await import("client-zip");
    vi.spyOn(clientZip, "downloadZip").mockReturnValueOnce({
      body: null,
    } as unknown as Response);
    await expect(buildZip([{ name: "x.txt", content: "x" }])).rejects.toThrow(
      "client-zip returned no body",
    );
    vi.restoreAllMocks();
  });
});
