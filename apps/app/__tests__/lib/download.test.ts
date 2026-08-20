import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { triggerBrowserDownload } from "../../src/lib/download";

describe("triggerBrowserDownload", () => {
  describe("Test A — call order with synchronous scheduleCleanup", () => {
    it("appends, clicks, removes, then revokes in order", () => {
      const order: string[] = [];

      const objectUrl = "blob:http://localhost/test-url";
      const urlApi = {
        createObjectURL: vi.fn().mockReturnValue(objectUrl),
        revokeObjectURL: vi.fn().mockImplementation(() => {
          order.push("revoke");
        }),
      };

      const anchor = document.createElement("a");
      vi.spyOn(anchor, "click").mockImplementation(() => {
        order.push("click");
      });

      const appendChildSpy = vi
        .spyOn(document.body, "appendChild")
        .mockImplementation((node) => {
          order.push("append");
          return node;
        });
      const removeChildSpy = vi
        .spyOn(document.body, "removeChild")
        .mockImplementation((node) => {
          order.push("remove");
          return node;
        });

      vi.spyOn(document, "createElement").mockReturnValueOnce(
        anchor as unknown as HTMLElement,
      );

      const blob = new Blob(["test"], { type: "text/plain" });
      const filename = "test-file.txt";

      triggerBrowserDownload(
        { blob, filename },
        {
          doc: document,
          urlApi,
          scheduleCleanup: (cb) => cb(),
        },
      );

      expect(order).toEqual(["append", "click", "remove", "revoke"]);
      expect(anchor.download).toBe(filename);
      expect(anchor.href).toBe(objectUrl);
      expect(anchor.style.display).toBe("none");

      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });
  });

  describe("Test B — cleanup is deferred by default (uses setTimeout)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not remove or revoke before timers run, does after", () => {
      const objectUrl = "blob:http://localhost/deferred-url";
      const urlApi = {
        createObjectURL: vi.fn().mockReturnValue(objectUrl),
        revokeObjectURL: vi.fn(),
      };

      const anchor = document.createElement("a");
      vi.spyOn(anchor, "click").mockImplementation(() => {});

      const appendChildSpy = vi
        .spyOn(document.body, "appendChild")
        .mockImplementation((node) => node);
      const removeChildSpy = vi
        .spyOn(document.body, "removeChild")
        .mockImplementation((node) => node);

      vi.spyOn(document, "createElement").mockReturnValueOnce(
        anchor as unknown as HTMLElement,
      );

      const blob = new Blob(["data"], { type: "text/plain" });

      triggerBrowserDownload(
        { blob, filename: "deferred.txt" },
        { doc: document, urlApi },
      );

      // Before timers fire: should NOT have removed or revoked
      expect(removeChildSpy).not.toHaveBeenCalled();
      expect(urlApi.revokeObjectURL).not.toHaveBeenCalled();
      // But append should have happened
      expect(appendChildSpy).toHaveBeenCalledWith(anchor);

      vi.runAllTimers();

      // After timers fire: should have cleaned up
      expect(removeChildSpy).toHaveBeenCalledWith(anchor);
      expect(urlApi.revokeObjectURL).toHaveBeenCalledWith(objectUrl);

      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });
  });

  describe("Test C — createObjectURL receives the blob, revokeObjectURL receives the url", () => {
    it("passes the blob to createObjectURL and the returned url to revokeObjectURL", () => {
      const objectUrl = "blob:http://localhost/abc-123";
      const urlApi = {
        createObjectURL: vi.fn().mockReturnValue(objectUrl),
        revokeObjectURL: vi.fn(),
      };

      const anchor = document.createElement("a");
      vi.spyOn(anchor, "click").mockImplementation(() => {});

      const appendChildSpy = vi
        .spyOn(document.body, "appendChild")
        .mockImplementation((node) => node);
      const removeChildSpy = vi
        .spyOn(document.body, "removeChild")
        .mockImplementation((node) => node);

      vi.spyOn(document, "createElement").mockReturnValueOnce(
        anchor as unknown as HTMLElement,
      );

      const blob = new Blob(["content"], { type: "application/pdf" });

      triggerBrowserDownload(
        { blob, filename: "report.pdf" },
        {
          doc: document,
          urlApi,
          scheduleCleanup: (cb) => cb(),
        },
      );

      expect(urlApi.createObjectURL).toHaveBeenCalledWith(blob);
      expect(urlApi.revokeObjectURL).toHaveBeenCalledWith(objectUrl);

      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });
  });
});
