import {
  BlockStack,
  Button,
  Card,
  Checkbox,
  DropZone,
  FormLayout,
  InlineStack,
  Select,
  Text,
  TextField,
  Thumbnail,
} from "@shopify/polaris";
import { useCallback, useState } from "react";
import type { ReviewFormData, ReviewPlacement } from "../lib/constants";
import { StarRatingPicker } from "./StarRatingPicker";

type Props = {
  initial?: Partial<ReviewFormData>;
  imageUrls?: Record<string, string>;
  products?: Array<{ id: string; title: string }>;
  submitLabel?: string;
  onSubmit: (data: ReviewFormData, files: File[]) => void;
  onCancel?: () => void;
};

export function ReviewForm({
  initial,
  imageUrls = {},
  products = [],
  submitLabel = "Salvar",
  onSubmit,
  onCancel,
}: Props) {
  const [rating, setRating] = useState(initial?.rating ?? 5);
  const [verified, setVerified] = useState(initial?.verified_buyer ?? true);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [author, setAuthor] = useState(initial?.author ?? "");
  const [time, setTime] = useState(initial?.time ?? "");
  const [placement, setPlacement] = useState<ReviewPlacement>(
    initial?.placement ?? "homepage",
  );
  const [productId, setProductId] = useState(initial?.productId ?? "");
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [existingImageIds, setExistingImageIds] = useState<string[]>(
    initial?.imageFileIds ?? [],
  );

  const handleDrop = useCallback(
    (_dropFiles: File[], accepted: File[]) => {
      setNewFiles((prev) => [...prev, ...accepted].slice(0, 6));
    },
    [],
  );

  const removeNewFile = useCallback((index: number) => {
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const removeExisting = useCallback((id: string) => {
    setExistingImageIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const handleSubmit = useCallback(() => {
    onSubmit(
      {
        rating,
        verified_buyer: verified,
        title,
        body,
        author,
        time,
        placement,
        productId: placement === "product" ? productId : undefined,
        imageFileIds: existingImageIds,
      },
      newFiles,
    );
  }, [
    rating,
    verified,
    title,
    body,
    author,
    time,
    placement,
    productId,
    existingImageIds,
    newFiles,
    onSubmit,
  ]);

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Dados da avaliação
        </Text>
        <FormLayout>
          <div>
            <Text as="p" variant="bodyMd">
              Nota
            </Text>
            <StarRatingPicker value={rating} onChange={setRating} />
          </div>
          <Checkbox
            label="Verified Buyer"
            checked={verified}
            onChange={setVerified}
          />
          <Select
            label="Onde exibir"
            options={[
              {
                label: "Página inicial (shop.metafields.custom.reviews)",
                value: "homepage",
              },
              { label: "Página de produto", value: "product" },
            ]}
            value={placement}
            onChange={(v) => setPlacement(v as ReviewPlacement)}
          />
          {placement === "product" ? (
            <Select
              label="Produto"
              options={[
                { label: "Selecione…", value: "" },
                ...products.map((p) => ({ label: p.title, value: p.id })),
              ]}
              value={productId}
              onChange={setProductId}
            />
          ) : null}
          <TextField label="Título" value={title} onChange={setTitle} autoComplete="off" />
          <TextField
            label="Texto"
            value={body}
            onChange={setBody}
            multiline={4}
            autoComplete="off"
          />
          <TextField label="Autor" value={author} onChange={setAuthor} autoComplete="name" />
          <TextField
            label="Horário (ex.: 23:34)"
            value={time}
            onChange={setTime}
            autoComplete="off"
          />
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd">
              Imagens (máx. 6)
            </Text>
            {existingImageIds.length > 0 ? (
              <InlineStack gap="200">
                {existingImageIds.map((id) => (
                  <BlockStack key={id} gap="100">
                    <Thumbnail
                      source={imageUrls[id] || ""}
                      alt="Imagem da avaliação"
                      size="large"
                    />
                    <Button size="slim" onClick={() => removeExisting(id)}>
                      Remover
                    </Button>
                  </BlockStack>
                ))}
              </InlineStack>
            ) : null}
            <DropZone accept="image/*" type="image" onDrop={handleDrop} allowMultiple>
              <DropZone.FileUpload actionHint="PNG, JPG até 6 imagens" />
            </DropZone>
            {newFiles.length > 0 ? (
              <InlineStack gap="200">
                {newFiles.map((file, index) => (
                  <div key={`${file.name}-${index}`}>
                    <Text as="span" variant="bodySm">
                      {file.name}
                    </Text>
                    <Button size="slim" onClick={() => removeNewFile(index)}>
                      Remover
                    </Button>
                  </div>
                ))}
              </InlineStack>
            ) : null}
          </BlockStack>
        </FormLayout>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary" onClick={handleSubmit}>
            {submitLabel}
          </Button>
          {onCancel ? <Button onClick={onCancel}>Cancelar</Button> : null}
        </div>
      </BlockStack>
    </Card>
  );
}
