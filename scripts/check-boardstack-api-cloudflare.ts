import {
  BOARDSTACK_API_NAME,
  findMissingSecrets,
  getCloudflareAccountId,
  getCloudflareApiToken,
  readGavelhouseApiSecretNames,
  verifyBuildTrigger,
} from "./lib/cloudflare-boardstack-api.js";

async function main() {
  let hasFailure = false;

  console.log(
    `Checking Cloudflare configuration for ${BOARDSTACK_API_NAME}...`,
  );

  const secretNames = readGavelhouseApiSecretNames();
  const missingSecrets = findMissingSecrets(secretNames);

  if (missingSecrets.length > 0) {
    hasFailure = true;
    console.error("Missing Worker secrets:");
    for (const name of missingSecrets) {
      console.error(`- ${name}`);
    }
  } else {
    console.log("Worker secrets: OK");
  }

  const token = getCloudflareApiToken(process.env);
  const accountId = getCloudflareAccountId(process.env);
  if (!token) {
    hasFailure = true;
    console.error(
      "Build trigger check skipped: set CLOUDFLARE_API_TOKEN, CF_API_TOKEN, or WRANGLER_API_TOKEN.",
    );
  } else if (!accountId) {
    hasFailure = true;
    console.error(
      "Build trigger check skipped: set CLOUDFLARE_ACCOUNT_ID or CF_ACCOUNT_ID.",
    );
  } else {
    try {
      const result = await verifyBuildTrigger(token, accountId);
      if (!result.found || result.diffs.length > 0) {
        hasFailure = true;
        console.error("Workers Builds trigger drift detected:");
        for (const diff of result.diffs) {
          console.error(`- ${diff}`);
        }
      } else {
        console.log("Workers Builds trigger: OK");
      }
    } catch (error) {
      hasFailure = true;
      console.error(
        `Workers Builds trigger check failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (hasFailure) {
    process.exitCode = 1;
    return;
  }

  console.log("Cloudflare checks passed.");
}

void main();
