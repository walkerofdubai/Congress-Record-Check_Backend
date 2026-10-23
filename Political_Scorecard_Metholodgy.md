# Politician Scorecard: Scoring Methodology

Oct 22, 2026 · Mak Trnka

## How the scorecard works

Each politician gets four graded scores, shown as a letter grade with the percentage beside it, for example **B (84%)**. When there is not enough evidence, a score shows **"Not graded"**, never a zero or a guess. Two other indicators and the Money & Influence analysis are shown without grades. The app applies these rules in `public/grades.js`.

| Score | Shown in the app as | What it measures | Minimum evidence for a grade |
| --- | --- | --- | --- |
| Ideology Match | Your match | How closely the politician's record matches the visitor's own views | 3 issues with evidence, covering at least half of the visitor's total importance |
| Promise | Promises delivered | Whether what they said matches what they did | 3 counted checks |
| Ethics | Ethics | Documented ethics and legal problems, plus stock-trading disclosures and conflicts | None: "none located" scores 100% |
| People over Profit | People over profit | Whether their record favors lower- and middle-income households or the wealthy and corporations | 3 scored actions on marked bills |

### Grade scale

| Grade | Percentage |
| --- | --- |
| A | 90–100% |
| B | 80–89% |
| C | 70–79% |
| D | 60–69% |
| F | Below 60% |

Percentages are rounded to the nearest whole number before a grade is assigned.

## Rule 1: Actions count more than words

Every recorded action on an issue gets a weight, and this weight is used in every score below. A speech or statement counts half as much as a vote or sponsorship, because only legislative actions have a binding effect.

| Action | Weight |
| --- | --- |
| Sponsors or co-sponsors a bill | 1.0 |
| Votes for or against a bill | 1.0 |
| Official act, for officials who do not vote in Congress (for example, an executive order or official ruling) | 1.0 |
| Speech in Congress or public statement on an issue with no recorded action | 0.5 |

- **Actions first.** Statements are used only on issues with no recorded action. Once a vote, sponsorship, or official act happens on an issue, it replaces earlier statements, so the politician is not counted twice.
- **One credit per bill.** Sponsoring a bill and then voting for it counts once, at 1.0.
- **Votes take a side.** A Yea or sponsorship counts toward the bill's marked side; a Nay counts toward the opposite side.
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

## Ethics Score

The Ethics Score starts at 100% and loses points for each documented ethics or legal case, based on where that case currently stands, and for stock-trading problems (see Stock trading below).

| Case status | Deduction |
| --- | --- |
| Confirmed finding: a penalty, conviction, or official finding by an ethics committee, court, or regulator, or the person admitted it | −20 |
| Open investigation, including investigations with no public resolution | −15 |
| Investigation ended without a finding: acquitted, dismissed, or cleared | −5 |
| Allegation: a complaint no official body acted on | 0 (listed, not scored) |

- **Each case counts once, at its current status.** When a case changes, its deduction is replaced, not added. An open investigation that ends in a finding moves from −15 to −20; one that ends in acquittal moves from −15 to −5.
- **Ended investigations keep a small deduction**, because the conduct was serious enough to be formally investigated.
- **An investigation** means one opened by an official body, such as a congressional ethics committee, the Justice Department, the FEC, or an inspector general.
- The score cannot go below 0%.

```latex
\text{Ethics Score} = 100 - \text{sum of deductions for all cases}
```

**Examples:** Collins has 1 closed investigation: 100 − 5 = **A (95%)**. Perry has 2 open investigations: 100 − 30 = **C (70%)**. Paxton has 1 finding and 4 closed investigations: 100 − 20 − 20 = **D (60%)**.

### Stock trading

Trades come from the Periodic Transaction Reports that members of Congress file under the STOCK Act, due within 30 days of learning of a trade and no later than 45 days after it. Members may still trade stock, so only rule-breaks and clear conflicts lose points. Trading deductions are added to the case deductions in the formula above. Trades that overlap with donors are also flagged in the Money & Influence Analysis.

| Trading item | Deduction |
| --- | --- |
| Late or missing disclosure report | −2 each, up to −10 |
| Individual stock trade in a company or sector their committee oversees | −1 each, up to −10 |
| Trade within 30 days before a vote, hearing, or bill they acted on that affects that company | Flagged, not scored |
| Returns or profits | Not scored |

- **Spouse and dependent-child trades count**, labeled as such, because the STOCK Act requires them to be disclosed.
- **No individual stocks** means no deduction and a "No individual stock trades" label. There are no bonus points, since the score already starts at 100.
- **Timing flags** follow the same principle as the Money & Influence Analysis: timing is not proof. If an official body opens an investigation, the case table above applies instead.
- **Returns are not scored**, because disclosures report value ranges (such as $1,001–$15,000) rather than exact amounts, so profit figures are estimates, and a large gain can simply reflect a market rally.
- **State-only officials** show "No trading data," since these filings cover Congress only and state disclosure rules vary.
- **Votes on stock-trading-ban bills** are policy positions, so they are scored in Your match and Promise, not here.

**Example:** 3 late reports and 4 committee-conflict trades: 100 − 6 − 4 = **A (90%)**, before any other ethics cases.

## People over Profit Score

The People over Profit Score measures whether a politician's legislative actions work for lower- and middle-income households or for the wealthy and corporations. A higher percentage means more of their record works for the people: an **A** means they work for the people, and an **F** means they work for the wealthy and corporations.

### Step 1: Classify each bill

Bills in the areas listed in Step 2 are in scope. A bill counts **only if** a nonpartisan analysis of who gains is cited for it, from the Congressional Budget Office, the Joint Committee on Taxation, or the Tax Policy Center. That analysis marks the bill **People** or **Profit**, recorded with a short written reason. A bill whose analysis shows no clear winner is left out.

A tax bill counts as benefiting the wealthy when independent analysis shows 80% or more of its benefits go to the highest-income households and large corporations.

### Step 2: Score each action

| Area | People-leaning actions | Profit-leaning actions |
| --- | --- | --- |
| Unions and labor | Supports bills that protect or strengthen unions and collective bargaining | Supports bills that weaken or dismantle unions; opposes bills that help unions |
| Wages | Votes to raise the minimum wage | Votes against raising the minimum wage |
| Taxes | Votes to raise taxes on the wealthy and close loopholes; opposes tax increases on working people | Votes for tax cuts that mainly benefit the wealthy and large corporations; opposes raising taxes on the wealthy; votes for new loopholes; votes for tax increases on working people |
| Social safety net | Votes to protect or expand safety-net programs | Votes to cut safety-net programs; votes against expanding them |
| Cost of essentials | Votes for bills that lower prescription drug, healthcare, and education costs | Votes against those bills; votes for bills that raise those costs |
| Regulation | Votes to keep or strengthen financial, worker, and consumer protections | Votes to dismantle key financial regulations or other worker and consumer protections |

Each action carries its Rule 1 weight and takes a side as Rule 1 describes.

### Step 3: Calculate

```latex
\text{People over Profit} = \frac{\text{People-leaning points}}{\text{People-leaning points} + \text{Profit-leaning points}} \times 100
```

**Example:** 12 People-leaning points and 8 Profit-leaning points give 12 ÷ 20 = 60%, shown as **D (60%)**.

## Other indicators (not graded)

Two more indicators appear on each profile as plain numbers, without a letter grade.

| Indicator | How it appears | How it is calculated |
| --- | --- | --- |
| Ideological position | "More conservative than 48% of the Senate" | Taken from Voteview's DW-NOMINATE score, which uses every roll call in the member's career. The app only compares it with the rest of the chamber. |
| Key-vote position | "Conservative side on 4 of 9 marked bills" | Counts how the person voted on 16 key bills marked liberal or conservative, with votes taking sides as in Rule 1. |

## Money & Influence Analysis

This analysis checks whether month-by-month changes in a politician's donations, along with their personal stock holdings, line up with their votes, sponsorships, and speeches. It shows timing and alignment, not proof that money caused a decision, so it is reported beside the grades rather than built into them.

### What is tracked

- **Donations by month and source:** contributions from each organization's PAC and employees, grouped by organization and industry, from FEC filings. Only the politician's top 20 donor organizations in the current election cycle are analyzed.
- **Who had a stake in each bill:** organizations that lobbied on the bill, from federal lobbying disclosure reports.
- **Decisions:** votes, sponsorships, and speeches in Congress, weighted as in Rule 1.
- **Stock holdings and trades:** holdings from annual financial disclosure reports and trades from Periodic Transaction Reports, including spouse and dependent-child accounts (see Stock trading under the Ethics Score).

### Two alignment measures

| Measure | Question it answers |
| --- | --- |
| Vote Donor Alignment | Of the votes and sponsorships on bills a top donor lobbied on, what percentage went the donor's way? |
| Speech Donor Alignment | Of the speeches on issues a top donor lobbied on, what percentage took the donor's side? |

### Timing flags

A decision is flagged for review when any of these happen within a 6-month window:

- Donations from an organization **rose** 50% or more around a decision in that organization's favor.
- Donations from an organization **dropped** 50% or more after a decision against that organization's interest.
- The politician **changed position** on an issue after a 50% or larger shift in donations from an organization that lobbied on it.
- The politician **held or traded stock** in an organization that also donated to them and lobbied on a bill they acted on.

Each flag lists the organization, its monthly donation totals, the decision, and the dates, so readers can judge the pattern for themselves.

## Charts for each score page

Each score's main page uses the charts below. Every chart shows how many data points sit behind each grade, and politicians who are "Not graded" appear as greyed rows rather than being left out. Gauges, pie charts, and radar charts are avoided because they are hard to compare across people.

### Your match

- Ranked horizontal bar chart of all politicians by match %, colored by grade
- Per-issue bar breakdown when a politician is selected, sorted by the importance the visitor chose

### Promises delivered

- Stacked horizontal bar per politician (supported, partly supported, changed position, contradicted), using raw counts so a grade built on 3 checks looks different from one built on 20

### Ethics

- Stacked bar of points lost (findings, open investigations, closed investigations, late disclosures, committee-conflict trades), only for politicians with deductions
- Summary line such as "X of 59 have no recorded cases"
- Case timeline showing status changes, on each politician's own page
- Filing-delay dot chart: one dot per trade showing the days from trade to disclosure, with a line at 45 days so late filings stand out
- Trades-by-sector bar chart, with the sectors their committees oversee highlighted
- Trade-and-vote timeline: buys and sells on a timeline with markers for related votes and hearings, and flagged trades highlighted
- No returns or profit leaderboards, since those figures are estimates

### People over Profit

- Diverging bar chart centered at 50%, with people-leaning records on one side and wealthy-and-corporate-leaning records on the other
- Scatter plot of People over Profit against DW-NOMINATE position, to spot outliers
- Tree map of the top 20 donors: tile size is the amount given, tile color shows People-aligned donors (unions, small-dollar donors as one tile) vs. Profit-aligned donors (corporate PACs, industry groups), and all other donors are grouped as "Other"
- Link to the outside spending chart on the Money & Influence page

### Ideological position

- Dot plot of the whole chamber on the DW-NOMINATE scale, with the selected politician highlighted

### Money & Influence

- Monthly line chart of donations from each top donor, with markers for related votes, speeches, and stock trades in that donor's company, and flagged moments highlighted
- Outside spending bar chart: money outside groups spent for vs. against the politician, from FEC independent expenditure filings, with each bar split by sector and colored People-aligned vs. Profit-aligned
- For-to-Against Ratio beside it (for example, "3.2 : 1"), or "no opposing spending" when nothing was spent against them

Outside spending is shown as a plain number, not a grade. The politician cannot legally coordinate with these groups, and the amounts mostly reflect how competitive the race was.

## Update process

Scores are refreshed once a month, matching the monthly donation data.

1. Collect everything new since the last update: votes, sponsorships, floor speeches, campaign statements, ethics case changes, stock trade disclosures, and donation filings.
2. Mark new bills People or Profit from a cited nonpartisan analysis, and record the reason.
3. Match new actions to existing promises, and replace earlier statements with votes where Rule 1 applies.
4. Apply the weights and recalculate all four scores.
5. Rerun the Money & Influence flags with the new month's donations.
6. Log every change: which score moved, by how much, and why.

## Data sources and current status

**Sources:** Congress.gov for bills, sponsors, and actions; House and Senate roll-call records for votes; the Congressional Record for floor speeches; FEC filings for donations; House and Senate Periodic Transaction Reports for stock trades and annual financial disclosure reports for holdings, with an aggregator such as Quiver Quantitative to cross-check; federal lobbying disclosure reports for who lobbied on which bills; Voteview for DW-NOMINATE scores; and the project's original research file for vote records, statement checks, ethics summaries, and the issue coding of each vote.

**Where things stand now:**

- 46 of 59 politicians are "Not graded" on the Promise Score, because most have only 2 or 3 checks.
- No bills are marked for People over Profit yet, because the cited analyses have not been verified, so everyone is "Not graded" on that score.
- The original research file was not independently fact-checked.
- The ethics tags, open/closed labels, and liberal/conservative key-vote marks were added on top of that file and are judgment calls.

**Before grades go public:**

- [ ] Review every ethics tag and open/closed label
- [ ] Review the liberal/conservative marks on the 16 key bills
- [ ] Fact-check the original research file
- [ ] Add People over Profit bills with cited analyses
- [ ] Tag true campaign promises separately from other stated positions

## Open decisions

These values are placeholders or interpretations of the original notes. Confirm or adjust each one.

- [ ] **Ethics deductions:** the original notes used −10 / −5 / −3; the app uses −20 / −15 / −5, which this doc follows. Confirm which set to keep.
- [ ] **Statement-only issues in Your match:** this doc counts them at half importance (Rule 1); the app currently counts them at full importance. Update `grades.js` or this doc.
- [ ] **People over Profit scope:** this doc scores votes and sponsorships with Rule 1 weights; the app currently scores votes only.
- [ ] **Weights:** statements at 0.5; votes, sponsorships, and official acts at 1.0. Should sponsoring a bill count more than voting for it?
- [ ] **Half credit in the Promise Score:** partly supported and changed position both earn ½. Raise partial credit (for example to 0.75) if a compromise should count closer to a kept promise.
- [ ] **Finding severity:** every confirmed finding costs 20 points regardless of how serious it is. Consider tiers.
- [ ] **Transparency:** the Ethics Score covers misconduct only. Add items such as late financial disclosures if it should also measure transparency.
- [ ] **The 80% rule:** read here as "a tax bill favors the wealthy if 80% or more of its benefit goes to them." If it meant "votes for such bills 80% or more of the time," this rule changes. Also define "wealthy" (top 1%, top 10%, or another cut-off).
- [ ] **People-leaning list:** the original notes repeated the Profit items under "People," so the People column was written as their mirror image. Add anything missing.
- [ ] **Which votes count:** final-passage votes only, or also amendments and procedural motions?
- [ ] **Money analysis:** kept separate from the grades. Decide whether it should ever affect a grade.
- [ ] **Flag thresholds:** top 20 donors, a 50% donation change, and a 6-month window.
- [ ] **Who marks bills:** who assigns People/Profit and liberal/conservative marks, and how reviewer disagreements are settled.
- [ ] **State records in People over Profit:** the CBO and JCT analyze federal bills only, so decide which sources (such as state legislative fiscal offices) can mark state bills. Voteview's DW-NOMINATE also covers Congress only, so the ideological position indicator is blank for state-only officials unless a state-level measure is added.
- [ ] **Trading deductions:** −2 per late report and −1 per committee-conflict trade (each capped at −10) and the 30-day timing window are placeholders. Check each aggregator's terms before republishing its trading data.
