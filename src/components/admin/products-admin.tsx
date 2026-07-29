"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { CategoryManager } from "@/components/admin/category-manager";
import { ProductForm } from "@/components/admin/product-form";
import { Alert, Badge, Button, Card, Spinner } from "@/components/ui";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import type { listCategories, listProductsForAdmin } from "@/server/services/admin";

type Product = Awaited<ReturnType<typeof listProductsForAdmin>>[number];
type Category = Awaited<ReturnType<typeof listCategories>>[number];
type AdminMenu = { products: Product[]; categories: Category[] };

export function ProductsAdmin({
  initialProducts,
  initialCategories,
  role,
}: {
  initialProducts: Product[];
  initialCategories: Category[];
  role: string;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [creatingInCategory, setCreatingInCategory] = useState<string | null>(null);

  const canManage = role === "ADMIN" || role === "MANAGER";

  const { data } = useQuery({
    queryKey: ["admin-products"],
    queryFn: () => apiGet<AdminMenu>("/api/admin/products"),
    initialData: { products: initialProducts, categories: initialCategories },
  });

  function refresh() {
    return queryClient.invalidateQueries({ queryKey: ["admin-products"] });
  }

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);

    try {
      await action();
      await refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Handlingen feilet.");
    } finally {
      setBusyId(null);
    }
  }

  const byCategory = data.categories.map((category) => ({
    category,
    products: data.products.filter((product) => product.category.id === category.id),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-5">
      <header>
        <h1 className="text-2xl font-bold text-fairway-900">Meny</h1>
        <p className="text-sm text-fairway-700">
          Legg inn egne kategorier, produkter og bilder. Kundene ser endringene med en gang.
        </p>
      </header>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <CategoryManager
        categories={data.categories}
        canManage={canManage}
        onChanged={refresh}
      />

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-fairway-900">Produkter</h2>
            <p className="text-sm text-fairway-700">
              Marker varer som utsolgt nar de tar slutt, uten a slette dem.
            </p>
          </div>

          {canManage && creatingInCategory === null ? (
            <Button
              size="sm"
              disabled={data.categories.length === 0}
              onClick={() => setCreatingInCategory("")}
            >
              Nytt produkt
            </Button>
          ) : null}
        </div>

        {data.categories.length === 0 ? (
          <div className="mt-3">
            <Alert tone="info">Opprett en kategori forst, sa kan du legge produkter i den.</Alert>
          </div>
        ) : null}

        {creatingInCategory !== null ? (
          <div className="mt-3">
            <ProductForm
              // Bytter den ansatte kategori mens skjemaet star apent, skal
              // feltene starte pa nytt med den nye kategorien valgt.
              key={creatingInCategory}
              categories={data.categories}
              defaultCategoryId={creatingInCategory || undefined}
              onSaved={async () => {
                await refresh();
                setCreatingInCategory(null);
              }}
              onCancel={() => setCreatingInCategory(null)}
            />
          </div>
        ) : null}

        <div className="mt-4 space-y-6">
          {byCategory.map(({ category, products }) => (
            <div key={category.id}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-wide text-fairway-700 uppercase">
                  {category.name}
                </h3>
                {category.isActive ? null : <Badge tone="neutral">Skjult</Badge>}
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setCreatingInCategory(category.id)}
                    className="text-sm font-medium text-fairway-600 hover:underline"
                  >
                    + Legg til vare
                  </button>
                ) : null}
              </div>

              {products.length === 0 ? (
                <p className="text-sm text-fairway-600">Ingen varer i denne kategorien enna.</p>
              ) : null}

              <div className="space-y-2">
                {products.map((product) =>
                  editingId === product.id ? (
                    <ProductForm
                      key={product.id}
                      categories={data.categories}
                      product={product}
                      onSaved={async () => {
                        await refresh();
                        setEditingId(null);
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <Card key={product.id} className="flex flex-wrap items-center gap-3 p-3">
                      {product.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.imageUrl}
                          alt=""
                          className="size-12 shrink-0 rounded-lg object-cover"
                          loading="lazy"
                        />
                      ) : null}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-fairway-900">{product.name}</p>
                          {product.isAvailable ? null : <Badge tone="danger">Utsolgt</Badge>}
                          {product.requiresAgeVerification ? (
                            <Badge tone="warning">18+</Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-fairway-600">
                          {product.preparationMinutes} min
                          {product.allergens.length > 0
                            ? ` · ${product.allergens.join(", ")}`
                            : ""}
                        </p>
                      </div>

                      <span className="font-semibold text-fairway-800">
                        {formatAmount(product.price)}
                      </span>

                      {canManage ? (
                        <Button size="sm" variant="secondary" onClick={() => setEditingId(product.id)}>
                          Endre
                        </Button>
                      ) : null}

                      <Button
                        size="sm"
                        variant={product.isAvailable ? "secondary" : "primary"}
                        disabled={busyId === product.id}
                        onClick={() =>
                          run(product.id, () =>
                            apiPost(`/api/admin/products/${product.id}/availability`, {
                              isAvailable: !product.isAvailable,
                            }),
                          )
                        }
                      >
                        {busyId === product.id ? <Spinner /> : null}
                        {product.isAvailable ? "Marker utsolgt" : "Gjor tilgjengelig"}
                      </Button>

                      {canManage ? (
                        confirmDeleteId === product.id ? (
                          <>
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={busyId === product.id}
                              onClick={() =>
                                run(product.id, async () => {
                                  await apiDelete(`/api/admin/products/${product.id}`);
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
                            <p className="w-full text-xs text-fairway-600">
                              Varer som finnes i tidligere bestillinger blir skjult i stedet for
                              slettet, slik at historikken beholdes.
                            </p>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setError(null);
                              setConfirmDeleteId(product.id);
                            }}
                          >
                            Slett
                          </Button>
                        )
                      ) : null}
                    </Card>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
