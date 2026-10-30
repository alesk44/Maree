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

## Current prototype limitations

- Fisher profiles, catches and orders are demonstration data stored in the browser; data is not shared between devices or users.
- There is no production authentication, payment processing, or live notification service.
- Before real commercial use, connect a shared database and secure authentication, then verify Jersey food-sale, traceability, data-protection and business requirements.

## Stack

- TanStack Start
- React and TypeScript
- Tailwind CSS
- Nitro Cloudflare Workers preset
