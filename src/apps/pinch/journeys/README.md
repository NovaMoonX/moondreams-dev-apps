# Pinch journey audit: the reports

The evidence behind [`../JOURNEYS.md`](../JOURNEYS.md). Ten independent audits walked the app in a real browser (390×844 first, then 1280×900, America/Los_Angeles) as Alex (the seeded returning user), Jamie (the empty first-time user) and Taylor (the scale kitchen), at the tip of the stack as of 2026-10-15. Each report has the same shape: who and when, goals and outcomes, journeys as walked (taps counted), flow diagrams, findings (small and high-arching, with ids), proposals (trim, merge, add, fill, rearrange, keep, with justification, cost and size), rule candidates and open questions for the owner.

| Report                                          | Question                                                                                                                          | Ids                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| [I1 Inventory](I1-inventory.md)                 | Every surface, every way to reach each feature, every volunteered insight, every noun, and the taps for 30 common tasks, as facts | `I1-S`, `I1-H`, `I1-P` |
| [J1 First run](J1-first-run.md)                 | What the first ten minutes teach, and what should stay invisible until there is data                                              | `J1-S`, `J1-F`, `J1-P` |
| [J2 Recipes](J2-recipes.md)                     | Whether Recipes, Meals, Ideas, Sources and the recipe drawer are one coherent thing                                               | `J2-S`, `J2-H`, `J2-P` |
| [J3 Planning](J3-planning.md)                   | What the calendar is for, and how few taps from "what's for dinner?" to planned                                                   | `J3-S`, `J3-F`, `J3-P` |
| [J4 Shopping](J4-shopping.md)                   | Whether the list, stores, products and prices fit standing in a shop                                                              | `J4-n`, `J4-H`, `J4-P` |
| [J5 Cooking](J5-cooking.md)                     | Whether cooking mode, cooks, notes, tweaks, history and care add up                                                               | `J5-S`, `J5-H`, `J5-P` |
| [J6 Prepared meals](J6-prepared-meals.md)       | Whether the fridge and freezer stay honest at a realistic effort                                                                  | `J6-S`, `J6-H`, `J6-P` |
| [J7 Costs and nutrition](J7-costs-nutrition.md) | The cheapest path to a number the person can trust                                                                                | `J7-n`, `J7-H`, `J7-P` |
| [N1 Navigation](N1-navigation.md)               | Where things live, how many ways lead to each, whether four tabs is right                                                         | `N1-S`, `N1-H`, `N1-P` |
| [N2 Insights](N2-insights.md)                   | Everything the app volunteers, classified by whether the person would act on it, and the insight budget                           | `N2-S`, `N2-H`, `N2-P` |

Notes for reading them:

- The screenshots the reports cite (`shots/…`, `N1-shots/…`) were kept with the working files of the audit and are not committed; every claim that matters also has a number or a quote in the text.
- Paths in `file:line` form are as of the audited commit and drift as the code changes.
- A proposal id like `J3-P4` means report J3, proposal P4. What was decided about each proposal, and what waits for the owner, is in `JOURNEYS.md` §7 and §8; the reports keep their original recommendations.
- Where one audit disagrees with another, the later reports (N1, N2) say so in their "agree or differ" notes, and `JOURNEYS.md` records the resolution.
