# Product proposal — Private Allowlist Access

**Program:** New Moon to Full: Monthly Moonshots on Midnight
**Level 3 idea (from the provided list):** Private Allowlist Access — prove
membership without revealing identity
**Builder:** Himanshu Kumar ([himanshu748](https://github.com/himanshu748))
**Foundation:** [VeilPledge](https://github.com/himanshu748/veilpledge) —
live at [veilpledge.vercel.app](https://veilpledge.vercel.app/)

## Problem

Communities, DAOs, event organizers, and token-gated products need to grant
access to an approved set of people. Today that almost always means publishing
the list itself (wallet addresses, emails, or usernames) or handing it to a
trusted gatekeeper. Every check leaks who is on the list, who showed up, and
which entry they matched — data that can be scraped, correlated, and abused.

## Product

**VeilGate** lets an organizer publish only a cryptographic commitment to an
allowlist, and lets each member prove *"I am on the list"* in zero knowledge
without revealing *which* entry they are.

- The organizer registers member commitments on a Midnight contract. Each
  commitment is derived from a member secret that never leaves the member's
  browser.
- A member proves membership through a Compact circuit: the private witness is
  their local secret, and the circuit checks it against the committed set.
- A domain-separated nullifier makes each access one-time (or one-per-epoch)
  without linking uses to an identity, preventing pass-sharing and replay.
- Selective disclosure: the only public facts are the size of the list, that
  a valid member checked in, and the nullifier that prevents reuse.

## Why Midnight

The product is only possible with private circuit inputs and public
commitments in one contract. Compact witnesses keep the member secret local,
the ledger holds only commitments and nullifiers, and proofs are verified
on-chain — the same `localSecretKey()` witness, domain-separated
`persistentHash` commitment, and encrypted local private-state patterns
already proven in VeilPledge.

## What stays public vs private

| Data | Visibility |
| --- | --- |
| Allowlist commitment set (hashes) | Public ledger |
| Number of registered members and check-ins | Public ledger |
| Nullifiers (one per use) | Public ledger |
| Member secret | Encrypted browser private state, witness-only |
| Which list entry a prover matched | Never revealed |
| Link between two check-ins by the same member | Never revealed across epochs |

## MVP scope (Level 4)

1. Compact contract: register commitments (organizer), prove membership with
   nullifier (member), epoch rotation.
2. React frontend on Preprod with Lace: organizer view (manage list, watch
   anonymous check-in count) and member view (join, prove, status).
3. Tests for every circuit (happy path, non-member rejection, double-use
   rejection) plus web component tests, on the existing CI pipeline.
4. Docs: privacy model (what an observer can and cannot learn), setup, and a
   demo video.

## Milestones

- Week 1 — contract circuits and simulator tests.
- Week 2 — frontend flows wired to Preprod, encrypted private state.
- Week 3 — polish, docs, demo video, MVP live for Level 4 review.

## Risks and mitigations

- **Set membership cost in-circuit** — start with a bounded list size and a
  Merkle/commitment structure that Compact handles efficiently; grow later.
- **Lost member secret** — same recovery limitation as VeilPledge; documented,
  with per-epoch re-registration as the escape hatch.
- **Organizer trust** — the organizer curates the list but cannot see which
  member checks in; that separation is the product.
