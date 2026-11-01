# MONEY & INFLUENCE ANALYSIS 💰

<img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> **Done** · <img src="../assets/checkbox-progress.svg" width="20" align="absmiddle" alt="In the works"> **In the works** · <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **Not started**. To change one, swap the image name in its line: `checkbox-empty` (not started), `checkbox-progress` (in the works) or `checkbox-checked` (done).

Back to [Updates & fixes in need](../.04_UPDATES_&_FIXES_IN_NEED.md). The rules every index follows are in [How the math works](01_HOW_THE_MATH_WORKS.md).

## Updates &/or changes

| Status | Item | Notes |
|---|---|---|
| <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> | Kept as an analysis, not a grade | Choice A. Labeled **Correlation, not cause**. |
| <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> | Insider Trading Index 📈 shown beside the trade list | The same number as the Ethics tab, with a link to it. |
| <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> | Money sources built | Donors by employer and by month, lobbying, foreign-agent registrations, contracts, rule comments, and the groups behind outside spending. Some wait on their keys. |
| <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> | Donor Loyalty Index 🤝 | On the Money & Influence tab, beside Vote Donor Alignment, with each funder's difference and weight in a table. Party totals are loaded for all 60 saved roll calls, the Senate's from Voteview when Senate.gov refuses. |
| <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> | Cap on one funder's weight in Donor Loyalty | Decided Nov. 1, 2026 (option 2): no funder counts for more than all the others put together. Collins went from 100 to 70; see the design below. |
| <img src="../assets/checkbox-progress.svg" width="20" align="absmiddle" alt="In the works"> | Donors by gift size (step 1 of 9) | Built: a daily FEC job reads each campaign's individual money in the FEC's five gift-size groups, shown as a second bar on the Overview's money card. Shown only. Fills in with `npm start`. Also the data for the Grassroots Index 🌱 (Workers > Profit). |
| <img src="../assets/checkbox-progress.svg" width="20" align="absmiddle" alt="In the works"> | PAC type from the FEC (step 2 of 9) | Built: `npm run pacs:types` matches each PAC name to its FEC committee ID and reads its registration (corporate, trade, membership, labor, lobbyist, leadership, nonconnected and so on), shown in the PAC table, a by-type chart and each PAC's description. Not saved yet: the Nov. 1 commit has the cosponsors but no PAC types, so rerun it without `--check`, review, and commit `public/research.json`. |
| <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> | Bundled (earmarked) donations (step 3 of 9) | `npm run funders:bundled`, run Nov. 1, 2026: $6.0M to 23 people from AIPAC, J Street, the Senate Conservatives Fund, Club for Growth and EMILY's List, plus Booker's hand-researched AIPAC total. Shown beside each group's own money, in a table and on the Bills page, and counted in Donor Loyalty and Vote Donor Alignment. Rerun with each quarter's FEC reports, then `node scripts/build-funders.mjs`. |
| <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> | Money review before committing (step 5 of 9) | `npm run review:money` lists, for each person, what changed in their funders, Donor Loyalty and Vote Donor Alignment since the last commit. Run it after any money script. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | More groups that bundle | Only five groups' conduit PACs are read. Others that forward members' gifts (for example Council for a Livable World) need their conduit committee IDs added to `groupPos[].conduits` in `public/research.json`. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Super PAC Dependence Index 💸 | Replaces the withdrawn super PAC share. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Lobbyist Overlap Index 🏛️ | |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Contracts for Donors Index 📝 | Needs a table matching agencies to the committees that oversee them. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Foreign Agent Flag 🚩 | |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Donor hover details | Three bullets: sector, what they do, and political stance with a cited source. Today the hover is one sentence. |
| <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> | Treemap of itemized PAC contributions by sector | On the Money & Influence tab, colored People-aligned, Profit-aligned or Other. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | SAM.gov: look up each organization once, then recheck monthly | Saves its 1-request-a-run limit. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Check for Epstein-linked donors in FEC records | Offered, not started. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Decide the graph for each index | |

---

## Index designs

These stay beside the grades and carry the **Correlation, not cause** label.

### Stock trades (from the Ethics tab) 📈
Not a separate index:
- **What's shown:** the Insider Trading Index number from the Ethics tab, beside the existing "Stock holdings and trades" list and the "Stock in donors" stat.
- **Breakdown:** a link to the Ethics tab, which has the parts and the math.
- **Nothing calculated here:** the trade list and its donor flags stay context only. They feed the "Trades in donors" part of the Insider Trading Index, so the two tabs always agree.

**Keys and sources:** the same as the Insider Trading Index 📈 on the Ethics tab.

### Donor Loyalty Index 🤝
**Measures:** how much more they vote with their funders than members of their own party do.

1. For each funder that took public positions, take the person's rate of voting its way minus their party's average on those same votes.
2. Weight each funder by the money it gave, bundled or spent for them, but no funder counts more than all the others put together (at most half the weight). Without this, one big funder with a single position on file decided some people's index on its own (Collins: 100 with AIPAC's $3.35M on one vote; 70 with the cap).
3. Only the amount above the party average counts. The ceiling is 25 points above.

**Minimum:** 5 compared votes.

**Details:**
- **Party average:** how the rest of their party in the chamber voted on each vote, from the official roll call's party totals, with their own vote left out.
- **Independents:** compared with the party they caucus with.
- **Money:** what each funder gave to the campaign, plus the donors' gifts it bundled to the campaign through its PAC ("earmarked": AIPAC, Club for Growth, EMILY's List, J Street and the Senate Conservatives Fund), plus what it spent for them. A group that only spent against them carries no weight.
- **No number:** for a president (who signs bills rather than voting), and until the party totals are loaded.

**Keys and sources:**
- **Party totals:** the official Senate and House Clerk roll calls, no key. `npm run votes:party` (`scripts/build-vote-party.mjs`) reads them for the saved votes into `public/vote-party.json`, and new roll calls the refresh reads keep their own. Senate.gov can turn the script away (HTTP 403); then the Senate votes come from Voteview's free files, and each one is kept only when its yeas and nays match the result saved with the vote.
- **Money from each funder:** `FEC_API_KEY` <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> for contributions and outside spending, plus the FEC's bulk files for earlier years (no key).
- **Bundled gifts:** `FEC_API_KEY`, from each conduit PAC's own reports (`npm run funders:bundled`, then `node scripts/build-funders.mjs`).
- **Funders' positions:** the reviewed research (their scorecards, key-vote letters and public statements, for 36 groups). No key.
- **Votes:** Senate and House roll calls (no key), and `CONGRESS_API_KEY` for House votes from 2023 on.

### Super PAC Dependence Index 💸
**Measures:** super PAC spending for them ÷ (campaign funds raised + all outside spending for them), × 100.

- **Dates:** Jan. 1, 2025 – Sept. 30, 2026. The Q3 reports are in, so both sides now cover the same dates.
- **Covers:** general-election spending only.
- **Not shown:** for three-way races or races marked incomplete.

This replaces the withdrawn super PAC share.

**Keys and sources:** `FEC_API_KEY` <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done">, for campaign totals and independent expenditures.

### Lobbyist Overlap Index 🏛️
**Measures:** bills they sponsored, cosponsored or voted on that a top 20 donor organization lobbied on ÷ all bills they acted on in the same period.

- **Ceiling:** 20%.
- **Exposure only:** lobbying reports don't say which side the lobbyist wanted.

**Keys and sources:**
- **Lobbying reports:** `LDA_API_KEY` (optional).
- **Top donor organizations:** `FEC_API_KEY` <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done">.
- **Their bills:** `CONGRESS_API_KEY`.
- **Their votes:** Senate and House roll calls. No key.

### Contracts for Donors Index 📝
**Measures:** the number of their top 20 donor organizations that got federal contracts from agencies their committees oversee, ÷ 20, × 100. The total contract dollars are shown beside it.

**Needs:** a small new table matching agencies to the committees that oversee them.

**Keys and sources:**
- **Top donor organizations:** `FEC_API_KEY` <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done">.
- **Companies' federal IDs:** `SAM_API_KEY` <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done">.
- **Federal contracts:** USAspending. No key.
- **Their committees:** congress-legislators. No key.

### Foreign Agent Flag 🚩
A flag, not an index:
- **Yes or no:** whether any top donor organization, or a lobbyist working for one, is registered as a foreign agent (FARA).
- **Details:** each registration is listed.

**Keys and sources:**
- **Foreign-agent registrations:** FARA. No key.
- **Top donor organizations:** `FEC_API_KEY` <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done">.
- **Their lobbyists:** `LDA_API_KEY` (optional).
