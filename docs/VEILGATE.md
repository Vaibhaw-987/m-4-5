# VeilGate: private allowlist access

VeilGate is the Level 4 MVP described in [proposal.md](proposal.md). An
organizer publishes only a commitment to an allowlist. A member proves *"I am
on the list"* in zero knowledge, without revealing *which* entry they are.

The contract is [`contracts/veilgate.compact`](../contracts/veilgate.compact).

## The privacy claim, precisely

This is the part worth checking rather than trusting.

| Fact | Where it lives | Who can see it |
| --- | --- | --- |
| Allowlist commitments (the Merkle tree) | Public ledger | Everyone |
| Number of registered members | Public ledger | Everyone |
| Number of check-ins | Public ledger | Everyone |
| Current epoch | Public ledger | Everyone |
| One nullifier per check-in | Public ledger | Everyone |
| Member secret | Encrypted browser private state | Only the member |
| **Which entry a prover matched** | Never computed publicly | Nobody |
| **Link between two check-ins across epochs** | Never computed publicly | Nobody |

A commitment is `persistentHash("veilgate:member:", secret)`. The tree holds
commitments, never secrets, so publishing the tree reveals nothing about who is
on the list beyond how many entries it has.

## How a check-in works

1. The member's browser resolves their own Merkle path from the public tree.
2. `proveMembership` takes the secret and the path as private witnesses.
3. The circuit asserts the path's leaf equals `deriveCommitment(secret)`, which
   binds the proof to this caller.
4. The circuit asserts the path's root matches the on-chain tree root.
5. The circuit derives `nullifier = persistentHash("veilgate:nullifier:", epoch, secret)`,
   asserts it is unspent, and records it.

Only step 5's nullifier and the incremented counter reach the ledger. The path
and the secret stay private, so an observer learns that *some* valid member
checked in, and nothing more.

## Why the leaf binding matters

Step 3 is the assertion the whole scheme rests on. The Merkle tree is public,
so anyone can read another member's path out of it. Without binding the leaf to
the caller's own secret, a non-member could replay a real member's path and
check in as them: the root would validate, because the path is genuine.

That attack is not hypothetical, because an attacker runs their own client and
can supply any witness they like. So it is tested against a deliberately
malicious client rather than the honest one, in
[`tests/veilgate-attack.test.ts`](../tests/veilgate-attack.test.ts):

- a non-member replaying a genuine member's path is rejected,
- a non-member claiming a genuine member's leaf is rejected,
- the genuine member is still admitted afterwards.

## Epochs and unlinkability

The nullifier is domain-separated and includes the epoch, so:

- Within an epoch, a member can check in exactly once. A second attempt hits
  the spent-nullifier assertion.
- When the organizer rotates the epoch, every member's nullifier changes.
  They can check in again, and the new nullifier is not linkable to the old
  one, because linking them would require the secret.

This is what makes "one entry per person per event" work without a login and
without a per-person identifier.

## Trust boundaries and limits

Worth stating plainly, because the product is a privacy claim.

- **The organizer curates the list but cannot see who checks in.** That
  separation is the product. The organizer does learn the commitment of each
  member they register, so a member who hands their commitment directly to the
  organizer is known *to be on the list*; what stays hidden is which check-in
  is theirs.
- **The list size is public.** Hiding it would need a fixed-size tree with
  dummy entries, which the current version does not do.
- **Membership is bounded at 1024** (`MerkleTree<10, Bytes<32>>`). Growing it
  is a one-line depth change plus a redeploy, and the proposal starts from a
  bounded list deliberately.
- **Losing the browser private state loses the membership.** There is no
  recovery circuit; the escape hatch is re-registration by the organizer in a
  later epoch, the same limitation VeilPledge documents.
- **Timing metadata is outside the guarantee.** A member who checks in
  seconds after registering, alone, is correlatable by timing regardless of
  what the circuit hides.
- **The organizer role is first-come.** `claimOrganizer` assigns the role to
  the first caller of a fresh deployment, so a deployment must be claimed by
  its intended organizer before anyone else sees the address.

## Running the tests

```bash
npm run compile
npm run test:contract
```

The VeilGate suite covers the three cases the proposal names (happy path,
non-member rejection, double-use rejection) plus organizer authorization,
epoch rotation and the adversarial path-replay attacks.
