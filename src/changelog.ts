import type { Repo } from "./repo.ts";
import type { Commit } from "./commits.ts";
import type { Tag } from "./tags.ts";

export interface Filter {
  type: string;
  title: string;
}

/**
 * Default list of commit type
 */
export const defaultFilters: Filter[] = [
  {
    // type ! means include !
    type: "!",
    title: "Breaking",
  },
  {
    type: "feat",
    title: "Features",
  },
  {
    type: "fix",
    title: "Bug Fixes",
  },
  {
    // empty string means all
    type: "",
    title: "Others",
  },
];

export interface Document {
  sections: string[];
  links: string[];
}

// links definition for markdown (they are not inline)
export function fmtLink(name: string, to: string): string {
  return `[${name}]: ${to}`;
}

export function pushHeader(doc: Document): void {
  doc.sections.push(`# Changelog

All notable changes to this project will be documented in this file.`);
}

export function pushChanges(
  doc: Document,
  repo: Repo,
  title: string,
  commits: Commit[],
  style: "github" | "md",
): void {
  if (title !== "") doc.sections.push(`### ${title}`);
  const list: string[] = [];
  for (const commit of commits) {
    const { hash } = commit;
    const { header } = commit.cc;
    const shortid = hash.slice(0, 7);

    if (repo.remote && repo.remote.github && style === "md") {
      const { user, name } = repo.remote.github;
      let url = `https://github.com/${user}/${name}/`;
      url = `${url}commit/${hash}`;

      list.push(`- ${header} ([${shortid}])`);
      doc.links.push(fmtLink(shortid, url));
    } else {
      // on github release we do not need to use url
      list.push(`- ${header} (${shortid})`);
    }
  }
  doc.sections.push(list.join("\n"));
}

export function pushTag(
  doc: Document,
  repo: Repo,
  commits: Commit[],
  filters: Filter[],
  tag: Tag,
  style: "github" | "md",
  parent?: Tag,
): void {
  const year = tag.date.getUTCFullYear();
  const month = String(tag.date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(tag.date.getUTCDate()).padStart(2, "0");

  if (repo.remote && repo.remote.github && style === "md") {
    const { user, name } = repo.remote.github;
    let url = `https://github.com/${user}/${name}/`;
    url = parent
      ? `${url}compare/${parent.version}...${tag.version}`
      : `${url}compare/${repo.commits.pop()?.hash}...${tag.version}`;
    doc.links.push(fmtLink(tag.version, url));
    doc.sections.push(`## [${tag.version}] - ${year}-${month}-${day}`);
  } else {
    doc.sections.push(`## ${tag.version} - ${year}-${month}-${day}`);
  }

  let hasConventionalCommit = false;
  // capture all commits by their types
  for (const filter of filters) {
    let title = filter.title;
    let filtered;
    if (filter.type === "!") {
      // process breaking change
      filtered = commits.filter((commit) => commit.cc.type?.endsWith("!"));
      if (filtered.length > 0) hasConventionalCommit = true;
    } else if (filter.type !== "") {
      // use conventional commmits as defined in filters
      filtered = commits.filter((commit) =>
        commit.cc.type?.toLocaleLowerCase() === filter.type.toLocaleLowerCase()
      );
      if (filtered.length > 0) hasConventionalCommit = true;
    } else {
      // capture other commits
      const types = filters.map((f) => f.type);
      filtered = commits.filter((commit) =>
        !types.includes(commit.cc.type?.toLocaleLowerCase() || "__any__")
      );
    }
    if (filtered.length > 0) {
      if (!hasConventionalCommit) {
        title = "";
      }
      pushChanges(doc, repo, title, filtered, style);
    }
  }

  if (repo.remote && repo.remote.github && parent) {
    const linkName = `${parent.version}...${tag.version}`;
    doc.sections.push(`Full Changelog: [${linkName}]`);
    const { user, name } = repo.remote.github;
    const url =
      `https://github.com/${user}/${name}/compare/${parent.version}...${tag.version}`;
    doc.links.push(fmtLink(linkName, url));
  }
}

export function render(doc: Document): string {
  const sections = doc.sections.join("\n\n");
  const links = doc.links.join("\n");
  const full = [sections, links];
  return `${full.join("\n\n").trim()}\n`;
}

/**
 * Add the new tag to the list of tags. beeing the latest it is the first one
 * @returns array of tags and commits
 */
export function polyfillVersion(repo: Repo, to: string): [Tag[], Commit[]] {
  const newtag: Tag = {
    tag: to,
    version: to,
    date: new Date(),
    hash: "",
  };
  const tags = [newtag, ...repo.tags];
  const commits = [...repo.commits];

  for (const commit of commits) {
    if (commit.belongs !== null) break;
    commit.belongs = newtag;
  }

  return [tags, commits];
}
