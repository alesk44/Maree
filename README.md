# Marée Jersey

A trilingual (French, English, Romanian) prototype connecting Jersey fishers with local restaurants for the day's fresh catch.

## Local development

Requirements: Node.js and Bun.

```sh
git clone https://github.com/alesk44/Maree.git
cd Maree
bun install
bun run dev
```

## Verify before deployment

```sh
bun run build
bun run test
bun x wrangler deploy --dry-run
```

The build creates a Cloudflare Workers-compatible Nitro bundle under `.output/`. The dry run checks the generated Worker and asset bundle without publishing it.

## Deploy to Cloudflare Workers

1. Create or sign in to your free Cloudflare account.
2. In the project folder, run `bun install`.
3. Run the verification commands above.
4. Authenticate with `bun x wrangler login` and complete the browser authorization.
5. Deploy with `bun run deploy`.
6. Open the `workers.dev` URL returned by Wrangler and verify the home page, all routes, and the FR / EN / RO language selector.

The deployment has not been performed automatically because it requires authorization to the owner's Cloudflare account. Do not treat the site as deployed until Wrangler reports success and returns a live URL.

## Supabase shared database and account foundation

A first Supabase/PostgreSQL schema migration is included at `supabase/migrations/20261030000000_initial_schema.sql`. It defines user profiles, fish lots, orders, validation triggers, indexes, and row-level security policies. It is **not connected to the app yet** and has not been applied to a live database because no Supabase project is connected to this repository/account. The schema is applied to the Supabase project `maree-jersey` in the London region. A transactional `reserve_catch` RPC locks the catch row, validates remaining stock, creates the order and decrements inventory atomically. New accounts are created with the `restaurant` role by default; fisher/admin roles must be assigned through a trusted administrative process.

## Current prototype limitations

- Supabase client configuration and the `/connexion` sign-in / sign-up page are now present. The app's catalogue, fisher workspace and order forms still use the local demo store; they have not yet been migrated to the shared database.
- Fisher/admin role assignment is not self-service. Do not use the demo fisher workspace for real listings until the routes are connected to authenticated user IDs and server-side permissions.
- There is no payment processing or live notification service.
- Before real commercial use, connect a shared database and secure authentication, then verify Jersey food-sale, traceability, data-protection and business requirements.

## Stack

- TanStack Start
- React and TypeScript
- Tailwind CSS
- Nitro Cloudflare Workers preset


## Supabase browser configuration

The frontend uses only the public project URL and publishable key in `src/lib/supabase.ts`. These are intended for browser use; never add a Supabase `service_role` key to frontend code. Optional deployment overrides are `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The sign-up flow creates restaurant accounts; fisher access must be granted by a trusted administrator after verification. Configure the Supabase Auth site URL and allowed redirect URLs for the final deployed domain before inviting real users.
