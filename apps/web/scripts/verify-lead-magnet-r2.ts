import {
  getLeadMagnetPdfDirectory,
  getLeadMagnetR2BucketName,
  verifyLeadMagnetPdfsInR2,
} from "./lead-magnet-r2.js";
import { verifyLeadMagnetPdfs } from "./verify-lead-magnet-pdfs.js";
import { pathToFileURL } from "node:url";

async function main(): Promise<void> {
  const directory = getLeadMagnetPdfDirectory("public");
  const bucketName = getLeadMagnetR2BucketName();
  await verifyLeadMagnetPdfs(directory);
  await verifyLeadMagnetPdfsInR2({ directory, bucketName });
  console.log(
    `[verify-lead-magnet-r2] Verified lead magnet PDFs in ${bucketName}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error("[verify-lead-magnet-r2] Failed:", error);
    process.exit(1);
  });
}
