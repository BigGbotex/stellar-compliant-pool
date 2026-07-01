# Frontend

Next.js app: deposit, ASP allow-list admin, and withdraw panels for the
Compliant Privacy Pool. API routes run the real Poseidon2-backed hashing
logic (see `lib/hasher.ts`, `lib/merkle.ts`) - not a UI mockup.

```bash
npm install
npm run dev
# http://localhost:3000
```

State (pool deposits, ASP identities) lives in-memory in this server process
only - see the top-level README's "What's intentionally simplified" section.
