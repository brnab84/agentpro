# AgentPro

Predictive SaaS CRM for real estate agents. Multi-tenant, layered architecture.

## Stack
Node 20, Express, MongoDB Atlas (Mongoose), JWT, Zod, ESLint/Prettier.

## Architecture
Layered per module: `routes -> controller -> service -> model`.
Every document is scoped by `tenantId`; `auth` + `tenantScope` middleware
guarantee isolation across tenants.

## Setup
```bash
npm install
cp .env.example .env   # fill MONGO_URI and JWT_SECRET
npm run dev
```

## API (Phase 1)
- `POST /api/auth/register` — creates tenant + owner user, returns JWT
- `POST /api/auth/login`
- `GET|POST /api/leads`  `GET|PATCH|DELETE /api/leads/:id`  (?stage= filter)
- `GET|POST /api/properties`  `GET|PATCH|DELETE /api/properties/:id`
- `GET|POST /api/appointments`  `GET|PATCH|DELETE /api/appointments/:id`

All `/api/*` routes except auth require `Authorization: Bearer <token>`.

## AI (Phase 2)
Requires `ANTHROPIC_API_KEY` in `.env`.
- `POST /api/ai/leads/:leadId/qualify` — body `{ conversationText }`. Claude extracts budget/intent/urgency, computes quality score, then recalculates lead score, close probability, property matches and next-best-action.
- `POST /api/ai/leads/:leadId/rescore` — recompute scoring/matches/next-action from current lead data (no AI call).
- `GET /api/ai/leads/:leadId/matches` — top property matches by attribute fit.

Scoring: weighted model over budget/urgency/intent/source/AI-quality signals; close probability via logistic curve. Matching: attribute fit (budget 45% / zone 35% / type 20%).

## Roadmap
- Phase 2: AI lead scoring, predictive close probability, semantic matching, next-best-action
- Phase 3: WhatsApp / Instagram / email automation + chatbot
- Phase 4: calendar sync, best-time-to-contact, pipeline forecast
- Phase 5: billing, plan limits, PWA
