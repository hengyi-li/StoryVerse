import { describe, expect, it } from "vitest";
import {
  adminStoryAuthor,
  filterAndSortAdminStories,
  type AdminStoryFilters,
} from "../src/features/admin/admin-story-management";

const rows: Array<Record<string, unknown>> = [
  {
    id: "story-b",
    title: "第二篇故事",
    body: "关于一次远行",
    city: "上海",
    status: "removed",
    published_at: "2026-08-22T12:00:00.000Z",
    created_at: "2026-08-22T11:00:00.000Z",
    author: { username: "beta_user", display_name: "小贝" },
  },
  {
    id: "story-a",
    title: "第一篇故事",
    body: "关于社区花园",
    city: "北京",
    status: "published",
    published_at: "2026-08-20T12:00:00.000Z",
    created_at: "2026-08-20T11:00:00.000Z",
    author: { username: "alpha_user", display_name: "小安" },
  },
  {
    id: "story-c",
    title: "尚未发布",
    body: "仍在整理",
    city: "成都",
    status: "draft",
    published_at: null,
    created_at: "2026-08-23T11:00:00.000Z",
    author: { username: "gamma_user", display_name: "小甘" },
  },
];

const defaults: AdminStoryFilters = {
  query: "",
  username: "",
  status: "",
  publishedFrom: "",
  publishedTo: "",
  sortKey: "published_at",
  sortDirection: "desc",
};

describe("admin story management", () => {
  it("reads the joined profile username and display name", () => {
    expect(adminStoryAuthor(rows[0])).toEqual({ username: "beta_user", displayName: "小贝" });
  });

  it("filters by username with or without an @ prefix", () => {
    expect(filterAndSortAdminStories(rows, { ...defaults, username: "@alpha" }).map((row) => row.id)).toEqual([
      "story-a",
    ]);
  });

  it("filters by exact status and inclusive publication dates", () => {
    expect(
      filterAndSortAdminStories(rows, {
        ...defaults,
        status: "removed",
        publishedFrom: "2026-08-22",
        publishedTo: "2026-08-22",
      }).map((row) => row.id),
    ).toEqual(["story-b"]);
  });

  it("keeps unpublished stories out of publication-date ranges", () => {
    expect(filterAndSortAdminStories(rows, { ...defaults, publishedFrom: "2026-08-01" }).map((row) => row.id)).toEqual([
      "story-b",
      "story-a",
    ]);
  });

  it("sorts by username, status and publication time in both directions", () => {
    expect(
      filterAndSortAdminStories(rows, { ...defaults, sortKey: "username", sortDirection: "asc" }).map((row) => row.id),
    ).toEqual(["story-a", "story-b", "story-c"]);
    expect(
      filterAndSortAdminStories(rows, { ...defaults, sortKey: "status", sortDirection: "asc" }).map((row) => row.id),
    ).toEqual(["story-c", "story-a", "story-b"]);
    expect(
      filterAndSortAdminStories(rows, { ...defaults, sortKey: "published_at", sortDirection: "asc" }).map(
        (row) => row.id,
      ),
    ).toEqual(["story-a", "story-b", "story-c"]);
  });
});
