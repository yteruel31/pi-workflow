---
name: yt-brainstorm
description: "Clarify a product idea, pressure-test its scope, and optionally capture a concise PRD before technical planning."
---

# YT Brainstorm

Turn a rough idea into a small, confirmed product brief. Stay product-only: define what should be built and why, not its architecture or implementation.

## Inputs and authority

A direct request is sufficient. A missing PRD or previous workflow stage never blocks brainstorming.

Use this authority order:

1. the user's current explicit request and corrections;
2. an artifact the user explicitly supplied;
3. relevant auto-discovered repository context.

Auto-discovered context is supporting evidence only. It never silently overrides the request and is never modified without approval. If multiple material sources conflict, ask one focused question instead of guessing.

## Core rules

- Inspect available repository context before asking a question whose answer is discoverable.
- Ask exactly one question at a time. Use `ask_user` for a genuine blocking decision when available.
- Clarify the problem, intended user or actor, outcome and value, scope, non-goals, and success signals.
- Challenge weak assumptions and name uncertainty honestly.
- Present two or three approaches only when meaningful alternatives exist, then recommend one with its trade-off.
- Do not design APIs, schemas, modules, migrations, or implementation sequencing.
- Keep output in the session by default. Never create or update a PRD unless the user explicitly asks or accepts the final offer.

## Bounded research

Work inline unless separate evidence would materially change scope, a recommendation, or confidence.

Before delegating, inspect the available roles. A single invocation may use:

- at most one fresh `scout` for local repository evidence;
- at most one fresh `researcher` for external evidence.

When both are necessary, they may run in one bounded parallel call. Use foreground execution with inline returns: set `async: false`, `output: false`, and `artifacts: false`. Tell each child to stay read-only, return concise evidence, and not spawn subagents.

Do not use chains, saved workflows, background runs, retries, resume, management actions, or additional agents. If the tool, role, or web access is unavailable, continue inline when safe and mention only the evidence or capability that could not be obtained.

## Workflow

1. **Frame the idea.** State the problem and intended outcome in plain language. Verify repository facts before treating them as constraints.
2. **Close product gaps.** Ask focused questions until actor, value, scope, non-goals, and success signals are known or explicitly recorded as assumptions.
3. **Compare real options.** When more than one product shape is credible, present the alternatives before the recommendation.
4. **Confirm a concise synthesis.** Summarize the proposed product, key decisions, scope boundaries, success criteria, and remaining open questions. Ask for confirmation before offering persistence.
5. **Offer an optional PRD.** Keep the confirmed synthesis in the session unless the user asks to write it. Suggested path: `docs/prds/YYYY-MM-DD-<slug>.md`.

## Optional PRD shape

When approved, write only the useful sections:

```markdown
# <Title>

## Summary
## Problem
## Scope
## Non-goals
## Success Criteria
## Key Decisions
## Open Questions
```

Omit empty sections and keep implementation details out.

## Completion

A brainstorm is complete when the intended actor, outcome, scope, non-goals, and success signals are clear enough that planning does not need to invent product behavior.

End by suggesting `/skill:yt-plan <request-or-prd-path>` when technical planning is useful. Never invoke the next skill automatically.
