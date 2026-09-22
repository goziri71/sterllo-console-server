# Frontend: Alpha email/password login → MFA

Primary console login is **email + password** against Alpha Account Auth, then the existing MFA flow.

**Removed (do not call):**
- Crosslink `/auth/login/crosslink` and `/auth/login-user`
- Email OTP `/auth/login/email/*`

## Flow

```
1. POST /auth/login   { email, password, device_label? }
2a. First time → mfa_enrollment_required (QR) → POST /auth/mfa/enroll/confirm
2b. Returning  → mfa_required → POST /auth/mfa/challenge/verify
3. Store JWT from authenticated response
```

Users must be **admin-provisioned** (`POST /rbac/users`) first.  
Unknown emails → `404` “User not provisioned. Contact admin” (Alpha is not called).

## Endpoint

Base prefix: `/1.202602.0/auth`

### `POST /login`

```json
{
  "email": "user@example.com",
  "password": "••••••••",
  "device_label": "Chrome on Mac"
}
```

Success → same MFA shapes as before:

- `data.state: "mfa_enrollment_required"` + `challenge_token` + `factor.otpauth_uri`
- `data.state: "mfa_required"` + `challenge_token` + `methods: ["totp","recovery_code"]`

Errors:
- `400` missing/invalid email or password
- `404` user not on console Users list
- `401` Alpha rejected credentials
- `502` Alpha unreachable / upstream failure

### MFA (unchanged)

| Step | Endpoint |
|------|----------|
| Confirm enrollment | `POST /mfa/enroll/confirm` `{ challenge_token, code }` |
| Verify login | `POST /mfa/challenge/verify` `{ challenge_token, code }` or `recovery_code` |

After MFA: `data.state: "authenticated"`, `data.token` (JWT), `data.session`.

## UI notes

- Email + password form only (no Crosslink, no email OTP).
- No forget-password on console (Alpha owns that if needed).
- First-time users still get MFA QR enrollment.
