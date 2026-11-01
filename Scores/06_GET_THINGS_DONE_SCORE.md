# GET THINGS DONE SCORE 🏗️ (Still Optional)

<img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> **Done** · <img src="../assets/checkbox-progress.svg" width="20" align="absmiddle" alt="In the works"> **In the works** · <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **Not started**. To change one, swap the image name in its line: `checkbox-empty` (not started), `checkbox-progress` (in the works) or `checkbox-checked` (done).

Back to [Updates & fixes in need](../.04_UPDATES_&_FIXES_IN_NEED.md). The rules every index follows are in [How the math works](01_HOW_THE_MATH_WORKS.md).

## Updates &/or changes

| Status | Item | Notes |
|---|---|---|
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Decide whether to add it as a fifth grade | |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Get It Done Index ✅ | Needs `CONGRESS_API_KEY`, which is set now. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | No-Show Index 🪑 | Needs a new job that reads every roll call. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Across the Aisle Index 🌉 | Needs `CONGRESS_API_KEY`, which is set now. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Party Rebel Index 🤠 | From Voteview. Beside the grade, not inside it. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Grade formula, home card, profile tab and Scores page | Only if the grade is added. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Decide the graph for each index | |

---

## Index designs

**Measures:** how well they do the job, whatever they stand for. It's shown as a fifth grade on each home card, with its own profile tab and its own page in the Scores menu.

### Get It Done Index ✅
**Measures:** how far their substantive bills get in the current Congress. Ceremonial and naming resolutions don't count.

- **Points per bill, by the furthest stage reached:**
  - committee action: 1
  - passed committee: 2
  - passed one chamber: 4
  - passed both chambers: 6
  - became law: 10
- **Ceiling:** 30 points per Congress for members of the majority party, and 15 for the minority. Minority-party bills rarely move, so they're compared on a fairer scale.

**Example:** a minority-party member with 3 bills that got committee action (3), 1 that passed committee (2) and 1 that passed the House (4) has 9 points ÷ 15 = **60**.

**Keys and sources:**
- **Their bills and how far each got:** `CONGRESS_API_KEY`, from their sponsored bills and each bill's actions.
- **Majority or minority party:** congress-legislators. No key.

### No-Show Index 🪑
**Measures:** missed roll calls ÷ the roll calls they were eligible for in the current Congress.

- **Ceiling:** 20% missed.
- **Medical leave:** votes missed during publicly announced medical leave don't count as missed.
- **Campaigning:** votes missed while running for another office count, and are labeled.

**Example:** 2% of votes missed ÷ the 20% ceiling = **10**.

**Keys and sources:**
- **Every roll call in the current Congress:** Senate.gov and the House Clerk (no key), and `CONGRESS_API_KEY` for House votes. The refresh reads only selected and recent votes today, so this needs a new job that reads them all.
- **Medical leave:** the member's own announcements and the news, in the reviewed research. No key.

### Across the Aisle Index 🌉
**Measures:** how much they work with the other party, in the current Congress.

- **Other-party cosponsors on their bills (50%):** the share of cosponsors on their bills who are from the other party.
- **Other-party bills they cosponsor (50%):** the share of the bills they cosponsored that were sponsored by the other party.

- **Ceiling:** 50% for each part.
- **Minimum:** 5 of their own bills with cosponsors.

**Example:** 20% other-party cosponsors (scores 40) and 20% other-party bills (scores 40) give **40**.

**Keys and sources:**
- **Bills, cosponsors and sponsors:** `CONGRESS_API_KEY`.
- **Each member's party:** congress-legislators. No key.

### Party Rebel Index 🤠
**Measures:** 100 − their party unity score (Voteview, 119th Congress).

- **Ceiling:** 20.
- **Also shown:** the number of key votes where they went against their party's majority.
- **Beside the grade, not inside it:** breaking from your party isn't good or bad in itself.

**Keys and sources:**
- **Party unity:** Voteview data. No key.
- **Key votes against their party:** Senate and House roll calls. No key.

### ↓↓↓

### New Get Things Done grade formula 🏗️
**Get Things Done** = (0.5 × Get It Done Index) + (0.3 × (100 − No-Show Index)) + (0.2 × Across the Aisle Index).

- **Letter grades:** the same scale as the other four grades. A is 90–100, down to F below 60.
- **Needs:** a congressional record in the current Congress, with a Get It Done Index. Everyone else, including most challengers and state officials, is "Not graded".
- **Missing parts:** if No-Show or Across the Aisle shows "Not enough data", the other parts are re-weighted.
- **Doesn't overlap the other grades:** none of the other four measure job performance. Your match stays about positions only.
- **Party Rebel 🤠** sits beside the grade, not inside it.

**Example:** Get It Done 60, No-Show 10 (so showing up scores 90) and Across the Aisle 40 give (0.5 × 60) + (0.3 × 90) + (0.2 × 40) = 30 + 27 + 8 = **65 (D)**.
