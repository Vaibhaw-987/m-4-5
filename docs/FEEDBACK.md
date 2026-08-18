# Feedback loop

How VeilPledge collects what users say, decides what to act on, and closes the
loop back to them. Level 5 asks for a living feedback loop, so this file is
kept current rather than written once.

## Intake

Feedback arrives through one form, linked from the dApp footer and from the
README:

**[Submit feedback](https://github.com/himanshu748/veilpledge/issues/new?template=feedback.yml)**

The form is a GitHub issue template, chosen because it needs no extra hosting,
is public by default, and gives every submission a stable URL to reference in
triage. It collects:

| Field | Why it is asked |
| --- | --- |
| What were you trying to do | Separates a broken flow from a missing feature |
| What happened instead | The actual symptom, not the user's diagnosis |
| Where it broke | Connect, create, complete, or somewhere else |
| Wallet address (optional) | Adds them to the Preprod registry if they want |
| Network | Preprod or local, since behaviour differs |

The wallet address is optional and explicitly not required to submit. Users who
share it are added to [users/preprod-users.json](users/preprod-users.json); see
[users/README.md](users/README.md) for why that list is self-attested.

Feedback also arrives out of band, from [@VeilPledge](https://x.com/VeilPledge)
replies and DMs, the Midnight Discord, and the RiseIn cohort. Anything
actionable from those channels is copied into an issue so it enters the same
queue, with the source recorded.

## Triage

Every submission is labelled within one working day.

| Label | Meaning | Response |
| --- | --- | --- |
| `bug` | The flow is broken or the privacy claim is at risk | Fix before new features |
| `friction` | It works but confused the user | Batch into the next UX pass |
| `feature` | Something the product does not do | Assess against scope below |
| `wont-fix` | Out of scope or conflicts with the privacy model | Reply explaining why |

Two rules decide priority:

1. **Anything touching the privacy boundary is top of the queue.** If a report
   suggests the owner secret leaks, is reused across accounts, or is derivable
   from public state, it is handled before everything else. That property is
   the product.
2. **Confusion counts as a defect.** A user who cannot tell whether their
   pledge is private has hit a real problem even when the contract behaved
   correctly.

Scope check for `feature`: VeilPledge deliberately keeps one active pledge at a
time so the privacy boundary and state transitions stay easy to inspect. A
request that requires many concurrent pledges is not automatically rejected,
but it must justify the added surface.

## Closing the loop

- Every issue gets a reply, including the ones that will not be built.
- When a change ships, the originating issue is linked in the commit and the
  issue is closed with the commit hash.
- Changes that came from feedback are listed below so the loop is auditable.

## Changes made from feedback

Nothing shipped from external feedback yet. The product went public with the
[@VeilPledge](https://x.com/VeilPledge) profile on 2026-07-24, so this section
fills in as reports arrive. Each row records what was reported, what changed,
and the commit.

| Reported | Change | Commit |
| --- | --- | --- |
| _(none yet)_ | | |

## Known issues found in-house

Recorded here so external reporters can see they are already known, and so the
list is not silently empty.

| Issue | Status |
| --- | --- |
| Lace resets the proof server to Remote after switching network, which fails with a CORS error until it is set back to Local | Documented in the README setup steps; needs a clearer in-app error |
| Lace 2.1.0 hides Midnight Preprod behind a feature flag, so users may not find the network | Documented; nothing the dApp can fix directly |
