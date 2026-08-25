# Account System

SPICE accounts now have an account-level role and a subscription snapshot. Playlist collaboration roles still live on playlist membership records and should not be reused for account authorization.

## Account Roles

The `users.account_role` column is the source of truth.

| Value | Meaning |
| --- | --- |
| `user` | Standard account. This is the default for every signup. |
| `admin` | Trusted operator account for future admin-only tools and maintenance endpoints. |

Use the helpers in `lib/account.ts` instead of comparing raw strings in route handlers:

```ts
import { isAdminAccount } from '@/lib/account';
import { getAccountSnapshotForSession } from '@/lib/accounts';
import { verifySession } from '@/lib/auth';

const session = await verifySession(token);
const account = await getAccountSnapshotForSession(session);

if (!account || !isAdminAccount(account)) {
  return jsonResponse({ error: 'admin_required' }, { status: 403 });
}
```

For new admin-only endpoints, prefer `requireAdminAccount(session)` from `lib/accounts.ts`. It reloads the current database role, so authorization is not based only on a JWT claim that may be stale.

## Account Moderation (timeouts and bans)

Account access state lives in the moderation columns on the `users` table and is enforced server-side on every authenticated request, so blocking applies immediately even to existing 30-day JWTs.

| Column | Meaning |
| --- | --- |
| `users.moderation_status` | `active`, `timeout`, or `banned`. Defaults to `active`. |
| `users.moderation_expires_at` | When a temporary timeout lifts automatically. `null` for bans and active accounts. |
| `users.moderation_reason` | Optional human-readable reason shown to the blocked account. |
| `users.moderation_set_by` / `users.moderation_set_at` | Admin (user id) and timestamp of the last moderation change. |

Behavior:

- A `timeout` account is fully blocked until `moderation_expires_at` passes; access is restored automatically when the expiry is reached. A timeout does **not** revoke Spice Connect device pairings, so paired devices reconnect after it lifts.
- A `banned` account is permanently blocked. Banning revokes remote device authorizations, pairing codes, and Spice Connect caches, matching the old role-based ban behavior.
- Only admin accounts can change moderation state (`requireAdminAccount`), and the admin APIs refuse to block other admin accounts.
- `verifySession` (`lib/auth.ts`) reloads the user row on every call and throws `AccountModerationError` (`account_timed_out` or `account_banned`) for blocked accounts. Sign-in returns the same codes with `status`, `reason`, and `expiresAt` fields so clients can render a full-screen blocked-account state.
- The legacy `users.account_role = 'banned'` value no longer exists after migration `0015`; the moderation columns are the single source of truth. Admin endpoints still accept the old value and map it to `moderation_status = 'banned'`.

Use the helpers in `lib/moderation.ts` (`resolveAccountModeration`, `isAccountModerationBlocked`, `accountModerationErrorPayload`) instead of reading the columns directly.

## Admin Bootstrap

New signups are created only after email ownership is verified. A verified signup becomes `user` unless its normalized email appears in `SPICE_ADMIN_EMAILS`.

```env
SPICE_ADMIN_EMAILS=owner@example.com,ops@example.com
```

That environment variable is checked after successful verification and only affects account creation. Promote or demote existing accounts with SQL:

```sql
update users
set account_role = 'admin'
where email = 'owner@example.com';

update users
set account_role = 'user'
where email = 'owner@example.com';
```

## Auth Response Contract

`POST /api/cloud/auth/spice/signup` starts a pending registration and never issues a session. `POST /api/cloud/auth/spice/verify-email` creates the account after the correct code is supplied and returns the same session shape as `POST /api/cloud/auth/spice/signin`. `GET /api/cloud/account/me` returns the account snapshot without issuing a new token.

Signup response:

```json
{
  "verificationRequired": true,
  "registrationId": "uuid",
  "email": "pe****@example.com",
  "expiresAt": "2026-07-13T12:10:00.000Z",
  "resendAfterSeconds": 60
}
```

Submit `{ "registrationId": "uuid", "code": "123456" }` to `/api/auth/spice/verify-email`. To request a replacement code, submit `{ "registrationId": "uuid" }` to `/api/auth/spice/resend-verification`.

```json
{
  "token": "jwt",
  "user": {
    "id": "uuid",
    "email": "person@example.com",
    "emailVerified": true,
    "accountRole": "user",
    "isAdmin": false,
    "subscription": {
      "tier": "free",
      "status": "inactive",
      "provider": null,
      "currentPeriodEnd": null,
      "cancelAtPeriodEnd": false,
      "isActive": false
    }
  },
  "account": {
    "id": "uuid",
    "email": "person@example.com",
    "emailVerified": true,
    "accountRole": "user",
    "isAdmin": false,
    "subscription": {
      "tier": "free",
      "status": "inactive",
      "provider": null,
      "currentPeriodEnd": null,
      "cancelAtPeriodEnd": false,
      "isActive": false
    }
  }
}
```

JWTs also include `accountRole` for UI hints. Protected APIs should still reload the account snapshot from the database before enforcing admin access.

Account snapshots (`/api/cloud/account/me`, sign-in, and the admin accounts list) also include a `moderation` object:

```json
{
  "moderation": {
    "status": "timeout",
    "expiresAt": "2026-08-16T12:00:00.000Z",
    "reason": "Repeated spam reports"
  }
}
```

## Subscription Foundation

The `account_subscriptions` table is intentionally billing-provider neutral. It is ready for Stripe, Vercel Marketplace billing, or a manual entitlement system.

| Column | Purpose |
| --- | --- |
| `user_id` | One subscription snapshot per account. |
| `tier` | Plan code, defaulting to `free`. Future codes can be added without a schema change. |
| `status` | One of `inactive`, `trialing`, `active`, `past_due`, or `canceled`. |
| `provider` | Optional billing source such as `stripe`. |
| `provider_customer_id` | External customer identifier. |
| `provider_subscription_id` | External subscription identifier. |
| `current_period_start` / `current_period_end` | Billing period window. |
| `cancel_at_period_end` | Whether access should stop after the current period. |

If no subscription row exists, API helpers serialize the account as `free` and `inactive`. A subscription is considered active when its status is `active` or `trialing` and `current_period_end` is absent or in the future.

## Spice Connect pairing

Migration `0009_spice_connect_pairing.sql` adds short-lived, single-use pairing codes and revocable device authorizations. Pairing codes and device credentials are stored only as keyed hashes. Set `SPICE_PAIRING_SECRET` to an independent high-entropy value in production, or the service falls back to `JWT_SECRET`.

Pairing codes expire after five minutes and can be consumed only once. A successful claim returns a device-scoped `spice_pair_...` bearer credential that expires after 30 days. The credential can access only Spice Connect remote-device and command routes, is bound to the claimed device ID, and does not create a cloud account session. Revoking its authorization immediately causes the next remote request to return `401`; native clients must erase the rejected credential and require a new pairing code.

## Migration

Migration `0010_email_verification.sql` adds pending verification challenges and `users.email_verified_at`. It marks every user that existed at migration time as verified; new users are inserted only by successful verification.

Migration `0015_account_moderation.sql` adds the moderation columns and converts any legacy `account_role = 'banned'` rows to `moderation_status = 'banned'`.

Production email delivery requires `RESEND_API_KEY`, a verified sending domain, and `SPICE_EMAIL_FROM`. Configure SPF and DKIM with the email provider and add DMARC at the domain host. Local development without a Resend key writes the code to the backend console and never returns it to the client.

Before deploying or promoting pairing or email-verification code, apply migrations `0009`, `0010`, and `0011` to the production database:

```bash
npm run db:migrate --workspace @spice/backend
```

The application reads the new user column and challenge/rate-limit tables immediately, so promoting code before these migrations would break account routes.

For local database prototyping without migration files, `npm run db:push --workspace @spice/backend` can also apply the schema.
