# Preprod user registry

`preprod-users.json` is the list of people who have used VeilPledge on Midnight
Preprod. It backs the Level 5 target of 50 Preprod users.

## Why the list is self-attested

Midnight shields the caller of a contract call. A VeilPledge transaction
carries a `ContractCall` action with an entry point and no sender, and its
unshielded input and output sets are empty. Confirm it against the deployed
contract:

```bash
curl -s -X POST https://indexer.preprod.midnight.network/api/v4/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"query($h:HexEncoded!){transactions(offset:{hash:$h}){contractActions{__typename ... on ContractCall{entryPoint}} unshieldedCreatedOutputs{owner} unshieldedSpentOutputs{owner}}}","variables":{"h":"7268500adb482c14e67953884351b518584f398791bcef324d5ee6cc750cea65"}}'
```

There is no field that maps a call back to a wallet, and that is the privacy
property the product exists to demonstrate. So an address gets into this file
only when its owner submits it, and the address is evidence that a person holds
that wallet, not proof that the wallet called the contract.

What the chain does prove is aggregate usage. The ledger counters advance once
per pledge created and once per pledge completed, so the totals are public even
though the participants are not. `npm run users` reads those counters and
reconciles them against this file.

## Schema

```json
{
  "network": "preprod",
  "target": 50,
  "users": [
    {
      "address": "mn_addr_test1...",
      "joinedAt": "2026-07-24T09:00:00.000Z",
      "source": "x",
      "note": "optional free text"
    }
  ]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `address` | yes | Unshielded Midnight address the user submitted |
| `joinedAt` | yes | ISO 8601 timestamp of the submission |
| `source` | no | Where they came from (`x`, `discord`, `risein`, `direct`) |
| `note` | no | Anything worth remembering about the session |

## Adding a user

Entries come from the feedback form described in [../FEEDBACK.md](../FEEDBACK.md).
The dApp shows the connected address so a user can copy it without typing.

Append the entry, then check the file:

```bash
npm run users -- --network preprod
```

The check fails on a malformed address, a duplicate, or a missing `joinedAt`,
and warns when the registry lists users while the contract has never been
called. Fix any reported problem before submitting, because reviewers verify
the on-chain counters independently.

## What not to do

Do not generate wallets and fund them from one seed to reach 50. Fifty fresh
addresses funded from a single source and transacting in one window is obvious
to anyone reading the chain, and it fabricates the exact evidence Level 5 asks
for. A short honest list beats a long invented one.
