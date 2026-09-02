from pathlib import Path
p = Path('tests/unit/pds-candidate-identity-conflict.test.ts')
s = p.read_text()
replacements = [
    (
        "expect(modal).toContain('Use the existing Candidate Database identity.')",
        "expect(modal).toContain('Use this existing Candidate Database record.')\n    expect(modal).toContain('selected any fields that should be refreshed')",
    ),
    (
        "expect(modal).toContain('candidateId: identityConflictCheck.value.candidate.id')",
        "expect(modal).toContain('const existingCandidateId = identityConflictCheck.value.candidate.id')\n    expect(modal).toContain('candidateId: existingCandidateId')",
    ),
]
for old, new in replacements:
    if s.count(old) != 1:
        raise SystemExit(f'Expected one legacy assertion, found {s.count(old)} for {old}')
    s = s.replace(old, new, 1)
p.write_text(s)
