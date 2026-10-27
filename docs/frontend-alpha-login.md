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
2c. Alpha email OTP (locked account, or OTP required as normal 2nd factor) →
     data.state email_otp_required, provider alpha, methods ["email_otp"]
     → POST /auth/login/otp/verify { challenge_token, code }
     → may itself return 2a or 2b if Alpha asks for another factor after the OTP
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
- `data.state: "email_otp_required"` — Alpha emailed a 6-digit code and needs it to continue; `data.provider: "alpha"`, `data.methods: ["email_otp"]`. This covers **two** underlying Alpha business codes — both land on the same screen/endpoint:
  - `7001` + message `"Account locked."` — too many failed attempts
  - `7015` — OTP required as a normal second factor (not a lockout; e.g. `"Authentication Code required."`)
- `data.state: "authenticated"` — Alpha + provisioned user (no Alpha MFA step)

Errors:

- `400` missing/invalid email or password
- `401` Alpha rejected credentials (bad password, unknown account, etc.) — **body is Alpha’s JSON unchanged** (e.g. `{ "code": 4013, "state": false, "message": "Request denied." }`), not the console `{ code: 4010, … }` envelope. `7001` with message `"Account locked."` and `7015` are **not** in this bucket — both are caught server-side and turned into the `200` / `email_otp_required` response above instead of a thrown error.
- `403` Alpha login succeeded but `account.mfa` is not enabled — user must set up MFA on Redbiller/Alpha before Console access
- `404` Alpha OK but user not on console Users list
- `502` Alpha unreachable / misconfigured env

Every completed login checks Alpha **`account.mfa`** (and equivalent fields). Console JWT is issued only when MFA is enabled on the Alpha account **and** the user is provisioned locally.

### MFA (Alpha-backed)

| Step | Endpoint | Body |
|------|----------|------|
| Confirm Alpha enrollment | `POST /mfa/enroll/confirm` | `{ challenge_token, code }` |
| Verify Alpha login | `POST /mfa/challenge/verify` | `{ challenge_token, code }` |
| Verify emailed OTP (`email_otp_required`) | `POST /login/otp/verify` | `{ challenge_token, code }` |

`recovery_code` is **not** supported on console login (use Alpha account security).

`code` is the 6-digit code sent to the user's inbox. Only `challenge_token` + `code` are sent — the frontend never sees or sends Alpha's internal `reference`; the server holds it against the challenge token.

`POST /login/otp/verify` returns the same shape as `/login`: `authenticated` on success, or another `mfa_enrollment_required` / `mfa_required` challenge if Alpha asks for a second factor after the OTP (handle it the same way as `2a`/`2b` above, in a loop).

After success: `data.token` (JWT), `data.user`, `data.session`.

## Env (ops)

Optional override if Alpha path differs:

- `ACCOUNT_AUTH_MFA_VERIFY_PATH` (default `.../Login/Client/Mfa/Verify`)
- `ACCOUNT_AUTH_MFA_ENROLL_PATH` (default `.../Login/Client/Mfa/Enroll/Confirm`)
- `ACCOUNT_AUTH_LOGIN_CODE_PATH` (default `.../Login/Client/Code`) — emailed OTP verify (`email_otp_required`)
- Default: **`productId` mode** — `Source-Product-Key` and `Target-Product-Key` are both `ACCOUNT_AUTH`; `Source-Product-Id` is parsed from that key (trailing pipe segment or `<ALPHA>.` prefix).
- Optional: `ACCOUNT_AUTH_STERLLO_PRODUCT=true` only if Alpha registered your Beamer `SOURCE_*` key for Account Login (otherwise you may see **7010**).
- Optional override: `SOURCE_PRODUCT_ID`.
- `ACCOUNT_AUTH_DEBUG=true` — log phase / Alpha business code server-side
- `ACCOUNT_AUTH_WIRE_FORMAT=schema` (default) — plain `Source/Target-Product-Key`, `Source-Product-Id`, matching encrypted `Credentials`, encrypted `{ payload }` (no `Request-Id` header)
- `ACCOUNT_AUTH_WIRE_FORMAT=legacy` — older mobile-style `Credentials` + `X-Request-Signature`

## UI notes

- Email + password → Alpha MFA screens (same URLs as before; `provider: "alpha"`).
- Do not show console MFA QR unless `factor.otpauth_uri` is present from Alpha.
- On `email_otp_required`, show the same kind of 6-digit code screen as the authenticator step, but mention it was emailed (`methods: ["email_otp"]`). Do not treat this as a hard login failure — it is a normal `200` with a `challenge_token` to continue from, exactly like `mfa_required`. This fires both for an actual lockout and for accounts where Alpha just requires email OTP as a normal second factor — the UI copy shouldn't assume "locked" (don't show a lockout-specific message; a generic "Enter the code we emailed you" works for both).
- `challenge_token` expires after `data.expires_in` seconds (same TTL as the other MFA challenges); on expiry the user must resubmit email/password on `/login` to get a fresh one. There is **no separate resend endpoint** for this OTP yet — whether resubmitting `/login` while still locked re-emails a new code (vs. just repeating the same lockout) hasn't been confirmed against the live Alpha API yet; verify this before building a "resend" UI affordance.
