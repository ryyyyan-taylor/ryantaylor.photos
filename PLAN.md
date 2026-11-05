# Plan

Infra/ops features to turn the site into a portfolio project, highest leverage first.

## 1. Infrastructure as Code (Terraform)

Everything currently configured by hand in the Cloudflare dashboard, codified:

- Zone, DNS records
- R2 bucket(s) + CORS + lifecycle rules, `img.ryantaylor.photos` custom domain
- Worker custom domain/routes (currently commented out in `wrangler.jsonc`)
- Email routing / sending config
- Cache rules, WAF / rate-limit rules for `/utils/api/*`
- Remote state in R2 (S3-compatible backend)

## 2. CI/CD (GitHub Actions)

- PR: typecheck, `astro build`, validate `photos.json` schema
- PR: Wrangler preview deploy, `terraform plan` posted as a comment
- Merge to main: `wrangler deploy` with a scoped API token, `terraform apply`

## 3. Event-driven photo pipeline

- Upload originals to an R2 "inbox" bucket → R2 event notification → Queue
- Consumer Worker/container encodes AVIF+WebP variants
- Workflow (durable, retryable steps) updates the manifest and triggers a rebuild
- Idempotency, retries, dead-letter queue

## 4. Testing

- Vitest + `@cloudflare/vitest-pool-workers` for `gallery-auth.ts`, redirects, contact handler
- Playwright smoke tests against preview deploys
- Lighthouse CI with performance budgets

## 5. Observability

- Workers Logs / Analytics, uptime check via Cron Trigger
- Public `/status` or "how this is built" page: build times, image counts, AVIF savings, cache hit ratio

## 6. Security hardening

- Turnstile on contact form and gallery password form
- Rate limiting on the gallery password endpoint
- CSP / security headers from the Worker
- Dependabot or Renovate

## 7. Smaller extras

- Workers AI alt-text generation, reviewed in the admin UI
- Scheduled prune + off-provider R2 backup (3-2-1)
- Architecture diagram and ADRs in the repo
