> ⚠️ **OUTDATED — DO NOT BUILD AGAINST THIS.** GitHub sunset Projects (classic) on **2024-08-23**; every endpoint described below returns `410 Gone` (verified 2026-07-17). Kept for reference only. Cadence uses **Projects v2 (GraphQL)** — see `DECISIONS.md` §10.

# Interacting with GitHub Projects (Classic) using `octokit/octokit.js` (REST)

> **Audience:** JavaScript/TypeScript developers using Octokit  
> **Scope:** GitHub **Projects (Classic)** via **REST API** through `octokit.js`  
> **Goal:** Explain what is possible RESTfully, how to do it, caveats, and migration context

---

## Table of Contents

1. [Important Context](#important-context)
2. [Can You Fully Interact RESTfully with Projects Classic?](#can-you-fully-interact-restfully-with-projects-classic)
3. [Prerequisites](#prerequisites)
4. [Authentication & Permissions](#authentication--permissions)
5. [Install and Initialize Octokit](#install-and-initialize-octokit)
6. [REST Endpoints for Projects Classic (What You Can Do)](#rest-endpoints-for-projects-classic-what-you-can-do)
7. [End-to-End Workflow Examples](#end-to-end-workflow-examples)
8. [Pagination, Errors, and Retry Strategy](#pagination-errors-and-retry-strategy)
9. [Rate Limits](#rate-limits)
10. [What REST Cannot Reliably Cover (and Why “Fully” is tricky)](#what-rest-cannot-reliably-cover-and-why-fully-is-tricky)
11. [Classic vs Projects (v2)](#classic-vs-projects-v2)
12. [Best Practices](#best-practices)
13. [Troubleshooting](#troubleshooting)
14. [Complete Utility Module Example](#complete-utility-module-example)
15. [Final Checklist](#final-checklist)

---

## Important Context

GitHub has two different project systems:

- **Projects (Classic)** — older board model (columns + cards)
- **Projects (v2)** — newer model with fields, views, workflows

This guide is **only for Projects (Classic)** and focuses on **REST via Octokit**.

---

## Can You Fully Interact RESTfully with Projects Classic?

**Practical answer:** You can cover most board/card operations via REST for Projects (Classic), including:

- list/get projects
- create/update/delete projects
- list/create/update/delete columns
- list/get/create/move/update/delete cards
- attach issue/PR content to cards
- create note cards

However, “**fully**” is tricky in real-world automation because:

1. Some project ecosystem functionality lives outside classic REST endpoints.
2. Organizations may disable/restrict features or tokens in ways that block automation.
3. GitHub’s strategic direction favors Projects (v2), where many advanced operations are GraphQL-centric.

So: **you can do extensive classic project automation with Octokit REST, but not guaranteed universal coverage for every project-management scenario.**

---

## Prerequisites

- Node.js 18+ recommended
- A GitHub token with the necessary scopes/permissions
- `@octokit/core` or `octokit` package
- Target repository/org where Projects (Classic) are available and accessible

---

## Authentication & Permissions

Token type options:

- Personal Access Token (classic)
- Fine-grained PAT (with required repo/org permissions)
- GitHub App installation token

Permissions differ by resource owner (repo/org/user project) and operation (read vs write).

If you get `403` or `404` unexpectedly:
- verify token scopes/permissions
- verify project ownership context (repo/org/user)
- verify that you’re calling **classic** endpoints for **classic** projects

---

## Install and Initialize Octokit

```bash
npm install octokit
```

```js name=init-octokit.js
import { Octokit } from "octokit";

export const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});
```

---

## REST Endpoints for Projects Classic (What You Can Do)

> The exact route names below are what you’ll call through `octokit.request(...)`.
> Octokit also supports `octokit.rest.*` helpers for many endpoints.

### 1) Projects (Classic)

- `GET /users/{username}/projects`
- `GET /orgs/{org}/projects`
- `GET /repos/{owner}/{repo}/projects`
- `GET /projects/{project_id}`
- `POST /orgs/{org}/projects`
- `POST /repos/{owner}/{repo}/projects`
- `PATCH /projects/{project_id}`
- `DELETE /projects/{project_id}`

### 2) Project Columns

- `GET /projects/{project_id}/columns`
- `GET /projects/columns/{column_id}`
- `POST /projects/{project_id}/columns`
- `PATCH /projects/columns/{column_id}`
- `DELETE /projects/columns/{column_id}`
- `POST /projects/columns/{column_id}/moves`

### 3) Project Cards

- `GET /projects/columns/{column_id}/cards`
- `GET /projects/columns/cards/{card_id}`
- `POST /projects/columns/{column_id}/cards`
- `PATCH /projects/columns/cards/{card_id}`
- `DELETE /projects/columns/cards/{card_id}`
- `POST /projects/columns/cards/{card_id}/moves`

> For cards:
> - Create with `content_id` + `content_type` (Issue or PullRequest), or
> - Create with `note` for note cards.

---

## End-to-End Workflow Examples

## A) List repository classic projects

```js name=list-repo-projects.js
import { octokit } from "./init-octokit.js";

export async function listRepoProjects(owner, repo) {
  const res = await octokit.request("GET /repos/{owner}/{repo}/projects", {
    owner,
    repo,
    headers: {
      accept: "application/vnd.github+json",
    },
    per_page: 100,
  });
  return res.data;
}
```

## B) Create a classic project in a repository

```js name=create-project.js
import { octokit } from "./init-octokit.js";

export async function createRepoProject(owner, repo, name, body = "") {
  const res = await octokit.request("POST /repos/{owner}/{repo}/projects", {
    owner,
    repo,
    name,
    body,
    headers: {
      accept: "application/vnd.github+json",
    },
  });
  return res.data; // includes project_id, columns_url, etc.
}
```

## C) Create columns

```js name=create-column.js
import { octokit } from "./init-octokit.js";

export async function createColumn(project_id, name) {
  const res = await octokit.request("POST /projects/{project_id}/columns", {
    project_id,
    name,
    headers: {
      accept: "application/vnd.github+json",
    },
  });
  return res.data; // includes column_id
}
```

## D) Create a card linked to an Issue

```js name=create-issue-card.js
import { octokit } from "./init-octokit.js";

export async function createIssueCard(column_id, issue_id) {
  const res = await octokit.request("POST /projects/columns/{column_id}/cards", {
    column_id,
    content_id: issue_id,
    content_type: "Issue",
    headers: {
      accept: "application/vnd.github+json",
    },
  });
  return res.data;
}
```

## E) Create a note card

```js name=create-note-card.js
import { octokit } from "./init-octokit.js";

export async function createNoteCard(column_id, note) {
  const res = await octokit.request("POST /projects/columns/{column_id}/cards", {
    column_id,
    note,
    headers: {
      accept: "application/vnd.github+json",
    },
  });
  return res.data;
}
```

## F) Move a card to another column / position

```js name=move-card.js
import { octokit } from "./init-octokit.js";

export async function moveCard(card_id, { position = "top", column_id }) {
  const res = await octokit.request("POST /projects/columns/cards/{card_id}/moves", {
    card_id,
    position, // "top" | "bottom" | "after:{card_id}"
    column_id, // optional if staying in same column
    headers: {
      accept: "application/vnd.github+json",
    },
  });
  return res.status; // usually 201 / 200-ish depending endpoint behavior
}
```

## G) Move a column

```js name=move-column.js
import { octokit } from "./init-octokit.js";

export async function moveColumn(column_id, position = "last") {
  const res = await octokit.request("POST /projects/columns/{column_id}/moves", {
    column_id,
    position, // "first" | "last" | "after:{column_id}"
    headers: {
      accept: "application/vnd.github+json",
    },
  });
  return res.status;
}
```

## H) Delete card / column / project

```js name=delete-entities.js
import { octokit } from "./init-octokit.js";

export async function deleteCard(card_id) {
  await octokit.request("DELETE /projects/columns/cards/{card_id}", {
    card_id,
    headers: { accept: "application/vnd.github+json" },
  });
}

export async function deleteColumn(column_id) {
  await octokit.request("DELETE /projects/columns/{column_id}", {
    column_id,
    headers: { accept: "application/vnd.github+json" },
  });
}

export async function deleteProject(project_id) {
  await octokit.request("DELETE /projects/{project_id}", {
    project_id,
    headers: { accept: "application/vnd.github+json" },
  });
}
```

---

## Pagination, Errors, and Retry Strategy

### Pagination
Many list endpoints are paginated (`per_page`, `page`).

Use Octokit paginate helper where available:

```js name=pagination-example.js
import { octokit } from "./init-octokit.js";

export async function listAllCards(column_id) {
  return octokit.paginate("GET /projects/columns/{column_id}/cards", {
    column_id,
    per_page: 100,
    headers: { accept: "application/vnd.github+json" },
  });
}
```

### Error handling pattern

```js name=error-handling.js
export function handleGitHubError(error) {
  if (error.status === 401) {
    throw new Error("Unauthorized: check token.");
  }
  if (error.status === 403) {
    throw new Error("Forbidden: missing permission/scope or org policy restriction.");
  }
  if (error.status === 404) {
    throw new Error("Not found: wrong owner/repo/project/column/card id, or hidden by permission.");
  }
  if (error.status === 422) {
    throw new Error("Validation failed: check request payload (position/content_type/content_id/note).");
  }
  throw error;
}
```

---

## Rate Limits

- Respect REST API rate limits.
- Batch operations thoughtfully.
- Add retries with backoff for transient failures (`502`, `503`, `504`, occasional secondary limits).
- Avoid hammering move endpoints in tight loops without delay.

---

## What REST Cannot Reliably Cover (and Why “Fully” is tricky)

Even for classic boards, “full” can fail due to:

- policy restrictions in org settings
- token model limitations (fine-grained PAT/GitHub App permission shape)
- mixed environment where teams have migrated to Projects (v2)
- lifecycle differences between classic board cards and newer project field-driven workflows

So the robust architecture is often:
- use REST for classic board mechanics,
- use GraphQL for v2 workflows and advanced project semantics.

---

## Classic vs Projects (v2)

If your team uses **Projects (v2)**:
- prefer GraphQL-based project APIs
- do **not** assume classic columns/cards endpoints apply

If your team still uses **Projects (Classic)**:
- REST via Octokit is still practical for board automation.

---

## Best Practices

1. **Detect project type early** (classic vs v2).
2. **Centralize IDs** (project_id, column_id, card_id) to avoid mix-ups.
3. **Wrap all Octokit calls** in service functions with consistent logging.
4. **Use idempotency guards** (e.g., check for existing card before create).
5. **Keep move operations explicit** (`top`, `bottom`, `after:id`).
6. **Log request context** (without leaking token) for ops debugging.
7. **Implement dry-run mode** for automation scripts.

---

## Troubleshooting

### Symptom: `404` on project endpoint
Possible causes:
- wrong endpoint type (classic vs v2 confusion)
- wrong owner/repo/org context
- token cannot see private resource

### Symptom: cannot create card with issue
Check:
- `content_type` is exactly `Issue` or `PullRequest`
- `content_id` is the internal item ID expected by endpoint
- token can access that issue/PR

### Symptom: moves behave unexpectedly
Check:
- `position` format (`top`, `bottom`, `after:<id>`)
- target column exists and is accessible
- race conditions from concurrent automations

---

## Complete Utility Module Example

```js name=projects-classic-service.js
import { Octokit } from "octokit";

export class ProjectsClassicService {
  /**
   * @param {string} token
   */
  constructor(token) {
    this.octokit = new Octokit({ auth: token });
    this.headers = { accept: "application/vnd.github+json" };
  }

  async listRepoProjects(owner, repo) {
    return this.octokit.paginate("GET /repos/{owner}/{repo}/projects", {
      owner, repo, per_page: 100, headers: this.headers,
    });
  }

  async createRepoProject(owner, repo, name, body = "") {
    const { data } = await this.octokit.request("POST /repos/{owner}/{repo}/projects", {
      owner, repo, name, body, headers: this.headers,
    });
    return data;
  }

  async listColumns(project_id) {
    return this.octokit.paginate("GET /projects/{project_id}/columns", {
      project_id, per_page: 100, headers: this.headers,
    });
  }

  async createColumn(project_id, name) {
    const { data } = await this.octokit.request("POST /projects/{project_id}/columns", {
      project_id, name, headers: this.headers,
    });
    return data;
  }

  async createIssueCard(column_id, issue_id) {
    const { data } = await this.octokit.request("POST /projects/columns/{column_id}/cards", {
      column_id, content_id: issue_id, content_type: "Issue", headers: this.headers,
    });
    return data;
  }

  async createPullRequestCard(column_id, pr_id) {
    const { data } = await this.octokit.request("POST /projects/columns/{column_id}/cards", {
      column_id, content_id: pr_id, content_type: "PullRequest", headers: this.headers,
    });
    return data;
  }

  async createNoteCard(column_id, note) {
    const { data } = await this.octokit.request("POST /projects/columns/{column_id}/cards", {
      column_id, note, headers: this.headers,
    });
    return data;
  }

  async moveCard(card_id, position = "top", column_id = undefined) {
    await this.octokit.request("POST /projects/columns/cards/{card_id}/moves", {
      card_id, position, column_id, headers: this.headers,
    });
  }

  async moveColumn(column_id, position = "last") {
    await this.octokit.request("POST /projects/columns/{column_id}/moves", {
      column_id, position, headers: this.headers,
    });
  }

  async deleteCard(card_id) {
    await this.octokit.request("DELETE /projects/columns/cards/{card_id}", {
      card_id, headers: this.headers,
    });
  }

  async deleteColumn(column_id) {
    await this.octokit.request("DELETE /projects/columns/{column_id}", {
      column_id, headers: this.headers,
    });
  }

  async deleteProject(project_id) {
    await this.octokit.request("DELETE /projects/{project_id}", {
      project_id, headers: this.headers,
    });
  }
}
```

---

## Final Checklist

- [ ] Confirm your board is **Projects (Classic)**, not v2.
- [ ] Use correct endpoint group (projects / columns / cards).
- [ ] Ensure token permissions match read/write intent.
- [ ] Implement pagination for all list operations.
- [ ] Add robust error handling for 401/403/404/422.
- [ ] Add backoff/retry for transient API failures.
- [ ] If your org is moving to v2, plan GraphQL migration.

---

## Conclusion

Using `octokit/octokit.js`, you can perform **substantial and practical REST automation** for **GitHub Projects (Classic)** (projects, columns, cards, moves, CRUD).  
But saying “**fully**” can be misleading because real-world constraints (permissions, product evolution, and v2 differences) may require GraphQL or migration-aware logic.