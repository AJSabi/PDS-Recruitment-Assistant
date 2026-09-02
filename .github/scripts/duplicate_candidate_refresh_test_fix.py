from pathlib import Path
p = Path('tests/unit/pds-candidate-identity-conflict.test.ts')
s = p.read_text()
old = "expect(modal).toContain('Use the existing Candidate Database identity.')"
new = "expect(modal).toContain('Use this existing Candidate Database record.')\n    expect(modal).toContain('selected any fields that should be refreshed')"
if s.count(old) != 1:
    raise SystemExit(f'Expected one legacy assertion, found {s.count(old)}')
p.write_text(s.replace(old, new, 1))
