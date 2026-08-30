# CampOps Consumer POC — Source Documentation

This folder contains the source documentation Claude Code should read before making implementation changes to the CampOps Consumer Agentic Booking POC.

## Project Boundary

This is a standalone consumer POC, not a branch or extension of the existing CampOps admin/operator application.

The two products share a domain and brand, but they do not currently share a backend, data layer, or unified object model. Do not inherit admin-side architecture, schemas, or components unless there is a clear consumer-side reason to do so.

Where the consumer documentation intentionally diverges from the admin model, preserve that divergence.

## Source-of-Truth Hierarchy

The files in this folder have different responsibilities. Do not treat them as one flat set of requirements.

### 1. PRD
**Authority:** Product behavior, scope, requirements, success criteria, evaluation scenarios.

Use the PRD to determine:
- what the product must accomplish
- what is in or out of scope
- what the agent may do autonomously
- what requires explicit authorization
- what the POC must prove
- how success should be evaluated

If another document conflicts with the PRD on product behavior, flag the conflict rather than silently resolving it.

### 2. Design Brief
**Authority:** Current experience decisions and interaction behavior.

Use the Design Brief to determine:
- how intent remains visible and correctable
- how agent activity is communicated
- how users redirect or interrupt the agent
- when the agent should interrupt the user
- how constraints, preferences, and priorities are represented
- how recommendations and tradeoffs are explained
- how staged work differs from committed work
- how rejection, alternatives, unsupported requests, and clarification are handled

Do not redesign an interaction that the Design Brief has already resolved.

### 3. POC Build Brief
**Authority:** Technical architecture and implementation boundaries.

Use the Build Brief to determine:
- application architecture
- model responsibilities
- deterministic application responsibilities
- state requirements
- mocked versus real systems
- OpenAI integration direction
- implementation constraints
- intentionally unresolved technical decisions

Normal implementation choices may be recommended, but product or design behavior must not be changed silently.

### 4. Design Handoff Spec
**Authority:** Implementation-level UI specification.

Use the Design Handoff Spec for:
- exact design tokens
- typography
- spacing
- radius values
- component contracts
- component variants
- responsive behavior
- accessibility requirements
- per-screen implementation notes
- state and interaction details
- links to the live Figma files

This document exists so engineering does not have to guess decisions that design has already made.

### 5. Live Figma Files
**Authority:** Current visual, component, and screen source of truth.

Use the Figma MCP to inspect the live files linked from the Design Handoff Spec.

The live files include:
- **CampOps Consumer — DS**: published component library and style guide
- **CampOps Consumer — Pages**: designed desktop and mobile screens
- **OOUX Object Map + User Flow**: object map, nested object matrix, CTA matrix, golden path, and edge cases

If the Design Handoff Spec and live Figma disagree, **the live Figma file is correct**.

### 6. Case Study Notes
**Authority:** Historical reasoning and decision record.

Use the Case Study Notes to understand:
- why decisions were made
- alternatives that were considered
- what evidence informed choices
- what would cause a decision to change
- implementation and design discoveries worth preserving

Case Study Notes do not override newer current-state decisions in the PRD, Design Brief, Build Brief, Handoff Spec, or Figma.

### 7. Agentic Interface Research
**Authority:** Supporting evidence only.

The research documents explain the evidence base behind the product and design decisions.

Use them when background rationale is needed, but do not treat research recommendations as implementation requirements when a current project document has already made a decision.

## Required Reading Order

Before planning or coding, read the project sources in this order:

1. PRD
2. Design Brief
3. POC Build Brief
4. Design Handoff Spec
5. Inspect the live Figma files linked from the Handoff Spec
6. Inspect the repository
7. Review Case Study Notes where useful
8. Consult the research documents only when background rationale is needed

## Implementation Rules

- Do not make code changes until the current product, design, build, and handoff documentation has been reviewed.
- Do not silently change product behavior, design intent, autonomy boundaries, or consequence handling.
- Flag contradictions between documents, Figma, and the repo before resolving them.
- Build reusable components from the design system rather than duplicating whole screens.
- Preserve the distinction between probabilistic model work and deterministic application truth.
- Critical state must live in the application, not only in conversational memory.
- Model output that updates application state must be structured and validated.
- Inventory, availability, pricing, booking state, and consequence-sensitive transitions remain deterministic.
- Consequential financial or irreversible actions require explicit user authorization.
- Treat the consumer POC as independent from the admin/operator implementation unless a shared pattern is clearly justified.

## First-Pass Claude Code Instruction

Before making code changes:

1. Read everything in this folder using the hierarchy above.
2. Inspect all live Figma files linked from the Design Handoff Spec using the Figma MCP.
3. Inspect the repository.
4. Report back with:
   - product hypothesis
   - golden path and edge cases
   - primary objects and application state
   - GPT-5.4 mini responsibilities
   - deterministic application responsibilities
   - autonomy and authorization boundaries
   - Figma component-to-code mapping
   - reusable existing repo patterns
   - contradictions or gaps
   - unresolved technical decisions that block the first vertical slice
   - proposed implementation sequence
5. Do not begin implementation until the plan is approved.

## Maintenance

These files are local implementation references copied from the project’s Drive documentation.

When the Drive documents change materially, refresh the corresponding local copies and commit the update so the repository preserves the documentation baseline used for implementation.
