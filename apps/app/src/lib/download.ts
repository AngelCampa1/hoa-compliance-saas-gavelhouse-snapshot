export interface TriggerBrowserDownloadInput {
  blob: Blob;
  filename: string;
}

export interface TriggerBrowserDownloadDeps {
  doc?: Document;
  urlApi?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
  scheduleCleanup?: (cleanup: () => void) => void;
}

export function triggerBrowserDownload(
  input: TriggerBrowserDownloadInput,
  deps: TriggerBrowserDownloadDeps = {},
): void {
  const doc = deps.doc ?? document;
  const urlApi = deps.urlApi ?? URL;
  const scheduleCleanup =
    deps.scheduleCleanup ??
    ((cleanup) => {
      setTimeout(cleanup, 0);
    });
  const url = urlApi.createObjectURL(input.blob);
  const link = doc.createElement("a");
  link.href = url;
  link.download = input.filename;
  link.style.display = "none";
  doc.body.appendChild(link);
  link.click();
  scheduleCleanup(() => {
    doc.body.removeChild(link);
    urlApi.revokeObjectURL(url);
  });
}
