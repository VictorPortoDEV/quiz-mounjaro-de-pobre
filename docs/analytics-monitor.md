# Monitor de analytics

O Quiz e as duas VSLs enviam eventos relevantes e um heartbeat a cada 10 segundos para um Cloudflare Worker. O Worker grava o estado consolidado em `sessions`, a timeline em `events` e serve o painel privado em `/analytics/`. Não há tracking no checkout nem coleta de nome, e-mail, telefone, pagamento ou IP.

## Cloudflare

O projeto está em `analytics-worker/`. Ele usa o binding D1 `ANALYTICS_DB`, o secret `ANALYTICS_ADMIN_TOKEN` e as variáveis `ALLOWED_ORIGINS` e `ALLOW_LOCAL_DEV`. O ambiente de produção está publicado em `https://analytics.mounjarodpobre.com.br`, com o painel em `/analytics/`.

```powershell
cd "C:\Users\Victor\Desktop\o clonador\MOUNJARO DE POBRE\analytics-worker"
npm install
npx wrangler login
npx wrangler d1 create mounjaro-analytics
```

Em uma nova conta Cloudflare, copie o `database_id` retornado para `wrangler.jsonc`. No ambiente atual o D1 e o custom domain já estão configurados. Para reaplicar migrations e publicar:

```powershell
npx wrangler d1 migrations apply mounjaro-analytics --remote
npx wrangler secret put ANALYTICS_ADMIN_TOKEN
npx wrangler deploy
```

Configure o custom domain `analytics.mounjarodpobre.com.br` para o Worker no painel Cloudflare em **Workers & Pages → mounjaro-analytics → Settings → Domains & Routes**. Se usar outro domínio, altere `data-endpoint` nos três HTMLs instrumentados.

Para desenvolvimento local, defina temporariamente `ALLOW_LOCAL_DEV` como `true`, execute `npx wrangler dev` e aponte `data-endpoint` para a URL local. O painel pede o token e o mantém somente em `sessionStorage`.

Para validar:

```powershell
npm test
npm run check
npx wrangler d1 execute mounjaro-analytics --remote --command "SELECT session_id,current_page,current_step,vsl_progress,last_seen_at FROM sessions ORDER BY last_seen_at DESC LIMIT 10;"
```
