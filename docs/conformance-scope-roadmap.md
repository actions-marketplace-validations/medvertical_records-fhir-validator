---
type: product-contract
status: current
owner: validation
audience:
  - integrator
  - developer
  - internal
last_reviewed: 2026-08-21
source: manual
---

# FHIR Conformance Scope Roadmap

**Status:** 2026-07-30
**Scope owner:** validator engine / HL7 `FHIR/fhir-test-cases` lane
**Repository boundary:** public `medvertical/records-fhir-validator` package scope
**Current headline:** 100.0% on executable JSON resource comparison cases

This document defines what the validator conformance number means, why the
HL7 manifest has more entries than the current score counts, and which test
classes should be added next.

This is the source of truth for the HL7 `FHIR/fhir-test-cases` lane. MII
reference parity is a separate lane defined in
[MII Conformance Scope](./mii-conformance-scope.md).

## Current Measurement

The current conformance harness measures one thing:

> JSON FHIR resource validation parity against the HL7 Java validator's
> expected `OperationOutcome`.

It does not measure every format, protocol, historical version, or adjacent
standard represented in `FHIR/fhir-test-cases`.

| Stage | Count | Meaning |
|---|---:|---|
| Upstream manifest entries | 969 | All entries in `FHIR/fhir-test-cases/validator/manifest.json` at commit `8923095`. |
| Pre-filtered out | 433 | Not executable by the current JSON resource comparison harness. |
| Candidate comparison set | 536 | R4/R5/R6 or unversioned entries where the upstream manifest declares a `java` baseline. |
| Runtime skipped | 0 | Every candidate's declared Java `OperationOutcome` resolves locally. |
| Executed and compared | 536 | Records output was normalized to `OperationOutcome` and diffed against Java. |
| Passed | 536 | Comparisons matching the normalized Java result. |
| Failed | 0 | No executable comparison differs from the normalized Java result. |

The previous 2026-05-03 launch-discovery lane is retained as historical
evidence. It was measured against an older manifest and must not be combined
with the current headline result.

The current score should be described as:

> Records matches the Java validator on all 536 currently in-scope FHIR JSON
> resource validation comparisons.

It should not be described as support for every item in the upstream manifest.

## Why 433 Entries Are Pre-Filtered

| Reason | Count | Decision |
|---|---:|---|
| XML resources | 299 | The XML adapter is active; add a separate Java-baseline XML score rather than changing the JSON headline. |
| Non-R4/R5/R6 FHIR versions (`3.0`, `3.0.1`, `1.4`) | 47 | Add only if legacy STU3/DSTU support becomes a product target. |
| Unsupported modules: SHC, CDA, CDS Hooks, JSON5, XVer, DSIG, HL7 v2 | 68 | Adjacent standards need dedicated modules and separate scores. |
| Disabled by upstream manifest (`use-test: false`) | 17 | Keep excluded unless upstream enables them or Records defines its own baseline. |
| No `java` baseline declared in the upstream manifest | 1 | `(default)/zzz` is an upstream platform-specific teardown workaround rather than a validator comparison case. |
| Logical model test | 1 | Add as a logical-model lane if logical-model validation is implemented. |

These are excluded because they do not test the current package contract:
validate a parsed FHIR JSON resource and compare the result with a Java
`OperationOutcome` baseline.

## Completed Executable Parity Lane

The upstream manifest cleanup removed the baseline-resolution gap: all 536
headline candidates now execute against checked-in Java outcomes and match the
normalized Java result. No executable parity differences remain in this lane.

| Module | Failed |
|---|---:|---|
| All measured modules | 0 |

The machine-readable case details are in
`conformance-results/report-2026-07-21.json`. Future parity changes must update
the validator or an explicitly justified normalization policy and add focused
regression tests; differences must not be hidden with replacement outcomes.

### Historical Baseline Discovery

`conformance-results/baseline-backlog-discovery-2026-05-03.json` records a
547/547 discovery run against the older manifest. That lane used local path,
parser, and compatibility fixtures behind the legacy
`--include-baseline-backlog` flag. It remains useful as historical provenance,
but its 100.0% result is superseded by the current direct-baseline measurement.

The upstream cleanup now supplies direct outcomes for cases including
`opdef2-params`, `cc-pattern-system-only`, and `cw-slice-compatible`; Records no
longer injects hidden manifest fields, remaps stale outcome paths, or synthesizes
missing Java outcomes in the headline harness.

## Scope Lanes

Conformance should be reported as multiple lanes instead of one blended
percentage:

| Lane | Status | Metric |
|---|---|---|
| JSON resource parity | Active | `passed / executed` against Java `OperationOutcome` baselines. |
| Baseline-backlog discovery | Historical | Older opt-in measurement retained for provenance; not part of the current headline claim. |
| NDJSON input parity | Adapter active | The bounded loader and CLI lane are shipped; publish a dedicated multi-resource parser/validation metric separately from JSON parity. |
| XML input parity | Adapter active, score pending | Namespace-aware parsing, normalization, source locations, DTD/entity rejection, primitive extensions, contained resources, and XHTML are shipped; Java-baseline fixture scoring remains separate work. |
| FML mapping tests | Discovery fixture only | Two Java StructureMap parser-baseline fixtures are green; a product mapping runner remains separate work. |
| JSON5 parser behavior | Discovery fixture only | Eight Java parser-behavior fixtures are green; product JSON5 input support remains a separate decision. |
| DSIG JSON harness | Discovery fixture only | Six Java DSIG JSON fixtures are green; cryptographic-signature validation remains a separate product lane. |
| Adjacent standards | Separate backlog | CDA, HL7 v2, CDS Hooks, SHC, and XVer each need explicit support decisions. |
| Legacy FHIR versions | Separate backlog | STU3/DSTU compatibility score if legacy versions are supported. |
| Logical models | Separate backlog | Logical-model validation score if implemented. |

## XML Decision

An XML-to-JSON adapter is worth adding, but it should be a separate input
lane with its own score. It should not be hand-rolled string parsing.

Input-adapter acceptance criteria are complete:

- Use a maintained XML parser that preserves namespaces, attributes, text
  nodes, and order where FHIR XML semantics require it.
- Normalize XML resources into the same internal object shape used by JSON
  validation.
- Preserve source locations enough to produce useful XML diagnostics.
- Cover FHIR primitive value/extension representation in XML.
- Cover XHTML narratives and contained resources.
The remaining measurement task is to compare XML fixtures against Java
`OperationOutcome` baselines in a separate report, for example
`XML input parity: x/y`.

This keeps the core validator object-based and makes XML an input adapter
rather than a forked validation engine.

## Recommended Execution Order

1. **Publish the broadened discovery artifact.** Keep the launch-discovery
   artifact (`547/547`, 0 skips) with the public export so reviewers can
   inspect the exact JSON5, DSIG JSON, parser-baseline, and compatibility
   fixtures included behind `--include-baseline-backlog`.
2. **NDJSON loader — complete.** The CLI and public adapter accept bounded
   one-resource-per-line input; a separate parity metric is still required.
3. **Classify FML.** Decide whether FML belongs in the public validator repo.
   If yes, add a mapping-language runner and score it separately.
4. **XML adapter — complete; parity report next.** Parser, normalizer, security
   limits, and source-map support are active. Keep its future Java comparison
   separate from JSON.
5. **Decide adjacent standards explicitly.** CDA, HL7 v2, CDS Hooks, SHC,
   XVer, product JSON5 input support, and DSIG cryptographic verification
   should not be inherited accidentally just because they appear in the HL7
   test-case repository.
6. **Decide legacy versions.** Add STU3/DSTU support only if there is a
   concrete customer or ecosystem reason.

## Open-Source Readiness Rule

The public `medvertical/records-fhir-validator` README must state:

- Records itself remains commercial closed-source software.
- The public validator package is Apache-2.0 unless a package-level notice
  says otherwise.
- The headline conformance number is the JSON resource comparison lane.
- Skipped and excluded test classes are documented separately and are not
  hidden inside the percentage.

That framing is required before using the conformance number externally.
