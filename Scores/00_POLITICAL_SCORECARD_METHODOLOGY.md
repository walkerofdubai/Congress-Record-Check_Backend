# Politician Scorecard: Scoring Methodology

Oct 22, 2026 (updated Nov. 1, 2026) · Mak Trnka

## How the scorecard works

Each politician gets four graded scores, shown as a letter grade with the percentage beside it, for example **B (84%)**. When there is not enough evidence, a score shows **"Not graded"**, never a zero or a guess. Three other indicators and the Money & Influence analysis are shown without grades. The app applies these rules in `public/grades.js`.

| Score | Shown in the app as | What it measures | Minimum evidence for a grade |
| --- | --- | --- | --- |
| Ideology Match | Your match | How closely the politician's record matches the visitor's own views | 3 issues with evidence, covering at least half of the visitor's total importance |
| Promise | Promises delivered | Whether what they said matches what they did | 3 counted checks |
| Ethics | Ethics | Documented ethics and legal problems, plus stock-trading disclosures and conflicts | None: "none located" scores 100% |
| Workers > Profit | Workers > Profit | Whether their record favors lower- and middle-income households or the wealthy and corporations, with a quarter from how much they rely on and side with business money | 3 scored actions on marked bills |

### Grade scale

| Grade | Percentage |
| --- | --- |
| A | 90–100% |
| B | 80–89% |
| C | 70–79% |
| D | 60–69% |
| F | Below 60% |

Percentages are rounded to the nearest whole number before a grade is assigned.

### The president (featured profile)

Donald Trump has a featured profile: a card beside the home page's title and a full profile page. Trump is not on the 2026 ballot, so the profile is left out of the home filters and counts, the races, the comparisons and the score pages, which cover the 2026 candidates. The grades follow the same four scores, with these differences for a president:

- **Promise Score:** from PolitiFact's promise trackers instead of the site's own statement checks (see Promise Score).
- **Workers > Profit:** from the bills the president signed or vetoed and the president's executive orders, instead of votes and sponsorships (see Workers > Profit).
- **Stock trading:** a president reports trades on OGE Form 278-T, not the STOCK Act reports members of Congress file. Trump's are listed on the Ethics tab, from Disclosed Capitol's open dataset of the OGE reports, but not scored yet (see Stock trading).
- **Money & Influence:** with no 2026 race, the card and profile show the money of the 2024 Trump campaign committee, which still files with the FEC, from the daily refresh.

## Rule 1: Actions count more than words

Every recorded action on an issue gets a weight, and this weight is used in every score below. A speech or statement counts half as much as a vote or sponsorship, because only legislative actions have a binding effect.

| Action | Weight |
| --- | --- |
| Sponsors or co-sponsors a bill | 1.0 |
| Votes for or against a bill | 1.0 |
| Official act, for officials who do not vote in Congress (for example, an executive order, a bill signed or vetoed by a president, or an official ruling) | 1.0 |
| Speech in Congress or public statement on an issue with no recorded action | 0.5 |

- **Actions first.** Statements are used only on issues with no recorded action. Once a vote, sponsorship, or official act happens on an issue, it replaces earlier statements, so the politician is not counted twice.
- **One credit per bill.** Sponsoring a bill and then voting for it counts once, at 1.0.
- **Votes take a side.** A Yea or sponsorship counts toward the bill's marked side; a Nay counts toward the opposite side. For a president, signing a bill or issuing an executive order counts like a Yea, and a veto like a Nay.
- **Missed votes are not counted.**
- **The vote wins.** If a politician says one thing and votes the other way, only the vote is scored.
- **State officials.** If a person has never held federal office but has held a state office (for example, state legislator, governor, or attorney general), their record from that state office is used instead. Their state bills, votes, official acts, statements, and campaign promises determine their views and promises, scored with the same weights and rules.

## Ideology Match Score

The Ideology Match Score (shown as "Your match") measures how often a politician's record lines up with the positions the visitor picked.

1. The visitor picks a side on each issue and how much it matters: Low = 1, Medium = 2, High = 3. Any issue can be skipped.
2. For each issue, the app collects the politician's weighted actions on it (Rule 1).
3. Per issue, it takes the share of those actions that went the visitor's way and multiplies it by the issue's importance.
4. It adds up the issue points and divides by the total importance of the issues that had evidence.

```latex
\text{Ideology Match} = \frac{\sum (\text{importance} \times \text{share of actions matching the visitor})}{\text{total importance of issues with evidence}} \times 100
```

Issues with no evidence are left out, not counted as a miss. An issue backed only by statements counts at half its importance, per Rule 1.

**Example: Ossoff, using the mockup's sample answers**

| Issue | Visitor's answer (importance) | Ossoff's record | Points |
| --- | --- | --- | --- |
| Health | Agree (2) | 3 of 3 votes match | 2 × 3/3 = **2** |
| Abortion | Disagree (2) | 0 of 1 votes match | 2 × 0/1 = **0** |
| Climate | Strongly agree (3) | 2 of 2 votes match | 3 × 2/2 = **3** |
| Ukraine | Agree (2) | 1 of 1 votes match | 2 × 1/1 = **2** |

Total: 7 of 9 = **C (78%)**. Collins, with the same answers, scores 6.17 of 9 = **D (69%)**.

## Promise Score

The Promise Score (shown as "Promises delivered") measures whether what a politician said matches what they did, using the Statements vs. actions checks.

**What gets checked:** a specific commitment or stated position (in campaign ads, on a campaign website, in debates, or in speeches) that can be checked against a later bill or vote. Vague goals such as "fight for families" are not scored.

| Check result | What it looks like | Credit |
| --- | --- | --- |
| Supported | Sponsored or voted for a bill that does what they said | 1 |
| Partly supported | Voted for a compromise bill that moves toward what they said | ½ |
| Changed position | Their position changed between the statement and the action | ½ |
| Contradicted | Voted against, or sponsored a bill opposing, what they said | 0 |
| Not counted | Ambiguous checks; outcome checks, where later events matter more than the vote; promises with no related bill yet | — |

```latex
\text{Promise Score} = \frac{\text{sum of credits}}{\text{number of counted checks}} \times 100
```

At the end of a term, a promise the politician could have acted on but did not (for example, never introducing a bill they promised to introduce) is scored as Contradicted.

**Examples:** Collins has 3 supported checks plus 1 outcome check left out: 3 ÷ 3 = **A (100%)**. Marshall has 1 supported and 2 partly supported: (1 + ½ + ½) ÷ 3 = **D (67%)**.

**Money pledges:** a check tagged as a pledge (to refuse corporate PAC money or single-issue PAC money, or to back a stock-trading ban, a lobbying ban for former members or overturning Citizens United) also shows what the records on file say now: company PACs from the FEC's PAC types in the reports after the pledge, ideological PACs and bundled gifts, and the bans' sponsors, cosponsors and votes. It is shown under the reviewed verdict and never replaces it, so the Promise Score doesn't change; a direct conflict is flagged for the next review (`npm run review:pledges`). Details: [Promises delivered](04_PROMISES_DELIVERED_SCORE.md).

### For a president: PolitiFact's promise trackers

A president's promises are graded from PolitiFact's own ratings, which compare each campaign promise with what happened, including the executive orders and bills the president signed or vetoed. Each tracker's published tally counts like the checks above:

| PolitiFact rating | Credit |
| --- | --- |
| Promise Kept | 1 |
| Compromise | ½ |
| Promise Broken | 0 |
| Stalled, In the Works | Not counted until PolitiFact gives a final rating |

Trump's grade combines both trackers. The first-term **Trump-O-Meter** is final: 102 promises from the 2016 campaign, rated 25 Kept, 23 Compromise and 54 Broken when the term ended. The second-term **MAGA-Meter** tracks 75 promises from the 2024 campaign; as of October 2026 it shows 15 Kept, 3 Compromise, 3 Broken, 22 Stalled and 32 In the Works. Each tracker's tally is shown on Trump's Promises tab with sourced examples and the executive order or bill behind each one.

**Example:** (25 + 15 kept + ½ × (23 + 3) compromises) ÷ 123 promises with a final rating = 53 ÷ 123 = **F (43%)**. The 54 Stalled or In the Works promises are not counted yet.

## Ethics Score

The Ethics Score is 100 minus three indexes, each scored 0–100 (higher means more of what its name says):

```latex
\text{Ethics Score} = 100 - \text{Legal Trouble Index} - 0.10 \times \text{Insider Trading Index} - 0.10 \times \text{Stock Disclosure Dodger Index}
```

- The indexes keep their exact values (a case can be worth 22.5); only the result is rounded to a whole percentage. It cannot go below 0%.
- An index without enough data costs nothing.
- Cases count in full; the two trading indexes cost a tenth of their value each, so trading can cost at most 20 points.

### Legal Trouble Index 🚨

Each documented ethics or legal case is worth its **status points × kind × age**. The index is the total, with a ceiling of 100.

| Case status | Points |
| --- | --- |
| Confirmed finding: a penalty, conviction, or official finding by an ethics committee, court, or regulator, or the person admitted it | 20 |
| Open investigation, including investigations with no public resolution | 15 |
| Investigation ended without a finding: acquitted, dismissed, or cleared | 5 |
| Allegation: a complaint no official body acted on | 0 (listed, not scored) |

| Kind of case | Multiplier |
| --- | --- |
| Criminal: the person was indicted, convicted, pleaded guilty, or was the subject of a criminal investigation | × 1.5 |
| Ethics or civil: House or Senate Ethics, state ethics bodies, agency enforcement, civil lawsuits, impeachment | × 1 |
| Technical: FEC fines for late reports, late stock disclosures, and disclosure mistakes that were corrected | × 0.5 |

- **Age:** × 0.5 when the case was decided (its latest status change, the `decided` year in the research) more than 10 years before the reviewed research. Open cases always count in full.
- **Each case counts once, at its current status.** When a case changes, its points are replaced, not added. An open criminal investigation that ends in a conviction moves from 22.5 to 30; one that ends in acquittal moves from 22.5 to 7.5.
- **One matter is one case.** If the same conduct leads to both a criminal case and an ethics probe, only the more serious one counts.
- **Ended investigations keep a small deduction**, because the conduct was serious enough to be formally investigated.
- **An investigation** means one opened by an official body, such as a congressional ethics committee, the Justice Department, the FEC, or an inspector general.
- **Leads don't count.** Court records, FEC enforcement records, DOJ press releases and news from the daily refresh count only after their status is confirmed from an official record.

| Status | Criminal | Ethics or civil | Technical |
| --- | --- | --- | --- |
| Confirmed finding | 30 | 20 | 10 |
| Open investigation | 22.5 | 15 | 7.5 |
| Closed without a finding | 7.5 | 5 | 2.5 |

**Examples:** Collins has 1 closed investigation (ethics): 100 − 5 = **A (95%)**. Perry has an open criminal investigation (22.5) and an open ethics referral (15): 100 − 37.5 = 62.5, rounded to **D (63%)**. Paxton has a civil finding (20), two closed criminal cases (7.5 each) and two other closed cases (5 each): 100 − 45 = **F (55%)**.

### Insider Trading Index 📈

From reviewed Periodic Transaction Reports, which members of Congress file under the STOCK Act. Members may still trade stock, so the index measures overlap with their power, donors and votes, not trading itself.

| Part | Weight | How it's figured |
| --- | --- | --- |
| Committee conflicts (required) | 40% | The dollar value of trades in single companies' stock, in sectors their committees oversee, ÷ the dollar value of all their single-company trades. Each trade's value is the middle of its disclosed range ($1,001–$15,000 counts as $8,000). |
| Trades near related votes | 25% | The share of trades flagged as within 30 days of a vote or bill action of theirs that affects that company's sector. |
| Trades in donors | 20% | The share of trades in a company whose PAC gave to them or whose group's positions are compared with their votes. |
| Single-stock activity | 15% | Single-company trades per year, with 50 a year counting as 100. Funds, ETFs and bonds don't count. |

- **Fewer than 5 reviewed trades** means "Not enough data", with the raw flags still listed. **No trades** scores 0.
- **Spouse and dependent-child trades count**, labeled as such, because the STOCK Act requires them to be disclosed.
- **Returns are not scored**, because disclosures report value ranges rather than exact amounts, and a large gain can simply reflect a market rally.
- The same number is shown beside the trade list on the Money & Influence tab; it is not a second score.

### Stock Disclosure Dodger Index 🙈

| Part | Weight | How it's figured |
| --- | --- | --- |
| Late or missing trade reports (required) | 70% | The share of trades reported after the 45-day deadline, or never reported. |
| Late annual financial disclosures | 30% | The share of the last 3 years' annual reports filed after their due date, extensions included (from the House disclosure index; not imported yet, so this part drops out for now). The refresh now reads each member's latest annual report for net worth, but not yet when each one was due and filed. |

- **Minimum:** 3 required filings.
- **No double counting:** a STOCK Act late-disclosure case counts in the Legal Trouble Index until the person's trades are reviewed; after that, late reports count here instead.
- **Late FEC campaign reports** are not part of this index; an FEC fine for one counts in the Legal Trouble Index as a technical case.

### Who has trading data

- **State-only officials and candidates who never served in Congress** show "No trading data," since these filings cover Congress only and state disclosure rules vary.
- **A president** files OGE Form 278-T transaction reports instead, under the same 30- and 45-day deadlines. Trump's are listed on the Ethics tab from Disclosed Capitol's open dataset of the OGE reports (CC BY 4.0), with how many were reported more than 45 days after the trade as a lead. They're not scored yet, so the two trading indexes show "Not scored for a president". The committee-conflict rule has no direct equivalent for a president (see Open decisions).
- **Votes on stock-trading-ban bills** are policy positions, so they are scored in Your match (the "Money in politics and congressional ethics" issue, where sponsoring or cosponsoring a ban counts as an action) and Promise, not here.

### Net worth (shown, not scored)

Each sitting member's net worth is shown on the Ethics tab and the Overview's ethics card, as a range from their latest annual financial disclosure (an amendment over the original): House reports from the House Clerk's disclosure index, senators' from Senate eFD, read weekly.

- **Why a range:** the forms give every asset and debt as a range ("$15,001 – $50,000"). The lowest net worth is every asset at the bottom of its range minus every debt at the top of its; the highest is the reverse. A value with no upper limit ("Over $50,000,000") makes the range "or more".
- **Not on the form:** a home and its mortgage, unless the home earns income, so neither is counted.
- **Not covered yet:** candidates who never served, and reports filed on paper.
- **Holdings status (step 8):** the asset list it keeps also suggests whether the member holds a qualified blind trust or no individual stocks, as a lead for review (see Blind trusts and divestment below).

### Blind trusts and divestment

- **Qualified blind trust:** only a trust the House or Senate ethics committee certified as a qualified blind trust. An independent trustee decides what to buy and sell and doesn't tell the member, so a trade made inside it isn't theirs: it counts in neither the Insider Trading 📈 nor the Stock Disclosure Dodger 🙈 index. Trades they report outside the trust, and trades from before they set it up, count as usual.
- **No individual stocks:** only funds, bonds, cash, retirement plans, real estate or a private business (no stocks or stock options of a public company). It labels the Insider Trading Index; earlier stock trades still count, and fund trades never counted as conflicts or single-stock activity.
- **Not excused:** a managed or "discretionary" account, an adviser who trades without asking, a spouse's account, or a trust that isn't a qualified blind trust. The member still controls it and must report it under the STOCK Act, so those trades count in full (Letlow's Merrill Lynch account and Sullivan's outside manager are examples on file).
- **No bonus:** the Ethics grade starts at 100 and only loses points, so a blind trust or no stocks never adds any. The Integrity Index gives a point for holding no stocks and drops its stock-holdings penalty for a blind trust; here, holdings were never penalized, only trades.
- **Where the status comes from:** the reviewed research (`"holdings": {"status": "blind-trust" | "no-stocks", "since", "src", "note"}`), cited to the annual report or another source. The net-worth refresh reads each sitting member's latest annual report and suggests a status (a qualified blind trust listed, or no individual stocks), shown as a lead; `npm run review:holdings` lists the leads and any reviewed status the latest report or a reviewed stock trade now contradicts.

## Workers > Profit Score

The Workers > Profit Score measures whether a politician's legislative actions work for lower- and middle-income households or for the wealthy and corporations. A higher percentage means more of their record works for the people: an **A** means they work for the people, and an **F** means they work for the wealthy and corporations.

### Step 1: Score each bill

Bills in the areas listed in Step 2 are in scope. Each bill is scored from **−100 (fully corporate-backed)** to **+100 (fully worker-backed)**, from two equal parts, and stored once per bill so it applies to everyone who acted on it.

- **Who gains (50%):** a cited nonpartisan analysis from the Congressional Budget Office, the Joint Committee on Taxation, the Tax Policy Center or the Penn Wharton Budget Model, placed on one of five steps:
  - **+100:** lower-income households come out ahead while the top pays more.
  - **+50:** it tilts toward lower-income households: they gain more, or pay less, as a share of income than the top.
  - **0:** about even across incomes.
  - **−50:** it tilts toward the top: it gains more, as a share of income, than lower-income households.
  - **−100:** lower-income households lose while the top gains.
- **Who took a side (50%):** each worker group (the AFL-CIO, the Economic Policy Institute, the National Employment Law Project) that supports a bill counts +100, and each that opposes it −100. Business groups (the U.S. Chamber of Commerce, NFIB, the National Association of Manufacturers) count the other way, so a business group opposing a bill counts toward workers. On tax bills, ITEP counts with the worker groups and the Tax Foundation with the business groups. On construction-pay (prevailing-wage) measures, North America's Building Trades Unions and Associated Builders and Contractors do the same. Each side's groups are averaged first, then the two sides, so a side with more groups on file doesn't outweigh the other. If both sides support a bill, it lands near 0.
- **Access counts as who gains too:** a cited estimate that a bill expands or cuts access to a basic need, mainly for lower- and middle-income households: health coverage, public schools, child care, food assistance, housing, or services like clean water and low-income broadband. +100 for a clear expansion, −100 for a clear cut, ±50 for a smaller or mixed change. With both money and access on file, their average is the who-gains part. Access doesn't count for bills that fund the whole government, or for public money that mainly goes to companies (that's the money side).
- **When they disagree:** if the two parts point opposite ways, the bill is **Disputed**. It's shown, but not scored.
- **One part only:** that part decides. A bill marked from groups' positions alone needs a worker group and a business group on opposite sides.
- **Shown, not scored:** lobbying reports that name the bill (LDA.gov), split into unions and other clients, because a report doesn't say which side the client was on; CBO estimates that don't split by income; and the White House's position, which follows the president's party.

Fourteen bills and amendments are on file, and ten are scored. Bills that didn't pass count too (Step 2):

| Bill | Who gains | Who took a side | Score |
| --- | --- | --- | --- |
| H.R. 1 of 2025, the One Big Beautiful Bill Act (Public Law 119-21) | −100. CBO, *Distributional Effects of Public Law 119-21* (August 2025): the bottom tenth lose about $1,200 a year (3.1% of income), mainly through Medicaid and SNAP cuts, while the top tenth gain about $13,600 a year. | −100. The AFL-CIO opposed it; the Chamber and NFIB supported it. | **−100** |
| H.R. 6703 of 2025, the Lower Health Care Premiums for All Americans Act | −50, from access: CBO finds about 100,000 fewer insured, though premiums fall 11%. | −100. The AFL-CIO opposed it; NFIB supported it. | **−75** |
| S.Amdt. 1858 of 2021, the Cornyn amendment to S. 1260 (the bill whose CHIPS for America funding became the CHIPS and Science Act) | None on file. It would have removed prevailing wages from CHIPS-funded construction. | −100. North America's Building Trades Unions opposed it; Associated Builders and Contractors supported it. Senate roll call 223, rejected 42–58. | **−100** |
| H.R. 1 of 2017, the Tax Cuts and Jobs Act (Public Law 115-97) | −50. Tax Policy Center (December 2017): the largest cuts as a share of income go to households making about $308,000 to $733,000, and by 2027 the top 1% receive 83% of the benefit. | −100. The AFL-CIO opposed it; the Chamber, NAM and NFIB supported it. | **−75** |
| H.R. 5376 of 2022, the Inflation Reduction Act (Public Law 117-169) | +50. Tax Policy Center (August 2022): the tax changes fall mainly on the top 1%, with the lowest fifth about unchanged. | +100. The AFL-CIO supported it; the Chamber and NAM opposed it. | **+75** |
| H.R. 1319 of 2021, the American Rescue Plan Act (Public Law 117-2) | +50. Tax Policy Center (March 2021): households making $91,000 or less get nearly 70% of the tax benefits. | +100. The AFL-CIO supported it. | **+75** |
| H.R. 3684 of 2021, the Infrastructure Investment and Jobs Act (Public Law 117-58) | None on file (CBO's estimate gives the cost, not who gains by income) | 0. The AFL-CIO and the Chamber both supported it. No Senate amendment vote on its wage or labor rules was found. | **Even**, not scored |
| H.R. 4346 of 2022, the CHIPS and Science Act (Public Law 117-167) | None on file | 0. The AFL-CIO and the Chamber both supported it. Its amendment vote is scored on its own (above). | **Even**, not scored |
| H.R. 842 of 2021, the PRO Act (also H.R. 2474 of 2019, S. 420, and H.R. 20 and S. 567 of 2023, and H.R. 20 of 2025) | None on file | +100. The AFL-CIO supported it; the Chamber and NFIB opposed it. Passed the House in 2020 and 2021; the Senate never voted. | **+100** |
| S. 53 of 2021, the Raise the Wage Act (also H.R. 603, and the Sanders amendment, S.Amdt. 972, that the Senate voted on) | +100. CBO (July 2019): a $15 minimum wage raises income for families below three times the poverty line and lowers it above, mostly above six times, including about 1.3 million fewer jobs. | +100. NFIB opposed it. | **+100** |
| H.R. 7 of 2021, the Paycheck Fairness Act (also S. 205) | None on file | +100. The AFL-CIO supported it; the Chamber and NFIB opposed it. | **+100** |
| H.R. 1232 of 2025, the National Right-to-Work Act (also S. 533, and H.R. 1200 of 2023) | None on file | No cited position from the listed groups yet | Not scored |
| S. 1582 of 2025, the GENIUS Act | None on file | The AFL-CIO opposed it. | Not scored: needs a business group's position or a study |
| H.R. 1834 of 2025, the three-year ACA premium tax credit extension | +100, from access: CBO estimates 3.0 million more insured in 2027 and 4.0 million in 2028. | +100. The AFL-CIO supported it. | **+100** |

### Step 2: Score each action

| Area | People-leaning actions | Profit-leaning actions |
| --- | --- | --- |
| Unions and labor | Supports bills that protect or strengthen unions and collective bargaining | Supports bills that weaken or dismantle unions; opposes bills that help unions |
| Wages | Votes to raise the minimum wage | Votes against raising the minimum wage |
| Taxes | Votes to raise taxes on the wealthy and close loopholes; opposes tax increases on working people | Votes for tax cuts that mainly benefit the wealthy and large corporations; opposes raising taxes on the wealthy; votes for new loopholes; votes for tax increases on working people |
| Social safety net | Votes to protect or expand safety-net programs | Votes to cut safety-net programs; votes against expanding them |
| Cost of essentials | Votes for bills that lower prescription drug, healthcare, and education costs | Votes against those bills; votes for bills that raise those costs |
| Regulation | Votes to keep or strengthen financial, worker, and consumer protections | Votes to dismantle key financial regulations or other worker and consumer protections |

Bills that didn't pass count the same way: sponsoring or cosponsoring one counts like a Yea, and a cited public statement that names the bill counts half (Rule 1's statement weight), replaced by any later vote or cosponsorship. Not cosponsoring counts for nothing. A bill counts once across its versions in different Congresses, and the latest vote wins.

Each action carries its Rule 1 weight and takes a side as Rule 1 describes, and counts its bill's strength (the score ÷ 100): a Yea on a +75 bill adds 0.75 to the People side, and a Nay adds 0.75 to the Profit side. For a president, the actions are bills signed or vetoed and executive orders: signing a marked bill or issuing a marked order counts for its side, and a veto for the other side. An executive order can be marked like a bill, from a cited analysis of who gains.

### Step 3: Calculate

```latex
\text{Workers > Profit} = \frac{\text{People-leaning points}}{\text{People-leaning points} + \text{Profit-leaning points}} \times 100
```

Since Nov. 1, 2026 that is three quarters of the grade; the other quarter is 100 minus the Corporation Compromised Index 🏢 (step 9), which measures how much of their campaign money comes from businesses' PACs (the share of funds raised; 20% scores 100) and how much more often they vote with business funders than their party does (25 points above scores 100). Parts without reviewed data drop out. Without the index (no campaign money on file, or a president), the bills count alone. Full design: [Workers > Profit](07_WORKERS_OVER_PROFIT_SCORE.md).

```latex
\text{Workers > Profit} = 0.75 \times \text{bills score} + 0.25 \times (100 - \text{Corporation Compromised Index})
```

**Example:** a Nay on the American Rescue Plan Act (+75) and on the Inflation Reduction Act (+75) adds 1.5 Profit-leaning points, and a Nay on the One Big Beautiful Bill Act (−100) adds 1 People-leaning point: 1 ÷ 2.5 = 40%, shown as **F (40%)**.

**Where it stands:** 23 people have the 3 scored actions a grade needs, most of the House members through their votes on the One Big Beautiful Bill Act, H.R. 6703 and the ACA credit extension. Every saved roll call's positions and each bill's profiled cosponsors were filled on Oct. 31, 2026 (`npm run votes:positions` and `npm run bills:cosponsors`); rerun them when bills or roll calls are added. Trump signed two scored bills, both Profit-leaning, one short of a grade. Candidates without a voting record are scored from cited public statements: 25 so far, from 22 candidates, each counting half a vote.

## Other indicators (not graded)

Three more indicators appear on each profile as plain numbers or bars, without a letter grade. Net worth (under the Ethics Score) and the money figures under the Money & Influence Analysis are shown the same way.

| Indicator | How it appears | How it is calculated |
| --- | --- | --- |
| Ideological position | "More conservative than 48% of the Senate" | Taken from Voteview's DW-NOMINATE score, which uses every roll call in the member's career. The app only compares it with the rest of the chamber. |
| Key-vote position | "Conservative side on 4 of 9 marked bills" | Counts how the person voted on 16 key bills marked liberal or conservative, with votes taking sides as in Rule 1. |
| Position by issue | A bar per category, toward liberal or conservative, with "2 of 3 conservative" beside it | For each category (immigration, taxes, health care and so on), the share of the person's record on the liberal and conservative sides of its issues. Same evidence as Your match: actions one credit per bill, and statements at half only where there is no action. Issues without a liberal side, such as tariffs and Ukraine aid, aren't placed. |

## Money & Influence Analysis

This analysis checks whether month-by-month changes in a politician's donations, along with their personal stock holdings, line up with their votes, sponsorships, and speeches. It shows timing and alignment, not proof that money caused a decision, so it is reported beside the grades rather than built into them.

### What is tracked

- **Donations by month and source:** contributions from each organization's PAC and employees, grouped by organization and industry, from FEC filings. Only the politician's top 20 donor organizations in the current election cycle are analyzed.
- **Bundled (earmarked) donations:** individual donors' gifts that a group collected and forwarded through its PAC (AIPAC, Club for Growth, EMILY's List, J Street and the Senate Conservatives Fund), read from each group's PAC's own FEC reports and shown beside the group's own money. They are the donors' own money, which the FEC counts as individual contributions, so they are already in campaign funds raised; the group decided where they went. ActBlue and WinRed are left out, because they forward gifts for any campaign that uses them.
- **Donors by gift size:** individuals' money in the FEC's five size groups ($200 and under up to $2,000 and over), shown on the Overview's money card.
- **PAC type:** each PAC's type from its FEC registration (corporate, trade association, labor union, membership group, leadership PAC, nonconnected and so on), shown beside the sector this app assigns from the PAC's name.
- **Who had a stake in each bill:** organizations that lobbied on the bill, from federal lobbying disclosure reports.
- **Decisions:** votes, sponsorships, and speeches in Congress, weighted as in Rule 1.
- **Stock holdings and trades:** holdings from annual financial disclosure reports and trades from Periodic Transaction Reports, including spouse and dependent-child accounts (see Stock trading under the Ethics Score).

Every profile's analysis shows where stock stands, even when nothing is flagged:

- **Stock in donors:** how many reviewed trades were in a donor's company, or "No trading data" for people the disclosures don't cover.
- **Stock holdings and trades:** the reviewed trades in a donor's company and whether each is a timing flag. Below them, the latest disclosed trades from the daily refresh (not yet reviewed) are checked against the top 20 donor organizations as leads.
- Most of the reviewed donor groups are advocacy groups and unions, which have no stock, so most matches are expected to come from the top 20 donor organizations in the refresh: companies, their PACs and their employees.

### Three alignment measures

| Measure | Question it answers |
| --- | --- |
| Vote Donor Alignment | Of the votes and sponsorships on bills a top donor lobbied on, what percentage went the donor's way? |
| Donor Loyalty 🤝 | How much more often do they vote their funders' way than the rest of their party does on the same votes? |
| Speech Donor Alignment | Of the speeches on issues a top donor lobbied on, what percentage took the donor's side? (Not measured yet.) |

**Donor Loyalty 🤝:** for each funder that took public positions, the person's rate of voting its way minus their party's rate on the same votes (from the official roll calls' party totals, with their own vote left out). The funders are weighted by the money each gave, bundled or spent for them, but no funder counts for more than all the others put together (at most half the weight); before this cap, one funder with a single position on file could decide the number alone. Only the part above the party counts, and 25 points above scores 100. It needs 5 compared votes. Full design: [Money & Influence](05_MONEY_&_INFLUENCE_ANALYSIS.md).

### Timing flags

A decision is flagged for review when any of these happen within a 6-month window:

- Donations from an organization **rose** 50% or more around a decision in that organization's favor.
- Donations from an organization **dropped** 50% or more after a decision against that organization's interest.
- The politician **changed position** on an issue after a 50% or larger shift in donations from an organization that lobbied on it.
- The politician **held or traded stock** in an organization that also donated to them and lobbied on a bill they acted on. For the reviewed donor groups, a public position on a vote they cast counts the same as lobbying.

Each flag lists the organization, its monthly donation totals, the decision, and the dates, so readers can judge the pattern for themselves.

## Charts for each score page

Each score's main page uses the charts below. Every chart shows how many data points sit behind each grade, and politicians who are "Not graded" appear as greyed rows rather than being left out. Gauges, pie charts, and radar charts are avoided because they are hard to compare across people.

### Your match

- Ranked horizontal bar chart of all politicians by match %, colored by grade
- Per-issue bar breakdown when a politician is selected, sorted by the importance the visitor chose

### Promises delivered

- Stacked horizontal bar per politician (supported, partly supported, changed position, contradicted), using raw counts so a grade built on 3 checks looks different from one built on 20
- For a president, on the profile: one bar per PolitiFact tracker (Kept, Compromise, Broken, Stalled, In the Works), with sourced examples

### Ethics

- Stacked bar of points lost (findings, open investigations, closed investigations, late disclosures, committee-conflict trades), only for politicians with deductions
- Summary line such as "X of 59 have no recorded cases"
- Case timeline showing status changes, on each politician's own page
- Filing-delay dot chart: one dot per trade showing the days from trade to disclosure, with a line at 45 days so late filings stand out
- Trades-by-sector bar chart, with the sectors their committees oversee highlighted
- Trade-and-vote timeline: buys and sells on a timeline with markers for related votes and hearings, and flagged trades highlighted
- No returns or profit leaderboards, since those figures are estimates

### Workers > Profit

- Diverging bar chart centered at 50%, with people-leaning records on one side and wealthy-and-corporate-leaning records on the other
- Scatter plot of Workers > Profit against DW-NOMINATE position, to spot outliers
- Tree map of the top 20 donors: tile size is the amount given, tile color shows People-aligned donors (unions, small-dollar donors as one tile) vs. Profit-aligned donors (corporate PACs, industry groups), and all other donors are grouped as "Other"
- Link to the outside spending chart on the Money & Influence page

### Ideological position

- Dot plot of the whole chamber on the DW-NOMINATE scale, with the selected politician highlighted

### Money & Influence

- Monthly line chart of donations from each top donor, with markers for related votes (triangles), speeches, and stock trades in that donor's company (diamonds), and flagged moments highlighted
- Outside spending bar chart: money outside groups spent for vs. against the politician, from FEC independent expenditure filings, with each bar split by sector and colored People-aligned vs. Profit-aligned
- For-to-Against Ratio beside it (for example, "3.2 : 1"), or "no opposing spending" when nothing was spent against them

Outside spending is shown as a plain number, not a grade. The politician cannot legally coordinate with these groups, and the amounts mostly reflect how competitive the race was.

## Update process

Scores are refreshed once a month, matching the monthly donation data.

1. Collect everything new since the last update: votes, sponsorships, floor speeches, campaign statements, ethics case changes, stock trade disclosures, donation filings, and, for the president, PolitiFact's latest tracker tallies and new bills signed or vetoed.
2. Add new Workers > Profit bills with their cited evidence (who gains, and each group's position), and record the reasons.
3. Match new actions to existing promises, and replace earlier statements with votes where Rule 1 applies.
4. Apply the weights and recalculate all four scores.
5. Rerun the Money & Influence flags with the new month's donations.
6. Log every change: which score moved, by how much, and why.

## Data sources and current status

Each data category below lists its free sources and the parts of the scorecard it feeds. The bold label shows whether a source covers federal officials, state officials, or both. Sources marked *in use* are used by the app (built October 24, 2026); *by hand* means imported with a script and rebuilt by hand; *not used* gives the reason. Every source with a free key or no key that can run alongside the others refreshes automatically, and every key that is set is used at the same time; FEC bulk files, Voteview, unitedstates/images, congress-legislators and CapitolGains are imported by hand. No live response from the new sources has been checked yet, since that needs your keys. Sources were checked on October 23, 2026; details marked *(unconfirmed)* come from third-party pages, and [.01_API_SOURCES_USED.md](../.01_API_SOURCES_USED.md) has the full list with links.

### Bills and sponsorships

*Feeds Rule 1, Your match, the Promise Score, and Workers > Profit.*

- **Congress.gov API** *(in use)*: bills each member sponsored in the current Congress **(Federal only)**. [Key](https://api.congress.gov/sign-up/) · [Docs](https://github.com/LibraryOfCongress/api.congress.gov)
- **Congress.gov cosponsored-legislation endpoint** *(in use)*: the bills each member co-sponsored, which Rule 1 counts. It uses the same Congress.gov key **(Federal only)**.
- **Congress.gov bill summaries, amendments, committee reports, CBO estimates, and CRS Reports** *(in use, for key bills; CRS reports are matched to the bills they cover)*: bill details and background for marking bills People or Profit, with the same key **(Federal only)**.

### Official acts

*Feeds Rule 1 official acts by officials who don't vote in Congress.*

- **Federal Register API** *(in use, for people given a federalRegister setting: Donald Trump)*: executive orders, rules, and other official acts by federal executive officials, with no key **(Federal only)**. [Docs](https://www.federalregister.gov/developers/documentation/api/v1)

### Votes

*Feeds Rule 1, Your match, the Promise Score, Workers > Profit, and key-vote position.*

- **House Clerk roll calls** *(in use)*: official House votes **(Federal only)**. [clerk.house.gov/Votes](https://clerk.house.gov/Votes)
- **Senate roll calls** *(in use)*: official Senate votes **(Federal only)**. [senate.gov roll call lists](https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.htm)
- **Congress.gov House roll-call vote endpoints** *(in use)*: official House votes from 2023 on, with the Congress.gov key; the House Clerk's files remain for older votes and as the fallback **(Federal only)**.

### Ideological position

*Feeds the ideological position indicator.*

- **Voteview** *(in use)*: DW-NOMINATE ideology scores, copied into the research file and not refreshed **(Federal only)**. [voteview.com](https://voteview.com)

### Floor speeches and hearings

*Feeds Rule 1 statements and the Promise Score.*

- **Congress.gov Congressional Record endpoints** *(not used: GovInfo splits the Record into speeches with each speaker's ID)*: daily and bound Record, using the Congress.gov key **(Federal only)**. [Endpoint docs](https://github.com/LibraryOfCongress/api.congress.gov/blob/main/Documentation/DailyCongressionalRecordEndpoint.md)
- **GovInfo API** *(in use)*: the Congressional Record broken into individual speeches, plus hearing transcripts. It uses a free api.data.gov key, so the Congress.gov key may work **(Federal only)**. [Docs](https://api.govinfo.gov/docs) · [Key](https://www.govinfo.gov/api-signup)
- **crec** *(not used: the GovInfo API is read directly)*: free Python package that turns GovInfo's Record into a table of speeches with dates **(Federal only)**. [crec.readthedocs.io](https://crec.readthedocs.io)
- **House Document Repository** *(in use, through Congress.gov's committee-meeting endpoint, which serves its files with witness data)*: committee meeting documents and witness testimony, with no key **(Federal only)**. [docs.house.gov](https://docs.house.gov/committee/Help.aspx)
- **YouTube Data API** *(in use)*: videos from officials' own channels, with a free Google key; each channel's uploads list costs 1 of the 10,000 daily quota units **(State and federal)**. [Docs](https://developers.google.com/youtube/v3/getting-started)

### Statements, issue positions, and campaign promises

*Feeds Rule 1 statements, Your match, and the Promise Score. All of these run together; GDELT and the New York Times are merged by link.*

- **Vote Smart API** *(not used: paid license only)*: candidates' issue positions, votes, and interest-group ratings. Vote Smart quoted a Developer license (internal use only: $350 for 1 month, $1,000 for 3 months, $1,900 for 6) and a Public Distribution license, needed once the site shows its data, from $4,850 a year (October 2026). A license also forbids crediting Vote Smart or linking to it on the site. The refresh code stays off while the key is blank **(State and federal)**. [votesmart.org/votesmart-api](https://www.votesmart.org/votesmart-api)
- **Google Fact Check Tools API** *(in use)*: published fact-checks of politicians' claims, with a free Google key, as leads for statement checks **(State and federal)**. [Docs](https://developers.google.com/fact-check-tools)
- **GDELT DOC API** and the **New York Times Article Search API** *(in use)*: news coverage of each politician (GDELT with no key, back to 2017; NYT with a free key), as leads for statements and ethics cases **(State and federal)**. [GDELT](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/) · [NYT](https://developer.nytimes.com/)
- **Bluesky public API** *(in use, for accounts added by hand)*: officials' public posts, with no login or key **(State and federal)**. [Docs](https://docs.bsky.app/docs/category/http-reference)
- **congress-legislators** *(by hand)*: each member's official social media accounts, so you know which feeds to follow **(Federal only)**. [github.com/unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators)
- **PolitiFact Trump-O-Meter and MAGA-Meter** *(by hand, from the published tallies)*: PolitiFact's ratings of Donald Trump's 2016 and 2024 campaign promises, used for Trump's Promise Score. PolitiFact has no API and could not be reached from the build environment, so the tallies are entered by hand with their date; the MAGA-Meter tally needs checking against the live page each month **(Federal only)**. [Trump-O-Meter](https://www.politifact.com/truth-o-meter/promises/trumpometer/) · [MAGA-Meter](https://www.politifact.com/truth-o-meter/promises/maga-meter-tracking-donald-trumps-2024-promises/)
- **Wayback Machine** *(in use)*: every archived snapshot of a campaign website, to capture promises before they are edited or deleted. It is free with no key **(State and federal)**. [Docs](https://github.com/internetarchive/wayback/tree/master/wayback-cdx-server) · [Endpoint](https://web.archive.org/cdx/search/cdx)

### State officials' records

*Feeds the State officials rule in Rule 1. Open States and LegiScan run together, merged by state bill number; LegiScan is checked weekly through its query API, well inside the cap.*

- **Open States API** *(in use)*: state bills, votes, sponsorships, legislators, committees, and governors for all 50 states, DC, and Puerto Rico, with a free key **(State only)**. [Docs](https://v3.openstates.org/docs/) · [Key](https://openstates.org/accounts/signup/)
- **LegiScan** *(in use)*: legislation in all 50 states and Congress, with a free key and a monthly query cap. Its weekly bulk files do not count against the cap **(State and federal)**. [legiscan.com/legiscan](https://legiscan.com/legiscan)
- **Open States bulk downloads** *(not used yet)*: the same data, public domain, for when the API's quota runs out **(State only)**. [Bulk data](https://open.pluralpolicy.com/data/legislator-csv/)
- **State campaign-finance portals** *(not used yet)*: donations to state officials, in states that publish them (for example Washington, updated daily, with no commercial use allowed). There's no single national source **(State only)**. [Washington PDC](https://pdc.wa.gov/node/140)

### Committees and member IDs

*Feeds committee-conflict trades in the Ethics Score, and matches records across every source.*

- **congress-legislators** *(by hand, scripts/build-ids.mjs)*: current committee assignments, plus each member's IDs across systems (Bioguide, FEC, Senate ID, and others) **(Federal only)**. [Project](https://github.com/unitedstates/congress-legislators) · [Current members file](https://unitedstates.github.io/congress-legislators/legislators-current.json)
- **Senate.gov and House Clerk member files** *(in use, compared daily with the reviewed list)*: the official current committee assignments, with no key **(Federal only)**. [Senate XML](https://www.senate.gov/general/XML.htm) · [House MemberData guide](https://xml.house.gov/MemberData/MemberData_UserGuide.pdf)
- **Wikidata** *(by hand, matched by FEC candidate ID)*: IDs for candidates who never served in Congress, with no key **(State and federal)**. [wikidata.org](https://www.wikidata.org/)

### Stock trades and holdings

*Feeds the Insider Trading and Stock Disclosure Dodger indexes in the Ethics Score and the stock flag in the Money & Influence Analysis. The official reports are read directly and are the record of truth: House members' PDFs from the House Clerk, and senators' reports from the Senate eFD site. Bargo, Eulerpool, and Financial Modeling Prep (if its free plan includes trades) run alongside as a cross-check: duplicate trades are merged, the official report's date wins, and a trade only a service reports goes to review. Reports filed on paper are scanned images and are checked by hand. Only reviewed trades count. Capitol API is not needed, since it reads the same filings.*

- **House Clerk disclosures** *(in use: the yearly filing index, each electronically filed trade report's PDF, and each member's latest annual report's PDF for net worth, read automatically)*: official yearly downloads, with trades as PDFs; reports filed on paper are scanned images, listed for review **(Federal only)**. [disclosures-clerk.house.gov/FinancialDisclosure](https://disclosures-clerk.house.gov/FinancialDisclosure)
- **Senate eFD** *(in use: each senator's electronic trade reports, and their latest annual report for net worth, read automatically)*: official search portal, no API; it asks visitors to agree that reports won't be used for commercial purposes (other than news media), credit ratings or solicitation, and the reader agrees each session **(Federal only)**. [efdsearch.senate.gov](https://efdsearch.senate.gov/)
- **CapitolGains** *(by hand, scripts/build-holdings.py)*: free Python package for trades, holdings, and blind trusts from both chambers **(Federal only)**. [pypi.org/project/capitolgains](https://pypi.org/project/capitolgains/)
- **Capitol API** *(not used)*: open-source and self-hostable; its GitHub repo is crnicholson/capitol-api **(Federal only)**. [Archived copy](https://archive.hackclub.com/archive/8ODyA/mhtml/html)
- **Bargo Congress Trades API** *(in use)*: free with limits, and works without a key at a lower limit. Its published description has no late-filing field, so lateness comes from the dates. The free tier covers only the last 3 months of trades, so older trades need the official filings **(Federal only)**. [API](https://www.bargo.ai/free-apis/congress/v1) · [Free key](https://www.bargo.ai/free-apis/dash)
- **Eulerpool** *(optional cross-check; its path is unconfirmed)*: free tier of 100,000 requests a month, with party and committee filters **(Federal only)**. [Docs](https://eulerpool.com/financial-data-api/congress-trading-data) · [Free key](https://eulerpool.com/developers/register)
- **Financial Modeling Prep** *(in use when its key is set)*: has a free plan, but check whether it includes congressional trades **(Federal only)**. [Senate trading API docs](https://site.financialmodelingprep.com/developer/docs/senate-trading-api)
- **Disclosed Capitol API** *(not used: paid after a one-time trial)*: members' trades, and the president's and cabinet's, with a free key. A new account's 750 credits are a one-time trial, and calls cost money after that **(Federal only)**. [Docs](https://www.disclosedcapitol.com/developers) · [Terms](https://www.disclosedcapitol.com/terms)
- **Disclosed Capitol's executive-branch-trades dataset** *(in use, by hand: `npm run exec:build`)*: the president's, vice president's, cabinet's and senior appointees' trades, parsed from their OGE reports and refreshed nightly, with no key, under CC BY 4.0 (credited wherever shown). About 70% of Trump's trades have no report date in it, and a few dates were misread, so it's listed, not scored, and should be spot-checked against the PDFs **(Federal only)**. [GitHub](https://github.com/disclosedcapitol/executive-branch-trades)
- **SEC EDGAR** *(in use)*: each traded company's ticker and industry code, with no key, so trades can be sorted by sector for the committee-conflict rule and the trades-by-sector chart **(Federal only)**. [SEC developer resources](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)

### Ethics and legal cases

*Feeds the case table in the Ethics Score. Each item is a lead for review; a case is scored only after its status is confirmed from an official record.*

- **CourtListener API** *(in use, weekly)*: court opinions and dockets, with a free account. Since May 2026, free accounts reportedly get about 125 requests a day *(unconfirmed)*; paid memberships get more. Pulling new documents from PACER costs PACER's fees **(State and federal)**. [Docs](https://www.courtlistener.com/help/api/rest/)
- **FEC enforcement records** *(in use)*: closed enforcement cases (MURs), advisory opinions, and fines, with the existing FEC key **(Federal only)**. [FEC legal search](https://www.fec.gov/legal-resources/how-to-use-fec-legal-search-systems)
- **DOJ press releases API** *(in use)*: indictments, plea deals, and settlements, with no key **(Federal only)**. [R client documenting it](https://cran.r-universe.dev/usdoj)
- **Office of Government Ethics** *(the president's reports through Disclosed Capitol's dataset, under Stock trades; not used directly)*: executive-branch financial disclosures, for candidates who held federal executive posts and for the president: yearly OGE Form 278e reports and Form 278-T transaction reports, the president's equivalent of the STOCK Act trade reports. No API, and many reports are scanned PDFs **(Federal only)**. [OGE Form 278e](https://oge.gov/web/278eGuide.nsf/Overview)

### Donations and outside spending

*Feeds the Money & Influence Analysis and its charts.*

- **FEC API and bulk files** *(in use)*: campaign totals (including the total from individual donors), PAC contributions, and outside spending; the bulk files feed the funder timelines. Individual contributions are now also totaled by the donor's employer for the top-donor tracking; donors' names are never kept. Also read: individuals' money by gift size (daily), each PAC's committee registration for its FEC type (`npm run pacs:types`), and the bundled gifts each conduit PAC forwarded to each campaign (`npm run funders:bundled`) **(Federal only)**. [api.open.fec.gov/developers](https://api.open.fec.gov/developers/)
- **ProPublica Nonprofit Explorer API** *(in use)*: tax filings of nonprofits that spend in races ("dark money" groups), with no key **(Federal only)**. [Announcement](https://www.propublica.org/nerds/announcing-the-nonprofit-explorer-api)
- **IRS political organization (527) data** *(not refreshed: bulk downloads only, so 527 spenders link to the IRS search)*: groups that report to the IRS instead of the FEC, as weekly bulk downloads with no key **(Federal only)**. [IRS political organizations](https://www.irs.gov/node/471)

### Lobbying

*Feeds the Money & Influence Analysis.*

- **LDA.gov** *(in use, for top donor organizations; lobbyist contribution reports not yet)*: official lobbying registrations, quarterly activity reports, and lobbyist contribution reports, with an API. A free key raises the limit from 15 to 120 requests a minute **(Federal only)**. [lda.gov](https://lda.gov/)
- **FARA API** *(in use)*: registrations of people lobbying for foreign governments and companies, with no key *(rate limit unconfirmed)* **(Federal only)**. [efile.fara.gov/api](https://efile.fara.gov/api)
- **Regulations.gov API** *(in use)*: donor companies' public comments on federal rules, with a free api.data.gov key **(Federal only)**. [Docs](https://open.gsa.gov/api/regulationsgov/)

### Federal contracts

*Optional context for the Money & Influence Analysis: federal contracts and grants to donor companies.*

- **USAspending API** *(in use)*: federal contracts and grants by company, with no key or quota **(Federal only)**. [api.usaspending.gov](https://api.usaspending.gov/)
- **SAM.gov Entity API** *(in use)*: companies' federal IDs (UEI) and industry codes, with a free key, to match donor companies to their contracts **(Federal only)**. [Docs](https://open.gsa.gov/api/entity-api)

### Profile photos

- **unitedstates/images** *(in use)*: official public-domain congressional portraits; candidates who never served in Congress use photos supplied for the site, and the president's official portrait (public domain) was supplied too **(Federal only)**. [github.com/unitedstates/images](https://github.com/unitedstates/images)
- **Wikimedia Commons** *(in use)*: freely licensed photos for candidates without an official portrait; check each photo's license and credit **(State and federal)**. [commons.wikimedia.org](https://commons.wikimedia.org/)

### Other sources

- Nonpartisan analyses from the Congressional Budget Office, the Joint Committee on Taxation, the Tax Policy Center and the Penn Wharton Budget Model, and the positions of worker and business groups, score Workers > Profit bills (fourteen on file, ten scored).
- The project's original research file supplies vote records, statement checks, ethics summaries, and the issue coding of each vote.

### Do not use (shut down, closing, or not free)

- **Vote Smart API:** paid license only, from $350 a month to build with or $4,850 a year to publish, and the site may not credit Vote Smart **(State and federal)**.
- **ProPublica Congress API:** no longer available and no new keys **(Federal only)**. [Shutdown notice](https://projects.propublica.org/api-docs/congress-api/)
- **OpenSecrets API:** reported switched off in 2025; use FEC data directly instead. Its bulk-data sign-ups also reportedly go unanswered **(Federal only)**.
- **Google Civic Information API, representative lookup:** shut down in April 2025 **(State and federal)**.
- **GovTrack API and bulk data:** ended in 2017 **(Federal only)**.
- **House Stock Watcher and Senate Stock Watcher:** reportedly offline; **Lambda Finance:** API closes August 31, 2026 **(Federal only)**.
- **Paid only:** Quiver Quantitative, EODHD congressional trades, Ballotpedia, Cicero, BallotReady, and PACER (per page).

Some links were built from paths the sites list rather than opened directly (voteview.com, the Eulerpool docs, LDA.gov, the congress-legislators project page, and the Federal Register, SEC, New York Times, Wikidata, and Wikimedia Commons pages). If one does not load, use the site's home page.

### Current status

<img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> **Done** · <img src="../assets/checkbox-progress.svg" width="20" align="absmiddle" alt="In the works"> **In the works** · <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **Not started**

**Where things stand now:**

- 46 of 59 politicians are "Not graded" on the Promise Score, because most have only 2 or 3 checks. The president is graded from PolitiFact's trackers: **F (43%)**.
- Fourteen bills and amendments are on file for Workers > Profit and ten are scored. 23 people have the 3 scored actions a grade needs; everyone else is "Not graded" on that score.
- The president's Ethics Score is **F (0%)**: 5 confirmed findings and 7 investigations that ended without a finding.
- Money figures added Nov. 1, 2026, all shown without a grade: $6.0 million in bundled donations to 23 people from five groups' PACs (AIPAC $4.9 million, J Street $0.6 million, the Senate Conservatives Fund $0.3 million, Club for Growth $0.1 million, EMILY's List $12,000), plus Booker's hand-researched AIPAC total; 378 funder entries for 51 of 59 people. Gift sizes and net worth fill in from the refresh. PAC types are built but not saved yet (`npm run pacs:types`).
- The 16th Your match issue, money in politics and congressional ethics, has six bills: 17 sponsorships and cosponsorships from 12 people, and 6 cited statements.
- The original research file was not independently fact-checked.
- The ethics tags, open/closed labels, and liberal/conservative key-vote marks were added on top of that file and are judgment calls.

**Before grades go public:**

- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> Review every ethics tag and open/closed label
- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> Review the liberal/conservative marks on the key votes, including the labor votes added for Workers > Profit
- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> Fact-check the original research file
- <img src="../assets/checkbox-progress.svg" width="20" align="absmiddle" alt="In the works"> Add Workers > Profit bills with cited evidence (fourteen on file, ten scored)
- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> Check the MAGA-Meter tally against PolitiFact's live page
- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> Tag true campaign promises separately from other stated positions
- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> Review the committee-sector list (`public/committee-sectors.json`) and the outside-spender sectors assigned from names
- <img src="../assets/checkbox-progress.svg" width="20" align="absmiddle" alt="In the works"> Enter the API keys and check each new source's first live refresh on the API updates and Website updates screens (FEC, SAM.gov and Congress.gov are set)

## Open decisions

These values are placeholders or interpretations of the original notes. Confirm or adjust each one.

- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **Ethics deductions:** the original notes used −10 / −5 / −3; the app uses −20 / −15 / −5, which this doc follows. Confirm which set to keep.
- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **Ethics index weights:** the kind multipliers (criminal × 1.5, technical × 0.5), the age rule (× 0.5 after 10 years), the trading indexes' tenth, and each index's part weights are placeholders. Confirm them, and review each case's `kind` and `decided` tags in the research.
- <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> **Statement-only issues in Your match:** counted at half importance (Rule 1), in this doc and in the app.
- <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> **Workers > Profit scope:** votes, sponsorships and cosponsorships with Rule 1 weights, in this doc and in the app.
- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **Weights:** statements at 0.5 (also used now for public statements on Workers > Profit bills); votes, sponsorships, and official acts at 1.0. Should sponsoring a bill count more than voting for it?
- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **Half credit in the Promise Score:** partly supported and changed position both earn ½. Raise partial credit (for example to 0.75) if a compromise should count closer to a kept promise.
- <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> **Finding severity:** cases are now weighted by kind in the Legal Trouble Index (criminal × 1.5, ethics or civil × 1, technical × 0.5). The multipliers themselves are confirmed under **Ethics index weights**.
- <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> **Transparency:** late or missing trade reports and late annual disclosures now count, through the Stock Disclosure Dodger Index.
- <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> **The 80% rule:** replaced by the five who-gains steps (Step 1 of Workers > Profit), which compare lower-income households with the top instead of using one cut-off.
- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **People-leaning list:** the original notes repeated the Profit items under "People," so the People column was written as their mirror image. Add anything missing.
- <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> **Which votes count:** an amendment vote counts on its own, keyed like a bill (the Cornyn and Sanders amendments). A procedural vote, such as cloture or a motion to waive the budget rules, counts as the vote on its bill. When a bill has more than one recorded vote, or versions in different Congresses, the latest vote is the one counted.
- <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> **Money analysis:** decided Nov. 1, 2026: the Money & Influence analysis stays outside the grades, except the Corporation Compromised Index 🏢, which is now 25% of Workers > Profit (step 9). "Corporate" means PACs the FEC records as sponsored by a corporation, a trade association or a cooperative.
- <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> **One funder deciding Donor Loyalty:** decided Nov. 1, 2026: no funder counts for more than all the others put together (at most half the weight).
- <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> **Blind trusts and divestment (step 8):** decided Nov. 1, 2026: a qualified blind trust takes the trustee's trades out of the trading indexes; no individual stocks labels the index; managed accounts and trusts in name only are not excused; no bonus. See Blind trusts and divestment under the Ethics Score.
- <img src="../assets/checkbox-progress.svg" width="20" align="absmiddle" alt="In the works"> **Money promises (step 7):** built as a records check beside the reviewed verdict, not a score change. Defaults to confirm: trade-association and membership PACs don't count against a corporate-PAC pledge; the FEC report covering the pledge date decides nothing; a vote against a ban is reviewed, not counted as broken on its own.
- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **Flag thresholds:** top 20 donors, a 50% donation change, and a 6-month window.
- <img src="../assets/checkbox-progress.svg" width="20" align="absmiddle" alt="In the works"> **Who marks bills:** the Workers > Profit bill score now follows a fixed rule from cited evidence (who gains and who took a side). Still open: who reviews the evidence and settles disagreements, and who assigns the liberal/conservative marks.
- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **State records in Workers > Profit:** the CBO and JCT analyze federal bills only, so decide which sources (such as state legislative fiscal offices) can mark state bills. Voteview's DW-NOMINATE also covers Congress only, so the ideological position indicator is blank for state-only officials unless a state-level measure is added.
- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **Trading deductions:** the old −2 per late report and −1 per conflict trade are replaced by the Insider Trading and Stock Disclosure Dodger indexes, at a tenth each (their weights are under **Ethics index weights**). Still open: the 30-day window for trades near votes, and checking each trade service's terms before republishing its data.
- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **Overlapping sources:** where several sources cover the same thing (stock trades, state bills, news, hearings, legal leads, statements and top donor organizations), they are merged and the official record wins. Confirm this rule, and who reviews the disagreements.
- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **Trading history:** the refresh now reads both chambers' official trade reports from the last two years (House Clerk and Senate eFD). Older trades still come from `scripts/build-holdings.py`, for review. Confirm your use fits the Ethics in Government Act limits: no commercial use other than news media, no credit ratings and no fundraising.
- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **Court records:** CourtListener's free account allows only about 125 requests a day. Decide whether checking the profiled politicians weekly fits that, or whether a membership is needed.
- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **Ethics leads:** court records, FEC enforcement records, DOJ press releases, and news only point to possible cases. Decide who confirms a case's status from an official record before it is scored.
- <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> **The president's promises:** graded from PolitiFact's trackers, with both terms counted together (the Trump-O-Meter and the MAGA-Meter).
- <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> **Shared bill scores:** a bill's score applies to everyone who acted on it, so a president's signature and members' votes on the same bill are scored the same way.
- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **Agency estimates:** decide whether a government agency's own estimate (for example the CFPB's estimate of what its overdraft-fee rule saved consumers) can mark a bill, or only the CBO, the Joint Committee on Taxation and the Tax Policy Center. The repeal of that rule, which Trump signed in 2025, would be the next mark. CBO's coverage estimates now count, as access (Step 1); an agency's own estimate is still undecided.
- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **Tariffs:** analyses find the 2025 tariffs cost lower-income households the most as a share of income, but show no group that gains. Decide whether a policy like that can be marked.
- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **The president's trades:** now listed, from Disclosed Capitol's dataset of the OGE reports, but not scored. Decide what replaces the committee-conflict rule for a president (for example, trades in companies or industries the president's own executive orders or signed bills directly affected), or whether conflicts are left out, and whether 278-T reports filed more than 45 days after a trade count in the Stock Disclosure Dodger Index.
- <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **Featured profiles on the score pages:** the president is left out of the score pages, which rank the 2026 candidates. Decide whether to show the president there too.
