import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, Check, Loader2, LogOut, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { DashboardPreview } from "@/components/dashboard-preview";
import { FinalCta, ZeroHardware } from "@/components/sections";
import { Button, ButtonLink, Card, PageHero, SectionHeading, pageMeta } from "@/components/ui-kit";
import {
  retailerApiResponseSchema,
  type RetailerAccount,
  type RetailerOrder,
  type RetailerProduct,
  type RetailerUser,
} from "@/lib/retailer-contract";
import { inr } from "@/lib/demo-store";
import { validateRetailerSearch } from "@/lib/retailer-search";

export const Route = createFileRoute("/retailers")({
  head: () =>
    pageMeta(
      "QARTUNO for Retailers | Self-Checkout Without Kiosks",
      "Offer smartphone-based self-checkout in your supermarket without buying dedicated kiosks. Plans start at ₹1,999/month.",
    ),
  validateSearch: validateRetailerSearch,
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleRetailerPost } = await import("@/lib/retailer-api.server");
        return handleRetailerPost(request);
      },
    },
  },
  component: Page,
});

const NEEDS = [
  "A compatible POS or inventory system (confirmed during onboarding)",
  "Supported payment infrastructure",
  "Reliable in-store connectivity for shoppers",
  "A defined exit verification procedure",
  "Barcoded products in your catalogue",
];

function Page() {
  const { portal } = Route.useSearch();
  return portal ? <RetailerPortal /> : <RetailerMarketing />;
}

function RetailerMarketing() {
  return (
    <>
      <PageHero
        eyebrow="For retailers"
        title="Offer modern self-checkout without investing in dedicated checkout kiosks."
        intro="Built for independent grocery stores, supermarkets and chains looking to ease peak-hour queues and modernise the in-store experience."
      >
        <ButtonLink to="/contact">Book a Demo</ButtonLink>
        <ButtonLink to="/pricing" variant="outline">
          View Pricing
        </ButtonLink>
        <a
          href="/retailers?portal=1"
          className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-primary underline underline-offset-4"
        >
          Retailer portal
        </a>
      </PageHero>
      <section className="container-site py-20">
        <SectionHeading
          title="Retailer dashboard preview"
          intro="Proposed capabilities shown with sample demo data: daily sales, order and transaction summaries, inventory status, product management, store activity, reporting and configuration. Switch tabs to explore."
        />
        <div className="mt-10">
          <DashboardPreview />
        </div>
      </section>
      <ZeroHardware />
      <section className="container-site grid gap-10 py-20 lg:grid-cols-2">
        <SectionHeading
          title="What your store needs"
          intro="QARTUNO removes the need for checkout kiosks, not for sensible setup. Here's what we'll work through together."
        />
        <Card>
          <ul className="space-y-3">
            {NEEDS.map((n) => (
              <li key={n} className="flex gap-2.5 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                {n}
              </li>
            ))}
          </ul>
        </Card>
      </section>
      <FinalCta />
    </>
  );
}

type PortalAction = Record<string, unknown> & { action: string };

async function sendPortalAction(action: PortalAction) {
  const response = await fetch("/retailers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(action),
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The server returned an unreadable response.");
  }
  const result = retailerApiResponseSchema.safeParse(payload);
  if (!result.success) throw new Error("The server returned an unexpected response.");
  if (!response.ok || !result.data.ok) {
    throw new Error(result.data.error ?? "The request could not be completed.");
  }
  return result.data;
}

function RetailerPortal() {
  const [user, setUser] = useState<RetailerUser | null>(null);
  const [products, setProducts] = useState<RetailerProduct[]>([]);
  const [orders, setOrders] = useState<RetailerOrder[]>([]);
  const [orderCount, setOrderCount] = useState(0);
  const [verifiedSalesPaise, setVerifiedSalesPaise] = useState(0);
  const [retailers, setRetailers] = useState<RetailerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"overview" | "products" | "orders">("overview");
  const [editing, setEditing] = useState<RetailerProduct | null>(null);
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const loadData = async () => {
    const result = await sendPortalAction({ action: "load" });
    setUser(result.user ?? null);
    setProducts(result.products ?? []);
    setOrders(result.orders ?? []);
    setOrderCount(result.orderCount ?? 0);
    setVerifiedSalesPaise(result.verifiedSalesPaise ?? 0);
    setRetailers(result.retailers ?? []);
  };

  useEffect(() => {
    let active = true;
    sendPortalAction({ action: "load" })
      .then((result) => {
        if (!active) return;
        setUser(result.user ?? null);
        setProducts(result.products ?? []);
        setOrders(result.orders ?? []);
        setOrderCount(result.orderCount ?? 0);
        setVerifiedSalesPaise(result.verifiedSalesPaise ?? 0);
        setRetailers(result.retailers ?? []);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "The retailer portal could not load.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const perform = async (action: PortalAction, successMessage: string) => {
    setError("");
    setNotice("");
    try {
      await sendPortalAction(action);
      setNotice(successMessage);
      if (action.action === "logout" || action.action === "changePassword") {
        setUser(null);
        setProducts([]);
        setOrders([]);
        setOrderCount(0);
        setVerifiedSalesPaise(0);
        setRetailers([]);
        return true;
      }
      try {
        await loadData();
      } catch (reason) {
        setError(
          `Saved, but the portal could not refresh its data: ${reason instanceof Error ? reason.message : "unknown error"}`,
        );
      }
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The request could not be completed.");
      return false;
    }
  };

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setError("");
    setNotice("");
    try {
      const result = await sendPortalAction({
        action: "login",
        email: String(values["email"] ?? ""),
        password: String(values["password"] ?? ""),
      });
      form.reset();
      if (result.user) setUser(result.user);
      try {
        await loadData();
      } catch (reason) {
        setError(
          `Signed in, but the portal could not load its data: ${reason instanceof Error ? reason.message : "unknown error"}`,
        );
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed.");
    }
  };

  const createRetailer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const succeeded = await perform(
      {
        action: "createRetailer",
        storeName: String(values["storeName"] ?? ""),
        email: String(values["email"] ?? ""),
        password: String(values["password"] ?? ""),
      },
      "Retailer account created.",
    );
    if (succeeded) form.reset();
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const succeeded = await perform(
      {
        action: "changePassword",
        currentPassword: String(values["currentPassword"] ?? ""),
        newPassword: String(values["newPassword"] ?? ""),
      },
      "Password changed. Sign in again with the new password.",
    );
    if (succeeded) form.reset();
  };

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const succeeded = await perform(
      {
        action: "saveProduct",
        ...(editing ? { id: editing.id } : {}),
        name: String(values["name"] ?? ""),
        barcode: String(values["barcode"] ?? ""),
        category: String(values["category"] ?? ""),
        price: Number(values["price"]),
        stock: Number(values["stock"]),
        active: true,
      },
      editing ? "Product updated." : "Product added.",
    );
    if (succeeded) {
      setEditing(null);
      form.reset();
    }
  };

  const visibleProducts = lowStockOnly
    ? products.filter((product) => product.stock <= 10)
    : products;

  return (
    <section className="container-site min-h-[70vh] py-12">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">QARTUNO retailer portal</p>
          <h1 className="mt-1 text-3xl font-bold">
            {user ? (user.storeName ?? "Retailer administration") : "Sign in to your store"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Private retailer tools. Store data is scoped to your signed-in account.
          </p>
        </div>
        <a
          href="/retailers"
          className="text-sm font-medium text-primary underline underline-offset-4"
        >
          Back to retailer information
        </a>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mb-5 rounded-xl border border-success/40 bg-success/10 p-4 text-sm"
        >
          {notice}
        </div>
      )}

      {loading ? (
        <div role="status" className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading retailer portal…
        </div>
      ) : user ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
            <div>
              <p className="font-medium">{user.email}</p>
              <p className="text-xs text-muted-foreground">
                Role: {user.role === "admin" ? "Platform administrator" : "Store owner"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void perform({ action: "logout" }, "You have signed out.")}
            >
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
          <ChangePasswordPanel onChange={changePassword} />
          {user.mustChangePassword ? (
            <Card className="border-warning/50 bg-warning/5 p-5">
              <h2 className="font-semibold">Update your temporary password</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose a new password of at least 12 characters before managing this store.
              </p>
            </Card>
          ) : user.role === "admin" ? (
            <AdminRetailerPanel retailers={retailers} onCreate={createRetailer} />
          ) : (
            <OwnerDashboard
              products={products}
              orders={orders}
              orderCount={orderCount}
              verifiedSalesPaise={verifiedSalesPaise}
              tab={tab}
              setTab={setTab}
              editing={editing}
              setEditing={setEditing}
              lowStockOnly={lowStockOnly}
              setLowStockOnly={setLowStockOnly}
              visibleProducts={visibleProducts}
              onSaveProduct={saveProduct}
              onAction={perform}
            />
          )}
        </div>
      ) : (
        <Card className="mx-auto max-w-md p-6 md:p-8">
          <h2 className="text-xl font-semibold">Retailer sign in</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Accounts are created by a QARTUNO administrator. There is no public sign-up.
          </p>
          <form onSubmit={signIn} className="mt-6 space-y-4">
            <div>
              <label htmlFor="retailer-email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="retailer-email"
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={255}
                className="mt-1.5 w-full rounded-xl border bg-background px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="retailer-password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="retailer-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={200}
                className="mt-1.5 w-full rounded-xl border bg-background px-3.5 py-2.5 text-sm"
              />
            </div>
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
        </Card>
      )}
      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        Demo orders are labelled and do not represent payments. Real payment processing and
        payment-provider verification are not configured.
      </p>
    </section>
  );
}

function AdminRetailerPanel({
  retailers,
  onCreate,
}: {
  retailers: RetailerAccount[];
  onCreate: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Create retailer account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Share the temporary password with the store owner through a secure channel.
        </p>
        <form onSubmit={onCreate} className="mt-5 space-y-4">
          <Field label="Store name" name="storeName" required maxLength={120} />
          <Field label="Owner email" name="email" type="email" required maxLength={255} />
          <Field
            label="Temporary password (12+ characters)"
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={200}
            autoComplete="new-password"
          />
          <Button type="submit">
            <Plus className="size-4" /> Create account
          </Button>
        </form>
      </Card>
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Retailer accounts</h2>
        {retailers.length === 0 ? (
          <p className="mt-4 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            No retailer accounts have been created yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y">
            {retailers.map((retailer) => (
              <li key={retailer.id} className="py-3">
                <p className="font-medium">{retailer.storeName}</p>
                <p className="text-sm text-muted-foreground">
                  {retailer.email} · {retailer.productCount} products · {retailer.orderCount} orders
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ChangePasswordPanel({
  onChange,
}: {
  onChange: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <details className="rounded-xl border bg-card p-4">
      <summary className="cursor-pointer text-sm font-semibold">Change password</summary>
      <form onSubmit={onChange} className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field
          label="Current password"
          name="currentPassword"
          type="password"
          required
          maxLength={200}
          autoComplete="current-password"
        />
        <Field
          label="New password (12+ characters)"
          name="newPassword"
          type="password"
          required
          minLength={12}
          maxLength={200}
          autoComplete="new-password"
        />
        <div className="self-end">
          <Button type="submit" variant="outline">
            Update password
          </Button>
        </div>
      </form>
    </details>
  );
}

function OwnerDashboard({
  products,
  orders,
  orderCount,
  verifiedSalesPaise,
  tab,
  setTab,
  editing,
  setEditing,
  lowStockOnly,
  setLowStockOnly,
  visibleProducts,
  onSaveProduct,
  onAction,
}: {
  products: RetailerProduct[];
  orders: RetailerOrder[];
  orderCount: number;
  verifiedSalesPaise: number;
  tab: "overview" | "products" | "orders";
  setTab: (tab: "overview" | "products" | "orders") => void;
  editing: RetailerProduct | null;
  setEditing: (product: RetailerProduct | null) => void;
  lowStockOnly: boolean;
  setLowStockOnly: (value: boolean) => void;
  visibleProducts: RetailerProduct[];
  onSaveProduct: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onAction: (action: PortalAction, successMessage: string) => Promise<boolean>;
}) {
  const tabs = [
    ["overview", "Overview"],
    ["products", "Products & inventory"],
    ["orders", "Orders"],
  ] as const;

  return (
    <div>
      <nav aria-label="Retailer dashboard" className="flex flex-wrap gap-2 border-b pb-3">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Active products"
            value={String(products.filter((product) => product.active).length)}
          />
          <Metric
            label="Low / out of stock"
            value={String(products.filter((product) => product.stock <= 10).length)}
          />
          <Metric label="Order records" value={String(orderCount)} />
          <Metric
            label="Verified sales"
            value={inr(verifiedSalesPaise / 100)}
            footnote="Paid / verified records only"
          />
          <Card className="p-5 sm:col-span-2 lg:col-span-4">
            <h2 className="font-semibold">Recent order records</h2>
            {orders.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No orders recorded yet. Demo orders can be created from the product list.
              </p>
            ) : (
              <OrderList orders={orders.slice(0, 5)} />
            )}
          </Card>
        </div>
      )}

      {tab === "products" && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[320px_1fr]">
          <Card className="h-fit p-5">
            <h2 className="text-lg font-semibold">{editing ? "Edit product" : "Add a product"}</h2>
            <form key={editing?.id ?? "new"} onSubmit={onSaveProduct} className="mt-4 space-y-3">
              <Field
                label="Product name"
                name="name"
                defaultValue={editing?.name ?? ""}
                required
                maxLength={120}
              />
              <Field
                label="Barcode"
                name="barcode"
                defaultValue={editing?.barcode ?? ""}
                required
                minLength={4}
                maxLength={64}
              />
              <Field
                label="Category"
                name="category"
                defaultValue={editing?.category ?? ""}
                required
                maxLength={50}
              />
              <Field
                label="Price (₹)"
                name="price"
                type="number"
                defaultValue={editing ? String(editing.pricePaise / 100) : ""}
                required
                min="0"
                max="1000000"
                step="0.01"
              />
              <Field
                label="Stock quantity"
                name="stock"
                type="number"
                defaultValue={editing ? String(editing.stock) : "0"}
                required
                min="0"
                max="10000000"
                step="1"
              />
              <div className="flex gap-2">
                <Button type="submit">
                  {editing ? (
                    "Save changes"
                  ) : (
                    <>
                      <Plus className="size-4" /> Add product
                    </>
                  )}
                </Button>
                {editing && (
                  <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </Card>
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
              <h2 className="font-semibold">Inventory ({products.length})</h2>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={lowStockOnly}
                  onChange={(event) => setLowStockOnly(event.target.checked)}
                  className="accent-primary"
                />
                Low stock only (10 or fewer)
              </label>
            </div>
            {visibleProducts.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">
                {products.length === 0
                  ? "Add products to start managing your inventory."
                  : "No products match this stock filter."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-muted text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3">Product</th>
                      <th className="p-3">Barcode</th>
                      <th className="p-3">Price</th>
                      <th className="p-3">Stock</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visibleProducts.map((product) => (
                      <tr key={product.id}>
                        <td className="p-3">
                          <span className="font-medium">{product.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {product.category}
                          </span>
                        </td>
                        <td className="p-3">{product.barcode}</td>
                        <td className="p-3">{inr(product.pricePaise / 100)}</td>
                        <td
                          className={`p-3 ${product.stock <= 10 ? "font-medium text-warning" : ""}`}
                        >
                          {product.stock}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setEditing(product)}
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              <Pencil className="size-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={product.stock < 1 || !product.active}
                              onClick={() =>
                                void onAction(
                                  {
                                    action: "createDemoOrder",
                                    lines: [{ productId: product.id, quantity: 1 }],
                                  },
                                  "Demo order recorded. No payment was processed.",
                                )
                              }
                              className="text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Demo order
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Delete ${product.name} from this catalogue?`)) {
                                  void onAction(
                                    { action: "deleteProduct", id: product.id },
                                    "Product deleted.",
                                  );
                                }
                              }}
                              className="inline-flex items-center gap-1 text-destructive hover:underline"
                            >
                              <Trash2 className="size-3.5" />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "orders" && (
        <Card className="mt-5 overflow-hidden">
          <div className="border-b p-4">
            <h2 className="font-semibold">Orders ({orders.length})</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Demo orders are not payments and are excluded from verified sales.
            </p>
          </div>
          {orders.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No orders recorded yet.</p>
          ) : (
            <OrderList orders={orders} />
          )}
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value, footnote }: { label: string; value: string; footnote?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {footnote && <p className="mt-1 text-xs text-muted-foreground">{footnote}</p>}
    </Card>
  );
}

function OrderList({ orders }: { orders: RetailerOrder[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[540px] text-left text-sm">
        <thead className="bg-muted text-xs text-muted-foreground">
          <tr>
            <th className="p-3">Order</th>
            <th className="p-3">Created</th>
            <th className="p-3">Items</th>
            <th className="p-3">Total</th>
            <th className="p-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {orders.map((order) => (
            <tr key={order.id}>
              <td className="p-3 font-mono text-xs">{order.id.slice(0, 8)}</td>
              <td className="p-3">{new Date(order.createdAt).toLocaleString("en-IN")}</td>
              <td className="p-3">{order.itemCount}</td>
              <td className="p-3">{inr(order.totalPaise / 100)}</td>
              <td className="p-3">
                <span
                  className={`rounded-md px-2 py-1 text-xs ${order.state === "demo" ? "bg-warning/15 text-foreground" : "bg-success/15"}`}
                >
                  {order.state === "demo" ? "Demo — not paid" : order.state}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  ...inputProps
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: string;
  max?: string;
  step?: string;
  autoComplete?: string;
}) {
  const inputId = `retailer-${name}`;
  return (
    <div>
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        type={type}
        {...inputProps}
        className="mt-1.5 w-full rounded-xl border bg-background px-3.5 py-2.5 text-sm"
      />
    </div>
  );
}
