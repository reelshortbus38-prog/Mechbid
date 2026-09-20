# Go-live privacy checklist

What the code guarantees, what it cannot, and what has to be checked by hand
before strangers upload other people's drawings.

Written 2026-09-20, before opening Coldgauge to outside testers.

---

## The distinction that organises this

The privacy policy makes promises. Some of them the **code** keeps, and those
are now held by tests that fail if anybody changes the code without changing
the policy. Others depend on **settings in a dashboard** that no test in this
repo can see.

The second list is short and it is the dangerous one, because everything looks
fine from the outside either way.

---

## Held by tests — no action needed

| Promise | Held by |
|---|---|
| No AI provider retains or trains on uploaded documents | `api/providerPrivacy.test.js` — every OpenRouter call must send `data_collection: 'deny'` and `zdr: true` |
| Every processor the code calls is named in the policy | `src/components/legalTruth.test.js` |
| No processor is named that the code does not call | same |
| No billing is described while no payment processor exists | same |
| The diagnostic export carries no customer identity | `src/components/bidSelfCheck.test.js` |

These fail loudly on a change. They are not the problem.

---

## NOT held by anything — check these by hand

### 1. The storage bucket must be private

`src/lib/fileSync.js` says the `job-files` bucket is private and that paths are
scoped per user. **The code cannot enforce either.** Both are Supabase settings.

If the bucket is public, every plan set anyone uploads is readable by anyone who
can guess a URL, and the paths are predictable (`userId/uploadId`).

- [ ] Supabase → Storage → `job-files` → **Public bucket is OFF**
- [ ] A storage policy exists restricting `SELECT` to `auth.uid()::text = (storage.foldername(name))[1]`
- [ ] The same restriction on `INSERT`, `UPDATE` and `DELETE`
- [ ] Verified by signing in as a second test account and trying to read the
      first account's path directly. It must fail. *Reading your own file
      successfully proves nothing.*

### 2. Row Level Security on every table

Jobs sync to Postgres. Without RLS, any authenticated user can read every row
in the table, including other contractors' bids and pricing.

- [ ] RLS **enabled** on the jobs table (enabling it is separate from writing a policy — a table with RLS on and no policy denies everyone, which is safe; a table with RLS off ignores policies entirely, which is not)
- [ ] Same for the shop-settings table
- [ ] Verified with a second account, as above

### 3. The service-role key must not be in the browser

Only `VITE_`-prefixed variables reach the client bundle. The service-role key
bypasses RLS completely.

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is **not** prefixed `VITE_` in Vercel
- [ ] `grep -r "service_role" dist/` after a build returns nothing
- [ ] The anon key is the only Supabase key in the client

### 4. OpenRouter account-level data policy

The per-request `data_collection: 'deny'` is now sent on every call. OpenRouter
also has an account-level privacy setting.

- [ ] Account setting matches the per-request one, so the two cannot disagree
- [ ] Confirm the model actually used (`openai/gpt-4o`) still has a compliant
      endpoint — if it does not, the cross-check silently stops returning a
      second opinion. **That is the designed behaviour and it is the right
      trade,** but it is worth knowing it happened rather than assuming the
      cross-check is running.

### 5. Deletion actually deletes

The policy says "delete a job in the app and it is removed from your account."

- [ ] Delete a job that has uploaded files, then check Supabase Storage — the
      objects should be gone, not orphaned
- [ ] Confirm on a second device that the tombstone propagates

---

## What the policy says, and what it deliberately does not

The policy tells contractors that documents go to AI providers, and that
requests are routed only to providers that do not retain or train on them.

It then says this, and the wording is deliberate:

> Even so: do not upload material you are not permitted to disclose to a
> third-party processor. Construction documents are frequently confidential to
> an owner, architect or engineer, and that is a promise **you** made to them,
> not one we can make for you.

A contractor's NDA with a GC is not something this app can satisfy on his
behalf. Routing carefully reduces the risk; it does not transfer the obligation.
Saying so plainly is better for him than a reassuring sentence that would leave
him thinking it had been handled.

---

## Before the Reddit post

- [ ] Every box above ticked
- [ ] The legal profile fields filled in — `legalGaps()` returns empty, so the
      policy names a real company, a real contact address and a real mailing
      address. A privacy policy with placeholder contact details is not a
      privacy policy.
- [ ] Decide what happens to beta testers' data when the beta ends, and say it
      in the post. "I will delete everything on request, and here is the address
      to write to" is enough; silence is not.
