#!/usr/bin/env python3
"""Run local interaction fixtures in disposable Chrome profiles. No network needed."""
import argparse
from html.parser import HTMLParser
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent

class Results(HTMLParser):
    def __init__(self):
        super().__init__()
        self.capture = False
        self.text = ''
        self.passed = False
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('data-test-result') in ('pass', 'passed') or attrs.get('data-test-status') == 'passed':
            self.passed = True
        if tag == 'pre' and attrs.get('id') in ('results', 'test-results'):
            self.capture = True
    def handle_endtag(self, tag):
        if tag == 'pre':
            self.capture = False
    def handle_data(self, data):
        if self.capture:
            self.text += data

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chrome', default=shutil.which('google-chrome') or shutil.which('chromium'))
    parser.add_argument('--no-sandbox', action='store_true', help='Only for restricted development containers where Chrome sandbox startup fails.')
    parser.add_argument('--fixture', action='append', help='Run only this fixture filename (repeatable).')
    args = parser.parse_args()
    if not args.chrome:
        parser.error('Install Chrome/Chromium or supply --chrome /path/to/browser')
    fixtures = [('popup.html', 5000), ('shortcuts.html', 12000), ('connections.html', 9000), ('connections-inline.html', 3000), ('connections-submit.html', 14000), ('connections-submit.html?swap', 8000), ('sudoku-colored.html', 4000), ('wordle-crossword.html', 10000), ('crossword-cycle.html', 80000), ('security.html', 2500), ('shell.html?game=connections', 16000), ('layout.html',35000), ('../preview/tests.html',14000)]
    fixtures.append(('crossword-candidates.html', 5000))
    if args.fixture:
        chosen=set(args.fixture)
        fixtures=[item for item in fixtures if item[0].partition('?')[0] in chosen]
        if not fixtures: parser.error('No matching fixtures')
    total = 0
    for fixture, budget in fixtures:
        filename, _, query = fixture.partition('?')
        url = (ROOT / 'tests' / filename).as_uri() + ('?' + query if query else '')
        with tempfile.TemporaryDirectory(prefix='margin-browser-test-') as profile:
            command = [args.chrome, '--headless', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files', '--window-size=1280,900', '--user-data-dir=' + profile, '--virtual-time-budget=' + str(budget), '--dump-dom', url]
            if args.no_sandbox:
                command.insert(2, '--no-sandbox')
            result = subprocess.run(command, capture_output=True, text=True, timeout=55)
            parsed = Results()
            parsed.feed(result.stdout)
            if result.returncode != 0 or not parsed.passed or 'FAIL' in parsed.text:
                raise SystemExit(f'FAIL {fixture}\n{parsed.text or result.stderr[-2000:]}')
            single = re.search(r'PASS:\s*(\d+)', parsed.text)
            count = int(single.group(1)) if single else len(re.findall(r'^PASS\b', parsed.text, re.M))
            total += count
            print(f'PASS {filename}: {count} browser checks', flush=True)
    print(f'PASS {total} browser interaction checks. Synthetic fixtures; optional live checks are documented in README.md.')

if __name__ == '__main__':
    main()
