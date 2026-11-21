# Data security — how NEXUS keeps ideas private

## Promise
An idea a founder researches in NEXUS can be read only by that founder. It is encrypted in their browser before it is saved. The database, the NEXUS operator and the hosting providers see only ciphertext.

## How it works
| Piece | Detail |
|---|---|
| Encryption | AES-256-GCM in the browser (Web Crypto). Fresh 96-bit IV for every save. |
| Data key | A random 256-bit key per user, generated in the browser. |
| Passphrase | The data key is wrapped with a key derived from the user's **vault passphrase**: PBKDF2-SHA-256, 600,000 iterations, random salt. The passphrase is separate from the sign-in password and is never sent anywhere. |
| Recovery | At setup the user gets a one-time **recovery key** (160 random bits, shown once). It wraps a second copy of the data key. With it the user can set a new passphrase. |
| What the server stores | Only the wrapped keys (in the user's auth metadata) and sealed blobs (`projects.settings.sealed`, `.meta`, `versions.snapshot`). Plaintext columns hold the placeholder `🔒 Encrypted`. When an older plaintext project is opened, its graph, artifacts, tasks and plaintext versions are deleted. |
| This device | Optionally, the unwrapped key is kept as a **non-extractable** CryptoKey in IndexedDB, so the user doesn't retype the passphrase. "Lock & sign out" removes it. |
| Isolation | Row-level security still limits every row to its owner, as defence in depth. |

## What encryption cannot cover — stated to users
- **AI processing.** When the user asks the AI to work on an idea, that text is sent over HTTPS through our serverless function to the AI model provider (Anthropic) to be processed. NEXUS does not store it: `ai_runs` records only the operation, the model, token counts and errors. The model provider handles it under its commercial API terms.
- **Company-setup research** sends a short description of the business and the country to the AI's web-search tool.
- **Lost secrets.** If a user loses both the passphrase and the recovery key, their ideas cannot be recovered by anyone, including us.
- **A compromised browser** (malware, a malicious extension, or an XSS bug in our app) could read ideas while the vault is unlocked. Keep dependencies patched and add a strict Content-Security-Policy as the next hardening step.

## Not encrypted (by design)
- Account email and sign-in data (Supabase Auth).
- Billing records (product, amount, status). These are needed for invoices and support.
- The professionals directory. It is public, paid listing information.
- Audit event names and timestamps, which contain no idea content.

## Payments
Razorpay Checkout handles card and UPI details; NEXUS never sees them. Orders are created on the server. Payment signatures (HMAC-SHA256) are checked on the server before anything is granted. Each payment is applied exactly once, whether the confirmation arrives from the browser callback or the webhook. Credits can only be spent through a `SECURITY DEFINER` database function. Users cannot write their own entitlements.
