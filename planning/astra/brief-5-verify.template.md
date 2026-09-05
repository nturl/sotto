# Sotto audit, verification pass

Four parallel auditors just reviewed the Sotto repo (root: current directory, read-only sandbox). Below are their top claimed findings, deduplicated by the orchestrator. Your job is adversarial verification: for each claim, decide CONFIRMED, REFUTED, or DOWNGRADED, by reading the cited files and tracing the path yourself. Do not trust the claim's own `file:line`; re-derive it.

Rules: read, do not grep. One verdict per claim with the evidence that decided it (file:line, the exact behavior). If a claim is REFUTED, say what the auditor misread. If CONFIRMED, say whether the stated severity holds and add the smallest fix if the auditor's is wrong or missing. If two claims share a root cause, say so. Do not add new findings unless a trace forces one on you; if it does, mark it NEW.

Final message format: a table `# | claim title | verdict | severity (final) | evidence`, followed by one paragraph per non-CONFIRMED verdict explaining why, then a short list of any NEW findings.

## Claims

<<CLAIMS>>
