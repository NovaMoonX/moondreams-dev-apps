# Runway 🛫

> Everything below is the product vision; the UX doc and the technical design come after this is approved.

## The Short

Runway is an income-first budget planner for money that does not arrive or leave on a tidy schedule. Every source of income, every bill and every goal has its own timing, its own end, and its own priority, and each time money arrives Runway drafts where it should go. You adjust the draft and confirm it. Look ahead to see how far your plan holds, try a what-if before committing to it, and change the plan whenever life changes, with a record of how it used to look and how each income day differed from what was planned. It works with nothing connected: just your income, bills and goals. Track what you spend by hand, import a CSV, or link your accounts when you want the numbers to be exact. Sensitive details are encrypted.

## The Story

Most budgets start from a month and a bank balance. Money actually arrives in pieces, from more than one place, bills land between paychecks, and a checking balance includes money that is already spoken for: rent due Friday, the credit card bill you are about to owe. Runway starts from the money as it arrives, keeps what is spoken for apart from what you can spend, tells you how far ahead everything is covered, and never asks for a bank login to get started, so anyone can plan a budget with it on day one.

## Who It Is For

Every change names the person it serves and is walked as that person. Each person has a situation, the journey they repeat, the level they use and what they never want to see. A change for one never breaks another's journey.

### The owner, who tracks

- **Situation.** Spending goes on several credit cards, each paid in full every month, so a card's balance is money already spoken for, not a debt carried. One account (Wealthfront cash) holds the cash, the cards are paid from it, and it holds the money set aside for envelopes and goals, so no transfer is ever needed for the budget to stay true.
- **The problem it solves.** A separate account per envelope and per card meant a transfer for every purchase; when the transfers lagged, nobody knew what was really free to spend, owed on a card or set aside.
- **Journey they repeat.** Type a purchase or card charge by hand, see what its envelope has left and what is free to spend, pay a card in full from the cash account.
- **Level.** Track. Importing a CSV and linking banks are on hold until the owner says otherwise, so adding a purchase, a card charge or a card payment must stay quick by hand.
- **Never wants to see.** A transfer between accounts to keep the budget true.

### The owner's brother, who plans paycheck to paycheck

- **Situation.** He keeps a sheet of what each paycheck covers over the next two months or so, with amounts that change from paycheck to paycheck.
- **Journey they repeat.** Open the next paychecks, see what each one covers, and when a surprise cost lands (his cat's vet bill) see what the following paychecks give up to absorb it.
- **Level.** Plan only. He never logs a purchase.
- **Never wants to see.** Purchases, cards, receipts, or a figure that depends on a purchase being logged.

### Someone paying off card debt (future, not built)

- **Situation.** Carries a balance on a card. That debt is a loan with a balance, a rate and a payoff date, as "Rates and Scheduled Increases, In Detail" describes.
- **Journey they repeat.** Pay the card each month, put anything extra toward the payoff through priorities, and watch the payoff date move closer.
- **Level.** Track: a carried card links to its debt.
- **Never wants to see.** A payoff date that ignores the extra they put in.

**Plan and Track stay apart.** A Plan screen never mentions a purchase or a card, and Track only adds to Plan: turning it on shows more, never changes what Plan says or does.

## How It Works

1. **Add your income.** Each source of money has one or more kinds of pay under it, each with its own schedule, amount and ending.
2. **Add what goes out.** Bills that repeat, bills that happen once, bills that end, and spending with no date.
3. **Make envelopes and goals.** Spending categories and savings targets, each with an amount or percentage, a timing rule and a priority: Must, Should or Want.
4. **Say where things stand.** The money you have now and what is already set aside, all optional and in any order. You can start before signing in; your answers stay on this device for 7 days until you do.
5. **Draft and confirm each income day.** Every coming income day has a draft with a reason on each line. When the money is in, you enter what arrived, adjust, and confirm.
6. **Look ahead.** Plan upcoming income days now and see how far the plan holds.
7. **Try a what-if.** Change a scratch copy of the plan and see every upcoming income day before deciding.
8. **Choose how much to track.** Plan only, track purchases, or link accounts. Move either way whenever you like.
9. **See what each envelope can spend.** Every envelope has its own number, and Free to Spend is the money nobody has claimed.
10. **Add what you spend.** Amount, envelope, date, with a note, link or receipt when it helps. Import a CSV or link accounts and purchases arrive on their own.
11. **Change the plan when life changes.** Every change says from when and shows its effect first, and the history keeps what was planned and what happened.
12. **Keep it your own.** One person per plan, with sensitive details encrypted.

### Levels, In Detail

Runway is one app with three levels. Nothing from a level shows until you use it. Plan and Track are built; Link is in Next Steps.

| Level | What you do | What it needs | What you get |
|---|---|---|---|
| **Plan** | Income, bills, envelopes, goals, lookahead, changes and history, the priorities view (what-ifs come later) | Nothing | A draft for every income day, what each envelope is assigned, Free to Spend, how far ahead the plan holds |
| **Track** | Add purchases by hand, import a CSV, attach notes, links and receipts, group purchases, check a balance | What you type or import | Envelopes that go down as you spend ("left"), check an amount, card reserves, a record of what each purchase was for |
| **Link** *(not built yet)* | Link accounts | A link to your accounts | Purchases that arrive on their own, "safe to spend" backed by real cash |

A person who only plans never sees a purchase, a bank screen or an import button. Notes, receipts and groups never change a balance. Anything that moves money, such as assigning a purchase to an envelope or splitting it, belongs to Track and Link.

### Moving Between Levels, In Detail

Tracking is one switch for the whole plan: off is Plan, on is Track. Linking is per account, on top of Track, so a plan can link a checking account and keep tracking cash by hand. A move in either direction is a setting, and each one is recorded in history.

- **Up to Track.** Pick a start date (today by default) and what each envelope holds on it. Amounts from days you already confirmed are filled in, and you add or correct the rest to what each really holds. Purchases from before the start date are not part of it.
- **Up to Link.** Link an account and pick a start date. Runway shows the account's real balance and asks how it divides across your envelopes and goals. Purchases you added by hand for that account after the start date are offered as matches when the real ones arrive, so nothing is counted twice.
- **Down from Link.** Unlink an account. What came in stays. New purchases stop arriving for it, its envelope figures go back from "safe to spend" to "left", merchant rules wait unused, and goals held in it return to the amounts you type. Anything still in Needs a home stays there until you assign or skip it.
- **Down from Track.** Stop tracking. Purchase screens and "left" figures are hidden, envelopes show what they are assigned, and the purchases, notes, receipts and the amounts as they stood that day stay in history.
- **Back up again.** Pick a new start date. The time in between is a gap, and Runway offers to add what you spent since or start fresh from today.
- **Hidden, not disabled.** What depends on a level you are not using is not on screen: check an amount, card reserves, notes and receipts, balance checks, Needs a home, and Where your cash is. It returns, with its data, when you come back.
- **Nothing is deleted and nothing is guessed.** A move down keeps everything. A move up asks for what it needs.

### Starting Out, In Detail

- **One thing is required: an income source.** Everything else has a "Later" button, so the first session still ends with a draft for the next income day.
- **Say where things stand, in any order.** Runway asks one short step at a time:
  - **Income:** who pays you, how often, and when the next one is due.
  - **Bills and upcoming expenses:** what is due and when, how much is already set aside for each, and for a loan its balance and rate, so progress bars start true.
  - **Goals:** the target, and what the goal holds now.
  - **Money on hand:** what you have right now to plan with, before anything has a job. This starts as Free to Spend.
  - **Envelopes:** their amounts and, on Track, what each holds now.
  - **Accounts** *(optional)*: as many as you have, at any bank or app. Each has a name, an institution, a kind (checking, savings, cash management, investment or other), what it holds, and whether it counts toward the money you can plan with. A retirement or brokerage account can be listed and left out of the total. Goals and envelopes can live in any account.
- **One line-up screen.** "Where is your money now?" sets what is assigned (goals, bills, envelopes, card reserve) beside what the accounts hold, and what is left over is Free to Spend. If the assignments are more than the accounts hold, it says "Over-assigned $X". The same screen is used when you start to track and when you link an account.
- **What is missing is said out loud.** Until bills are added, Free to Spend and the lookahead headline say so ("No bills added yet"). They never let a gap in the plan look like a gap in your finances.
- **Or start from a budget you already keep.** When nothing has been added yet, Starting out offers to read up to five files (CSV, text, Markdown or PDF) or pasted text. An AI reads them and proposes income, bills, envelopes and goals; reading needs a signed-in account (a signed-out visitor sees the option, with a note that it needs signing in, and signing in brings them straight to it); nothing is saved until you add them, a value the documents don't give stays empty and asks you, and each proposal opens in its usual form to check.
- **The starting point is the first entry in history.** The plan cannot be opened as of a date before it.

### Income, In Detail

- **A source is who pays you; a pay line is one kind of pay from them.** Rover can have Regular pay (every two weeks, $18 an hour for 20 to 32 hours), Commission (monthly, $0 to $400) and a Holiday bonus (one time). Most sources have one pay line. Each pay line has its own schedule, amount and ending. A source with its own start and end date (a seasonal job, a contract) is not built yet: as built, a source cannot be ended or archived, and an income stops by ending each of its pay lines.
- **Schedules:** weekly, every two weeks, twice a month on chosen dates, monthly, one time (a bonus, a refund, a gift), or irregular. An irregular pay line has no expected days: you add each one when it arrives, and you can give a rough monthly amount for lookahead to use. With a low end of $0, a conservative plan counts on none of it.
- **Pay changes over time.** A new schedule or amount ("Rover moves to weekly pay", "a 4% raise on Jan 1") is a change to the plan from a date on, and the earlier schedule stays in history.
- **Any one income day can differ.** An income day is one occurrence of a pay line. It can be given its own amount or hours without touching the pay line.
- **An amount is exact, a range, or a rate and hours.** Pay with a fixed amount is exact. Tips and commissions are ranges. Hourly pay is a rate and the hours you expect, which can be a range ("20 to 32 hours"). Taxes and deductions apply to hourly pay the same way as to any other.
- **Money counts once it has arrived.** A coming income day is expected until it arrives. When it does, you confirm the actual amount (or it arrives by import or link), the draft adjusts, and Runway shows the difference from what was expected. Lookahead plans against expected income and marks it as expected.
- **A source or a pay line can pay particular things first.** Every income pays for everything in the plan; "Pay these first" points one at specific envelopes, bills and goals, which come out of that pay before anything else, each with an amount, a percentage or "the rest". Rover can pay Groceries ($100) and Spending money (the rest) first. A pairing can be set on the source, on one pay line, or on a single income day ("this check pays the Dec 1 rent and the Travel goal"). The narrower one wins: a pairing on a pay line replaces the source's for that line, and one on an income day replaces both for that day. The pairing shows both ways: on the source ("Funds: Groceries, Spending money") and on the envelope ("Paid by: Rover").
- **Tied money comes only from its source.** If a source falls short on a day (a light week), the draft shows the shortfall and offers a top-up from another source in one tap. A pairing can also be set ahead of time to top up from any source.
- **Whatever no pairing claims pools together.** Each source's money goes first where you pointed it, and the draft assigns the rest. What is left from every source joins one shared pool, Free to Spend, which remembers how much came from each source. A person who does not care sees one number; a person who does can view it by source and assign a particular source's money. Envelopes do not remember: once money is in an envelope, it is just that envelope's money.
- **When income stops.** When a source or pay line ends, lookahead shows the gap. A bill due after the last income day it could be funded from is flagged ("Rent on Sep 1 has no income before it is due").

### Income Days, In Detail

An income day has a draft while it is coming, and is confirmed when the money is in.

- **Every coming income day has a draft.** The draft is Runway's proposed split, built from the plan's rules, priorities, endings, your earlier changes and anything you have overridden for that day. It keeps itself current: change the plan and every coming draft changes with it, while your overrides for a day stay. Every line says why it is there ("Rent: due Dec 1, Must, paid from Main job"). The same plan always produces the same draft.
- **Confirming is one step.** When the money is in, open the day, enter the amount that arrived (it starts as the expected one), look the draft over, and confirm. That records that the money arrived and that you accept the split, and the envelopes fill. With linked accounts, Runway offers the amount for you.
- **Money can arrive early or late.** Confirm the day whenever the money is in, with the date it arrived (today or earlier). The actual date is recorded, and the schedule does not shift. A day not confirmed stays on the list for 14 days after its date, then leaves it and its money is not counted.
- **Planned and confirmed are both kept.** When you confirm a day, Runway keeps the draft as it stood at that moment beside the split you confirm (opening a day stores nothing). It records everything that differs: the amount that arrived against what was expected, each item you gave a different amount, and where extra money went or where a shortfall came from. Any difference can carry a note ("overtime", "a bonus from the quarter"). Later, the day shows what was planned, what happened, and why.
- **Plan several income days together.** Two jobs that pay on Wednesday and Friday can be planned in one sitting. Pick consecutive income days in lookahead, or set Runway to plan together any income days that land within a number of days of each other. The draft shows one list, and each line says which day's money pays for it. Each income day is still confirmed and recorded on its own, with its own amount and date, so nothing underneath changes.
- **Then there is something to do with the real money.** A short checklist: pay the bills this day funded and, once accounts are named, move money to the accounts that hold your goals. Ticking an item marks it done; with linked accounts Runway ticks it when a matching transaction appears. A day with every item ticked shows as done.
- **Changing a confirmed day is a correction.** It shows what the change does to the envelopes and bills before it applies, and the original stays viewable. It is offered while the day is in the recent window (see Limits and Windows).
- **Money that does not arrive.** Mark the day as not arrived. Its draft goes away, and lookahead and the bills react.
- **Those are all the states.** "Money arrived" is part of confirming, and "acted on" is a checklist, not a phase of its own.

### Priorities, In Detail

- **Every bill, envelope and goal has a priority:** **Must**, **Should** or **Want**. New items start as Should. Groceries and the car note are Musts, a streaming subscription and a trip a year away are Wants.
- **Order inside a tier is yours to arrange.** Within a tier, things due before the next income day come first, then your order.
- **Drafts fund in priority order.** When money covers everything, the order changes nothing. When it does not, Wants go unfunded first, then Shoulds, and a Must is the last to be cut. Runway says exactly what went unfunded and why, and a bill funded in part shows its progress.
- **Proposals follow priority too.** When Runway proposes a shift (Cover it, Put it to work, an overspent envelope with no spill-over chain), it takes from the lowest tier with room and sends extra money to the highest-priority thing that is behind. A Must is touched only if you pick it. Confirming less than planned is the one place a proposal reaches Musts, and only once the Wants and Shoulds have nothing left to give (see Confirming Money).
- **Proposals wait for a tap.** The one exception is a spill-over chain you set up yourself, which applies on its own when a purchase goes over.
- **The Priorities view.** One list of everything money goes to, grouped by tier. Move an item to another tier or reorder it within its tier. A line marks where the soonest short income day's money runs out ("Items above the line get all they ask; the first item below may get part"). *As built:* Plan > More > Priorities; reorder by picking an item and placing it.
- **Ties are said, not hidden.** If two items rank the same and money covers only one, the draft says which one it chose and why.

### Endings, In Detail

Anything that repeats can say when it stops:

- **On a date.** A seasonal job, a contract, a lease.
- **After a number of times.** Six payments left.
- **When a total is reached.** A loan reaches $0, a debt reaches a payoff amount, a goal reaches its target, or a yearly limit is reached (a 401(k) contribution limit that starts over each January).
- **Whichever comes first,** when more than one is given.
- **Never.** The default.

This applies to pay lines, bills, envelope and goal funding, and deductions. An ending shows ahead of time: lookahead and the draft before it say "Last payment Jun 14". When one is reached the item ends itself and history says why ("Car loan ended: paid off"). An ending that depends on an estimate, such as interest, is marked as estimated until you check it against a statement. Changing an ending is a change to the plan, recorded in history.

### Rates and Scheduled Increases, In Detail

- **A loan has a balance, a rate, a payment and a schedule.** Runway works out the interest, the balance after each payment, and when it will be paid off, which is the loan's ending. Nobody raises or lowers the payment by hand each month.
- **Extra payments move the payoff.** A payment larger than scheduled lowers the balance and brings the end date forward.
- **A savings account has a rate.** A goal held in an account that earns interest gets that interest added on its own, shown as interest earned. When several goals share an account, the interest is shared in proportion to what each holds.
- **A loan starts with a fixed rate.** Interest is figured monthly on the payment date. A rate that changes (a new APY, or a loan's new rate) is entered as a change to the plan from a date on, kept in history. Loans whose rate moves on its own, or that have a promotional rate, come later.
- **Interest is an estimate until checked.** Lenders and banks compute interest their own way, so Runway labels the figure as estimated and lets you enter a statement balance to correct it. The correction is recorded.
- **Amounts can step up on a schedule.** Rent rising 3% each January or a raise on a set date is entered once, and every draft after it uses the new amount.
- **Cards carried month to month,** with their rate and minimum payment, come later.

### Amounts, Percentages and Ranges, In Detail

- **An amount can be exact, a percentage, or the rest.** This holds wherever an amount is set: envelope funding, goal contributions, a source's pairings, taxes and deductions. Taxes and deductions are each a percentage of gross pay or an exact amount.
- **A percentage says of what.** Either of the income day's money, or of what is left when its turn comes in priority order. "Put 40% of what is left after bills into Savings" is a goal ranked after the bills, set to 40% of what is left.
- **Where ranges apply.** Income and money out can be exact or a range. Envelope and goal amounts are your decisions, so they are never ranges.
- **The planning stance decides which end counts.** One setting for the whole plan, with three positions: **Conservative** (the low end of income and the high end of expenses), **Middle**, and **Optimistic** (the high end of income and the low end of expenses). Conservative is the default. Any single source or bill can use a different stance than the plan.
- **Actuals replace estimates.** When income arrives, the real amount replaces the range and the difference is shown, and extra income joins Free to Spend. *Not built yet:* a bill's actual amount. Marking a bill paid records the payment's planned amount, paid today, so a bill that cost less does not return the difference, and one that cost more is not flagged ("Cover it" is in Next Steps).
- **A range is always labeled.** A figure built on one says so ("Planned at the low end: $620 of $620 to $780").
- **The cushion is visible.** Because the stance applies to every range at once, a conservative plan holds money back on purpose. Lookahead says how much ("Conservative planning is holding back $240 across 3 sources and 2 bills").

### Money Out, In Detail

Money going out comes in three shapes, by how well you know the date:

- **On a date.** One time (a deposit, a flight), repeating (rent, a subscription: weekly, every other week or monthly; every N weeks and yearly come later), or repeating until it ends (a loan with six payments left, a bill that runs six months). The amount is fixed, or a range you narrow when the real amount is known (an electric bill).
- **Within a window.** You know roughly when: car registration in March, a dentist visit this fall. Runway spreads the funding across the income days before the window closes, and you can reshape it. Setting the date or marking it paid completes it.
- **No date.** Car repairs, vet visits, gifts. Give it an envelope. The envelope keeps its balance until the money is needed.

A bill is funded by the income days you choose, or by the ones Runway suggests (the days before it is due, divided evenly). A bill is marked paid by you, or automatically when a matching purchase arrives.

- **Paid ahead of time.** A card, a car note or any bill can be marked paid before its due date. It stops asking for money, and the payment is recorded with the day you made it. If the bill was not yet funded, the payment comes out of Free to Spend and the next draft makes it up.
- **What it's for.** A bill or an envelope can say what it is for: Pets, Home, Car. Pets can hold the pet insurance bill and the Food, Litter and Pet misc envelopes. The Bills and Envelopes lists show each name with what is for it under it, and what they come to in a usual month, bills and envelopes together (a range when an amount varies; an envelope with no fixed amount or beat is named as left out). What is for something can set the priority a new bill or envelope starts with. "Stop using Pets" leaves its bills and envelopes in the plan with nothing set. It is a label for organizing and totaling; it does not change when anything is funded. Goals and income get nothing. (Code and data keep the name group.)

### Envelopes, In Detail

- **An envelope sets its own timing.** Each envelope has an amount and a funding rule:
  - on the calendar: weekly, every 2 weeks, twice a month, monthly or yearly, as an amount for that period (a $600 monthly envelope asks $300 of each of two paydays and $200 of each of three, and a month with no payday carries over to the next)
  - from a paycheck: each pay of one source or of all of them, every other, or every third, as an amount, a percentage of the pay or whatever is left of it
  - only the days you choose, such as one a few months away

  Any single income day can override the rule: add to an envelope, skip it, or change the amount, in the draft or in lookahead.
- **Money stays where you put it.** What is left in an envelope stays in it. Moving leftover money to another envelope, a goal or Free to Spend is one tap on the envelope's sheet ("Move what's left"), with an Undo, also offered later on the move's History entry; money on hand never changes, since Runway only changes which bucket holds the money and never moves real money. Covering an overspent envelope or moving to Free to Spend does change Free to Spend, and the view says so before the move. "Set what it holds now" asks where the difference came from or went: Free to Spend, or outside the plan (another account, a gift, a correction), which changes money on hand by the same amount and leaves Free to Spend as it was.
- **Bills and envelopes are different.** Something with a due date and an amount is a bill. Spending with no due date is an envelope.
- **Draft and confirm.** A draft is a suggestion. It funds in priority order, with bills due before the next income day first within their tier. You can move any amount, fund a reserve, or send cash somewhere else before you confirm. Confirming an income day is what fills its envelopes. See Income Days.
- **Lookahead.** Every coming income day has its own draft. You can adjust one weeks out and Runway shows what that does to the bills in between.
- **Gross-to-net.** Starting from gross pay lists taxes and fees (income tax, Medicare) and deductions that build assets (401k, Roth 401k, HSA, FSA). Each is a line you can edit, as a percentage of gross or an exact amount. Deductions that build assets are recorded as contributions so a later net worth view can pick them up.
- **Spill-over.** Each envelope can name what takes its overflow, in as many steps as you want. Example: Cat food ($40) spills to Pet care ($60), then to General shopping ($100), then to an envelope you keep for everyday spending. The envelope you are spending from always shows its own balance first, and the fallback balances are listed under it as separate lines, never added into one flattering number. Where no chain is set, Runway proposes where the money could come from, by priority.

### Adding What You Spend, In Detail

*Track level.*

- **A purchase is an amount, an envelope and a date.** The date starts as today. A label (your own name for it, "Sam's birthday dinner"), the merchant and a note are optional. A row is named by the label, else the merchant, else the envelope, and its line under the name shows whichever of those the name left out. The note is a memo, read when you open the purchase.
- **See it before you save it.** Before a purchase is added, the form shows what each envelope it touches has now and will have after ("Groceries $120.00 → $82.40 left"), and when one would go over it says so as a warning, with what Free to Spend drops by.
- **Add it from where you are.** The home screen has an Add button, and every envelope has its own, already pointed at that envelope.
- **Split a purchase.** A mixed cart can go to more than one envelope, each with its own amount.
- **Mark a refund.** The money returns to the envelope it came from, and a split purchase returns to each envelope in the original proportions. If that envelope has been archived, or the refund matches no purchase you have (one from before tracking started), you pick the envelope and it defaults to Free to Spend. Free to Spend is always worked out from the current balances, so a refund after an overspend restores it with no extra step.
- **Change it later.** Edit the amount, move it to another envelope, or remove it, and the envelopes recalculate. Each of these is kept in history.
- **Imported and linked purchases land in the same list** and behave the same way.

### What You Can Spend, In Detail

- **Every envelope has its own number, and the level decides what it means.** On Plan it reads "assigned": what the envelope was given. On Track it reads "left": what it was given, less the purchases you have added. On Link it reads "safe to spend", because real cash backs it. At a mall you look at Clothing, at a pet store Pets, at a restaurant Dining. Each number is that envelope's money only.
- **There is no single total to spend.** One big number that mixes every envelope invites spending money meant for something else on another day. The overall figure is **Free to Spend**: money that no envelope, bill, goal or reserve has claimed.
- **An overspent envelope draws on Free to Spend.** A purchase is never blocked. If it takes an envelope below zero, the envelope shows the amount it is over ("−$18, over") and Free to Spend drops by the same amount, because that cash is gone and Free to Spend is the only money no one has claimed. If Free to Spend goes below zero, the Over-assigned line shows, meaning other envelopes are short. Nothing moves on its own: "Cover it" proposes where the money could come from, lowest priority first (Next Steps; until then, Check an amount lists where it could come from). If the envelope is still over at the next income day, that day's draft applies its refill to the overspend first and says so on the line *(not built yet: as built, a refill is the envelope's usual amount, and the overspend has already come out of Free to Spend)*.
- **The home screen stays short.** It shows Free to Spend and the envelopes you use most, each with its own number. The rest are one tap or a search away.
- **Check an amount** *(Track and Link)*. Pick an envelope and type an amount. If it fits, Runway says what is left after. If it does not, Runway says by how much and lists where the money could come from, by spill-over chain or by priority, naming what it would take.
- **Check your balance** *(Track)*. Name the accounts that hold your money and type what one holds now. Runway adds up the envelopes and goals kept in it and shows the difference ("Your envelopes and goals add up to $4,210; you typed $4,060. $150 difference"). It never changes anything on its own; the difference is yours to resolve. *As built (Issue 52, check a balance):* with one account, the check is against all the money on hand. "Check your balance" on Free to Spend asks "What does your account hold now?", then says what Runway counts on hand (with the part waiting to be paid on cards, which is still in the account) and "They match." or "Your account has $150.00 less (or more) than Runway counts.", with three plain things that can cause a difference. Checking changes nothing; naming accounts and a per-account line-up are still to come.
- **Where your cash is** *(Link)*. A breakdown, top to bottom: the cash in the accounts you pick; minus what is already committed (bills funded but not yet paid, goal money held in those accounts, the card reserve, charges still pending); then how much of the rest sits in envelopes, and how much is free. If the envelopes hold more than the cash left, one line says "Over-assigned $40", and the envelopes keep their planned figures.

### Goals, In Detail

- **A goal is an envelope that keeps its money.** It does not spill into other envelopes. It has a target, an optional date, and a priority, and reaching the target ends it.
- **States.** A goal is active, paused, completed or archived. Pausing "Vacation fund" to focus on "Car repair" stops new money going in and keeps the balance and history. Archiving a goal, envelope or bill, or reaching the end of one, keeps its history, and the money it held has no job any more, so it counts as Free to Spend from then; the archive and end views say how much before you confirm.
- **Pace.** For a goal with a date, Runway says what each income day needs to put in ("$110 each time gets you to $1,800 by June") and whether you are on track, in words.
- **Where a goal is held.** A goal can sit in a real savings account, or be a slice of money inside a checking account. Until the account is linked, you keep the number. Once it is, Runway compares what your goals add up to against the account's balance and says the difference in one line ("Your savings account has $120 more than your goals add up to"). It never moves money or changes a goal on its own.
- **Interest.** A goal in an account that earns interest grows by it on its own (see Rates and Scheduled Increases).
- **Taking money out.** Withdrawing from a goal records it and lowers the balance.

### Changing the Plan, In Detail

- **Anything can change:** an income source, a bill, an envelope's amount or timing, a goal's contribution, a priority.
- **Every change says from when.** Choose one of:
  - this income day only
  - from this income day on, or from a date ahead
  - for a stretch, either the next N income days or until a date, after which the earlier amount returns on its own
  - end it
- **A foreseeable change shows up early.** A change that starts in the future ("from Mar 1, rent goes up $75") appears in lookahead now, so the days it affects show it before it arrives.
- **A change shows its effect first.** Before you confirm, each upcoming income day shows what it would assign before and after.
- **A new bill shows who pays for it.** Add a $200 bill that runs six months and lookahead shows which income days it leaves short, and by how much. "Cover it" lists the envelopes and goals with room to give, lowest priority first, and lets you pick: "Vacation fund, $150 less for the next 12 income days". The picks are ordinary temporary changes and nothing applies until you confirm.
- **New income shows where it would go.** Add an income that starts on a date, or a raise, and "Put it to work" proposes where it would go, highest-priority gaps first, as ordinary changes you can edit.
- **Later, in plain words.** Describing a coming expense or income in a sentence will produce the same proposals. Until then, forms produce them.
- **Returns are visible.** When a temporary change ends, the draft that restores the amount says so ("Vacation fund returns to $300 this time").
- **A reason is optional** on every change, in your own words.
- **A confirmed income day does not move when the plan changes.** The plan changes the days that are still to come. To fix a confirmed day, you correct it, and the correction is recorded with the original still viewable.

### What If, In Detail

- **A scratch copy of the plan.** Start a what-if and change anything: the hours of an hourly job for a week, an income amount or range, a new or ended bill, an envelope's amount, a goal's contribution, a job that ends early. The real plan is untouched.
- **The effect shows across the coming days.** For each upcoming income day: what is assigned to each envelope, which bills are covered, Free to Spend, and how far ahead the plan holds. The real plan sits beside it for comparison.
- **Keep it, apply it, or drop it.** A what-if can be saved under a name and revisited. Applying one turns each of its changes into an ordinary change with its own "from when" and note, recorded in history. Dropping one loses nothing.
- **Hours are a first-class question.** For an hourly source the what-if asks about hours directly ("What if I work 30 hours this week?"). A source that is not hourly is changed by amount, range or dates.

### History, In Detail

- **Change log.** Every change to the plan: when it was made, what it was, from what to what, which income days it covers, and your note. The starting point, moves between levels and applied what-ifs are in it too. Filter it by an item ("Vacation fund") or by dates.
- **Each confirmed income day is kept as planned and as confirmed.** The draft as it stood when you confirmed the day, the income that arrived and its date, every amount you confirmed, the differences with their notes, and any corrections after (a correction is kept with its day, not in the change log). Beside it, what happened in each envelope: assigned, spent, left.
- **Plan as of a date.** Open the plan as it stood on any past date, read-only: income sources, bills, envelope timing, priorities and goals. Answers "how was I handling my money three months ago?"
- **Ending is not erasing.** Ending a bill, envelope or goal keeps its history. Deleting your whole plan removes everything.

### Importing and Linking, In Detail

- **What comes in.** Transactions from a bank's CSV file (Track), or balances and transactions from linked accounts (Link). Linking is read-only: where your bank supports it you sign in on the bank's own site, and otherwise in the linking window of the service that connects it; either way Runway never sees or stores your bank username or password, and you can cut the connection from your bank at any time.
- **Linking is a starting line.** When you link, you choose the date tracking starts (today by default). Earlier transactions are history and do not touch your envelopes. Runway then shows each account's real balance and asks how it divides across your envelopes and goals. The split starts from your plan, and you confirm it once.
- **A merchant is a hint, never the answer.** A big-box store or an online marketplace sells everything, so Runway does not choose an envelope from the merchant alone.
- **What Runway applies on its own.** A purchase that matches a bill (merchant, amount and date) marks that bill paid. A purchase from a merchant you have set a rule for ("Always send Chipotle to Dining") goes to that envelope. A card payment settles against the card reserve. Everything else goes to **Needs a home**.
- **Rules are yours.** Runway suggests a rule only after you send a merchant to the same envelope three times in a row, and you decide. A merchant can be marked "varies", and then it always asks.
- **Needs a home is quick to clear.** One card per purchase, the likely envelopes first, a tap to assign, a split for a mixed cart, and a skip for later. While a purchase waits, it comes out of Free to Spend, so no envelope's number is wrong in the meantime.
- **Pending becomes posted in place.** A pending charge shows as pending, and when it posts it settles into the same purchase, never counted twice.
- **Deposits are matched to income days.** A deposit that fits a coming income day (the amount within its range, the date near it, early or late) is offered as that day's money. One that does not fit asks where it came from: a pay line, or one-time income.
- **Everything applied can be changed.** Reassign a purchase, split it, or mark it a refund, and the envelopes recalculate.
- **Unlinking** stops new data and keeps what already came in. Your plan keeps working.

### Credit Cards, In Detail

- **Cards are part of tracking.** Like purchases, cards appear once you track spending; at Plan they are hidden, not disabled, and a bill marked paid reads as paid in cash. Starting to track again carries what each card owes forward on "Where is your money now?", where each card's amount can be corrected.
- **Each card is its own.** A card is named by who issues it (Chase, Capital One) and, when it has one, its own name ("Capital One Venture X"). Each keeps its own reserve: what was charged to it and not yet paid, shown as "Waiting to be paid". Plan > Cards lists them.
- **A card purchase moves money, not the account.** The amount comes out of its envelope as any purchase does, and moves into that card's reserve, while the cash stays where it is. "Paid by" on the purchase form picks the card, starting from the one used last.
- **Free to Spend changes as if you paid cash.** Pay $40 of groceries in cash and your money on hand and Groceries each drop $40, so Free to Spend stays put. Charge it to a card and your money on hand stays put while Groceries drops $40 and "Waiting to be paid on cards" grows $40, so Free to Spend stays put the same way. Paying the card later lowers money on hand and "Waiting to be paid on cards" together, so Free to Spend does not move then either. The Free to Spend sum says this in a help icon beside each row.
- **A card is due on a day each month.** Each card can have a due day (the month's last day when the month is shorter). Its sheet and rows say "Due Nov 14", and within 7 days of it, with money waiting, "Due in 3 days".
- **Cards on Home.** Home lists up to four cards under Free to Spend, one wide row each with what it waits for, due soonest first, and "See all" opens the rest. A card due within 7 days with money waiting joins Home's warning row ("Chase is due Nov 3 · $120.00 waiting"), a door straight to its Pay off.
- **A warning that sticks until the card is paid for.** A card's warning stays past its due day until a payment in full or of the minimum, or until the next due day is within 7 days; then the warning moves to it and says "Not paid by Oct 14". A payment of only part leaves the warning up.
- **A payment says what it covered.** Pay off starts at everything waiting, which is paid in full; below that, "This is the minimum payment" marks the minimum, and anything else is part. Each pays for one due day: the last one if it is still unpaid, else the next.
- **Paying part of a card changes nothing else in the plan.** What a card owes is already set aside, so any payment lowers your cash and the card's balance by the same amount and Free to Spend stays put; the unpaid rest simply stays set aside. Interest, statement minimums and planning a payoff belong to cards carried month to month, later.
- **A card's history.** The card's sheet opens its history: each purchase and bill charged to it and each payment, newest first, by month, each with what the card owed after it. Adding, changing, archiving and paying a card are in the change log too. A payment can be taken back there.
- **A bill can be paid by a card.** A bill says which card it is usually charged to. Marking it paid moves its amount into that card's reserve instead of out of your cash.
- **Paying a card off is one step.** Open the card and tap "Pay off": the amount starts at what it waits for, and you change it to the statement if it differs. Your cash goes down and the reserve with it, so Free to Spend does not move. Paying more than the card waits for says how much more comes out of Free to Spend before you confirm. Every payment has an Undo on its toast, and the card's history lists every payment, each of which can be taken back there (append-only: taking one back writes a move that cancels it). A card paid more than it waited for reads "Paid $X ahead" until new charges use it up.
- **What a card owed before.** Adding a card asks what it owes right now, for what you charged before you started using Runway; that is set aside from the start.
- **Linked cards show the gap** *(on hold with linking)*. If the card's statement balance differs from the reserve (a pending charge, interest), Runway shows the difference and leaves the choice to you.

### Notes and Receipts, In Detail

*Track level.*

- **Group purchases into an expense.** A $40 flight, a $12 bag fee and a $200 hotel can be one "Chicago trip". Grouping adds a label, not a balance change. Open any purchase in it to see the group: what it comes to, from when to when, and each purchase. Removing a group keeps its purchases. Every group is listed on Spend, so one can be found without opening a purchase, and an emptied one can be removed.
- **Add context.** A link to an order page, a long note, photos or screenshots, on a purchase you added by hand, imported or linked.
- **Details are kept as text.** An order number, a date and an itemized breakdown read from a receipt or order page are saved as text with the purchase. Reading a receipt runs only when the person taps "Read a receipt" on a new purchase and chooses a photo; the screen says what is sent first, and a photo added as an attachment is never read.
- **Receipt images are kept until you remove them.** A photo or screenshot stays sealed on your purchase until you remove it, or remove the purchase or the plan. You can download one at any time.

### Notifications, In Detail

*Next Steps.*

- **Off until you turn them on, one switch per kind.** Whether this browser receives notifications from any of the site's apps is set for the whole site; Runway only asks for the ones it sends.
- **A notification never says an amount, a name or a merchant.** "Money arrived. Ready to confirm." "A bill was paid." "A bill is due tomorrow." "Income is expected today." Opening one goes to the day or the bill, where the details are.
- **Four kinds.**
  - *Money arrived:* a deposit matched an income day, and the day is ready to confirm. Needs a linked account.
  - *A bill was paid:* a purchase matched a bill. Needs a linked account.
  - *A bill is due tomorrow.* Works on Plan, with nothing linked.
  - *Income is expected today.* Works on Plan, with nothing linked.
- **Matching happens on Runway's servers,** so it works when the app is closed. It uses the same rules as when you open the app, looks only at purchases that have posted, and never changes a purchase you assigned yourself.
- **Each event sends once,** even if the bank reports it twice.
- **No notification is sent about how much is left in an envelope.**

### Privacy and Security, In Detail

- **A plan belongs to one person.** Income, bills and goals are visible to that person's account only. There is no shared household.
- **Amounts stay hidden until you show them.** Every figure is masked on this device until you tap the eye, forms included: a folded answer, a notice and a footer reason are masked too, and only the field you are typing in shows its value. While hidden, a warning about the plan names neither an amount nor an item; one row says "Something needs a look" and shows amounts when you tap it.
- **View-only access may come later,** so a person can let someone else look at their plan without changing it.
- **Sensitive details are encrypted.** Names of sources, bills, goals, envelopes and accounts, amounts, balances, notes, merchant names and receipt images are stored as ciphertext. Dates and item types, which Runway needs to sort and filter and which identify nothing on their own, are not. Which fields identify someone alone or together is settled field by field in the technical design.
- **Everything is encrypted in transit,** and the platform encrypts stored data.
- **Bank access is locked down further.** The access a provider grants is stored encrypted, readable only by the server functions that talk to the provider, and never sent to your device.
- **Sending plan details to an AI service is opt-in.** Anything that does so says what it will send before it sends, sends the least it needs, and leaves out account and bank identifiers.
- **A plan without a bank link stores no bank data.** Linking is optional and is the only time bank data enters the app.
- **Provider access is read-only and revocable.** You can end it from your bank or from Runway.
- **Matching on the server.** With notifications on, Runway's servers open new purchases, your bills and your merchant rules to match them, using the same key that seals bank data. They log counts and ids, never names or amounts.

## How It Feels

- **Accurate.** Every number says what it counts and what it leaves out. "Left" never pretends to be your bank balance.
- **Precise.** Amounts are exact, dates are exact, and a figure that is a guess, a range or an estimate is labeled as one.
- **Reliable.** The same screen gives the same answer every time. Nothing changes until you confirm it, and when data is late or missing, Runway says so instead of filling the gap.
- **Traceable.** Any number can be explained, any draft line says why it is there, and any past decision can be looked up.
- **Matter-of-fact.** It reports what happened and what it affects ("Dining is $18 over. It would take $18 from Everyday spending."). No scoring, no streaks, no scolding, and no cheerleading either.
- **Plain and restrained.** Friendly enough to be easy, never cutesy.
- **A one-minute payday.** Open the app when money arrives, read the draft, change what is wrong, confirm.
- **Phone first.** Every screen is built for a thumb.
- **Useful before it is connected.** The first session ends with a plan for your next income day, with no sign-up beyond an account.

## How Runway Works

What the app does today, as a person using it sees it. Where this differs from the descriptions above, this section is what is built now; the technical side of each change is under "Cascades" in `TECHNICAL.md`.

### Free to Spend

Free to Spend is the money nobody has claimed. Home shows it, and tapping it shows the sum, one line each:

| | Line | What it counts |
|---|---|---|
| | **Money on hand** | what you started with, plus the money from every income day you confirmed since, less every bill payment you marked paid, less (Track only) what you spent |
| − | **Held for bills** | for each bill, what it started with plus what confirmed days set aside for it, less what its paid payments used |
| − | **Held for goals** | for each goal, what it started with plus what confirmed days gave it |
| − | **Set aside in envelopes** (Plan) or **Left in envelopes** (Track) | each envelope's figure, with an overspent envelope counted as $0 |
| = | **Free to Spend** | |

- **Until you say what you have, it reads "Not set yet"**, never $0. Below zero it reads "Over-assigned $X": more is held than you have. Nothing is blocked either way.
- **Plan and Track count differently.** At Plan nothing you spend is recorded, so envelopes only fill and money on hand is a planning figure, not your bank balance. At Track every purchase since tracking started lowers money on hand and its envelope. Moving up to Track starts the count again from the day you pick, with what each envelope holds then, so purchases before it are never counted. Link, where real balances would back the figure, is not built yet.
- **An overspent envelope lowers Free to Spend by exactly the overspend.** The purchase took the money from what you have, and the envelope counts as $0 rather than less than nothing, so the difference comes out of Free to Spend. Nothing refills the envelope on its own yet.
- **A bill paid before it was fully set aside** takes the missing part from Free to Spend; marking it from the bill's sheet says how much first.
- **Money an item no longer needs goes where you choose.** Archiving or ending a bill, envelope or goal that holds money asks what to do with it, with nothing chosen for you: "Make it Free to Spend" (from the archive day, or the day after its last day) or "Keep it held". A kept item is listed under "Stopped, still holding money" at the end of its Plan view, and its sheet offers "Release what it holds" (with an Undo) whenever you are ready. Moving the money straight to another envelope or goal is not offered yet: no move records it. An item archived or ended before this choice existed reads as released, as it did then. A paused goal keeps its money.
- **What one income day leaves is not called Free to Spend.** On an income day the figure is "Left from this day": the money that arrived less what each item got. It joins Free to Spend once the day is confirmed. The lookahead never adds to Free to Spend, and a coming day's plan never draws on it; only confirming does, when you choose to cover a shortfall.

### Limits and Windows

| What | The limit | Why | What you see |
|---|---|---|---|
| Confirming an income day | until 14 days after its date | money that lands late can still be confirmed | the day is tagged "Waiting to be confirmed"; after 14 days it leaves the list and its money is not counted |
| "Did not arrive" | can be put back for 14 days | | "Put this day back" disappears after that |
| The day money arrived | today or earlier | | the date picker stops at today |
| Correcting a confirmed day | only days in the recent window | older months are summed once and kept | Days lists the recent window (from the 1st of the month after the newest closed month, or the past 180 days on a newer plan); "Earlier months" opens any month back to the plan's start, read-only, and its days open but are not corrected |
| A month closes | 15 days after it ends | stays clear of the 14 days a late day can be confirmed | nothing, unless something dated in it changes: then "Updating your history" shows until it is summed again |
| Changing the plan | from today, a date after today (up to about ten years), one coming income day or a stretch | a change never reaches back | Next is off with a sentence in the footer |
| Ending or archiving | a last day of today or later; archiving is from today | | the date picker stops at today |
| "Change what you started with" | until the first income day after the start is confirmed, and at most 14 days after you first entered it | it is a correction, not a new plan | after that: "To fix a balance later, correct the income day or the bill payment it came from." |
| Adding a purchase | today or earlier, on a day you were tracking, and not before tracking last started | an earlier stretch has another starting point, so it would never count | "Tracking started again on Oct 1, and an earlier day is not counted. Pick that day or a later one." |
| Spend's list | This month, Last month, Past 30 or 90 days, or any month back to the plan's start (up to 120 months) | older months are read when you pick them | the period chip beside "Purchases" |
| Lookahead | 12 months | | a goal's date past it is refused; a gap of more than 45 days to the horizon reads as income ending |
| Search | from 5 rows in every list | people look a bill or goal up by name | a search field above the list |

### Confirming Money

- **As planned.** Open the income day and tap "Confirm money arrived". The amount starts at what was expected and the day at today; confirm. Each item gets what the plan gave it, what is left from the day joins Free to Spend, the day leaves the coming days, and later days ask less of any bill or goal it paid toward. Confirming needs a connection; offline, the sheet stays open and says nothing was saved. It is off while an item paid first by a source is waiting for your choice ("choose before confirming").
- **Less than planned.** A warning under the amount says how much less. If what was left from the day covers it, the items stay as planned and "Left from this day" shrinks. If not, the sheet says what Free to Spend is and offers "Cover it from Free to Spend" (or "Use Free to Spend for part" when it holds less than the gap). Beside it, "What gets less" already shows the other route, cuts by priority for the whole difference, so either is one tap. While amounts are hidden the sheet says only that Free to Spend can cover some or all of it, and what was covered stays masked. One tap covers it, says what Free to Spend will be, and has an Undo. If Free to Spend drops below what was chosen before you confirm, the choice is cleared and you choose again. The day then confirms with every item as planned and "Left from this day" below zero by exactly what was covered, so Free to Spend drops by that amount and nothing else; the confirmed day says "Covered from Free to Spend". Whatever Free to Spend does not cover, or all of it when you would rather not cover it, "What gets less" proposes cuts by priority: Wants, then Shoulds, then Musts, and a bill due before the next income day only when nothing else is left. "Use these" applies them with an Undo, or you change each item yourself. Nothing is covered or cut until you tap, and Confirm stays off, with the reason in the footer, until the items fit the money.
- **More than planned.** A success notice says how much more. The extra is left from this day and adds to Free to Spend, unless you give an item more before confirming.
- **What is kept.** The plan as it stood and what you confirmed are both kept, with the amount that differed and each item that got a different amount, each with an optional note. Nothing is stored for a day before you confirm it.
- **Correcting later.** "Correct this day" on a confirmed day changes the amount that arrived (above $0) or what any item got (down to $0). It cannot change the date, add an item, or turn the day into "did not arrive", and when it leaves the day short beyond what the day already covered it asks as Confirm does: a warning, an offer to cover the rest from Free to Spend in one tap (capped by what Free to Spend holds once the day gives back what it left, checked again before saving) with an Undo, and "What gets less" by priority. Nothing is covered or cut without a tap. The original stays viewable beside every correction. Bills the correction changes are unticked on the checklist. If a correction lowers what a bill got after that bill was marked paid, the payment keeps its amount and the part the bill no longer held comes out of Free to Spend. Corrections show on the day, not in the change log.

### Editing the Past

| Thing | What you can change | What is refused |
|---|---|---|
| A purchase | the amount, envelopes, day, place and note, or remove it | a day before tracking last started, unless it already had that day; an envelope archived since |
| A confirmed day | the amounts, by a correction | the date; anything once the day is older than the recent window (it opens read-only) |
| A bill payment | mark paid, or take the mark back | the amount: a mark records the payment's planned amount, paid today |
| Income, bills, envelopes, goals | a new version from today or later | any change dated before today |
| What you started with | while the correction window is open | after it, a balance is fixed by correcting the day or payment it came from |
| A day's own choices | while the day is still coming | once it is confirmed |

Kept forever: every version of every item, every change in the change log, every bill-paid mark and its undo, and a confirmed day's records with every correction. Nothing is refused for being in a closed month; the change is summed again, and "Updating your history" shows while that happens.

### Changing Your Plan

Every change says from when and shows, before it saves, which coming income days it moves. Confirmed days keep what they had; only days still coming follow the plan.

- **Income.** A new amount or schedule from a date reshapes every coming day from then. Lowering pay so a Must no longer fits leaves it "$X short" on that day; the plan then holds only to the day before, and Home and Days show "the plan leaves Rent short" as a door to that day. A Should or Want that goes short is listed under "Not fully funded" and is not counted as a problem, unless it is a bill due before the next income day. A bill due after the last income day says it has no income day before it is due. If a new schedule moves your paydays, what you changed for a day (its own amounts or what pays first) moves to the nearest new date, and the preview says so; a day with no new date near it says its choices stop applying. A source cannot be ended or archived, only its pay lines.
- **Bills.** A new amount or due date changes what coming days set aside. What is already set aside stays and counts toward the payment whose window it falls in. A payment marked paid keeps its mark when its date moves (to the nearest new date, up to half a month away for a one-time bill), and keeps the amount it was marked with. A bill past due and not marked paid is a problem until you mark it.
- **Envelopes.** A new amount or timing changes coming days only. Overspending at Track is shown ("−$18.00 over") and never blocked, and Free to Spend drops by the overspend.
- **Goals.** A new target or contribution changes coming days; a goal at its target asks for nothing more. Pausing stops new money and keeps the balance.
- **Pay these first.** A source or pay line that pays an item first gives it no more than the item still needs (a goal's target, a bill's payment), and gives an archived, ended or paused item nothing, saying so in "Pay these first". Pausing, ending or archiving an item that a source pays first says which sources stop paying it.
- **Ending and archiving.** Either keeps all history. The item leaves the coming days from the day after its last day (end) or from today (archive), and what it held becomes Free to Spend from then. There is no un-archive.

## The Build Plan

**Where it stands.** The Core MVP below is built. What it does not do yet, so the descriptions above are not read as promises for it: adding an income source, bill, envelope or goal saves at once and shows its effect only when it is changed later (the proposals with Apply and Not now come with Cover it and Put it to work); "Add expected money" is the add form for an income or an expense; bills repeat weekly, every other week or monthly; hourly pay, what-ifs, accounts, importing and linking are in Next Steps; and Days lists every month back to the plan's start ("Earlier months"), where a day older than the recent window opens to look up and is not corrected. Spend reaches the same way: its "Older months" period lists and edits purchases back to the month the plan started. The rest of what is built, and its limits, is under "How Runway Works" above.

### Core MVP

- [x] Add income sources with one or more pay lines, each with a schedule, an exact or range amount, and an ending by date or number of times, including one-time income
- [x] Income entered as the amount that lands in the account (take-home), with room to add a gross breakdown later
- [x] Amounts that are exact, a percentage of the income day's money, or the rest (envelopes and goals; bills stay exact or a range)
- [x] Point a source, a pay line or one income day at the envelopes, bills and goals it pays first
- [x] Planning stance (conservative by default), with an override per source or bill
- [x] Add bills: one time, repeating, or repeating until an ending, exact or a range, funded from the income days you choose, and marked paid, including ahead of time
- [x] Add envelopes funded on the calendar (weekly to yearly) or from each paycheck, every other, or on chosen days
- [x] Add, pause, complete and archive savings goals, with a pace line
- [x] A priority (Must, Should, Want) on every bill, envelope and goal, used to order drafts and flag what is unfunded
- [x] A draft for every coming income day, each line saying why, confirmed when the money is in with the amount that arrived and its date, every amount adjustable, with a way to mark a day as not arrived
- [x] Keep the draft as proposed beside the confirmed split, record each difference, and allow a note on it
- [x] After confirming, a checklist of the bills to pay
- [x] Fund a bill across several income days, with progress shown
- [x] Guided setup: money on hand now, what each goal holds, and what is already set aside for each bill
- [x] Look ahead and plan upcoming income days, with how far the plan holds, a warning for any bill with no income before it is due, and changes that start in the future
- [x] Choose Plan or Track, and move either way, with a start date and starting amounts on the way up
- [x] Add a purchase by hand, split it, mark a refund, and see its envelope go down
- [x] "Left" for every envelope, Free to Spend, and check an amount against an envelope
- [x] Change the plan for one income day, from now on, from a date ahead, for a stretch, or end it, with the effect shown first
- [x] Change log, with an optional note on every change
- [x] Each confirmed income day kept as confirmed, and correctable with the original viewable

### Next Steps

- [x] Start from a budget you already have: pick up to five files or paste text, an AI reads them in the browser, and you review each income source, bill, envelope and goal in Starting out before anything is added
- [ ] Start from gross pay, with each tax and deduction a percentage or an exact amount
- [ ] Amounts that are a percentage of what is left at their turn in priority order
- [ ] Plan consecutive income days together in one sitting
- [ ] Loans with a fixed rate: balance, rate, payment and schedule, with estimated interest worked out monthly, extra payments, and payoff as the ending
- [ ] Endings by total amount, including a yearly limit
- [ ] Amounts that step up on a schedule
- [ ] Interest on savings goals, shared across goals in an account
- [ ] What if: a scratch copy of the plan, saved, applied or dropped
- [ ] Hourly income: a rate and the hours you expect, with hours in what-ifs
- [ ] Bills that land within a window, funded across the income days before it closes
- [ ] Cover it: choose what gives when a new bill leaves a day short, lowest priority first
- [ ] Put it to work: where new income or a raise would go
- [x] Notes, links and expense groups on purchases at the Track level
- [x] Receipt photos on purchases
- [x] Monthly envelope funding, split across the month's income days
- [x] Move leftover envelope money to another envelope, a goal or Free to Spend
- [ ] Open the plan as of a past date
- [ ] Say what a bill or envelope is for (Subscriptions, Housing, Car), with a monthly total and a starting priority per name
- [ ] Irregular income with no schedule, and a rough monthly expectation for lookahead
- [ ] Free to Spend shows how much came from each source, and you can assign a chosen source's money
- [ ] Name accounts, say where each goal and envelope is held, and see the line-up against each balance (check a balance against all your money: built)
- [ ] After confirming, a checklist of money to move between accounts
- [ ] Import purchases from a CSV, with Needs a home, merchant rules and "varies" merchants
- [ ] Spill-over between envelopes, any number of steps deep, and proposals by priority where none is set
- [ ] Cards with a reserve each, filled by card purchases and bills paid by card, and paid off in one step
- [ ] Link bank and card accounts through one provider, with a one-time line-up of balances, matching purchases you entered by hand, and matching deposits to expected income days
- [ ] Move down from Link: unlink an account and keep its history
- [ ] "Safe to spend" for each envelope from live balances, and Where your cash is
- [ ] Goals held in linked accounts, with the difference line
- [ ] Match new purchases and deposits on Runway's servers as they arrive, by the same rules as on the device
- [ ] Notifications with no amounts or names: money arrived and ready to confirm, a bill was paid
- [ ] Reminders for income days and bills coming due, which need no linked account

### Beyond

- [ ] Describe a coming expense or income in plain words and get proposed changes, through an AI service you opt into
- [ ] Loans whose rate moves on its own, or that have a promotional rate
- [ ] Credit cards carried month to month: rate, minimum payment and payoff
- [ ] More providers, for retirement and brokerage accounts
- [ ] Read order pages, and suggest an envelope for a mixed purchase from its items (receipts are read on tap)
- [ ] Net worth, investments and long-range projections (large enough to be its own app)
- [ ] View-only access to a plan for someone else
- [ ] A second trusted person who can keep the service running and recover everyone's data if its owner cannot, before anyone else's plan is held

## Under the Hood

- **Stack:** React with Redux Toolkit for state, Firestore for data, Storage for receipt images (Next Steps), Cloud Functions for the key, for deleting a plan and, later, for anything that talks to a bank-data provider.
- **Data:** Each person's plan is private under their own path in the app's data. Money is stored as whole cents. Income days and bill due dates are date-only values.
- **Draft:** A draft is computed from the plan, never edited in place. The same plan and overrides always produce the same draft, in a fixed order of operations written down in the technical design (pairings first, then priority order, with percentages resolved at their turn). At confirmation the draft as proposed and the confirmed split are both stored.
- **History:** Plan items (income sources, pay lines, bills, envelope rules, goals, priorities) are stored as dated versions, each with the date it takes effect, so the plan on any past date can be rebuilt. A confirmed income day is stored as the assignment that was confirmed, and a correction is a new record beside it. Nothing in history is overwritten.
- **Balances:** Every figure is a sum of the ledger since the starting day. So that a plan that has run for years opens quickly, each month that has closed is summed once and kept as a closing, and a plan opens on the months since the newest one. A closing is a cache: it is rebuilt whenever something dated in that month changes, and deleting every closing loses nothing.
- **Filtering encrypted data:** History entries refer to items by an opaque id, so filtering by item or by date uses readable fields and never a name. Names are matched on the device after decrypting. History and imported purchases load and decrypt one date window at a time, and search runs over the window in view.
- **Ranges:** An amount is stored as a low and a high (equal when exact), and the planning stance picks which one a draft uses.
- **Endings and rates:** An ending is stored on the item that repeats (a date, a count, or a total). Interest is computed from the stored rate and labeled as an estimate until corrected by a statement balance.
- **Security:** Traffic uses TLS and the platform encrypts stored data. Sensitive fields are also encrypted individually (AES-256-GCM, the same payload and helpers Worth the Wait uses, with the key held by the server rather than stored beside the data), while dates, item types and flags stay readable for sorting, filtering and indexes. Which fields identify someone alone or in combination, and how the functions that import bank data write encrypted fields, are decided in the technical design. A provider's access grant is encrypted with a key held only by the server functions and kept where no client rule can read it.
- **Bank data:** One provider at first, behind a small internal layer (a normalized transaction, a normalized balance) so another can be added later. Sign-in happens at the bank where the bank supports OAuth, and otherwise in the provider's own window. Credentials never reach Runway.
- **Notifications:** Next Steps. Pushes carry fixed text only. A server function matches new purchases and deposits with the same engine as the device, writes each event once, and sends through the site's push service.
- **Receipts:** Images are kept until the person removes them; nothing expires and no scheduled function touches them.
- **State and tooling:** Slices, listeners, actions and selectors follow the repo's existing pattern, with the app's own reducer composed into the central store.
- **A bill can wait for its due date.** Adding a bill never needs a date: until it has one, the plan sets nothing aside for it and says so as a thing to fix. A monthly bill without a date still counts in its group's monthly total.
