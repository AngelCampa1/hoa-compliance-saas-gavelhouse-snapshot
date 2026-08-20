export function pageUrl(page: number, basePath: string): string {
  if (page === 1) {
    return basePath.endsWith("/") ? basePath : `${basePath}/`;
  }
  const base = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return `${base}${page}`;
}

export function getPageNumbers(
  current: number,
  total: number,
): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis")[] = [1];

  if (current > 3) pages.push("ellipsis");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) pages.push("ellipsis");

  pages.push(total);
  return pages;
}
