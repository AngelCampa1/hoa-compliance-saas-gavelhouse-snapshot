import { describe, expect, it } from "vitest";
import {
  assertLeadMagnetUploadsAllowed,
  hasShutdownFlag,
} from "./upload-lead-magnet-pdfs-to-r2";

describe("upload-lead-magnet-pdfs-to-r2 shutdown guard", () => {
  it("detects the web shutdown flag", () => {
    expect(hasShutdownFlag('[vars]\nGAVELHOUSE_SHUTDOWN = "true"\n')).toBe(
      true,
    );
    expect(hasShutdownFlag('[vars]\nGAVELHOUSE_SHUTDOWN = "false"\n')).toBe(
      false,
    );
  });

  it("blocks lead magnet uploads after shutdown", () => {
    expect(() =>
      assertLeadMagnetUploadsAllowed(
        () => '[vars]\nGAVELHOUSE_SHUTDOWN = "true"\n',
      ),
    ).toThrow(
      "Lead magnet R2 uploads are disabled because Gavelhouse is shut down.",
    );
  });
});
