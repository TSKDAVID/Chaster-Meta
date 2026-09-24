import { NextRequest, NextResponse } from "next/server";
import {
  createCatalogItem,
  deleteCatalogItem,
  duplicateCatalogItem,
  listCatalogItems,
  updateCatalogItem,
} from "@/lib/catalog";
import type { CatalogAvailability, CatalogVariant } from "@/lib/types";

function isSafeMetaId(value: string) {
  return /^[0-9A-Za-z._-]{1,128}$/.test(value);
}

type CatalogBody = {
  page_id?: string;
  id?: string;
  name?: string;
  description?: string | null;
  price?: number | null;
  currency?: string | null;
  unit?: string | null;
  category?: string | null;
  image_url?: string | null;
  availability?: CatalogAvailability;
  tags?: string[];
  variants?: CatalogVariant[];
  stock_unlimited?: boolean;
  stock_qty?: number | null;
  active?: boolean;
  sort_order?: number;
  duplicate_of?: string;
};

export async function GET(request: NextRequest) {
  const pageId = request.nextUrl.searchParams.get("page_id")?.trim() ?? "";
  const includeInactive =
    request.nextUrl.searchParams.get("include_inactive") === "1";

  if (!pageId || !isSafeMetaId(pageId)) {
    return NextResponse.json({ error: "page_id required" }, { status: 400 });
  }

  try {
    const items = await listCatalogItems(pageId, { includeInactive });
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load catalog" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let body: CatalogBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pageId = body.page_id?.trim() ?? "";
  if (!pageId || !isSafeMetaId(pageId)) {
    return NextResponse.json({ error: "page_id required" }, { status: 400 });
  }

  try {
    if (body.duplicate_of?.trim()) {
      const item = await duplicateCatalogItem(body.duplicate_of.trim(), pageId);
      return NextResponse.json({ item });
    }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const item = await createCatalogItem({
      pageId,
      name: body.name,
      description: body.description,
      price: body.price,
      currency: body.currency,
      unit: body.unit,
      category: body.category,
      image_url: body.image_url,
      availability: body.availability,
      tags: body.tags,
      variants: body.variants,
      stock_unlimited: body.stock_unlimited,
      stock_qty: body.stock_qty,
      active: body.active,
    });
    return NextResponse.json({ item });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create item" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  let body: CatalogBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = body.id?.trim() ?? "";
  const pageId = body.page_id?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!pageId || !isSafeMetaId(pageId)) {
    return NextResponse.json({ error: "page_id required" }, { status: 400 });
  }

  try {
    const item = await updateCatalogItem({
      id,
      pageId,
      name: body.name,
      description: body.description,
      price: body.price,
      currency: body.currency,
      unit: body.unit,
      category: body.category,
      image_url: body.image_url,
      availability: body.availability,
      tags: body.tags,
      variants: body.variants,
      stock_unlimited: body.stock_unlimited,
      stock_qty: body.stock_qty,
      active: body.active,
      sort_order: body.sort_order,
    });
    return NextResponse.json({ item });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update item" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  const pageId = request.nextUrl.searchParams.get("page_id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!pageId || !isSafeMetaId(pageId)) {
    return NextResponse.json({ error: "page_id required" }, { status: 400 });
  }

  try {
    await deleteCatalogItem(id, pageId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete item" },
      { status: 500 },
    );
  }
}
