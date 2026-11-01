# PROMISES DELIVERED SCORE 📦

<img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> **Done** · <img src="../assets/checkbox-progress.svg" width="20" align="absmiddle" alt="In the works"> **In the works** · <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **Not started**. To change one, swap the image name in its line: `checkbox-empty` (not started), `checkbox-progress` (in the works) or `checkbox-checked` (done).

Back to [Updates & fixes in need](../.04_UPDATES_&_FIXES_IN_NEED.md). The rules every index follows are in [How the math works](01_HOW_THE_MATH_WORKS.md).

## Updates &/or changes

| Status | Item | Notes |
|---|---|---|
| <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> | Promise score | Kept counts 1, partly kept or changed counts ½. Needs 3 counted checks. |
| <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> | The president graded from PolitiFact's trackers | Both terms counted together. |
| <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> | Statement sources built | Floor speeches, hearings, press releases, Bluesky, YouTube and Threads. Some wait on their keys, and Threads waits on Meta's approval. |
| <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> | Fact-check source built | Google Fact Check Tools. Starts once `GOOGLE_API_KEY` is set. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Flip-Flop Index 🩴 | Designed, not built. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Pants on Fire Index 🔥 | Designed, not built. Needs `GOOGLE_API_KEY`. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | New Promises Delivered grade formula | After both indexes are built. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Decide whether Pants on Fire counts in the grade | Or sits beside it (the option in its design). |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Tag true campaign promises separately | Apart from other stated positions. |
| <img src="../assets/checkbox-progress.svg" width="20" align="absmiddle" alt="In the works"> | Money pledges checked against the records (step 7 of 9) | Built Nov. 1, 2026. 12 statements are tagged as pledges (5 to refuse corporate PAC money, 6 to back a stock-trading ban, 1 to refuse single-issue PAC money), and each Promises tab shows what the records on file say under the reviewed verdict. Today: the 6 stock-trading pledges are kept by the record (Ossoff's is mixed: he sponsored bans and voted against the Stop Insider Trading Act), Booker's single-issue pledge is kept since March 26, 2026, and the 5 corporate-PAC pledges wait for the FEC's PAC types (`npm run pacs:types`). None conflicts with its reviewed verdict. `npm run review:pledges` lists them all. Decided by default (change if you want): trade-association and membership PACs are listed but don't count against a corporate-PAC pledge; leadership PACs that pass on corporate money (Conley's case) aren't traced yet. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Check the MAGA-Meter tally against PolitiFact's live page | |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Decide the graph for each index | |

---

## Index designs

### Flip-Flop Index 🩴
**Measures:** reversals over time in what they actually did.

- **Record switches (100%, required):** of the issues where they have recorded actions at least 2 years apart, the share where later actions took the opposite side from earlier ones. Recorded actions are votes, bills and official acts. For a president, that means signings, vetoes and executive orders.
- **Changed-position checks:** shown beside the index, not counted in it. They already count at half credit in the promise score.

**Minimum:** 5 issues with 2 or more actions each.

**Example:** 10 issues with actions at least 2 years apart, and on 3 of them later actions took the other side. That gives 3 ÷ 10 = **30**.

**Keys and sources:**
- **Recorded actions and how they're coded by issue:** the reviewed research. No key.
- **Newer votes:** Senate and House roll calls (no key), and `CONGRESS_API_KEY` for bills and House votes from 2023 on.
- **State legislators:** `OPENSTATES_API_KEY` and `LEGISCAN_API_KEY`.
- **A president's executive orders:** the Federal Register. No key.

### Pants on Fire Index 🔥
**Measures:** the average falseness of their fact-checked claims from the last 6 years.

- **Scoring each rating:** True 0, Mostly True 20, Half True 50, Mostly False 80, False 100, Pants on Fire 100.

**Minimum:** 10 ratings.

**Example:** 10 ratings: 2 Mostly True, 3 Half True, 3 Mostly False and 2 False. That gives (2×20 + 3×50 + 3×80 + 2×100) ÷ 10 = **63**.

**Keys and sources:** 
- `GOOGLE_API_KEY`, through Google's Fact Check Tools. It covers PolitiFact, FactCheck.org and other fact-checkers.

### ↓↓↓

### New Promises Delivered grade formula 📦
**Promises Delivered** = Promise score − Flip-Flop deduction − Pants on Fire deduction. It never goes below 0.

- **Promise score:** today's score, unchanged: (kept + ½ × partly kept or changed) ÷ counted checks. For a president, it's PolitiFact's promise trackers instead.
- **Flip-Flop deduction:** Flip-Flop Index × 0.10. At most 10 points.
- **Pants on Fire deduction:** (Pants on Fire Index − 50) × 0.20, only when the index is above 50. At most 10 points. Fact-checkers mostly pick claims that already sound doubtful, so only a mostly-false record costs points.
- The grade still needs today's minimum of 3 counted checks. The indexes adjust a grade but can't create one.
- An index showing "Not enough data" deducts nothing.
- Together the two indexes can take off at most 20 points, the same as trading on the Ethics grade.

**Example:** promise score 80, Flip-Flop Index 30 and Pants on Fire Index 63 give 80 − (30 × 0.10) − ((63 − 50) × 0.20) = 80 − 3 − 2.6 = **74.4, rounded to 74 (C)**.

**Option:** to keep Pants on Fire out of the grade, delete its deduction line and add "The Pants on Fire 🔥 index sits beside the grade, not inside it." The formula then becomes Promise score − Flip-Flop deduction.

### Money pledges (step 7 of 9) 🤝
**Checks:** whether a public pledge about money in politics matches the records on file. A pledge stays an ordinary promise check with a reviewed verdict (kept 1, partly ½, broken 0, no separate bonus). The records check is shown under that verdict and never replaces it; it is flagged for review only when it directly conflicts (the review says consistent but the records show money after the pledge or a vote against a ban, or the review says contradicted but the records show it kept).

**Which statements:** a statement in `public/research.json` with `"pledge": {"kind": ..., "since"?: "YYYY-MM-DD" or null, "refunded"?: [{"pac", "amount"}]}`. `since` defaults to the day it was said; `null` means the whole record on file counts (for "I've never taken a dime" claims). `refunded` names checks the campaign returned, which then don't count.

**The kinds:**
- **Refuse corporate PAC money (`corporate-pac`):** counts PACs the FEC records as sponsored by a corporation (from `npm run pacs:types`), in each FEC report that starts on or after the pledge date. The report covering the pledge date can't be split by day, so it's shown apart and decides nothing. Trade-association, membership and cooperative PACs are listed but don't count. Leadership PACs, unions and other candidates' committees don't count. Until a PAC after the pledge has an FEC type on file, the check says "Can't be checked yet" instead of guessing from the name.
- **Refuse single-issue and ideological PAC money (`single-issue-pac`):** counts PACs in this app's "ideological, single-issue and advocacy" sector (assigned from their names), plus donors' gifts a group bundled through its PAC (`npm run funders:bundled`, which now saves them by month).
- **Back a stock-trading ban (`stock-trading`), a lobbying ban for former members (`lobbying`), or overturning Citizens United (`citizens-united`):** the bills on the Bills page tagged `"reform"`, with their earlier versions (`"versions"`): sponsoring, cosponsoring or voting for one backs it. A vote against one is listed and reviewed with the reason given, not counted as broken on its own; Senate Democrats opposed the Stop Insider Trading Act as "toothless" for exempting the executive branch, and its final version carried a voter-ID section.

**Outcomes shown:** Kept, by the records on file · Money on file after the pledge · Backed one, voted against another · Voted against one, backed none on file · Can't be checked yet · Nothing on file to check it against.

**Still to do:**
- Trace money passed on by leadership PACs that take corporate PAC money (the workaround NOTUS reported for Conley), which the pledges don't explicitly cover.
- Read refunds from the campaign's own reports (FEC Form 3, line 28c: refunds to PACs and other political committees) instead of naming them by hand.
- Add pledges from the Political Integrity Pledge's signer list, End Citizens United's endorsements and candidates' own announcements, each cited to the candidate's own statement.

**Keys and sources:**
- **PAC types:** `FEC_API_KEY` <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done">, from `npm run pacs:types`.
- **Bundled gifts:** `FEC_API_KEY`, from `npm run funders:bundled`.
- **Sponsors and cosponsors:** `CONGRESS_API_KEY` <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done">, from `npm run bills:cosponsors` (it now reads the `"reform"` bills too, such as the Stop Insider Trading Act and its Senate companion).
- **Votes:** Senate and House roll calls. No key.
