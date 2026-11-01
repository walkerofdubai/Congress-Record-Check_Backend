# HOW THE MATH WORKS

The rules every index in this folder follows.

Back to [Updates & fixes in need](../.04_UPDATES_&_FIXES_IN_NEED.md).

- **Turning a part into 0–100:** a share is multiplied by 100, so 30% becomes 30. Anything else is compared with a ceiling. At or above the ceiling counts as 100, and below it scales down. For example, with a ceiling of 20%, a share of 8% scores 40.
- **The index:** the weighted average of its parts.
- **Missing data:** a missing part drops out and the other parts are re-weighted. If a part marked *required* is missing, the index shows "Not enough data".
- **Party comparison:** every index also shows how the person compares with the average for their party and chamber, for example "+12 vs. party."
- **Reviewed data only:** refreshed records stay as leads until they're reviewed.
- **One calculation per index:** each index is calculated once, on its home tab. If another tab shows it, it's the same number with a link back.
- **Keys:** in these files, <img src="../assets/checkbox-checked.svg" width="20" align="absmiddle" alt="Done"> after a key means you already have it. "No key" sources work for free.
