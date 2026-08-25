export type AdminStorySortKey = "published_at" | "username" | "status";
export type AdminStorySortDirection = "asc" | "desc";

export type AdminStoryFilters = {
  query: string;
  username: string;
  status: string;
  publishedFrom: string;
  publishedTo: string;
  sortKey: AdminStorySortKey;
  sortDirection: AdminStorySortDirection;
};

export const adminStoryStatuses = [
  "draft",
  "analyzing",
  "pending_review",
  "needs_confirmation",
  "published",
  "private",
  "needs_edit",
  "removed",
] as const;

const statusOrder = new Map(adminStoryStatuses.map((status, index) => [status, index]));

function normalized(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase();
}

function relatedAuthor(row: Record<string, unknown>) {
  const value = Array.isArray(row.author) ? row.author[0] : row.author;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function adminStoryAuthor(row: Record<string, unknown>) {
  const author = relatedAuthor(row);
  return {
    username: String(author.username ?? row.author_username ?? "").trim(),
    displayName: String(author.display_name ?? row.author_display_name ?? "").trim(),
  };
}

function publishedDateKey(value: unknown) {
  const date = new Date(String(value ?? ""));
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function publishedTimestamp(row: Record<string, unknown>) {
  const value = new Date(String(row.published_at ?? "")).getTime();
  return Number.isFinite(value) ? value : null;
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, ["zh-CN", "en"], { numeric: true, sensitivity: "base" });
}

export function filterAndSortAdminStories(rows: Array<Record<string, unknown>>, filters: AdminStoryFilters) {
  const query = normalized(filters.query);
  const username = normalized(filters.username).replace(/^@/, "");
  const selectedStatus = normalized(filters.status);

  return rows
    .filter((row) => {
      const author = adminStoryAuthor(row);
      const authorUsername = normalized(author.username);
      if (username && !authorUsername.includes(username)) return false;
      if (selectedStatus && normalized(row.status) !== selectedStatus) return false;

      const dateKey = publishedDateKey(row.published_at);
      if (filters.publishedFrom && (!dateKey || dateKey < filters.publishedFrom)) return false;
      if (filters.publishedTo && (!dateKey || dateKey > filters.publishedTo)) return false;

      if (!query) return true;
      return [row.title, row.ai_suggested_title, row.body, row.city, author.username, author.displayName].some(
        (value) => normalized(value).includes(query),
      );
    })
    .sort((left, right) => {
      let comparison = 0;
      if (filters.sortKey === "username") {
        comparison = compareText(adminStoryAuthor(left).username, adminStoryAuthor(right).username);
      } else if (filters.sortKey === "status") {
        comparison =
          (statusOrder.get(String(left.status) as (typeof adminStoryStatuses)[number]) ?? Number.MAX_SAFE_INTEGER) -
          (statusOrder.get(String(right.status) as (typeof adminStoryStatuses)[number]) ?? Number.MAX_SAFE_INTEGER);
      } else {
        const leftTime = publishedTimestamp(left);
        const rightTime = publishedTimestamp(right);
        if (leftTime === null || rightTime === null) {
          if (leftTime === null && rightTime !== null) return 1;
          if (leftTime !== null && rightTime === null) return -1;
        } else comparison = leftTime - rightTime;
      }

      if (comparison !== 0) return filters.sortDirection === "asc" ? comparison : -comparison;

      const createdComparison =
        new Date(String(right.created_at ?? "")).getTime() - new Date(String(left.created_at ?? "")).getTime();
      if (Number.isFinite(createdComparison) && createdComparison !== 0) return createdComparison;
      return compareText(String(left.id ?? ""), String(right.id ?? ""));
    });
}
