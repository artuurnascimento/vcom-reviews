# VCOM Reviews App

App Shopify para gerir **avaliações manuais** com o mesmo modelo e visual da seção `product-reviews.liquid` do tema VCOM GLOBAL V9.

## O que faz

- **Admin (Polaris):** criar, editar e apagar reviews sem limite de blocos do Theme Editor.
- **Dados:** metaobject `review` com campos `rating`, `verified_buyer`, `title`, `body`, `author`, `time`, `images`.
- **Metafields:** `custom.reviews` na **Shop** (homepage) e no **Product** (página de produto).
- **Vitrine:** Theme App Extension `Avaliações VCOM` — mesmos SVGs de estrela e ícone Verified do tema.

## Pré-requisitos

- Node.js 20+
- [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) (`npm install -g @shopify/cli @shopify/theme`)
- App criada no [Partner Dashboard](https://dev.shopify.com)

## Instalação

```bash
cd reviews-app
npm install
cp .env.example .env
```

1. No Partner Dashboard, crie um app e copie **API key** e **API secret** para `.env`.
2. Atualize `client_id` em `shopify.app.toml`.
3. Execute a configuração da loja no app: **Configuração → Executar configuração** (cria metaobject + metafields).

## Desenvolvimento

```bash
npm run dev
```

Siga o login Shopify no terminal. O CLI abre o tunnel e o admin embarcado.

## Uso na loja

1. Instale o app na loja de desenvolvimento.
2. O tema VCOM já inclui a seção `vcom_reviews_homepage` em `templates/index.json` (após o UGC carousel). Se o bloco não aparecer, confira o handle do app na URL do Partner Dashboard e ajuste o tipo do bloco para `shopify://apps/SEU-HANDLE/blocks/product-reviews`.
3. Em **Apps → VCOM Reviews**, crie avaliações (com upload de até 6 imagens) e escolha **Homepage** ou **Produto**.

### Compatibilidade com o tema VCOM

O tema já lê `product.metafields.custom.reviews` quando `use_metafield_reviews` está ativo na seção legada. Com o app:

- Reviews de produto vão para `product.metafields.custom.reviews`.
- Reviews da homepage vão para `shop.metafields.custom.reviews`.
- Pode desativar blocos manuais na seção antiga e usar só o app block.

## Estrutura

```
reviews-app/
├── app/                    # Remix admin
├── extensions/
│   └── reviews-widget/     # Theme App Extension (Liquid)
├── shopify.app.toml
└── README.md
```

## Deploy

### Theme extension (Shopify)

```bash
shopify app deploy
```

### Servidor (Railway / Render)

Variáveis **obrigatórias** no painel do host:

| Variável | Exemplo |
|----------|---------|
| `SHOPIFY_API_KEY` | Client ID do Partners (`4a9d3ae2...`) |
| `SHOPIFY_API_SECRET` | Client secret do Partners |
| `SHOPIFY_APP_URL` | URL pública HTTPS do Railway **sem** `/` no final |
| `SCOPES` | Mesma string do `.env.example` |
| `NODE_ENV` | `production` |

**Railway:** Settings → Networking → **Generate Domain** → copie a URL → cole em `SHOPIFY_APP_URL` → **Redeploy**.

Depois atualize no Partners (ou `shopify.app.vcom-reviwers.toml` + `shopify app deploy`):

- App URL = `SHOPIFY_APP_URL`
- Redirects = `{SHOPIFY_APP_URL}/auth/callback` e `.../auth/shopify/callback`
- Webhook = `{SHOPIFY_APP_URL}/webhooks/app/uninstalled`

Build: `npm ci && npm run build` · Start: `npm run start`

## Notas

- Formulário “Write a review” na vitrine vem **desligado** por padrão (`show_review_form: false`).
- Upload de imagens no admin: até 6 por avaliação (staged upload + `fileCreate`).
- Trusted avatars: metafield `shop.metafields.custom.reviews_trusted_avatars` (lista de arquivos).
