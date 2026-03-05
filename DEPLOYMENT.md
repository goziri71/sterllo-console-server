# Production Deployment Guide

## 1) One-time setup

- Confirm default branch is `main`.
- Enable branch protection on `main`:
  - Require pull request before merge
  - Require status checks to pass
  - Block force pushes
- Configure production environment variables in your hosting platform (not in git).

## 2) Configure git remotes

- Keep current repository as `origin` (development/source of truth).
- Add a second remote for production repository (example name: `production`).
- Push only reviewed `main` changes to production remote.

## 3) Required production environment values

- `NODE_ENV=production`
- `DB_MODE=production`
- `PORT` (as required by host)
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- Encrypted DB values and keychain values:
  - `INF_STERLLO_CONSOLE_DATABASE_HOST_KEYCHAIN`
  - `INF_STERLLO_CONSOLE_DATABASE_USERNAME_KEYCHAIN`
  - `INF_STERLLO_CONSOLE_DATABASE_PASSWORD_KEYCHAIN`
  - `INF_STERLLO_CONSOLE_DATABASE_NAME_KEYCHAIN`
  - `DB_HOST_KEY`
  - `DB_USERNAME_KEY`
  - `DB_PASSWORD_KEY`
  - `DB_NAME_KEY`

## 4) Release flow

1. Create feature branch
2. Open PR to `main`
3. Wait for CI checks to pass
4. Merge PR to `main`
5. Push `main` to production remote (or let deployment trigger from `main`)
6. Verify health endpoint and logs

## 5) Rollback flow

- Re-deploy previous known-good commit/tag.
- Verify app startup and database connectivity in logs.
- Keep a short release note for each deployment.
