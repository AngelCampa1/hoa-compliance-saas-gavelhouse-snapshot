import { PUBLIC_API_URL } from "@boardstack/shared";

function isPrivateIpv4(hostname: string): boolean {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return false;
  }

  const octets = hostname.split(".").map(Number);
  const [first, second] = octets;

  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function shouldRunStrictChecks(): boolean {
  return (
    process.argv.includes("--strict") ||
    process.env.CF_PAGES === "1" ||
    process.env.CI === "true"
  );
}

const productionApiUrl = new URL(PUBLIC_API_URL);
const strict = shouldRunStrictChecks();
const apiUrl = process.env.VITE_API_URL?.trim();

if (!apiUrl) {
  if (!strict) {
    process.exit(0);
  }

  console.error(
    "Missing VITE_API_URL. Set VITE_API_URL to the public API origin before building or deploying @boardstack/app.",
  );
  process.exit(1);
}

let parsed: URL;

try {
  parsed = new URL(apiUrl);
} catch {
  console.error(
    `Invalid VITE_API_URL: ${apiUrl}. Expected an absolute URL such as ${PUBLIC_API_URL}.`,
  );
  process.exit(1);
}

if (strict && parsed.protocol !== "https:") {
  console.error(
    `Refusing to build @boardstack/app with non-HTTPS API origin ${apiUrl}.`,
  );
  process.exit(1);
}

if (
  strict &&
  (parsed.hostname === "localhost" ||
    parsed.hostname === "host.docker.internal" ||
    isPrivateIpv4(parsed.hostname))
) {
  console.error(
    `Refusing to build @boardstack/app with non-public API origin ${apiUrl}. Set VITE_API_URL to a public HTTPS endpoint.`,
  );
  process.exit(1);
}

if (
  strict &&
  process.env.CF_PAGES_BRANCH === "master" &&
  parsed.hostname !== productionApiUrl.hostname
) {
  console.error(
    `Refusing to build the master branch with VITE_API_URL=${apiUrl}. Production deploys must target ${PUBLIC_API_URL}.`,
  );
  process.exit(1);
}
