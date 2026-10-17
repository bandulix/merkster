# Merkster – common tasks.   make help
SHELL := /bin/bash
COMPOSE ?= docker compose
.DEFAULT_GOAL := help

help: ## show this help
	@grep -E '^[a-z][a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*## "}{printf "  \033[36m%-12s\033[0m %s\n",$$1,$$2}'

.env:
	@cp .env.example .env
	@sed -i "s|^APP_SECRET=.*|APP_SECRET=$$(openssl rand -hex 32)|; s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$$(openssl rand -hex 24)|" .env
	@echo "created .env with random secrets – now add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (and optionally the LLM settings)"

env: .env ## create .env from .env.example with random secrets (never overwrites)

mock-env: ## create .env for local testing with the mock Google + mock LLM (never overwrites)
	@test ! -f .env || { echo ".env exists – not touching it"; exit 1; }
	@cp .env.example .env
	@sed -i "s|^NODE_ENV=.*|NODE_ENV=development|; s|^APP_SECRET=.*|APP_SECRET=$$(openssl rand -hex 32)|; s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$$(openssl rand -hex 24)|; \
	  s|^GOOGLE_CLIENT_ID=.*|GOOGLE_CLIENT_ID=mock-client-id|; s|^GOOGLE_CLIENT_SECRET=.*|GOOGLE_CLIENT_SECRET=mock-client-secret|; \
	  s|^# OIDC_TEST_ISSUER=.*|OIDC_TEST_ISSUER=http://mock-oidc:9090|; s|^LLM_BASE_URL=.*|LLM_BASE_URL=http://mock-llm:8099/v1|; \
	  s|^LLM_API_KEY=.*|LLM_API_KEY=sk-mock-local-test-key|; s|^LLM_VISION_MODEL=.*|LLM_VISION_MODEL=mock-vision|" .env
	@echo "created .env for the mock setup (TEST ONLY – NODE_ENV=development)"

install: ## npm ci
	npm ci

dev: ## run server (tsx watch) + Vite dev server
	npx --yes concurrently -k "npm:dev:server" "npm:dev:web"

build: ## build the PWA + server bundle
	npm run build

test: ## unit tests (Vitest)
	npm test

typecheck: ## TypeScript (web + server)
	npm run typecheck

e2e: ## Playwright end-to-end tests (needs a running app + mocks; CHROME_PATH for a system Chrome)
	npx playwright test

lint: ## hadolint + compose config validation
	docker run --rm -i hadolint/hadolint < Dockerfile
	$(COMPOSE) config -q
	$(COMPOSE) -f docker-compose.yml -f docker-compose.caddy.yml config -q

up: .env ## pull ghcr.io/bandulix/merkster:latest and start app + Postgres
	$(COMPOSE) up -d

mock: ## start app + Postgres + mock Google + mock LLM (TEST ONLY)
	$(COMPOSE) --profile mock up -d

caddy: .env ## start with Caddy (HTTPS) in front – needs DOMAIN in .env
	$(COMPOSE) -f docker-compose.yml -f docker-compose.caddy.yml up -d

down: ## stop everything (data volume is kept)
	$(COMPOSE) --profile mock down

logs: ## follow app logs
	$(COMPOSE) logs -f app

health: ## query the health endpoint
	curl -fsS http://localhost:$${APP_PORT:-8080}/api/health && echo

backup: ## dump the database to backups/
	@mkdir -p backups
	$(COMPOSE) exec -T db sh -c 'pg_dump -U "$$POSTGRES_USER" "$$POSTGRES_DB"' | gzip > backups/merkster-$$(date +%F-%H%M).sql.gz

zip: ## release zip (no .env, no node_modules, no build output)
	rm -f merkster-v1.zip
	git archive --format=zip --prefix=merkster/ -o merkster-v1.zip HEAD

clean: ## remove build output and test artifacts
	rm -rf dist playwright-report test-results tests/output

.PHONY: help env mock-env install dev build test typecheck e2e lint up mock caddy down logs health backup zip clean
