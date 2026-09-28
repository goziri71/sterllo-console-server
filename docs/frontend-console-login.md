# Frontend: email login → MFA

Console login is **email only** for provisioned users, then the existing MFA flow.

**Removed (do not call):**
- Crosslink `/auth/login/crosslink` and `/auth/login-user`
- Email OTP `/auth/login/email/*`
- Password on `POST /auth/login` (Alpha Basic is not used for primary login)

## Flow

```
1. POST /auth/login   { email, device_label? }
2a. First time → mfa_enrollment_required (QR) → POST /auth/mfa/enroll/confirm
2b. Returning  → mfa_required → POST /auth/mfa/challenge/verify
3. Store JWT from authenticated response
```

Users must be **admin-provisioned** (`POST /rbac/users`) first.  
Unknown emails → `404` “User not provisioned. Contact admin”.

## Endpoint

Base prefix: `/1.202602.0/auth`

### `POST /login`

```json
{
  "email": "user@example.com",
  "device_label": "Chrome on Mac"
}
```

Success → same MFA shapes as before:

- `data.state: "mfa_enrollment_required"` + `challenge_token` + `factor.otpauth_uri`
- `data.state: "mfa_required"` + `challenge_token` + `methods: ["totp","recovery_code"]`

Errors:
- `400` missing/invalid email
- `404` user not on console Users list

### MFA (unchanged)

| Step | Endpoint |
|------|----------|
| Confirm enrollment | `POST /mfa/enroll/confirm` `{ challenge_token, code }` |
| Verify login | `POST /mfa/challenge/verify` `{ challenge_token, code }` or `recovery_code` |

After MFA: `data.state: "authenticated"`, `data.token` (JWT), `data.session`.

## UI notes

- Email-only form (no password field on console login).
- First-time users still get MFA QR enrollment.
