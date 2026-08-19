---
name: yt-plan
description: "Create an implementation-ready plan from a direct request, optional PRD, or existing plan without changing application code."
---

# YT Plan

Produce a practical implementation plan that a worker can execute without inventing scope or major technical decisions. Planning never implements the work.

## Inputs and authority

A direct request is sufficient. A missing PRD, plan, or previous workflow stage never blocks planning.

Use this authority order:

1. the user's current explicit request and corrections;
2. an artifact the user explicitly supplied;
3. relevant auto-discovered repository context.

Treat an explicit PRD or plan as supporting authority only where it does not conflict with the current request. Auto-discovered artifacts are context, not permission to change scope or files. If multiple material sources conflict, ask one focused question instead of guessing.

## Core rules

- Inspect repository instructions, relevant code, existing tests, and nearby patterns before asking discoverable questions.
- Ask exactly one question at a time. Use `ask_user` for a genuine blocking architecture or scope decision when available.
- Preserve confirmed product scope and make assumptions visible.
- Resolve planning-time questions through evidence or a focused user decision.
- Leave execution-time unknowns explicit instead of pretending to know runtime results.
- Use repository-relative paths throughout the plan.
- Do not edit application code, run migrations, stage files, or create commits.
- Keep the detailed plan in the session by default. Never create or update a plan or PRD unless the user explicitly asks or accepts the final offer.

## Bounded research and review

Work inline when repository inspection is small and the approach is already grounded. Use parent-session web tools directly when current external documentation is necessary; packaged research agents are intentionally local-only.

Before delegation, inspect available profiles with `subagent_agents`. Require every selected profile to report `source: "package"`, `package: "pi-workflow"`, and the exact tool list `read, grep, find, ls`; a higher-precedence override, missing `tools` metadata, or any mismatch is an incompatible provider/profile and must stop delegation. Evidence gathering may use:

- at most one fresh `repo-researcher` for local architecture, patterns, files, and tests;
- at most one fresh `learnings-researcher` for prior decisions and lessons recorded in local repository files.

Use a profile only when its evidence can change the approach, risk treatment, or verification. Start selected evidence profiles independently with `subagent_spawn`, a trusted repository `working_dir`, and complete read-only questions, then make one `subagent_wait` call with their run IDs before planning from the results.

After drafting the plan, always run one fresh `plan-reviewer`. Add at most one of each adaptive reviewer when its concern is material:

- `scope-guardian` for possible scope expansion, narrowing, or reinterpretation;
- `feasibility-reviewer` for cross-module work, unknown dependencies, migrations, external services, or risky sequencing;
- `security-reviewer` for auth, permissions, public APIs, sensitive data, payments, secrets, uploads, webhooks, or third-party integrations.

Start the selected review set independently, with at most four active runs, then make one `subagent_wait` call for all review run IDs. Incorporate valid findings before finalizing and disclose skipped adaptive roles with a reason. Do not use chains, retries, resume, replacement agents, or management actions. `pi-toolbox` and these named profiles are package prerequisites; if the required tools or a selected profile is unavailable, stop with the prerequisite or discovery failure.

## Workflow

1. **Resolve the source.** Start from the current request, then read an explicitly supplied PRD or plan. Search for related artifacts only when they would reduce ambiguity.
2. **Confirm scope.** Capture the goal, in-scope behavior, non-goals, success criteria, and true blockers. Ask only when a material decision cannot be responsibly inferred.
3. **Gather targeted context.** Find the owning files, current patterns, test locations, dependencies, and external constraints that affect the plan.
4. **Make planning decisions.** Record the chosen approach and rationale, sequencing, risks, and execution-time unknowns.
5. **Draft ordered units.** Each unit should be coherent enough to implement and validate independently.
6. **Review the draft.** Run `plan-reviewer` plus only the adaptive reviewers justified by scope, feasibility, or security risk; revise from evidence without widening product scope.
7. **Return the plan in session.** Offer persistence only after the plan is complete. Suggested path: `docs/plans/YYYY-MM-DD-<slug>-plan.md`.

## Plan shape

Use only sections that carry useful information:

```markdown
# <Title> - Plan

## Scope
## Key Decisions
## Implementation Units
### U1. <Outcome>
- Goal
- Requirements
- Dependencies
- Files
- Approach
- Test Scenarios
- Verification
## Risks and Blockers
## Definition of Done
```

Every feature-bearing unit must name repository-relative implementation and test paths, concrete happy/error/edge scenarios that apply, dependencies, and an observable verification result. Non-behavioral units state why no test is expected and name replacement verification.

## Completion

A plan is ready when units are dependency-ordered, important decisions have rationale, risks and blockers are visible, and a worker can begin without making a product or architecture choice the plan should have settled.

When the completed plan contains multiple immediately independent units that would benefit from separate visible sessions, optionally suggest `/skill:yt-dispatch <request-or-plan-path>`. Otherwise, end by suggesting `/skill:yt-work <request-or-plan-path>`. Dispatch is never mandatory. Never invoke either skill automatically.
