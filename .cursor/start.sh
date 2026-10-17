#!/usr/bin/env bash
# Boot-time Merkster dev stack: Postgres 16, mock Google, mock LLM, API, and Vite.
set -euo pipefail

cd /workspace

if ! pg_isready -q; then
  sudo pg_ctlcluster 16 main start
fi
for _ in $(seq 1 30); do
  pg_isready -q && break
  sleep 1
done
pg_isready -q

SECRET_DIR="${HOME}/.merkster"
mkdir -p "$SECRET_DIR"
chmod 700 "$SECRET_DIR"
if [ ! -s "$SECRET_DIR/app_secret" ]; then
  openssl rand -hex 32 > "$SECRET_DIR/app_secret"
  chmod 600 "$SECRET_DIR/app_secret"
fi
if [ ! -s "$SECRET_DIR/db_password" ]; then
  openssl rand -hex 24 > "$SECRET_DIR/db_password"
  chmod 600 "$SECRET_DIR/db_password"
fi
APP_SECRET="$(cat "$SECRET_DIR/app_secret")"
DB_PASSWORD="$(cat "$SECRET_DIR/db_password")"

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='merkster'" | grep -q 1; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE merkster LOGIN PASSWORD '${DB_PASSWORD}'"
else
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE merkster WITH LOGIN PASSWORD '${DB_PASSWORD}'"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='merkster'" | grep -q 1; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE merkster OWNER merkster"
fi
sudo -u postgres psql -v ON_ERROR_STOP=1 -d merkster -c "GRANT ALL ON SCHEMA public TO merkster"

umask 077
cat > /workspace/.env <<EOF
NODE_ENV=development
PORT=8080
HOST=0.0.0.0
PUBLIC_URL=http://localhost:5173
APP_SECRET=${APP_SECRET}
DATABASE_URL=postgres://merkster:${DB_PASSWORD}@127.0.0.1:5432/merkster
POSTGRES_USER=merkster
POSTGRES_PASSWORD=${DB_PASSWORD}
POSTGRES_DB=merkster
POSTGRES_HOST=127.0.0.1
GOOGLE_CLIENT_ID=mock-client-id
GOOGLE_CLIENT_SECRET=mock-client-secret
OIDC_TEST_ISSUER=http://127.0.0.1:9090
LLM_BASE_URL=http://127.0.0.1:8099/v1
LLM_API_KEY=sk-mock-local-test-key
LLM_VISION_MODEL=mock-vision
SOURCE_CODE_URL=https://github.com/bandulix/merkster
REGISTRATION_OPEN=true
LOG_LEVEL=info
EOF
chmod 600 /workspace/.env

if ! tmux has-session -t merkster-oidc 2>/dev/null; then
  tmux new-session -d -s merkster-oidc -c /workspace -- env MOCK_OIDC_ISSUER=http://127.0.0.1:9090 MOCK_OIDC_PUBLIC_URL=http://127.0.0.1:9090 node tools/mock-oidc.mjs
fi
if ! tmux has-session -t merkster-llm 2>/dev/null; then
  tmux new-session -d -s merkster-llm -c /workspace -- node tools/mock-llm.mjs
fi
if ! tmux has-session -t merkster-api 2>/dev/null; then
  tmux new-session -d -s merkster-api -c /workspace -- npm run dev:server
fi
if ! tmux has-session -t merkster-web 2>/dev/null; then
  tmux new-session -d -s merkster-web -c /workspace -- npm run dev:web -- --host 127.0.0.1 --port 5173
fi

for _ in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:8080/api/health >/dev/null \
    && curl -fsS http://127.0.0.1:5173/ >/dev/null \
    && curl -fsS http://127.0.0.1:9090/health >/dev/null \
    && curl -fsS http://127.0.0.1:8099/health >/dev/null; then
    echo "merkster dev stack is ready"
    exit 0
  fi
  sleep 1
done

echo "merkster dev stack did not become ready" >&2
tmux ls >&2 || true
echo "--- api ---" >&2
tmux capture-pane -pt merkster-api -S -100 >&2 || true
echo "--- web ---" >&2
tmux capture-pane -pt merkster-web -S -60 >&2 || true
exit 1
