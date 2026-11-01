# YOUR MATCH 🎯

<img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> **Done** · <img src="../assets/checkbox-progress.svg" width="20" align="absmiddle" alt="In the works"> **In the works** · <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> **Not started**. To change one, swap the image name in its line: `checkbox-empty` (not started), `checkbox-progress` (in the works) or `checkbox-checked` (done).

Back to [Updates & fixes in need](../.04_UPDATES_&_FIXES_IN_NEED.md). The rules every index follows are in [How the math works](01_HOW_THE_MATH_WORKS.md).

## Updates &/or changes

| Status | Item | Notes |
|---|---|---|
| <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> | Your match grade | Shown on each home card and profile. Compares your choices with their votes, bills and statements. |
| <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> | Statements count at half importance | Rule 1: actions count more than words. |
| <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> | Kept about positions only | Choice A: the "how they work" indexes are context, not part of the match. |
| <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> | Money in politics and congressional ethics | A new issue (the 16th, in its own My alignment category): ban members' stock trading and lobbying after office, and overturn Citizens United. Evidence: sponsoring or cosponsoring the six bills on the Bills page tagged with it (stock-trading bans H.R. 5106, S. 1879, S. 1498 and H.R. 358, the lifetime lobbying ban H.R. 3554, and the Democracy for All Amendment S.J.Res. 43), from `npm run bills:cosponsors`, plus six cited statements already on file. Not marked liberal or conservative. The Stop Insider Trading Act (H.R. 7008) isn't counted, because its final version added a voter-ID section. |
| <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> | Position by issue | A bar per category, liberal to conservative, in "The record behind the match". Same evidence as Your match. Context only. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Issues for Civil liberties, Criminal justice, Housing, and Social Security and Medicare | Each needs an issue with liberal and conservative sides and marked bills. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Decide the minimum record for a position bar | One action or statement for now (`MIN_POSITION_ITEMS` in `public/lean.js`). |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Show Party Rebel 🤠, Across the Aisle 🌉, Get It Done ✅ and No-Show 🪑 in the record section | Context only. They come from the [Get Things Done](06_GET_THINGS_DONE_SCORE.md) work. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Interest group ratings card | Heritage Action, AFL-CIO, LCV, ACLU and HRC, imported by hand once a year, always shown in opposing pairs and never counted in a grade. |
| <img src="../assets/checkbox-progress.svg" width="20" align="absmiddle" alt="In the works"> | Key votes from the interest groups | Suggestions for issue votes. Each vote is confirmed from the official roll call. Started: the PRO Act (2020 and 2021), the $15 minimum wage and the CHIPS prevailing-wage amendment were added from the groups' key votes, under Labor and wages. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Review the liberal/conservative marks on the key votes | From the methodology checklist. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Optional "how they work" questions in My alignment | Option B. Only if visitors ask for it later. |
| <img src="../assets/checkbox-empty.svg" width="20" align="absmiddle" alt="Not started"> | Decide the graph for each index shown here | |

---

## Index designs

### Indexes shown here
Party Rebel 🤠, Across the Aisle 🌉, Get It Done ✅ and No-Show 🪑 appear in the record section as context. They never count toward the match. Their designs are in [Get Things Done](06_GET_THINGS_DONE_SCORE.md).
