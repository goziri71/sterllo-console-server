# Frontend: Alpha email/password login → Alpha MFA

Console login uses **Alpha Account Auth only** (no console TOTP/recovery on login).

**Removed from login path:** console MFA enrollment, console recovery codes on `/auth/login` and `/auth/mfa/challenge/verify`.

## Flow

```
1. POST /auth/login   { email, password, device_label? }
   → Alpha Basic; no local Users check yet
2a. Alpha MFA enroll → data.state mfa_enrollment_required, provider alpha
     → POST /auth/mfa/enroll/confirm { challenge_token, code }
2b. Alpha MFA verify → data.state mfa_required, provider alpha, methods ["totp"]
     → POST /auth/mfa/challenge/verify { challenge_token, code }
3. After Alpha succeeds → server checks Users list → JWT if provisioned
```

Unknown / unprovisioned email → **404** “User not provisioned. Contact admin” **after** Alpha succeeds.

## Endpoint

Base prefix: `/1.202602.0/auth`

### `POST /login`

```json
{
  "email": "user@example.com",
  "password": "••••••••",
  "device_label": "Chrome on Mac",
  "device_id": "stable-browser-device-uuid"
}
```

`device_id` is sent to Alpha inside encrypted `client.device.id` (required for client login). If omitted, the API derives a fallback from IP + User-Agent — prefer sending a persistent id from the browser.

Responses:

- `data.state: "mfa_enrollment_required"` — Alpha enrollment; optional `data.factor.otpauth_uri`
- `data.state: "mfa_required"` — Alpha TOTP; `data.provider: "alpha"`
- `data.state: "authenticated"` — Alpha + provisioned user (no Alpha MFA step)

Errors:

- `400` missing/invalid email or password
- `401` Alpha rejected credentials or MFA — **body is Alpha’s JSON unchanged** (e.g. `{ "code": 4013, "state": false, "message": "Request denied." }`), not the console `{ code: 4010, … }` envelope
- `403` Alpha login succeeded but `account.mfa` is not enabled — user must set up MFA on Redbiller/Alpha before Console access
- `404` Alpha OK but user not on console Users list
- `502` Alpha unreachable / misconfigured env

Every completed login checks Alpha **`account.mfa`** (and equivalent fields). Console JWT is issued only when MFA is enabled on the Alpha account **and** the user is provisioned locally.

### MFA (Alpha-backed)

| Step | Endpoint | Body |
|------|----------|------|
| Confirm Alpha enrollment | `POST /mfa/enroll/confirm` | `{ challenge_token, code }` |
| Verify Alpha login | `POST /mfa/challenge/verify` | `{ challenge_token, code }` |

`recovery_code` is **not** supported on console login (use Alpha account security).

After success: `data.token` (JWT), `data.user`, `data.session`.

## Env (ops)

Optional override if Alpha path differs:

- `ACCOUNT_AUTH_MFA_VERIFY_PATH` (default `.../Login/Client/Mfa/Verify`)
- `ACCOUNT_AUTH_MFA_ENROLL_PATH` (default `.../Login/Client/Mfa/Enroll/Confirm`)
- When `SOURCE_PRODUCT_KEY` + keychain are in env (same as Beamer), login **automatically** uses Sterllo source → Alpha `ACCOUNT_AUTH` target — no `ACCOUNT_AUTH_STERLLO_PRODUCT=true` needed.
- `Source-Product-Id` is **derived from the decrypted SOURCE product key** (optional override: `SOURCE_PRODUCT_ID`).
- `ACCOUNT_AUTH_DEBUG=true` — log phase / Alpha business code server-side
- `ACCOUNT_AUTH_WIRE_FORMAT=schema` (default) — plain `Source/Target-Product-Key`, `Source-Product-Id`, matching encrypted `Credentials`, encrypted `{ payload }` (no `Request-Id` header)
- `ACCOUNT_AUTH_WIRE_FORMAT=legacy` — older mobile-style `Credentials` + `X-Request-Signature`

## UI notes

- Email + password → Alpha MFA screens (same URLs as before; `provider: "alpha"`).
- Do not show console MFA QR unless `factor.otpauth_uri` is present from Alpha.
