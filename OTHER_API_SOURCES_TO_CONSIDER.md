# These APIs were all stated as Free

## **Already using**
- **FEC API and bulk files:** donations, PAC contributions and outside spending **(Federal only)**. [api.open.fec.gov/developers](https://api.open.fec.gov/developers/)
- **Congress.gov API:** bills and sponsorships **(Federal only)**.
    - Key: [api.congress.gov/sign-up](https://api.congress.gov/sign-up/)
    - Docs: [github.com/LibraryOfCongress/api.congress.gov](https://github.com/LibraryOfCongress/api.congress.gov)
- **House Clerk roll calls:** official House votes **(Federal only)**. [clerk.house.gov/Votes](https://clerk.house.gov/Votes)
- **Senate roll calls:** official Senate votes **(Federal only)**. [senate.gov roll call lists](https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.htm)
- **Voteview:** DW-NOMINATE ideology scores **(Federal only)**. [voteview.com](https://voteview.com)
- **unitedstates/images:** official public-domain congressional portraits **(Federal only)**. [github.com/unitedstates/images](https://github.com/unitedstates/images)

## **New: floor speeches**
- **Congress.gov Congressional Record endpoints:** daily and bound Record, using your existing key **(Federal only)**. [Endpoint docs](https://github.com/LibraryOfCongress/api.congress.gov/blob/main/Documentation/DailyCongressionalRecordEndpoint.md)
- **GovInfo API:** the Congressional Record broken into individual speeches. It uses a free api.data.gov key, so your Congress.gov key may work **(Federal only)**.
    - Docs: [api.govinfo.gov/docs](https://api.govinfo.gov/docs)
    - Key: [govinfo.gov/api-signup](https://www.govinfo.gov/api-signup)
- **crec:** free Python package that turns GovInfo's Record into a table of speeches with dates **(Federal only)**. [crec.readthedocs.io](https://crec.readthedocs.io)

## **New: hearings**
- **GovInfo API:** congressional hearing transcripts, with the same key and docs as above **(Federal only)**. [api.govinfo.gov/docs](https://api.govinfo.gov/docs)

## **New: statements and issue positions**
- **Vote Smart API:** candidates' issue positions, votes and interest-group ratings. It needs a free key and doesn't allow bulk requests **(State and federal)**. [votesmart.org/services_api.php](http://votesmart.org/services_api.php)
- **Bluesky public API:** officials' public posts, with no login or key **(State and federal)**. [Docs](https://docs.bsky.app/docs/category/http-reference)
- **congress-legislators:** each member's official social media accounts, so you know which feeds to follow **(Federal only)**. [github.com/unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators)

## **New: campaign promises**
- **Wayback Machine:** every archived snapshot of a campaign website, to capture promises before they're edited or deleted. It's free with no key **(State and federal)**.
    - Docs: [Wayback CDX server](https://github.com/internetarchive/wayback/tree/master/wayback-cdx-server)
    - Endpoint: [web.archive.org/cdx/search/cdx](https://web.archive.org/cdx/search/cdx)

## **New: cosponsored bills**
- **Congress.gov cosponsored-legislation endpoint:** the bills each member co-sponsored, which Rule 1 counts. It uses your existing key **(Federal only)**. [Docs](https://github.com/LibraryOfCongress/api.congress.gov)

## **New: committees and member IDs**
- **congress-legislators:** current committee assignments, plus each member's IDs across systems (Bioguide, FEC, Senate ID and others) for matching data **(Federal only)**.
    - Project: [github.com/unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators)
    - Current members file: [legislators-current.json](https://unitedstates.github.io/congress-legislators/legislators-current.json)

## **New: state officials' records**
- **Open States API:** state bills, votes, sponsorships, legislators, committees and governors for all 50 states, DC and Puerto Rico, with a free key **(State only)**.
    - Docs: [v3.openstates.org/docs](https://v3.openstates.org/docs/)
    - Key: [openstates.org/accounts/signup](https://openstates.org/accounts/signup/)
- **LegiScan:** legislation in all 50 states and Congress, with a free key and a monthly query cap. Its weekly bulk files don't count against the cap **(State and federal)**. [legiscan.com/legiscan](https://legiscan.com/legiscan)

## **New: lobbying**
- **LDA.gov:** official lobbying registrations, quarterly activity reports and lobbyist contribution reports, with an API. A free key raises the rate limit **(Federal only)**. [lda.gov](https://lda.gov/)

## **New: stock trades and holdings**
- **House Clerk disclosures:** official yearly downloads, with trades as PDFs **(Federal only)**. [disclosures-clerk.house.gov/FinancialDisclosure](https://disclosures-clerk.house.gov/FinancialDisclosure)
- **Senate eFD:** official search portal, no API **(Federal only)**. [efdsearch.senate.gov](https://efdsearch.senate.gov/)
- **CapitolGains:** free Python package for trades, holdings and blind trusts from both chambers **(Federal only)**. [pypi.org/project/capitolgains](https://pypi.org/project/capitolgains/)
- **Capitol API:** open-source and self-hostable **(Federal only)**. Its GitHub repo is crnicholson/capitol-api, and the page I found it on is [an archived copy](https://archive.hackclub.com/archive/8ODyA/mhtml/html).
- **Bargo Congress Trades API:** free with limits, and includes a late-filing flag **(Federal only)**.
    - API: [bargo.ai/free-apis/congress/v1](https://www.bargo.ai/free-apis/congress/v1)
    - Free key: [bargo.ai/free-apis/dash](https://www.bargo.ai/free-apis/dash)
- **Eulerpool:** free tier of 100,000 requests a month, with party and committee filters **(Federal only)**.
    - Docs: [eulerpool.com/financial-data-api/congress-trading-data](https://eulerpool.com/financial-data-api/congress-trading-data)
    - Free key: [eulerpool.com/developers/register](https://eulerpool.com/developers/register)
- **Financial Modeling Prep:** has a free plan, but check whether it includes congressional trades **(Federal only)**. [Senate trading API docs](https://site.financialmodelingprep.com/developer/docs/senate-trading-api)

## **New: federal contracts to donor companies**
- **USAspending API:** federal contracts and grants by company, with no key or quota **(Federal only)**. [api.usaspending.gov](https://api.usaspending.gov/)

## **Don't use (shut down)**
- **ProPublica Congress API:** no longer available and no new keys **(Federal only)**. [Shutdown notice](https://projects.propublica.org/api-docs/congress-api/)
- **OpenSecrets API:** reported switched off in 2025. Use FEC data directly instead **(Federal only)**.

A few of these links I built from paths the sites list rather than opened directly: voteview.com, the Eulerpool docs, LDA.gov and the congress-legislators project page. If one doesn't load, the site's home page will get you there.
