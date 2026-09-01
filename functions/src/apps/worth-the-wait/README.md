# Cloud Functions for Worth the Wait

## Function behavior

The `triggerBoxAction` callable endpoint enforces the locked reveal workflow for Worth the Wait:

- requires an active `revealStartRequest` from one partner before the other partner can trigger the reveal,
- verifies both space members are online and still in the Worth the Wait flow,
- rejects duplicate simultaneous triggers via a transaction on `apps/worth-the-wait/spaces/{spaceId}.activeAction`,
- uses server-side randomness for raffles,
- waits for the remaining animation duration before marking the action as completed,
- clears reveal requests and appends a revealHistory entry when the action finishes.