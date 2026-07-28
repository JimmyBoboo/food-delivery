"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Alert, Badge, Button, Card, Spinner } from "@/components/ui";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import type { listCategories, listProductsForAdmin } from "@/server/services/admin";

type Product = Awaited<ReturnType<typeof listProductsForAdmin>>[number];
type Category = Awaited<ReturnType<typeof listCategories>>[number];

export function ProductsAdmin({
  initialProducts,
  categories,
  role,
}: {
  initialProducts: Product[];
  categories: Category[];
  role: string;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");

  const canEditPrices = role === "ADMIN" || role === "MANAGER";

  const { data: products = initialProducts } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const result = await apiGet<{ products: Product[] }>("/api/admin/products");
      return result.products;
    },
    initialData: initialProducts,
  });

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Handlingen feilet.");
    } finally {
      setBusyId(null);
    }
  }

  const byCategory = categories
    .map((category) => ({
      category,
      products: products.filter((product) => product.category.id === category.id),
    }))
    .filter((group) => group.products.length > 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-5">
      <header>
        <h1 className="text-2xl font-bold text-fairway-900">Produkter</h1>
        <p className="text-sm text-fairway-700">
          Marker varer som utsolgt nar de tar slutt. Kundene ser endringen med en gang.
        </p>
      </header>

      {error ? (
        <div className="mt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <div className="mt-5 space-y-6">
        {byCategory.map(({ category, products: categoryProducts }) => (
          <section key={category.id}>
            <h2 className="mb-2 text-sm font-bold tracking-wide text-fairway-700 uppercase">
              {category.name}
            </h2>

            <div className="space-y-2">
              {categoryProducts.map((product) => (
                <Card key={product.id} className="flex flex-wrap items-center gap-3 p-3">
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

                  {editingId === product.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        step="0.5"
                        value={priceDraft}
                        onChange={(event) => setPriceDraft(event.target.value)}
                        className="w-24 rounded-xl border border-fairway-200 px-3 py-2 text-sm"
                        aria-label="Ny pris i kroner"
                      />
                      <Button
                        size="sm"
                        disabled={busyId === product.id}
                        onClick={() =>
                          run(product.id, async () => {
                            await apiPatch(`/api/admin/products/${product.id}`, {
                              priceKroner: Number(priceDraft),
                            });
                            setEditingId(null);
                          })
                        }
                      >
                        Lagre
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Avbryt
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!canEditPrices}
                      onClick={() => {
                        setEditingId(product.id);
                        setPriceDraft(String(product.price / 100));
                      }}
                      className="rounded-lg px-2 py-1 font-semibold text-fairway-800 enabled:hover:bg-fairway-50"
                    >
                      {formatAmount(product.price)}
                    </button>
                  )}

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
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
