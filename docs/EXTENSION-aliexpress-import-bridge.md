# AliExpress Import Bridge (Chrome Extension)

Esta extensão envia avaliações coletadas do AliExpress para a página ` /app/import ` do VCOM Reviews.

## Arquivos da extensão

- `extensions/aliexpress-import-bridge/manifest.json`
- `extensions/aliexpress-import-bridge/popup.html`
- `extensions/aliexpress-import-bridge/popup.js`

## Configuração no app (Railway)

Defina:

- `IMPORT_EXTENSION_CHANNEL=vcom.import`
- `IMPORT_EXTENSION_ALLOWED_ORIGINS=chrome-extension://<EXTENSION_ID>`

Você pode incluir mais de uma origem separando por vírgula.

## Como obter o EXTENSION_ID

1. Abra `chrome://extensions`.
2. Ative **Developer mode**.
3. Clique em **Load unpacked** e selecione `extensions/aliexpress-import-bridge`.
4. Copie o ID mostrado no card da extensão.

## Fluxo de uso

1. Abra uma página de reviews no AliExpress.
2. Clique no ícone da extensão.
3. Clique em **Coletar do AliExpress**.
4. Abra a página ` /app/import ` do VCOM Reviews (na aba atual).
5. Clique em **Enviar para aba atual**.
6. Confira o resumo no app: importadas, duplicadas, inválidas, falhas.

## Contrato enviado para o app

```json
{
  "channel": "vcom.import",
  "type": "vcom.import.reviews",
  "source": "aliexpress",
  "requestId": "<uuid>",
  "batchId": "alx-<timestamp>-<rand>",
  "sentAt": "2026-05-27T23:00:00.000Z",
  "reviews": [
    {
      "sourceReviewId": "abc",
      "author": "Cliente AliExpress",
      "title": "Muito bom",
      "body": "Texto da avaliação...",
      "rating": 5,
      "time": "2026-05-27",
      "placement": "homepage",
      "verifiedBuyer": false
    }
  ]
}
```

## Observações V1

- Importa sempre com `status: pending` no app.
- Extração do AliExpress é heurística (seletores HTML podem variar com mudanças no site).
- Se a aba ativa não for ` /app/import `, o envio é bloqueado no popup.
