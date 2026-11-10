# Context Engineering & Lightweight Docs Best Practices — Research Notes

**Date accessed:** 2026-11-10

**Primary sources checked (fetched directly, not via secondary blogs):**

- https://code.claude.com/docs/en/memory (Claude Code docs — "How Claude remembers your project": CLAUDE.md, AGENTS.md, auto memory)
- https://code.claude.com/docs/en/best-practices (Claude Code docs — "Best practices for Claude Code"; this is the current location of the former `anthropic.com/engineering/claude-code-best-practices` post, which 308-redirects here)
- https://code.claude.com/docs/en/large-codebases ("Set up Claude Code in a monorepo or large codebase")
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents (Anthropic engineering blog — "Effective context engineering for AI agents")
- https://github.com/anthropics/claude-code/blob/main/CLAUDE.md (Anthropic's own dogfooded CLAUDE.md, in their public Claude Code repo)
- https://agents.md/ (official site for the `AGENTS.md` open format)
- https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions (Michael Nygard's original 2011 ADR post)
- https://adr.github.io/ (community ADR hub, incl. MADR template reference)
- https://github.com/lycheeverse/lychee/blob/master/README.md (lychee link checker README)
- In-repo primary sources: `/Users/auliamnaufal/orca/workspaces/Tripweave/master/node_modules/next/dist/server/lib/generate-agent-files.js` (the actual code that writes this repo's `AGENTS.md`), `docs/adr/0001-trip-order-funds-tripweave-not-suppliers.md`, and a repo-wide grep for `ADR-0002` / `live sandbox`.

Each web source was fetched directly and quoted/paraphrased from that fetch, not from a secondary write-up. Where a claim could not be pinned to a primary source, it's flagged in-line and summarized again at the end.

---

## 1. Claude Code's own CLAUDE.md / memory model

### 1.1 Two memory systems, both loaded every session

Per the Claude Code docs:

> "Claude Code has two complementary memory systems. Both are loaded at the start of every conversation. Claude treats them as context, not enforced configuration."

- **CLAUDE.md files** — instructions *you* write (rules, standards, architecture notes).
- **Auto memory** — notes *Claude* writes itself (`MEMORY.md` plus topic files under `~/.claude/projects/<project>/memory/`), capped at "the first 200 lines or 25KB" per session load.

Source: https://code.claude.com/docs/en/memory

### 1.2 What belongs in CLAUDE.md — add only what Claude can't derive from the code

The canonical test, from the Best Practices doc:

> "Claude Code loads CLAUDE.md into every session, which means every line in it takes a little of Claude's attention on every task, whether it's relevant or not. That's why the file works best when it only holds what Claude couldn't work out from the code itself:
> - How to confirm work in this repo: the exact test, typecheck, and lint commands, and how to run a single test file
> - Places where the code is misleading: an old pattern that's everywhere but that new code must not copy, or a directory that looks unused but isn't
> - Decisions that aren't in the repo: which error helper the team settled on, how deploys work, what needs a migration review
> - Anything you've had to correct twice already"

And from the memory doc, the comparison table says CLAUDE.md is for "Instructions and rules," not for things Claude can discover by reading the repo. The `/memory` page explicitly lists a size target:

> "**Size**: target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence."

Anthropic's own repo follows this: `anthropics/claude-code/CLAUDE.md` is 40 lines, and its only content is CI/workflow security hardening rules (egress-firewall runner, network allow-list, `--permission-mode auto` requirement) — exactly the "non-obvious, repo-specific constraint" category, with zero architecture description.

Sources: https://code.claude.com/docs/en/best-practices, https://code.claude.com/docs/en/memory, https://github.com/anthropics/claude-code/blob/main/CLAUDE.md

### 1.3 Where CLAUDE.md files live, and load order

From the memory doc's location table: managed policy (org-wide) → `~/.claude/CLAUDE.md` (user) → `./CLAUDE.md` or `./.claude/CLAUDE.md` (project) → `./CLAUDE.local.md` (personal, gitignored). All are concatenated into context, ordered root-to-working-directory, so instructions closer to the working directory are read last (and so take precedence in practice). Nested directories' CLAUDE.md files load **on demand**, not at launch:

> "Claude also discovers CLAUDE.md and CLAUDE.local.md files in subdirectories under your current working directory. Instead of loading them at launch, Claude Code loads each one once Claude reads, writes, or edits another file in that subdirectory."

Source: https://code.claude.com/docs/en/memory

### 1.4 Keeping memory files from going stale — Claude Code's own tooling

Three concrete, first-party mechanisms:

1. **`/doctor prompt-audit`** — runs a check across CLAUDE.md, CLAUDE.local.md, AGENTS.md, rules, skills, commands, subagents, and output styles:
   > "Claude looks for problems such as instructions written for older models, references to files or commands that don't exist, and files that contradict each other. You get a report of findings with proposed edits, and nothing in your files changes until you ask Claude to apply them."
   This directly targets the "citing a file/command that doesn't exist" failure mode — but its scope is instruction files under `.claude/` and CLAUDE.md/AGENTS.md, **not** arbitrary docs like ADRs.
2. **`/doctor`** (plain) — "proposes trims for a checked-in CLAUDE.md: it cuts content Claude can derive from the codebase... and keeps pitfalls, rationale, and conventions that differ from tool defaults."
3. **Review discipline**, from the large-codebases guide: "Review in pull requests: treat CLAUDE.md edits like any other documentation change so conventions track the code" and "Revisit after major model releases: instructions that worked around an older model's limitation may become overhead once a newer model handles the case on its own."

Sources: https://code.claude.com/docs/en/memory, https://code.claude.com/docs/en/best-practices, https://code.claude.com/docs/en/large-codebases

### 1.5 Nested CLAUDE.md in monorepos/large codebases

From the large-codebases guide, the recommended split is two levels:

> "**Root CLAUDE.md**: instructions that apply everywhere, such as coding standards and commit conventions
> **Per-subdirectory CLAUDE.md**: conventions specific to that area's stack... Commit these files to the repository so teammates inherit them. Each directory's owner typically maintains its file."

When Claude starts in a subdirectory it loads that directory's CLAUDE.md plus every ancestor's, but not sibling directories' — this is the mechanism that keeps a growing monorepo's instructions from all piling into context at once. The same doc also distinguishes CLAUDE.md from **path-scoped rules** (`.claude/rules/*.md` with `paths:` frontmatter, which load only when a matching file is opened) and from **skills** (procedures loaded only when the task calls for them) — the general principle being: put something always-true in CLAUDE.md, something conditional in a path-scoped rule, something procedural/occasional in a skill.

Source: https://code.claude.com/docs/en/large-codebases

---

## 2. AGENTS.md: the cross-tool format, and how Claude Code reads it

### 2.1 What AGENTS.md is and who owns it

> "AGENTS.md is a simple, open format for guiding coding agents... a dedicated, predictable place to provide the context and instructions to help AI coding agents work on your project." "AGENTS.md is now stewarded by the Agentic AI Foundation under the Linux Foundation."

It's deliberately plain Markdown with no required schema, and supports nesting for monorepos:

> "Place another AGENTS.md inside each package. Agents automatically read the nearest file in the directory tree, so the closest one takes precedence and every subproject can ship tailored instructions."

Source: https://agents.md/

### 2.2 Claude Code's actual precedence rule between CLAUDE.md and AGENTS.md — this is the load-bearing fact for this repo

The memory doc states the default resolution explicitly:

> | Your repository has | Claude reads |
> | An AGENTS.md, and no CLAUDE.md or CLAUDE.local.md in your working directory or above it | Your AGENTS.md |
> | An AGENTS.md and a CLAUDE.md or CLAUDE.local.md in your working directory or above it | **Your CLAUDE.md files only** |
> | A CLAUDE.md that already imports AGENTS.md | Your CLAUDE.md, with AGENTS.md included through the import |

In other words: **by default, the moment a project has any `CLAUDE.md` on the path, Claude Code stops reading `AGENTS.md` at all.** The two files are not merged unless you explicitly set the `claude-md-and-agents-md` project-instructions mode (`/config`, or `pluginConfigs["cc-plugin-agents-md@builtin"].options.instructionFiles`), in which case "each directory's CLAUDE.md files [load] first and its AGENTS.md after them."

This support requires Claude Code v2.1.277+ for direct AGENTS.md reading; before that (or when unavailable), the documented workaround is to import it from a CLAUDE.md:

> "When Claude isn't reading your AGENTS.md directly, you can still keep it as the one file every tool shares by putting an `@AGENTS.md` import in a CLAUDE.md next to it... Add any Claude-specific instructions below the import, and Claude reads the imported file first, then the rest."

```markdown
@AGENTS.md

## Claude Code
Use plan mode for changes under src/billing/.
```

A plain symlink (`ln -s AGENTS.md CLAUDE.md`) also works but the docs flag two caveats worth knowing: Edit/Write tools refuse to write through the symlink (they redirect edits to the real `AGENTS.md`), and on Windows, Git checks a committed symlink out as a one-line text file unless `core.symlinks` is enabled — so the import form is the more portable option for a team repo.

Source: https://code.claude.com/docs/en/memory (sections "AGENTS.md", "Share one file with other coding tools")

### 2.3 How this interacts with a tool-regenerated AGENTS.md specifically (this repo's exact situation)

Nothing in Claude Code's or AGENTS.md's own docs discusses the specific case of an `AGENTS.md` that another tool (here, `next dev`) actively rewrites. That part is answered by reading the generator itself, which **is** a primary source for how it behaves:

From `node_modules/next/dist/server/lib/generate-agent-files.js` (this repo's own installed copy):

```js
const AGENT_RULES_START_MARKER = '<!-- BEGIN:nextjs-agent-rules -->';
const AGENT_RULES_END_MARKER = '<!-- END:nextjs-agent-rules -->';
...
function upsertFile(filePath, block) {
    const existing = _fs.default.readFileSync(filePath, 'utf-8');
    const updated = upsertAgentRulesBlock(existing, block);
    if (updated === existing) return 'unchanged';
    _fs.default.writeFileSync(filePath, updated, 'utf-8');
    return 'updated';
}
```

`writeAgentFiles()` calls this `upsertFile` only when `AGENTS.md` already exists, and the upsert touches only the text between `AGENT_RULES_START_MARKER` and `AGENT_RULES_END_MARKER` (`extractAgentRulesBlock`/`extractManagedBlock` locate that span specifically). Content outside those markers is left untouched by every `next dev` run. This is a direct code-read, not an inference from Next.js's public docs.

Source (primary, in-repo): `node_modules/next/dist/server/lib/generate-agent-files.js` (resolved from this repo's own `next` install, per this repo's own AGENTS.md note that the package may not be visible from the repo root in a monorepo — it was visible here)

---

## 3. Anthropic's general context-engineering guidance

The engineering blog post frames the shift from prompt engineering to context engineering:

> "Context refers to the set of tokens included when sampling from a large-language model (LLM)."

Key recommendations relevant to project-context files:

- **"Right altitude"**: a system prompt (and by extension CLAUDE.md) should be "specific enough to guide behavior effectively, yet flexible enough to provide the model with strong heuristics," avoiding both brittle if/then rules and vague suppositions of shared context.
- **Minimal high-signal tokens**: "the minimal set of information that fully outlines your expected behavior" — minimal isn't "short," it's "no redundant or irrelevant information."
- **Just-in-time over preloading**: "maintain lightweight identifiers (file paths, queries, links) and dynamically load data via tools rather than pre-processing everything upfront," which "mirrors human cognition" and avoids stale pre-built indexes going out of sync with the code.
- **Coding-agent specific note**: "Claude Code uses CLAUDE.md files preloaded upfront, paired with bash primitives for just-in-time file retrieval, effectively bypassing the issues of stale indexing" — i.e. the small always-loaded file plus on-demand grep/read, rather than a large pre-digested project summary, is Anthropic's own stated reason CLAUDE.md stays small while the agent still has full-repo access.
- **Long-running tasks**: compaction (summarize + restart with compressed context), structured note-taking (an agent-maintained file outside the context window, analogous to this repo's `docs/adr/` or `docs/research/`), and sub-agent architectures for isolating exploration from the main thread.

Source: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

---

## 4. Lightweight documentation: Architecture Decision Records (ADRs)

### 4.1 Michael Nygard's original minimal template (2011)

The source that popularized ADRs specifies five sections, kept intentionally short:

> 1. **Title** — "short noun phrases," e.g. "ADR 1: Deployment on Ruby on Rails 3.0.10"
> 2. **Context** — "describes the forces at play... in value-neutral language, simply stating facts"
> 3. **Decision** — "stated in full sentences, with active voice. 'We will …'"
> 4. **Status** — "proposed," "accepted," "deprecated," or **"superseded"** (with a reference to its replacement)
> 5. **Consequences** — "All consequences should be listed here, not just the 'positive' ones"

On storage and lifecycle:

> "We will keep a collection of records for 'architecturally significant' decisions... stored in the project repository under doc/arch/adr-NNN... numbered sequentially and monotonically. Numbers will not be reused." "If a decision is reversed, we will keep the old one around, but mark it as superseded."

And on style: "The whole document should be one or two pages long," written "as if it is a conversation with a future developer," in full sentences rather than bullet fragments.

Source: https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions

### 4.2 The crucial lifecycle rule this repo is currently violating

Nygard's model is explicit about ordering: **the new (superseding) decision gets written and recorded first; only then does the old record get its status line changed to point at it.** The superseded record's status is a backward-pointing confirmation of something that already exists — never a forward promise of something not yet written.

`docs/adr/0001-trip-order-funds-tripweave-not-suppliers.md` currently has:

```
status: partially superseded by ADR-0002 — see that ADR for live sandbox evidence that
direct supplier payment is achievable for suppliers willing to share their own PayPal
email, without partner approval...
```

A repo-wide search confirms there is no `docs/adr/0002-*` file, and no other file in the repo mentions "ADR-0002" or a "live sandbox" test/evidence. This is exactly the failure mode ADR practice and link-checking exist to catch: a status/citation pointing at a record that was never created.

Sources: https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions; in-repo: `docs/adr/0001-trip-order-funds-tripweave-not-suppliers.md`, repo-wide grep for `ADR-0002` and `live sandbox` (no hits outside ADR-0001 itself)

### 4.3 The community ADR hub / MADR as the modern minimal-viable reference

adr.github.io (maintained by the `adr` GitHub organization) restates the same core definition and points to the Y-statement format and MADR (Markdown Architectural Decision Records) as the most widely reused lightweight template family:

> "An Architectural Decision Record (ADR) captures a single AD and its rationale... ADR can help you understand the reasons for a chosen architectural decision, along with its trade-offs and consequences."

This repo's single existing ADR (`0001-...md`) already follows a Nygard/MADR-shaped structure (status line, Context, Decision, Considered Options) — the format itself isn't the gap; the dangling status citation is.

Source: https://adr.github.io/

---

## 5. Checking that in-repo citations/links stay valid

No primary source was found specifically positioning a link checker as "the" ADR-citation-integrity tool — ADR literature (Nygard, adr.github.io) does not mention tooling for this at all, because ADRs predate most of this tooling and are a human-discipline practice, not a CI-enforced one. The closest first-party-documented, drop-in tool for catching dangling intra-repo Markdown references is a generic link checker:

> "lychee... finds broken URLs and mail addresses inside Markdown, HTML, reStructuredText, websites and more." It supports local file paths and relative URLs, not just `http(s)://` links, and ships a maintained GitHub Action (`lycheeverse/lychee-action`) for CI use, e.g.:
> ```yaml
> - name: Check links
>   uses: lycheeverse/lychee-action@v2
>   with:
>     args: --cache './/**/*.md'
>     fail: true
> ```

Relevant flags for checking an ADR's cross-reference to a sibling file: `--include-fragments` (validate `#anchor` targets, not just file existence), `--root-dir` (resolve root-relative links), and a `.lycheeignore` file for exclusions. Lychee checks that a *linked path* resolves — it does not parse free-text citations like "see ADR-0002" that aren't written as a Markdown link, so it would catch a dangling `[ADR-0002](../adr/0002-...md)` link but not today's prose reference ("see that ADR for live sandbox evidence") unless the citation is reformatted as an actual link.

Source: https://github.com/lycheeverse/lychee/blob/master/README.md

Separately, Claude Code's own `/doctor prompt-audit` (§1.4 above) explicitly flags "references to files or commands that don't exist" — but only within CLAUDE.md/AGENTS.md/rules/skills/commands, not general docs like `docs/adr/`. It is not a substitute for a link checker over `docs/`.

Source: https://code.claude.com/docs/en/memory

---

## Items that could not be verified from a primary source

- **Claude Code GitHub repo's own README/docs** (as distinct from the hosted `code.claude.com/docs`) for CLAUDE.md guidance specifically — the public `anthropics/claude-code` repo's top-level README focuses on install/usage instructions, not memory-file conventions; its own `CLAUDE.md` file (quoted in §1.2) was the only directly relevant content found there.
- **Cursor's own `.cursor/rules` documentation** — not fetched in this pass; the task treated it as lower priority than Claude Code per the repo's own AGENTS.md note, and Claude Code's docs already state AGENTS.md compatibility with "20+" other tools generically without naming Cursor's rule format specifically. If a Cursor-specific comparison is wanted later, `docs.cursor.com` would be the primary source to check.
- **Any first-party source that names a specific tool for checking free-text citations** (e.g., "see ADR-0002" written as prose, not a Markdown link) rather than literal Markdown links/paths — no such tool or convention surfaced in Nygard's post, adr.github.io, or lychee's docs. The gap between "dangling link" (tool-checkable) and "dangling prose citation" (not tool-checkable without reformatting as a link) appears to be a real, unaddressed gap in the primary sources checked, not an oversight in this research.
- **Exact Claude Code version behavior nuances** (e.g., pre-v2.1.277 AGENTS.md support, the `agents-md@builtin` vs `cc-plugin-agents-md@builtin` plugin ID rename at v2.1.285) were taken verbatim from the docs page's own version notes; this repo's installed Claude Code version was not checked against them, so which branch of that behavior actually applies to the user's current CLI was not separately confirmed.

---

## Implications for this repo

- **Create a real `CLAUDE.md` at repo root, don't fight the generated `AGENTS.md`.** Per §2.2, as soon as `CLAUDE.md` exists anywhere on the path, Claude Code reads *only* `CLAUDE.md` files by default — it stops reading `AGENTS.md` at all. This cleanly sidesteps the conflict with `next dev`'s auto-regenerated stub: put real project content in `CLAUDE.md`, leave `AGENTS.md` to Next.js, and the two never need to merge.
- **Keep `CLAUDE.md` under ~200 lines and limited to what the code and git history can't tell an agent** (per §1.2): build/test commands, the PayPal-merchant-of-record decision and why (link to the ADR rather than restate it), any "don't copy this pattern" notes, and anything already corrected twice in session. Skip anything /init or a fresh read of the repo would already surface.
- **If AGENTS.md content is ever wanted too** (e.g. for a non-Claude agent), know that `next dev`'s `upsertFile` only touches the marked block between `<!-- BEGIN:nextjs-agent-rules -->` / `<!-- END:nextjs-agent-rules -->` (§2.3) — real project content appended outside that block would survive every `next dev` run. This is a viable fallback, but the CLAUDE.md route above is simpler and matches Claude Code's documented default.
- **Resolve the dangling `ADR-0002` / "live sandbox evidence" citation in `docs/adr/0001-...md` — pick one, don't invent a fix here:**
  1. **Write ADR-0002** if the sandbox evidence actually exists/was actually gathered, following Nygard's five-section template (§4.1): Title, Context, Decision, Status, Consequences — one to two pages, in prose.
  2. **Remove the "superseded by ADR-0002" status clause** (and the "live sandbox evidence" claim) from ADR-0001's status line if that decision/evidence was never actually produced, reverting it to a plain `status: accepted` until a real ADR-0002 exists.
  3. **Add an automated link check** (lychee + `lycheeverse/lychee-action`, §5) to CI over `docs/**/*.md`, so a future ADR/status edit that references a non-existent sibling file fails the build — note this only catches it if the reference is written as a Markdown link (e.g. `[ADR-0002](../adr/0002-foo.md)`), so resolving this ADR should also mean rewriting the citation as a real link, not prose, if a link checker is adopted.
- **Treat ADRs as the durable decision record, `docs/research/*.md` as disposable investigation notes** — this matches how the repo already uses them (one ADR, several dated research files) and matches Nygard's framing of ADRs as the long-lived "why" record, separate from scratch research.
- **If per-directory context grows** (e.g. a `components/` or `app/api/` convention set emerges), use nested `CLAUDE.md` or `.claude/rules/*.md` with `paths:` frontmatter (§1.3, §1.5) rather than growing the root file — this repo is still small enough that this isn't needed yet, but the pattern is there for when it is.
- **Add a periodic CLAUDE.md audit habit**: run `/doctor prompt-audit` after major changes (it flags stale file/command references and model-specific instructions directly, §1.4), and treat CLAUDE.md edits like any other PR-reviewed doc change (§1.5) rather than a side effect of `/init`.
