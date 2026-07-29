"use client";

import { useRef, useState } from "react";

import { CheckboxField, Field, inputClass } from "@/components/admin/form-fields";
import { Alert, Button, Card, Spinner } from "@/components/ui";
import { apiPatch, apiPost, apiUpload } from "@/lib/api";
import type { listCategories, listProductsForAdmin } from "@/server/services/admin";

type Product = Awaited<ReturnType<typeof listProductsForAdmin>>[number];
type Category = Awaited<ReturnType<typeof listCategories>>[number];

const ACCEPTED_IMAGES = "image/jpeg,image/png,image/webp,image/avif";

/** Godtar bade «149» og «149,50», siden komma er det norske desimaltegnet. */
function parseKroner(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function ProductForm({
  categories,
  product,
  defaultCategoryId,
  onSaved,
  onCancel,
}: {
  categories: Category[];
  /** Utelates den, oppretter skjemaet et nytt produkt. */
  product?: Product;
  defaultCategoryId?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [categoryId, setCategoryId] = useState(
    product?.category.id ?? defaultCategoryId ?? categories[0]?.id ?? "",
  );
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product ? String(product.price / 100) : "");
  const [prepMinutes, setPrepMinutes] = useState(String(product?.preparationMinutes ?? 10));
  const [allergens, setAllergens] = useState(product?.allergens.join(", ") ?? "");
  const [requiresAgeVerification, setRequiresAgeVerification] = useState(
    product?.requiresAgeVerification ?? false,
  );
  const [isAvailable, setIsAvailable] = useState(product?.isAvailable ?? true);
  const [imageUrl, setImageUrl] = useState<string | null>(product?.imageUrl ?? null);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Bildet lastes opp med en gang, sa det blir liggende i bota selv om skjemaet
  // avbrytes etterpa. Ubrukte filer koster lite og kan ryddes ved behov.
  async function uploadImage(file: File) {
    setUploading(true);
    setError(null);

    try {
      const result = await apiUpload<{ url: string }>(
        "/api/admin/uploads/product-image",
        file,
      );
      setImageUrl(result.url);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "Kunne ikke laste opp bildet.",
      );
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!categoryId) {
      setError("Velg hvilken kategori produktet horer til.");
      return;
    }
    if (name.trim().length < 2) {
      setError("Navnet ma ha minst to tegn.");
      return;
    }

    const priceKroner = parseKroner(price);
    if (priceKroner === null) {
      setError("Skriv inn prisen i kroner, for eksempel 149 eller 149,50.");
      return;
    }

    const preparationMinutes = Number(prepMinutes.trim());
    if (!prepMinutes.trim() || !Number.isInteger(preparationMinutes) || preparationMinutes < 0) {
      setError("Tilberedningstiden ma vaere et helt antall minutter.");
      return;
    }

    const payload = {
      categoryId,
      name: name.trim(),
      description: description.trim() || null,
      priceKroner,
      imageUrl,
      allergens: allergens
        .split(",")
        .map((allergen) => allergen.trim())
        .filter(Boolean),
      preparationMinutes,
      isAvailable,
      requiresAgeVerification,
    };

    setSaving(true);
    setError(null);

    try {
      if (product) {
        await apiPatch(`/api/admin/products/${product.id}`, payload);
      } else {
        await apiPost("/api/admin/products", payload);
      }
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke lagre produktet.");
      setSaving(false);
    }
  }

  return (
    <Card className="p-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <h3 className="font-bold text-fairway-900">
          {product ? `Endre ${product.name}` : "Nytt produkt"}
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kategori">
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className={inputClass}
            >
              {categories.length === 0 ? <option value="">Opprett en kategori forst</option> : null}
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.isActive ? "" : " (skjult)"}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Navn">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              className={inputClass}
            />
          </Field>

          <Field label="Pris i kroner">
            <input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              inputMode="decimal"
              placeholder="149"
              className={inputClass}
            />
          </Field>

          <Field label="Tilberedningstid i minutter">
            <input
              type="number"
              min={0}
              max={180}
              value={prepMinutes}
              onChange={(event) => setPrepMinutes(event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Beskrivelse" hint="Vises under navnet i kundemenyen.">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            maxLength={400}
            className={inputClass}
          />
        </Field>

        <Field label="Allergener" hint="Skill dem med komma, for eksempel: gluten, melk, egg.">
          <input
            value={allergens}
            onChange={(event) => setAllergens(event.target.value)}
            placeholder="gluten, melk"
            className={inputClass}
          />
        </Field>

        <div>
          <span className="text-sm font-semibold text-fairway-900">Bilde</span>
          <p className="mt-0.5 text-xs text-fairway-600">
            JPG, PNG, WEBP eller AVIF, maks 5 MB. Uten bilde viser menyen et symbol i stedet.
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt=""
                className="size-20 rounded-xl border border-fairway-100 object-cover"
              />
            ) : (
              <div className="flex size-20 items-center justify-center rounded-xl border border-dashed border-fairway-200 text-xs text-fairway-600">
                Ingen
              </div>
            )}

            <div className="space-y-2">
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPTED_IMAGES}
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadImage(file);
                }}
                className="block text-sm text-fairway-700 file:mr-3 file:rounded-lg file:border file:border-fairway-200 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-fairway-800"
              />

              {uploading ? (
                <p className="flex items-center gap-2 text-sm text-fairway-700">
                  <Spinner className="text-fairway-600" />
                  Laster opp bildet ...
                </p>
              ) : null}

              {imageUrl && !uploading ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => setImageUrl(null)}>
                  Fjern bilde
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-5">
          <CheckboxField
            label="Tilgjengelig for kundene"
            checked={isAvailable}
            onChange={setIsAvailable}
          />
          <CheckboxField
            label="Krever legitimasjon (18+)"
            checked={requiresAgeVerification}
            onChange={setRequiresAgeVerification}
          />
        </div>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="flex gap-2">
          <Button type="submit" disabled={saving || uploading || categories.length === 0}>
            {saving ? <Spinner /> : null}
            {product ? "Lagre endringer" : "Opprett produkt"}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Avbryt
          </Button>
        </div>
      </form>
    </Card>
  );
}
