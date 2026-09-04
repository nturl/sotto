# Security Policy

## Reporting a vulnerability

Please report security issues privately using
[GitHub Security Advisories](../../security/advisories/new) for this
repository, rather than opening a public issue. Include steps to reproduce
and the potential impact if known.

We'll acknowledge reports as soon as we can and keep you updated as we work
on a fix. There is no bug bounty program.

## Scope

Sotto is a local-first app with no accounts and no payment processing. Areas
of particular interest: the voice WebSocket server (`apps/server`), content
pack loading/validation, and anything that reads untrusted input (imported
export files, content packs).
