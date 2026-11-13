# Runway 🛫

Runway is an income-first budget planner for money that does not arrive or leave on a tidy schedule. Most budgets start from a month and a bank balance, but money arrives in pieces from several places, bills land between paychecks, and a balance includes money already spoken for. Runway starts from the money as it arrives, drafts where it should go, and keeps what is spoken for apart from what you can spend. It never needs a bank login to get started, and linking a bank later never gives Runway your sign-in: you sign in on your bank's own site where it offers that, otherwise in Plaid's window. One person owns each plan, and sensitive details are encrypted.

## How it works

1. Add your income sources, each with its own schedule, amount and ending.
2. Add bills, envelopes and savings goals, each with a priority of Must, Should or Want.
3. Put what is on your horizon: name the event (Moving), list its one-time and repeating costs, put money toward it, and say where the rest comes from.
4. Say where things stand now: money on hand and what is already set aside.
5. For each coming income day, review the draft, adjust it, and confirm when the money arrives.
6. Look ahead to see how far the plan holds, and change it whenever life changes.
7. Choose how much to track: plan only, or add purchases as you spend.

## Status

Built:

- [x] Income with pay lines, exact or range amounts, and endings
- [x] Bills, envelopes and goals with priorities and a planning stance
- [x] Bills grouped under a name (Home, Subscriptions) with what they come to a month
- [x] Drafts for every income day, confirmed with what arrived, with a change log
- [x] Guided setup, look-ahead, and a Plan or Track choice
- [x] Start from a budget you already have: files or pasted text, read by an AI, reviewed before anything is added
- [x] Purchases entered by hand, with Left per envelope and Free to Spend
- [x] Savings goals with a pace line, and monthly envelope funding
- [x] Plan changes from a date or for a stretch, with the effect shown first
- [x] Priorities: every item in funding order, where a short pay runs out, and a way to reorder
- [x] Credit cards, each with its own reserve: purchases and bills paid by card, and paying a card off in one step
- [x] A link on a purchase, and purchases grouped into an expense ("Chicago trip") with its total, listed on Spend
- [x] Receipt photos on purchases, sealed on the device and kept until you remove them
- [x] Read a receipt on tap: the amount, the store, the day and the items fill in for you to check
- [x] Move what is left in an envelope to another envelope, a goal or Free to Spend, with an Undo

- [x] Check your balance: type what your bank holds and see how it compares with Runway
- [x] Link a bank: sign in at your bank, say which of your cards and accounts each of its accounts is, and bring their balances in, with the bank's figure offered, never applied on its own
- [x] Purchases from a linked bank wait in Needs a home and are filed in a tap; one you already typed by hand is matched to the bank's, so it counts once
- [x] Rules: always send a place, a kind of place or a card to an envelope, made from a waiting purchase, changed or removed in Spend > Rules
- [x] Unlink a bank: new purchases stop and everything that came in stays; unlinking the last bank moves the plan from Link to Track, stopping tracking moves it to Plan, and moving back up restores the same data

Next:

- [ ] Horizon: plan an event's costs, set money aside for it, see how far it goes, set each price, then pay it, make it a bill, finish it, or call the event off and bring it back later
- [x] Dates that read with an ordinal ("Feb 1st") everywhere in Runway
- [ ] Start from gross pay with taxes and deductions
- [x] Interest (APY) on savings, checking and cash accounts, shared across the goals an account holds
- [ ] Loans
- [ ] What if: a scratch copy of the plan
- [ ] Import purchases from a CSV
- [ ] Reminders for bills and income days

## Plaid

Runway links banks through Plaid. Keep this list current whenever a change starts or stops using a Plaid product.

- **Plan:** Trial. Bank logins in use: 6 of 20 (Plaid Dashboard, Nov 2026).
- **Products in use:**
  - Transactions: imports charges, deposits and pending ones (`/transactions/sync`, the `SYNC_UPDATES_AVAILABLE` webhook).
  - Transactions Refresh: asks Plaid to check the bank now when the person opens Runway, pulls down or taps refresh, and every 5 minutes while Runway stays open (at most once every 2 minutes per bank; Plaid allows 120 an hour per login).
  - Balance: a live balance read on those same asks (`/accounts/balance/get`; Plaid allows 30 an hour per login and bills each call). Other syncs use the cached `/accounts/get`.
  - Liabilities: a linked card's minimum payment, statement balance, due date and last payment (`/liabilities/get`, the `LIABILITIES` `DEFAULT_UPDATE` webhook). New links ask for it as an additional consented product; it is read only for a link with a card bound to it, when Plaid says it changed and otherwise at most every 12 hours (a bank that doesn't offer it is asked again after 7 days). Billed as a monthly subscription per login once read. A bank that wants the person's agreement first (`ADDITIONAL_CONSENT_REQUIRED`, `ACCESS_NOT_GRANTED`) shows "Get the minimum from your bank" on the card, which reopens the bank's window asking only for that.
  - Recurring Transactions: the bank's own list of repeating charges, outflows only (`/transactions/recurring/get`, the `RECURRING_TRANSACTIONS_UPDATE` webhook). Read when Plaid says it changed and otherwise at most daily; one that is not ready is retried after an hour, and a bank that can't give it is asked again after 7 days. Billed as an add-on after Trial. New links ask Plaid for 180 days of history (Plaid recommends at least 180 for recurring) while the plan still brings in only 30 days of purchases; existing links keep the history depth they were made with, so they may show few settled streams at first.
- **Five-minute check:** a sheet whose balance gets it carries a "Checks every 5 min" chip. Capital One cards and Apple Card share only cached balances, and a bank whose live reads stopped after a sign-in request keeps only the refresh, so their sheets show just when they last updated. Capital One checking and savings get the check.
- **Leaving Trial:** on the Production request form, ask for Transactions, Transactions Refresh, Balance, Liabilities and Recurring Transactions. Plaid keeps only the products named there.

## Docs

- [PRODUCT.md](PRODUCT.md): the full product doc (story, how each part works in detail, build plan)
- [UX.md](UX.md): screens and journeys
- [TECHNICAL.md](TECHNICAL.md): data model, rules, architecture
- [ISSUES.md](ISSUES.md): known issues and open work
