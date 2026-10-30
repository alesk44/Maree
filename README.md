# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Deploy to Cloudflare Workers

This repository includes a `wrangler.jsonc` configuration and a deployment script.

1. Install Node.js and Bun (the repository includes `bun.lock`).
2. Clone this repository and run `bun install`.
3. Run `bun run build` and check that the build succeeds.
4. Authenticate to Cloudflare with `npx wrangler login`.
5. Deploy with `bun run deploy`.

The first deployment must be completed from a machine where you can authenticate to your own Cloudflare account. The site is not considered deployed until Wrangler reports a successful deployment and returns its live `workers.dev` URL.
