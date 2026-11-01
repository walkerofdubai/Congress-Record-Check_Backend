"""Import yearly financial disclosures, blind trusts and older stock trades for review, rebuilt by hand.

Reads the House Clerk's and the Senate's financial disclosure sites with the CapitolGains package
(https://pypi.org/project/capitolgains/), which drives a headless browser. Writes data/holdings-review.json:
for each profiled member in office, their annual reports, blind-trust and other filings with links, and the
transactions from Senate periodic transaction reports (House reports are PDFs, listed with their links). Nothing here
changes a grade: a reviewer checks each trade against the filing and copies it into that person's "trades" in
public/research.json, which the Ethics grade reads.

Senate eFD has no API and asks every visitor to agree to its terms on use of the reports (no commercial use other
than news media, no credit ratings, no solicitation). Read them at https://efdsearch.senate.gov/search/home/ and pass
--accept-senate-terms to include senators; without it only House members are imported.

    python3 -m venv .local/hv
    .local/hv/bin/pip install capitolgains==0.1.0
    .local/hv/bin/python -m playwright install chromium
    .local/hv/bin/python scripts/build-holdings.py --year 2025                 # House members
    .local/hv/bin/python scripts/build-holdings.py --year 2025 --accept-senate-terms --only collins,perry
    python3 scripts/build-holdings.py --self-test                              # checks the parsing, no network
"""
import argparse
import datetime
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'holdings-review.json'
TYPES = {'purchase': 'purchase', 'sale (full)': 'sale', 'sale (partial)': 'sale', 'sale': 'sale', 'exchange': 'exchange'}
OWNERS = {'self': 'self', 'spouse': 'spouse', 'joint': 'joint', 'child': 'child', 'dependent child': 'child'}


def iso(text):
    """'01/15/2024' or 'Filed 01/15/2024 @ 10:00 AM' -> '2024-01-15'."""
    m = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})', text or '')
    return f'{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}' if m else None


def senate_trades(result, url):
    """Transactions from CapitolGains' parsed Senate PTR ({'type': 'web_table', 'metadata', 'sections'})."""
    if not result or result.get('type') != 'web_table':
        return []
    filed = iso(result.get('metadata', {}).get('filed_date'))
    table = (result.get('sections', {}).get('transactions') or {}).get('table') or {}
    out = []
    for row in table.get('rows') or []:
        asset = row.get('asset_name')
        name = asset.get('name') if isinstance(asset, dict) else asset
        ticker = (row.get('ticker') or '').strip()
        kind = TYPES.get((row.get('type') or '').strip().lower(), 'other')
        traded = iso(row.get('transaction_date'))
        if not traded:
            continue
        out.append({
            'traded': traded, 'filed': filed, 'company': name or None,
            'ticker': ticker if re.fullmatch(r'[A-Z][A-Z.\-]{0,9}', ticker) else None,
            'asset': 'stock' if 'stock' in (row.get('asset_type') or '').lower() else (row.get('asset_type') or '').lower() or None,
            'type': kind, 'amount': (row.get('amount') or '').strip() or None,
            'owner': OWNERS.get((row.get('owner') or '').strip().lower(), (row.get('owner') or '').strip().lower() or None),
            'src': {'t': 'Senate periodic transaction report', 'u': url},
        })
    return out


def filing(d, kind):
    url = d.get('pdf_url') or d.get('report_url')
    return {'kind': kind, 'type': d.get('filing_type') or d.get('report_type'), 'year': d.get('year'),
            'date': iso(d.get('date')) if d.get('date') else None, 'url': url}


def self_test():
    sample = {'type': 'web_table', 'metadata': {'filed_date': 'Filed 03/02/2026 @ 4:15 PM'}, 'sections': {'transactions': {'table': {'rows': [
        {'transaction_date': '01/05/2026', 'owner': 'Spouse', 'ticker': 'NVDA', 'asset_name': 'NVIDIA Corporation', 'asset_type': 'Stock', 'type': 'Purchase', 'amount': '$1,001 - $15,000'},
        {'transaction_date': '01/06/2026', 'owner': 'Self', 'ticker': '--', 'asset_name': {'name': 'US Treasury Note', 'rate': 4.1}, 'asset_type': 'Other Securities', 'type': 'Sale (Partial)', 'amount': '$15,001 - $50,000'},
        {'transaction_date': '', 'type': 'Purchase'}]}}}}
    t = senate_trades(sample, 'https://efdsearch.senate.gov/search/view/ptr/x/')
    assert len(t) == 2, t
    assert t[0] == {'traded': '2026-01-05', 'filed': '2026-03-02', 'company': 'NVIDIA Corporation', 'ticker': 'NVDA', 'asset': 'stock', 'type': 'purchase',
                    'amount': '$1,001 - $15,000', 'owner': 'spouse', 'src': {'t': 'Senate periodic transaction report', 'u': 'https://efdsearch.senate.gov/search/view/ptr/x/'}}, t[0]
    assert t[1]['ticker'] is None and t[1]['type'] == 'sale' and t[1]['company'] == 'US Treasury Note' and t[1]['asset'] == 'other securities'
    assert iso('1/2/2025') == '2025-01-02' and iso('none') is None
    print('build-holdings self-test passed')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--year', default=str(datetime.date.today().year - 1), help='filing year (default: last year)')
    ap.add_argument('--only', help='comma-separated person IDs')
    ap.add_argument('--accept-senate-terms', action='store_true', help='include senators (you have read and agree to the Senate eFD terms)')
    ap.add_argument('--self-test', action='store_true')
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    try:
        from capitolgains import Representative, Senator
        from capitolgains.utils.representative_scraper import HouseDisclosureScraper
        from capitolgains.utils.senator_scraper import SenateDisclosureScraper
    except ImportError:
        sys.exit('CapitolGains is not installed. See the instructions at the top of this script.')
    config = json.loads((ROOT / 'data' / 'config.json').read_text())
    research = json.loads((ROOT / 'public' / 'research.json').read_text())
    district = {s['id']: s.get('district') for s in research['members'] + research['cands']}
    only = set(a.only.split(',')) if a.only else None
    people = [p for p in config['people'] if p.get('inOffice') and (not only or p['id'] in only)]
    out = json.loads(OUT.read_text()) if OUT.exists() else {'people': {}}
    out.update({'about': 'For review only: filings and trades imported by scripts/build-holdings.py. Confirmed trades are copied by hand into public/research.json.',
                'built': datetime.date.today().isoformat(), 'year': a.year})
    house = [p for p in people if p['chamber'] == 'H']
    senate = [p for p in people if p['chamber'] == 'S']
    if senate and not a.accept_senate_terms:
        print(f'Skipping {len(senate)} senators: pass --accept-senate-terms after reading the Senate eFD terms.')
        senate = []
    last = lambda p: re.sub(r',?\s+(Jr\.?|Sr\.?|III|II|IV)$', '', p['name']).split()[-1]
    if house:
        with HouseDisclosureScraper(headless=True) as scraper:
            for p in house:
                d = (district.get(p['id']) or '').split('-')[-1] or None
                got = Representative(last(p), state=p['state'], district=d).get_disclosures(scraper, a.year)
                out['people'][p['id']] = {'chamber': 'H', 'year': a.year, 'checked': out['built'],
                    'annual': [filing(x, 'annual') for x in got['annual']], 'blindTrust': [filing(x, 'blind trust') for x in got['blind_trust']],
                    'ptr': [filing(x, 'ptr') for x in got['trades']], 'other': [filing(x, 'other') for x in got['amendments'] + got['other']],
                    'trades': [], 'note': 'House transaction reports are PDFs; read each one and copy confirmed trades into research.json.'}
                print(f"{p['id']}: {len(got['trades'])} transaction reports, {len(got['annual'])} annual reports")
    if senate:
        with SenateDisclosureScraper(headless=True) as scraper:
            for p in senate:
                got = Senator(last(p), first_name=p['name'].split()[0], state=p['state']).get_disclosures(scraper, year=a.year)
                trades = []
                for x in got['trades']:
                    try:
                        trades += senate_trades(scraper.process_filing(x['report_url'], 'ptr'), x['report_url'])
                    except ValueError as e:  # a scanned (paper) report has no table; it stays listed for review
                        print(f"{p['id']}: could not read {x['report_url']}: {e}")
                out['people'][p['id']] = {'chamber': 'S', 'year': a.year, 'checked': out['built'],
                    'annual': [filing(x, 'annual') for x in got['annual']], 'blindTrust': [filing(x, 'blind trust') for x in got['blind_trust']],
                    'ptr': [filing(x, 'ptr') for x in got['trades']], 'other': [filing(x, 'other') for x in got['amendments'] + got['other']],
                    'trades': trades}
                print(f"{p['id']}: {len(trades)} transactions from {len(got['trades'])} reports")
    OUT.write_text(json.dumps(out, indent=1) + '\n')
    print(f'Wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
