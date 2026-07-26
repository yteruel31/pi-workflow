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

## Bounded research

Work inline when repository inspection is small and the approach is already grounded.

Before delegating, inspect the available roles. A single invocation may use:

- at most one fresh `scout` for local architecture, patterns, files, and tests;
- at most one fresh `researcher` for current external documentation or practices.

Use a role only when its evidence can change the approach, risk treatment, or verification. When both are necessary, they may run in one bounded parallel call. Use foreground execution with inline returns: set `async: false`, `output: false`, and `artifacts: false`. Tell each child to stay read-only, return concise evidence, and not spawn subagents.

Do not use chains, saved workflows, background runs, retries, resume, management actions, or additional agents. If the tool, role, or web access is unavailable, continue inline when safe and identify the missing evidence without fabricating it.

## Workflow

1. **Resolve the source.** Start from the current request, then read an explicitly supplied PRD or plan. Search for related artifacts only when they would reduce ambiguity.
2. **Confirm scope.** Capture the goal, in-scope behavior, non-goals, success criteria, and true blockers. Ask only when a material decision cannot be responsibly inferred.
3. **Gather targeted context.** Find the owning files, current patterns, test locations, dependencies, and external constraints that affect the plan.
4. **Make planning decisions.** Record the chosen approach and rationale, sequencing, risks, and execution-time unknowns.
5. **Draft ordered units.** Each unit should be coherent enough to implement and validate independently.
6. **Return the plan in session.** Offer persistence only after the plan is complete. Suggested path: `docs/plans/YYYY-MM-DD-<slug>-plan.md`.

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

End by suggesting `/skill:yt-work <request-or-plan-path>`. Never invoke the next skill automatically.
