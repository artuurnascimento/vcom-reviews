type AdminApi = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const MAX_IMAGES = 6;

export async function uploadReviewImages(
  admin: AdminApi,
  files: File[],
): Promise<string[]> {
  const valid = files.filter((f) => f && f.size > 0).slice(0, MAX_IMAGES);
  if (valid.length === 0) return [];

  const staged = await admin.graphql(
    `#graphql
    mutation StagedUploads($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { message }
      }
    }`,
    {
      variables: {
        input: valid.map((file) => ({
          filename: file.name || "review-image.jpg",
          mimeType: file.type || "image/jpeg",
          resource: "FILE",
          fileSize: String(file.size),
          httpMethod: "POST",
        })),
      },
    },
  );
  const stagedJson = await staged.json();
  const targets = stagedJson.data?.stagedUploadsCreate?.stagedTargets || [];
  const stagedErrors = stagedJson.data?.stagedUploadsCreate?.userErrors || [];
  if (stagedErrors.length) {
    throw new Error(stagedErrors.map((e: { message: string }) => e.message).join(", "));
  }

  const resourceUrls: string[] = [];
  for (let i = 0; i < valid.length; i++) {
    const file = valid[i];
    const target = targets[i];
    if (!target) continue;

    const formData = new FormData();
    for (const param of target.parameters) {
      formData.append(param.name, param.value);
    }
    formData.append("file", file);

    const uploadRes = await fetch(target.url, { method: "POST", body: formData });
    if (!uploadRes.ok) {
      throw new Error(`Falha ao enviar imagem ${file.name}`);
    }
    resourceUrls.push(target.resourceUrl);
  }

  const created = await admin.graphql(
    `#graphql
    mutation FileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id }
        userErrors { message }
      }
    }`,
    {
      variables: {
        files: resourceUrls.map((url) => ({
          originalSource: url,
          contentType: "IMAGE",
        })),
      },
    },
  );
  const createdJson = await created.json();
  const fileErrors = createdJson.data?.fileCreate?.userErrors || [];
  if (fileErrors.length) {
    throw new Error(fileErrors.map((e: { message: string }) => e.message).join(", "));
  }
  return (createdJson.data?.fileCreate?.files || []).map((f: { id: string }) => f.id);
}

export function parseExistingImageIds(form: FormData): string[] {
  const raw = String(form.get("existing_images") || "[]");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_IMAGES) : [];
  } catch {
    return [];
  }
}

export async function resolveImageIdsFromForm(
  admin: AdminApi,
  form: FormData,
): Promise<string[]> {
  const existing = parseExistingImageIds(form);
  const uploads = form.getAll("images");
  const files = uploads.filter((f): f is File => f instanceof File && f.size > 0);
  const newIds = await uploadReviewImages(admin, files);
  return [...existing, ...newIds].slice(0, MAX_IMAGES);
}
