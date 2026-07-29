"use client";

import { useState } from "react";

import { Field, inputClass } from "@/components/admin/form-fields";
import { Alert, Badge, Button, Card, Spinner } from "@/components/ui";
import { apiDelete, apiPatch, apiPost } from "@/lib/api";
import type { listCategories } from "@/server/services/admin";

type Category = Awaited<ReturnType<typeof listCategories>>[number];

export function CategoryManager({
  categories,
  canManage,
  onChanged,
}: {
  categories: Category[];
  canManage: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);

    try {
      await action();
      await onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Handlingen feilet.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-fairway-900">Kategorier</h2>
          <p className="text-sm text-fairway-700">
            Kategoriene er seksjonene kundene ser i menyen, i den rekkefolgen de star her.
          </p>
        </div>

        {canManage && !creating ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            Ny kategori
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="mt-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      {creating ? (
        <div className="mt-3">
          <CategoryForm
            onSaved={async () => {
              await onChanged();
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      ) : null}

      <ul className="mt-3 space-y-2">
        {categories.length === 0 && !creating ? (
          <li className="text-sm text-fairway-600">
            Ingen kategorier enna. Opprett en for a kunne legge inn produkter.
          </li>
        ) : null}

        {categories.map((category) => (
          <li key={category.id}>
            {editingId === category.id ? (
              <CategoryForm
                category={category}
                onSaved={async () => {
                  await onChanged();
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <Card className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-fairway-900">{category.name}</p>
                    {category.isActive ? null : <Badge tone="neutral">Skjult</Badge>}
                  </div>
                  <p className="text-xs text-fairway-600">
                    {category.productCount === 1
                      ? "1 produkt"
                      : `${category.productCount} produkter`}
                    {category.description ? ` · ${category.description}` : ""}
                  </p>
                </div>

                {canManage ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditingId(category.id)}>
                      Endre
                    </Button>

                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === category.id}
                      onClick={() =>
                        run(category.id, () =>
                          apiPatch(`/api/admin/categories/${category.id}`, {
                            isActive: !category.isActive,
                          }),
                        )
                      }
                    >
                      {busyId === category.id ? <Spinner /> : null}
                      {category.isActive ? "Skjul i menyen" : "Vis i menyen"}
                    </Button>

                    {confirmDeleteId === category.id ? (
                      <>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busyId === category.id}
                          onClick={() =>
                            run(category.id, async () => {
                              await apiDelete(`/api/admin/categories/${category.id}`);
                              setConfirmDeleteId(null);
                            })
                          }
                        >
                          Bekreft sletting
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Avbryt
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setError(null);
                          setConfirmDeleteId(category.id);
                        }}
                      >
                        Slett
                      </Button>
                    )}
                  </div>
                ) : null}
              </Card>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CategoryForm({
  category,
  onSaved,
  onCancel,
}: {
  /** Utelates den, oppretter skjemaet en ny kategori. */
  category?: Category;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (name.trim().length < 2) {
      setError("Navnet ma ha minst to tegn.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (category) {
        await apiPatch(`/api/admin/categories/${category.id}`, {
          name: name.trim(),
          description: description.trim() || null,
          sortOrder: Number(sortOrder) || 0,
        });
      } else {
        // Uten rekkefolge legger serveren kategorien bakerst i menyen.
        await apiPost("/api/admin/categories", {
          name: name.trim(),
          description: description.trim() || null,
        });
      }

      await onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke lagre kategorien.");
      setSaving(false);
    }
  }

  return (
    <Card className="p-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <h3 className="font-bold text-fairway-900">
          {category ? `Endre ${category.name}` : "Ny kategori"}
        </h3>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Navn">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              placeholder="For eksempel: Varme drikker"
              className={inputClass}
            />
          </Field>

          {category ? (
            <Field label="Rekkefolge" hint="Lavest tall vises forst i kundemenyen.">
              <input
                type="number"
                min={0}
                max={1000}
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
                className={inputClass}
              />
            </Field>
          ) : null}
        </div>

        <Field label="Beskrivelse" hint="Valgfri linje under kategorinavnet i menyen.">
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={300}
            className={inputClass}
          />
        </Field>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? <Spinner /> : null}
            {category ? "Lagre endringer" : "Opprett kategori"}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
            Avbryt
          </Button>
        </div>
      </form>
    </Card>
  );
}
