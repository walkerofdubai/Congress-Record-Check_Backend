# Congress Record Check

A local, automatically refreshed version of the supplied Congress Record Check HTML, with a Cloudflare Worker and D1 configuration for later hosting.

## Run locally

Open **Start Congress Record Check.cmd**, then visit **http://127.0.0.1:8787**. Requires Node.js 22.13 or later. The launcher installs dependencies if needed. Alternatively, run `npm ci` and `npm start` in this directory.

The local server binds only to your computer. It uses `.local/records.sqlite` and checks the refresh queue once a minute while running. Closing it stops the checks; saved data survives restarts. Nothing has been deployed or subscribed to.

## Enable financial and bill updates

1. Obtain a free [FEC API key](https://api.open.fec.gov/developers/) and [Congress.gov API key](https://api.congress.gov/sign-up/).
2. Copy `.dev.vars.example` to `.dev.vars` in this directory.
3. Enter the keys after `FEC_API_KEY=` and `CONGRESS_API_KEY=`. Keep this file private.
4. Restart the local server. Open **Updates** to see progress.

House and Senate roll calls need no API keys. The Updates screen distinguishes setup requirements, queued work, successful refreshes, and retrying failures. The button runs the next eight source pages; a large source can require several batches. Frontend keys are never used, and saved request URLs exclude credentials.

## What refreshes

- **Campaign totals:** FEC principal committee summaries, on their own reporting dates.
- **PAC contributions:** processed FEC Form 3, Schedule A line 11C, in the selected two-year period. Memo entries are excluded. These contributions are part of campaign receipts.
- **Outside spending:** processed Schedule E with `most_recent=true`. Only general-election entries directly naming the candidate, with dissemination dates within the window, enter the current totals. Support and opposition are separate; opposition to another candidate is not credited to this person. Negative corrections remain. Exact repeated transactions are deduplicated; different transaction IDs remain distinct. Primary/special/unspecified elections, memo entries, future dates and missing dates are separately counted as exclusions.
- **Legislation:** current-Congress sponsored bills and resolutions from Congress.gov, with official links. Recently updated earlier-Congress bills are excluded. The interface shows up to 100; raw published records are retained.
- **Votes:** the original 50 selected roll calls, the latest 30 Senate roll calls discovered from the official index, and subsequent House roll calls discovered sequentially after the latest House roll in the supplied snapshot. This is not a complete historical voting archive. New votes do not change reviewed alignment scores. House positions use Bioguide IDs; Senate positions use an unambiguous exact surname and state match, or a LIS ID if configured. An unmatched person produces no inferred vote.

Each source is scheduled again 24 hours after completion. All pages must succeed before new financial or legislative records publish. Full replacements pick up revised totals, amendments and removed records instead of appending forever. Failed runs leave the last published snapshot intact and retry with backoff; source `Retry-After` is respected. A database lock prevents overlapping refreshers. The UI provides on-page failure/staleness notices and a refresh history; external email or push alerts are not configured.

Some snapshots can have different check and coverage dates. In particular, checking the FEC today does not create a newer campaign filing. Imported financial comparisons stay labeled as research snapshots; refreshed figures appear in **Latest records** so different reporting windows are not silently mixed.

## Profile Overview

A candidate's page opens on its Overview tab: where the campaign's money comes from (FEC two-year receipts split into small donors, larger individual donors, PACs, party committees, the candidate's own money and a joint-fundraising/other remainder), outside money for and against with the largest spenders named, a per-issue comparison with the viewer's My alignment choices (no evidence is left blank, never scored as a mismatch), a strip showing where the candidate sits among their chamber's DW-NOMINATE scores, and a tally of checked statements that always shows how many were checked. Ethics appears as a short text list tagged allegation, investigation or confirmed finding. The tag is the `status` field of each entry in `public/research.json`; `npm test` fails if a displayed entry lacks one. The Methodology page defines the tags and how each visual is computed.

The politics visual also scores how the candidate voted on key bills marked liberal or conservative. The marking is `liberalSide` / `leanNote` on each issue in `public/research.json`; the logic is in `public/lean.js` and is covered by `npm test`.

## Reviewed research

`public/research.json` contains the original researched snapshot, including biographies, race ratings, Voteview scores, ethics, statements, industry classifications and alignment coding. Edit this file to publish reviewed changes; refresh jobs never rewrite it. Its contents were preserved from the supplied document, not independently fact-checked by this conversion.

`data/config.json` defines source identifiers and the election/Congress to track. Coverage is fixed to the supplied 2026 candidate set until reviewed and updated. Review candidate/committee relationships and election-cycle configuration before moving to a new cycle. `scripts/import-original.mjs` is a one-time extraction tool; rerunning it overwrites the imported frontend/research files.

Job definitions are seeded on the first launch. Changing the tracked population or cycle also requires migrating the existing job definitions or starting a new database after backing up `.local/`. Editing research prose does not require a database reset.

## Checks

Run `npm test` for pagination, transaction deduplication, negative corrections, API identity validation, precision-safe IDs, stale-data preservation, atomic publication, refresh locking and request protection. Run `npm run check` for syntax and import validation.

The FEC and Congress.gov adapters are covered by representative response tests. Their authenticated live refreshes require your API keys; they have not been claimed as verified without those keys. Official House and Senate XML feeds can be checked live locally.

The Worker bundle also builds locally (`node scripts/build.mjs`). A full Wrangler deployment dry run was blocked by this execution environment's Windows directory-access restrictions. Cloudflare runtime/deployment verification remains a later step; no cloud deployment has been performed.

## Deploy later to Cloudflare

The local and Cloudflare servers share the same refresh and API implementation. There is no separate frontend build.

1. `npx wrangler login`
2. `npx wrangler d1 create congress-record-check`
3. Put the returned database ID in `wrangler.jsonc`.
4. `npm run db:migrate`
5. `npx wrangler secret put FEC_API_KEY`
6. `npx wrangler secret put CONGRESS_API_KEY`
7. `npm run cloudflare:deploy`

The hosted cron checks every five minutes, processing up to eight source pages per invocation. Use the Workers paid plan for the configured CPU allowance. D1 and Worker usage may incur charges beyond included allowances; this project does not enable billing or create any cloud resources by itself. The hosted database begins empty and fills from official sources; the reviewed snapshot is bundled with the static assets. Local SQLite files and API keys are excluded from deployment.

Deployment remains a later manual step because this version was requested to stay local.

## Files

- `public/` — existing design, reviewed JSON, live data UI
- `src/sources.mjs` — official-source adapters and validation
- `src/refresh.mjs` — persistent jobs, staging and publication
- `src/worker.mjs` — Cloudflare API and scheduled handler
- `scripts/local.mjs` — localhost server using the same backend
- `migrations/` — portable SQLite/D1 schema
- `test/` — backend regression tests

Sources: [FEC API](https://api.open.fec.gov/developers/), [Congress.gov API documentation](https://github.com/LibraryOfCongress/api.congress.gov), [Senate roll calls](https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.htm), [House Clerk](https://clerk.house.gov/Votes).
# Public Ledger
### Follow the money. Check the record. Find your alignment.

<img width="200" height="200" alt="image" src="https://github.com/user-attachments/assets/fa265870-665c-41b5-8ec7-2bce1c1c7391" />

Public Ledger helps voters understand **who funds their elected officials, how they vote, and whether their actions match their promises**.

The platform brings complex public records into one easy-to-read **candidate scorecard**, helping users explore:

- **Campaign Funding:** Who financially supports a candidate and how funding patterns relate to their legislative record.
- **Legislative Record:** Bills introduced, sponsored, and voted on, with plain-language summaries of their purpose and potential effects.
- **Promises vs. Actions:** How campaign promises and public statements compare with documented actions.
- **Ethics & Accountability:** Documented ethics history, clearly distinguishing ongoing investigations from confirmed violations.
- **Funder–Legislation Connections:** Compare funders’ public positions on bills with the actions of politicians they support, highlighting shared interests and potential influence without assuming causation.
- **Voter Alignment:** How candidates’ records and stated positions align with users’ policy priorities.

Our goal is to **make political accountability accessible** through clear, source-backed information that helps voters make informed choices.
