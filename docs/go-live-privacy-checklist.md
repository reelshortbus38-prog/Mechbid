# Privacy: what to do before anyone else uploads a drawing

A runbook, not a reading list. Every step says where to click, what to paste,
and how to prove it worked.

Written 2026-09-20, before opening Coldgauge to outside testers.

**Roughly 45 minutes.** Steps 1–4 are the ones that matter; 5–7 are cleanup.

---

## The thing to understand first

The policy makes promises. Some are kept by **code**, and tests now fail if
anyone changes the code without changing the policy. The rest depend on
**settings in the Supabase dashboard** that no test in this repo can see.

That second set is the dangerous one, because **the app looks and behaves
identically whether those settings are right or wrong.** Nothing is slow,
nothing errors, no page looks different. A public bucket serves files exactly
as fast as a private one.

So none of this can be checked by using the app. It has to be checked directly.

---

## Step 1 — Is the storage bucket private? (5 min)

This is the one that would hurt most. Every plan set anyone uploads lives in a
bucket called `job-files`. If it is public, **anyone on the internet who can
guess a URL can read every drawing in it** — and the paths are guessable, they
are just `userId/uploadId`.

**Do this:**

1. Supabase dashboard → **Storage** (left sidebar)
2. Find the bucket `job-files`
3. Look at the bucket name. If there is a **"Public"** badge next to it, that is
   the problem. Click the bucket → the **⋮** menu → **Edit bucket** → turn
   **Public bucket** OFF → Save.

**Prove it:**

1. Upload a file to any job in the app while signed in
2. Supabase → Storage → `job-files` → click into your user-id folder → click
   the file → **Copy URL**
3. Open a **private / incognito window** and paste that URL

- Loads the file → **the bucket is public. Stop and fix it.**
- Shows an error or JSON saying unauthorized → correct.

> Do not test this in your normal browser window. You are signed in there, so it
> will load either way and tell you nothing.

---

## Step 2 — Turn on Row Level Security (10 min)

Your jobs sync to two Postgres tables: **`jobs`** and **`shop_settings`**.
Without RLS, **any signed-in user can read every row in those tables** —
everyone's bids, everyone's pricing, everyone's labor rates.

There is a trap here worth knowing: writing a policy does nothing if RLS is not
*enabled* on the table. A table with RLS **off** ignores policies completely. A
table with RLS **on** and no policy denies everyone, which is safe but breaks
the app. You need both.

**Do this:**

Supabase dashboard → **SQL Editor** → New query → paste the whole thing → Run.

```sql
-- Turn RLS on. Without this the policies below are decorative.
alter table public.jobs          enable row level security;
alter table public.shop_settings enable row level security;

-- A user can see and change their own rows, and nobody else's.
-- Dropping first makes this safe to run twice.
drop policy if exists "own jobs" on public.jobs;
create policy "own jobs" on public.jobs
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own shop settings" on public.shop_settings;
create policy "own shop settings" on public.shop_settings
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

> **If that errors** with something about comparing `uuid` and `text`, your
> `user_id` column is text rather than uuid. Use `auth.uid()::text = user_id`
> in all four places instead.

**Prove it:**

Supabase → **Table Editor** → look at the table list. Each table shows its RLS
state. Both `jobs` and `shop_settings` should now say RLS is enabled, with no
red "unrestricted" warning.

Then the real test — see Step 4.

---

## Step 3 — Lock the storage paths (5 min)

Making the bucket private (Step 1) stops the public internet. It does **not**
stop one signed-in contractor from reading another's drawings. That needs a
policy on the storage objects.

Every path the app writes starts with the owner's user id —
`filePath()` in `src/lib/fileSync.js` builds `userId/uploadId` — so the rule is
"the first folder must be you."

**Do this:** SQL Editor → New query → Run.

```sql
drop policy if exists "own job files" on storage.objects;
create policy "own job files" on storage.objects
  for all
  using (
    bucket_id = 'job-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'job-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
```

`storage.foldername(name)` splits the path into folders; `[1]` is the first one.
So this reads: you may touch an object in `job-files` only when the first folder
of its path is your own user id.

### If policies already exist, read the expression and not just the role

A bucket can show four healthy-looking policies and still be wrong. The column
the dashboard shows you is **APPLIED TO**, and `authenticated` there only means
"any signed-in user" — it does not mean "the user who owns the file."

So a policy named `own job files — read`, applied to `authenticated`, whose body
is merely:

```sql
bucket_id = 'job-files'
```

lets every contractor who signs up read every other contractor's drawings. It
looks identical in the list to the correct one. Open each policy and confirm the
body contains the ownership test:

```sql
auth.uid()::text = (storage.foldername(name))[1]
```

Four separate policies split by command (SELECT / INSERT / UPDATE / DELETE) are
fine — arguably better than the single `for all` above, since each can be
tightened independently. What matters is that every one of them carries that
line.


---

## Step 4 — Prove it, the only way that proves anything (15 min)

This is the step people skip, and the one that matters.

**First, a warning about the obvious test.** Signing in as a second account and
checking that you cannot see the first account's jobs **proves nothing**. The
app asks the database only for its own rows — `pullCloudJobs` in
`src/lib/cloudSync.js` runs `.eq('user_id', userId)` — so account B would see
nothing whether RLS is on or off. That test passes either way.

The real test is to ask the database for *everything*, the way somebody
poking at it would.

### The one-command test

Your **anon key is public.** It ships in the browser bundle, which is correct
and by design — RLS is what makes it safe. So the honest question is: what does
that public key get you on its own?

**Where the two values are.** Not in this document — a placeholder that looks
pasteable will get pasted, and `your-project.supabase.co` resolves to nothing,
which reads as "the test failed" when it means "the test never ran."

- **Project URL** — Supabase → ⚙️ Settings → Data API → *Project URL*, which has
  a copy button. Or read it off the dashboard address bar: the URL is
  `supabase.com/dashboard/project/<ref>`, and your API host is
  `https://<ref>.supabase.co`.
- **Anon key** — Supabase → ⚙️ Settings → API Keys → the one labelled `anon`
  `public`. Vercel's `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` hold the
  same two values if you are already there.

Then, in a terminal:

```bash
URL="https://YOUR-PROJECT.supabase.co"
ANON="your-anon-key"

echo "--- jobs ---"
curl -s "$URL/rest/v1/jobs?select=id,user_id,name" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON"

echo; echo "--- shop_settings ---"
curl -s "$URL/rest/v1/shop_settings?select=user_id" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
```

**Read the result:**

- `[]` — an empty list. **Correct.** RLS is on and the public key alone gets
  nothing.
- A JSON error mentioning permission or the relation not existing — also fine.
- **Any rows at all** — RLS is off or the policy is wrong. Everything in those
  tables is readable by anyone who opens your site and reads the key out of it.
  **Go back to Step 2.** Do not launch.

Run this again any time you add a table.

### From an iPad, with no terminal

Coldgauge is used on an iPad, so this has to be doable on one. Supabase accepts
the key as a URL parameter as well as a header — its own error message says so
("No `apikey` request header or url param was found") — so the same test is a
URL you paste into Safari.

Build it from the same two values:

```
https://YOUR-PROJECT.supabase.co/rest/v1/jobs?select=id,user_id,name&apikey=YOUR-ANON-KEY
```

Open it in Safari. Same reading as above:

- `[]` — correct.
- Any rows — RLS is off or the policy is wrong. Do not launch.

Repeat with `shop_settings` in place of `jobs`.

> Keys in URLs end up in browser history and server logs, which is normally a
> reason not to do this. It does not apply here: the anon key is already public
> by design — it ships inside the JavaScript of your own site, where anyone can
> read it. Putting it in a URL exposes nothing that is not already exposed. Do
> NOT do this with the service-role key, ever.

### And the same for a file

While you are there, test storage the same way. Take any real object path from
Supabase → Storage (it looks like `a1b2c3.../f9e8d7...`) and:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "$URL/storage/v1/object/job-files/PASTE-PATH-HERE" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
```

- `400` or `403` — **correct**, the object is not readable without a real user.
- `200` — the file came back to an anonymous caller. **Go back to Steps 1 and 3.**

### Reading what is configured (the fast check)

The REST test above proves what actually HAPPENS, which is the thing that
matters. This one shows what is CONFIGURED, which is faster and says where to
look when the REST test comes back wrong.

The SQL Editor is the right place for this and the wrong place for the test
above — see the next section. Reading the catalog is not reading your data.

```sql
select c.relname                                            as table_name,
       case when c.relrowsecurity then 'ON' else 'OFF' end  as rls,
       coalesce(p.policyname, '(NO POLICY)')                as policy,
       coalesce(p.cmd, '-')                                 as cmd,
       coalesce(p.qual, '-')                                as using_expression
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p
  on p.tablename = c.relname and p.schemaname = n.nspname
where (n.nspname = 'public'  and c.relname in ('jobs', 'shop_settings'))
   or (n.nspname = 'storage' and c.relname = 'objects')
order by c.relname, p.policyname;
```

Reading it:

- `rls` must be **ON** for `jobs` and `shop_settings`. OFF on either means every
  contractor's bids and pricing are readable by any signed-in user.
- `(NO POLICY)` against a table whose RLS is ON means the app cannot read its
  own rows either. Safe, and broken.
- Every `using_expression` must carry an ownership test — `auth.uid() = user_id`
  on the tables, `(storage.foldername(name))[1] = auth.uid()::text` on storage.

> Order by column NAMES, not positions. `order by 1, 3` is the natural thing to
> write and it breaks the moment the select list is edited — PostgreSQL rejects
> a position that no longer exists, and the error reads like a problem with the
> data rather than with the query.

### A NULL on the INSERT policies is expected, and is not the whole story

Running the query above returns `qual = NULL` for every INSERT policy, on every
table. That looks like a missing rule and is not one.

`qual` is the **USING** expression, which decides *which existing rows you may
see or touch*. An INSERT has no existing row to test, so PostgreSQL does not
allow USING on an INSERT policy at all — its rule lives in a different column,
**`with_check`**, which decides *what you are allowed to write*.

So the first query genuinely cannot see the INSERT rule. Run this one as well:

```sql
select tablename, policyname, cmd,
       coalesce(with_check, '(NONE)') as with_check
from pg_policies
where tablename in ('jobs', 'shop_settings')
order by tablename, cmd;
```

`(NONE)` against an INSERT policy is the real hole, and it is a specific one:
a signed-in contractor could write rows carrying somebody ELSE's `user_id` —
inserting jobs into another shop's account. Reading is protected by the SELECT
policy either way, so nothing leaks; but another shop's job list grows rows they
did not create, and the tombstone logic in `cloudSync.js` would sync them down
to every device on that account.

Note the asymmetry while reading the results: on an UPDATE policy a missing
`with_check` is harmless — PostgreSQL falls back to the USING expression. On an
INSERT policy there is no USING to fall back to.

### Where NOT to test this

**The Supabase SQL Editor.** Queries there run as a privileged role that
**bypasses RLS entirely**, so `select * from jobs` will happily return every row
whether your policies are right or wrong. It is the most natural place to look
and it is the one place that cannot answer the question.

### Write down that you did it

Date it and keep it somewhere. It is the only evidence that what your privacy
policy tells contractors is actually true of your database.

---

## Step 5 — Keep the service-role key out of the browser (5 min)

The service-role key **bypasses RLS entirely**. If it ever reaches the browser
bundle, every step above becomes decorative.

Only variables starting with `VITE_` are exposed to the browser. The app uses
exactly two, and both are safe to expose:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**Do this:**

1. Vercel → your project → Settings → Environment Variables
2. Confirm **no** variable name starting with `VITE_` contains a service-role
   key. If one does, rename it so it does not start with `VITE_`, and redeploy.

**Prove it:**

```bash
npm run build
grep -r "service_role" dist/ ; echo "exit: $?"
```

`exit: 1` and no output → correct, the key is not in the bundle.
Any match → **stop and fix it before deploying.**

---

## Step 6 — Fill in the legal profile (5 min)

The policy currently renders with placeholders where your company details go. A
privacy policy that says "Acme Refrigeration" and has no real contact address is
not a privacy policy — and the contact address is where people write to have
their data deleted, which is a right you are promising them.

In the app: **Proposal step → Terms · Privacy**. Fill in every field until the
⚠ marker next to it disappears. You need:

- Company name
- Contact email (this is the address privacy requests go to — it has to be one
  you actually read)
- Mailing address

---

## Step 7 — Decide what happens when the beta ends (5 min)

Say it in the Reddit post and be done with it. Something like:

> It's free, there's no billing and nothing renews. Your files are stored in my
> Supabase project and only your account can read them. Email me and I'll delete
> your account and everything in it. If I ever shut this down I'll give notice
> and let you export first.

Silence on this is what makes contractors suspicious, and they are right to be.

---

## Already handled — no action needed

These are held by tests that fail if the code and the policy drift apart:

| Promise | Held by |
|---|---|
| No AI provider retains or trains on uploaded documents | `api/providerPrivacy.test.js` — every OpenRouter call must send `data_collection: 'deny'` and `zdr: true` |
| Every processor the code calls is named in the policy | `src/components/legalTruth.test.js` |
| No processor is named that the code does not call | same |
| No billing described while no payment processor exists | same |
| The diagnostic export carries no customer identity | `src/components/bidSelfCheck.test.js` |

---

## What the policy deliberately does not promise

> Even so: do not upload material you are not permitted to disclose to a
> third-party processor. Construction documents are frequently confidential to
> an owner, architect or engineer, and that is a promise **you** made to them,
> not one we can make for you.

A contractor's NDA with a GC is not something this app can satisfy on his
behalf. Careful routing reduces the risk; it does not transfer the obligation.
Saying so plainly leaves him better off than a reassuring sentence would.
