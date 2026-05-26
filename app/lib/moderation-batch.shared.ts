/** IDs por POST ao aprovar/rejeitar em massa (evita timeout no Railway). */
export const MODERATION_BATCH_SIZE = 15;

export type ModerationBatchSuccess = { ok: true; processed: number };
export type ModerationBatchError = { ok: false; error: string };
export type ModerationBatchResult = ModerationBatchSuccess | ModerationBatchError;

function buildActionFetchUrl(actionUrl: string, routeDataId: string): string {
  if (typeof window === "undefined") return actionUrl;
  const url = new URL(actionUrl, window.location.origin);
  url.searchParams.set("_data", routeDataId);
  return `${url.pathname}${url.search}`;
}

export async function postModerationBatch(
  actionUrl: string,
  routeDataId: string,
  formData: FormData,
): Promise<ModerationBatchResult> {
  const res = await fetch(buildActionFetchUrl(actionUrl, routeDataId), {
    method: "POST",
    body: formData,
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  const text = await res.text();

  if (!res.ok) {
    if (res.status === 502 || res.status === 504) {
      return {
        ok: false,
        error:
          "O servidor demorou demais neste lote. Aguarde e tente continuar (as já processadas foram salvas).",
      };
    }
    try {
      const json = JSON.parse(text) as { message?: string; error?: string };
      const msg = json.message || json.error;
      if (msg) return { ok: false, error: String(msg) };
    } catch {
      /* ignore */
    }
    return { ok: false, error: `Erro ${res.status} ao processar lote.` };
  }

  try {
    const data = JSON.parse(text) as unknown;
    if (
      data &&
      typeof data === "object" &&
      (data as ModerationBatchSuccess).ok === true &&
      typeof (data as ModerationBatchSuccess).processed === "number"
    ) {
      return data as ModerationBatchSuccess;
    }
    if (data && typeof data === "object" && "ok" in data && !(data as ModerationBatchSuccess).ok) {
      return data as ModerationBatchError;
    }
  } catch {
    /* ignore */
  }

  return { ok: false, error: "Resposta inválida do servidor." };
}

export function parseIdsJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}
