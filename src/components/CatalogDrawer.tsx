"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AVAILABILITY_OPTIONS,
  CATALOG_TAG_SUGGESTIONS,
  makeCatalogId,
} from "@/lib/catalog";
import DeskToolbar, { SaveStatus } from "@/components/DeskToolbar";
import HelpTip from "@/components/HelpTip";
import { useI18n } from "@/components/I18nProvider";
import type { TranslateFn } from "@/lib/i18n";
import { IconClose, IconImage, IconMore, IconSearch } from "@/components/icons";
import type {
  CatalogAvailability,
  CatalogItem,
  CatalogVariant,
} from "@/lib/types";

type Props = {
  open: boolean;
  onClose?: () => void;
  pageId: string;
  onError: (message: string | null) => void;
};

type DraftVariant = {
  key: string;
  name: string;
  price: string;
  unit: string;
};

type Draft = {
  name: string;
  description: string;
  price: string;
  currency: string;
  unit: string;
  category: string;
  image_url: string;
  availability: CatalogAvailability;
  tags: string[];
  variants: DraftVariant[];
  stock_unlimited: boolean;
  stock_qty: string;
  active: boolean;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  description: "",
  price: "",
  currency: "GEL",
  unit: "",
  category: "",
  image_url: "",
  availability: "in_stock",
  tags: [],
  variants: [],
  stock_unlimited: true,
  stock_qty: "",
  active: true,
};

function variantKey() {
  return makeCatalogId();
}

function itemToDraft(item: CatalogItem): Draft {
  return {
    name: item.name,
    description: item.description ?? "",
    price: item.price === null ? "" : String(item.price),
    currency: item.currency || "GEL",
    unit: item.unit ?? "",
    category: item.category ?? "",
    image_url: item.image_url ?? "",
    availability: item.availability,
    tags: [...item.tags],
    variants: item.variants.map((v) => ({
      key: v.id,
      name: v.name,
      price: v.price === null ? "" : String(v.price),
      unit: v.unit ?? "",
    })),
    stock_unlimited: item.stock_unlimited,
    stock_qty:
      item.stock_unlimited || item.stock_qty === null
        ? ""
        : String(item.stock_qty),
    active: item.active,
  };
}

function draftsEqual(a: Draft, b: Draft) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parsePrice(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseStockQty(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

function draftToVariants(draft: Draft): CatalogVariant[] {
  return draft.variants
    .filter((v) => v.name.trim())
    .map((v) => ({
      id: v.key,
      name: v.name.trim(),
      price: parsePrice(v.price),
      unit: v.unit.trim() || null,
    }));
}


const AVAIL_LABEL: Record<CatalogAvailability, string> = {
  in_stock: "catalog.inStock",
  seasonal: "catalog.seasonal",
  ask: "catalog.askFirst",
};
const AVAIL_HINT: Record<CatalogAvailability, string> = {
  in_stock: "catalog.inStockHint",
  seasonal: "catalog.seasonalHint",
  ask: "catalog.askFirstHint",
};

function moneyLabel(price: number | null, currency: string, unit: string | null | undefined, t: TranslateFn) {
  if (price === null) return t("catalog.priceOnRequest");
  const amount = Number.isInteger(price) ? String(price) : price.toFixed(2);
  const u = unit ? ` / ${unit}` : "";
  return `${amount} ${currency}${u}`;
}

function stockLabel(item: CatalogItem, t: TranslateFn) {
  if (item.stock_unlimited) return t("catalog.unlimited");
  const qty = item.stock_qty ?? 0;
  if (qty <= 0) return t("catalog.outOfStock");
  return t("catalog.nInStock", { n: qty });
}

function priceLabel(item: CatalogItem, t: TranslateFn) {
  if (item.variants.length > 0) {
    const priced = item.variants.map((v) => v.price).filter((p): p is number => p !== null);
    if (priced.length === 0) return t("catalog.variantsPriceOnRequest");
    const min = Math.min(...priced);
    const max = Math.max(...priced);
    if (min === max) return t("catalog.fromPrice", { price: moneyLabel(min, item.currency, null, t) });
    return `${moneyLabel(min, item.currency, null, t)}–${moneyLabel(max, item.currency, null, t)}`;
  }
  return moneyLabel(item.price, item.currency, item.unit, t);
}

export default function CatalogDrawer({ open, onClose, pageId, onError }: Props) {
  const { t } = useI18n();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [baseline, setBaseline] = useState<Draft>(EMPTY_DRAFT);
  const [query, setQuery] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.category?.toLowerCase().includes(q) ?? false) ||
        (i.description?.toLowerCase().includes(q) ?? false) ||
        i.tags.some((tag) => tag.includes(q)),
    );
  }, [items, query]);

  const editing = adding || Boolean(selected);
  const dirty = editing && !draftsEqual(draft, baseline);

  const load = useCallback(async () => {
    if (!pageId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/catalog?page_id=${encodeURIComponent(pageId)}&include_inactive=1`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load catalog");
      setItems(data.items ?? []);
      onError(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load catalog");
    } finally {
      setLoading(false);
    }
  }, [pageId, onError]);

  useEffect(() => {
    if (open && pageId) void load();
  }, [open, pageId, load]);

  // Never leave the editor pane empty when there is data to edit.
  useEffect(() => {
    if (loading || adding || selectedId) return;
    const first = items[0];
    if (!first) return;
    const next = itemToDraft(first);
    setSelectedId(first.id);
    setDraft(next);
    setBaseline(next);
  }, [loading, adding, selectedId, items]);

  useEffect(() => {
    if (!detailMenuOpen) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Element | null;
      if (t?.closest(".ch-menu-anchor")) return;
      setDetailMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDetailMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [detailMenuOpen]);

  useEffect(() => {
    if (!open || !onClose) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function beginAdd() {
    setAdding(true);
    setSelectedId(null);
    setDraft(EMPTY_DRAFT);
    setBaseline(EMPTY_DRAFT);
    setTagInput("");
    setDetailMenuOpen(false);
  }

  function selectItem(item: CatalogItem) {
    const next = itemToDraft(item);
    setAdding(false);
    setSelectedId(item.id);
    setDraft(next);
    setBaseline(next);
    setTagInput("");
    setDetailMenuOpen(false);
  }

  function addTag(raw: string) {
    const t = raw.trim().toLowerCase();
    if (!t) return;
    setDraft((d) =>
      d.tags.includes(t) || d.tags.length >= 16
        ? d
        : { ...d, tags: [...d.tags, t] },
    );
    setTagInput("");
  }

  function removeTag(tag: string) {
    setDraft((d) => ({ ...d, tags: d.tags.filter((t) => t !== tag) }));
  }

  async function uploadPhoto(file: File) {
    if (!pageId) return;
    setUploading(true);
    onError(null);
    try {
      const form = new FormData();
      form.set("page_id", pageId);
      form.set("file", file);
      const res = await fetch("/api/catalog/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setDraft((d) => ({ ...d, image_url: data.url as string }));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!pageId || !draft.name.trim()) return;
    if (draft.price.trim() && parsePrice(draft.price) === null) {
      onError(t("catalog.priceInvalid"));
      return;
    }
    for (const v of draft.variants) {
      if (v.price.trim() && parsePrice(v.price) === null) {
        onError(t("catalog.variantPriceInvalid", { name: v.name || t("bookings.unnamed") }));
        return;
      }
    }
    if (!draft.stock_unlimited) {
      const qty = parseStockQty(draft.stock_qty);
      if (qty === null) {
        onError(t("catalog.stockInvalid"));
        return;
      }
    }

    setSaving(true);
    onError(null);
    const payload = {
      page_id: pageId,
      name: draft.name,
      description: draft.description,
      price: parsePrice(draft.price),
      currency: draft.currency,
      unit: draft.unit,
      category: draft.category,
      image_url: draft.image_url || null,
      availability: draft.availability,
      tags: draft.tags,
      variants: draftToVariants(draft),
      stock_unlimited: draft.stock_unlimited,
      stock_qty: draft.stock_unlimited ? null : parseStockQty(draft.stock_qty),
      active: draft.active,
    };

    try {
      if (adding || !selectedId) {
        const res = await fetch("/api/catalog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to add item");
        const created = data.item as CatalogItem;
        const next = itemToDraft(created);
        setItems((prev) => [...prev, created]);
        setAdding(false);
        setSelectedId(created.id);
        setDraft(next);
        setBaseline(next);
        setSavedAt(Date.now());
      } else {
        const res = await fetch("/api/catalog", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, id: selectedId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to save item");
        const updated = data.item as CatalogItem;
        const next = itemToDraft(updated);
        setItems((prev) =>
          prev.map((i) => (i.id === updated.id ? updated : i)),
        );
        setDraft(next);
        setBaseline(next);
        setSavedAt(Date.now());
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function duplicateSelected() {
    if (!selectedId || !pageId) return;
    setSaving(true);
    onError(null);
    try {
      const res = await fetch("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: pageId, duplicate_of: selectedId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Duplicate failed");
      const created = data.item as CatalogItem;
      const next = itemToDraft(created);
      setItems((prev) => [...prev, created]);
      setAdding(false);
      setSelectedId(created.id);
      setDraft(next);
      setBaseline(next);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Duplicate failed");
    } finally {
      setSaving(false);
    }
  }

  async function removeSelected() {
    if (!selectedId || !pageId) return;
    if (!confirm(t("catalog.deleteConfirm"))) return;
    try {
      const res = await fetch(
        `/api/catalog?id=${encodeURIComponent(selectedId)}&page_id=${encodeURIComponent(pageId)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      setItems((prev) => prev.filter((i) => i.id !== selectedId));
      setSelectedId(null);
      setAdding(false);
      setDraft(EMPTY_DRAFT);
      setBaseline(EMPTY_DRAFT);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (!open) return null;

  const dirtyOrAdding = adding || dirty;

  function updateVariant(index: number, patch: Partial<DraftVariant>) {
    setDraft((d) => ({
      ...d,
      variants: d.variants.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }

  return (
    <div data-tour="catalog-drawer" className="ch-page" aria-labelledby="catalog-page-title">
      <DeskToolbar
        title={t("catalog.title")}
        titleId="catalog-page-title"
        onBack={onClose}
        end={
          <>
            <label className="ch-search">
              <IconSearch size={13} />
              <input
                placeholder={t("common.search")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={t("catalog.searchItems")}
              />
            </label>
            <button type="button" className="ch-btn ch-btn-primary h-8 px-3" onClick={beginAdd}>
              {t("catalog.addItem")}
            </button>
          </>
        }
      />

      <div className={`ch-split ch-split-catalog${editing ? " has-selection" : ""}`}>
        <section className="ch-split-list" aria-label={t("catalog.items")}>
          <div className="ch-rail-head">
            <h3 className="ch-rail-title">
              {loading
                ? t("catalog.items")
                : t("catalog.itemsCount", { n: filtered.length })}
            </h3>
          </div>
          {loading ? (
            <div className="ch-empty-line">{t("common.loading")}</div>
          ) : filtered.length === 0 ? (
            <div className="ch-empty-line">
              {query.trim() ? t("catalog.noMatches") : t("catalog.noItems")}
            </div>
          ) : (
            <ul className="ch-list">
              {filtered.map((item) => {
                const activeRow = item.id === selectedId && !adding;
                const meta = [
                  t(AVAIL_LABEL[item.availability]),
                  item.stock_unlimited ? null : stockLabel(item, t),
                  item.category,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`ch-list-row ch-catalog-row${activeRow ? " is-active" : ""}${!item.active ? " is-muted" : ""}`}
                      onClick={() => selectItem(item)}
                    >
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt="" className="ch-thumb" />
                      ) : (
                        <span className="ch-thumb is-initial" aria-hidden>
                          {item.name.trim().charAt(0).toUpperCase() || "?"}
                        </span>
                      )}
                      <span className="ch-catalog-row-text">
                        <span className="ch-list-title">{item.name}</span>
                        <span className="ch-list-meta">{meta}</span>
                      </span>
                      <span className="ch-list-trailing is-value tabular-nums">
                        {priceLabel(item, t)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="ch-split-detail" aria-label={t("catalog.itemEditor")}>
          {!editing ? (
            <div className="ch-empty-line">{t("catalog.selectToEdit")}</div>
          ) : (
            <>
              <div className="ch-detail-head">
                <div className="ch-detail-head-main">
                  {draft.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={draft.image_url} alt="" className="ch-thumb is-sm" />
                  ) : (
                    <span className="ch-thumb is-sm is-initial" aria-hidden>
                      {(draft.name.trim().charAt(0) || "?").toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <h3 className="ch-detail-title">
                      {adding ? t("catalog.newItem") : draft.name || t("catalog.item")}
                    </h3>
                    <div className="ch-detail-sub">{t("catalog.catalogItem")}</div>
                  </div>
                </div>
                <div className="ch-detail-actions">
                  <HelpTip tip="hints.catalogActive">
                    <label className="ch-switch">
                      <input
                        type="checkbox"
                        checked={draft.active}
                        disabled={saving}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, active: e.target.checked }))
                        }
                      />
                      <span className="ch-switch-track" aria-hidden />
                      <span>{t("catalog.active")}</span>
                    </label>
                  </HelpTip>
                  {!adding && selected ? (
                    <>
                      <button
                        type="button"
                        className="ch-btn ch-btn-text h-8 px-2"
                        disabled={saving}
                        onClick={() => void duplicateSelected()}
                      >
                        {t("catalog.duplicate")}
                      </button>
                      <div className="ch-menu-anchor">
                        <button
                          type="button"
                          className="ch-btn ch-btn-text h-8 w-8 px-0"
                          aria-label={t("common.more")}
                          aria-haspopup="menu"
                          aria-expanded={detailMenuOpen}
                          disabled={saving}
                          onClick={() => setDetailMenuOpen((v) => !v)}
                        >
                          <IconMore size={15} />
                        </button>
                        {detailMenuOpen ? (
                          <div className="ch-menu ch-menu-sm" role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              className="ch-menu-item is-danger"
                              onClick={() => {
                                setDetailMenuOpen(false);
                                void removeSelected();
                              }}
                            >
                              <span className="ch-menu-item-text">{t("common.delete")}</span>
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="ch-detail-scroll">
                <div className="ch-editor">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadPhoto(file);
                      e.target.value = "";
                    }}
                  />

                  <section className="ch-section">
                    <h4 className="ch-section-title">{t("catalog.basics")}</h4>
                    <div className="ch-catalog-identity">
                      <div className="ch-photo">
                        {draft.image_url ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={draft.image_url} alt="" className="ch-photo-img" />
                            <button
                              type="button"
                              className="ch-photo-clear"
                              aria-label={t("catalog.removePhoto")}
                              onClick={() => setDraft((d) => ({ ...d, image_url: "" }))}
                            >
                              <IconClose size={11} />
                            </button>
                            <button
                              type="button"
                              className="ch-photo-replace"
                              disabled={uploading}
                              onClick={() => fileRef.current?.click()}
                              aria-label={t("catalog.replacePhoto")}
                            >
                              {uploading ? t("catalog.uploading") : t("catalog.replace")}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="ch-photo-drop"
                            disabled={uploading}
                            onClick={() => fileRef.current?.click()}
                            aria-label={t("catalog.addPhoto")}
                            title={t("catalog.addPhoto")}
                          >
                            <IconImage size={16} />
                            <span>{uploading ? t("catalog.uploading") : t("catalog.photo")}</span>
                          </button>
                        )}
                      </div>
                      <div className="ch-catalog-identity-fields">
                        <label className="ch-field">
                          <span className="ch-label">{t("common.name")}</span>
                          <input
                            className="ch-input w-full px-2.5"
                            value={draft.name}
                            autoFocus={adding}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, name: e.target.value }))
                            }
                          />
                        </label>
                        <label className="ch-field">
                          <span className="ch-label">{t("catalog.description")}</span>
                          <textarea
                            className="ch-input w-full px-2.5"
                            rows={2}
                            value={draft.description}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, description: e.target.value }))
                            }
                          />
                        </label>
                      </div>
                    </div>
                  </section>

                  <section className="ch-section">
                    <h4 className="ch-section-title">{t("catalog.pricing")}</h4>
                    <div className="ch-grid-2">
                      <label className="ch-field">
                        <span className="ch-label">
                          {draft.variants.length > 0 ? t("catalog.basePrice") : t("catalog.price")}
                        </span>
                        <input
                          className="ch-input w-full px-2.5 tabular-nums"
                          inputMode="decimal"
                          value={draft.price}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, price: e.target.value }))
                          }
                          placeholder={t("catalog.onRequest")}
                        />
                      </label>
                      <label className="ch-field">
                        <span className="ch-label">{t("catalog.currency")}</span>
                        <input
                          className="ch-input w-full px-2.5"
                          value={draft.currency}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              currency: e.target.value.toUpperCase(),
                            }))
                          }
                        />
                      </label>
                    </div>
                    <div className="ch-grid-2">
                      <label className="ch-field">
                        <span className="ch-label">{t("catalog.unit")}</span>
                        <input
                          className="ch-input w-full px-2.5"
                          value={draft.unit}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, unit: e.target.value }))
                          }
                          placeholder={t("catalog.unitPlaceholder")}
                        />
                      </label>
                      <label className="ch-field">
                        <span className="ch-label">{t("catalog.category")}</span>
                        <input
                          className="ch-input w-full px-2.5"
                          value={draft.category}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, category: e.target.value }))
                          }
                        />
                      </label>
                    </div>
                  </section>

                  <section className="ch-section">
                    <h4 className="ch-section-title">{t("catalog.availability")}</h4>
                    <div className="ch-seg" role="radiogroup" aria-label={t("catalog.availability")}>
                      {AVAILABILITY_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          title={t(AVAIL_HINT[opt.id])}
                          className={`ch-seg-tab${draft.availability === opt.id ? " is-active" : ""}`}
                          aria-pressed={draft.availability === opt.id}
                          onClick={() =>
                            setDraft((d) => ({ ...d, availability: opt.id }))
                          }
                        >
                          {t(AVAIL_LABEL[opt.id])}
                        </button>
                      ))}
                    </div>
                    <div className="ch-toggle-row">
                      <HelpTip tip="hints.unlimitedStock">
                        <label className="ch-switch">
                          <input
                            type="checkbox"
                            checked={draft.stock_unlimited}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                stock_unlimited: e.target.checked,
                                stock_qty: e.target.checked ? "" : d.stock_qty || "0",
                              }))
                            }
                          />
                          <span className="ch-switch-track" aria-hidden />
                          <span>{t("catalog.unlimitedStock")}</span>
                        </label>
                      </HelpTip>
                      {!draft.stock_unlimited ? (
                        <label className="ch-field ch-field-inline">
                          <span className="ch-label">{t("catalog.onHand")}</span>
                          <input
                            className="ch-input w-24 px-2.5 tabular-nums"
                            inputMode="numeric"
                            value={draft.stock_qty}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, stock_qty: e.target.value }))
                            }
                          />
                        </label>
                      ) : null}
                    </div>
                  </section>

                  <section className="ch-section">
                    <div className="ch-section-head">
                      <h4 className="ch-section-title">{t("catalog.variants")}</h4>
                      <button
                        type="button"
                        className="ch-btn ch-btn-text h-7 px-2"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            variants: [
                              ...d.variants,
                              { key: variantKey(), name: "", price: "", unit: "" },
                            ],
                          }))
                        }
                      >
                        {t("catalog.addVariant")}
                      </button>
                    </div>
                    {draft.variants.length > 0 ? (
                      <ul className="ch-variants">
                        {draft.variants.map((v, index) => (
                          <li key={v.key} className="ch-variant-row">
                            <input
                              className="ch-input px-2.5"
                              placeholder={t("common.name")}
                              value={v.name}
                              onChange={(e) =>
                                updateVariant(index, { name: e.target.value })
                              }
                            />
                            <input
                              className="ch-input px-2.5 tabular-nums"
                              placeholder={t("catalog.price")}
                              inputMode="decimal"
                              value={v.price}
                              onChange={(e) =>
                                updateVariant(index, { price: e.target.value })
                              }
                            />
                            <input
                              className="ch-input px-2.5"
                              placeholder={t("catalog.unit")}
                              value={v.unit}
                              onChange={(e) =>
                                updateVariant(index, { unit: e.target.value })
                              }
                            />
                            <button
                              type="button"
                              className="ch-btn ch-btn-text h-8 w-8 px-0"
                              aria-label={t("catalog.removeVariant")}
                              onClick={() =>
                                setDraft((d) => ({
                                  ...d,
                                  variants: d.variants.filter((_, i) => i !== index),
                                }))
                              }
                            >
                              <IconClose size={12} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>

                  <section className="ch-section">
                    <h4 className="ch-section-title">{t("catalog.tags")}</h4>
                    <div className="ch-chips">
                      {draft.tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="ch-chip is-on"
                          onClick={() => removeTag(tag)}
                          title={t("catalog.removeTag")}
                        >
                          {tag}
                          <IconClose size={10} />
                        </button>
                      ))}
                      {CATALOG_TAG_SUGGESTIONS.filter((t) => !draft.tags.includes(t)).map(
                        (tag) => (
                          <button
                            key={tag}
                            type="button"
                            className="ch-chip"
                            onClick={() => addTag(tag)}
                          >
                            {tag}
                          </button>
                        ),
                      )}
                    </div>
                    <input
                      className="ch-input w-full px-2.5"
                      placeholder={t("catalog.newTag")}
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTag(tagInput);
                        }
                      }}
                    />
                  </section>
                </div>
              </div>

              <div className="ch-detail-foot">
                {!dirtyOrAdding && savedAt ? (
                  <SaveStatus
                    dirty={false}
                    saving={false}
                    savedAt={savedAt}
                    onSave={() => undefined}
                  />
                ) : null}
                <div className="ch-detail-foot-end">
                  {dirtyOrAdding ? (
                    <button
                      type="button"
                      className="ch-btn ch-btn-text h-8 px-2.5"
                      disabled={saving}
                      onClick={() => {
                        if (adding) {
                          setAdding(false);
                          setDraft(EMPTY_DRAFT);
                          setBaseline(EMPTY_DRAFT);
                          return;
                        }
                        setDraft(baseline);
                      }}
                    >
                      Cancel
                    </button>
                  ) : null}
                  {dirtyOrAdding || saving ? (
                    <SaveStatus
                      dirty={dirtyOrAdding}
                      saving={saving}
                      savedAt={savedAt}
                      onSave={() => void save()}
                      disabled={!draft.name.trim()}
                      label={adding ? t("catalog.addItem") : t("common.save")}
                    />
                  ) : null}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
