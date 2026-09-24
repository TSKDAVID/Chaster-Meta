import { NextRequest, NextResponse } from "next/server";
import { uploadCatalogImage } from "@/lib/catalog";

function isSafeMetaId(value: string) {
  return /^[0-9A-Za-z._-]{1,128}$/.test(value);
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const pageId = String(form.get("page_id") ?? "").trim();
  const file = form.get("file");

  if (!pageId || !isSafeMetaId(pageId)) {
    return NextResponse.json({ error: "page_id required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  try {
    const bytes = await file.arrayBuffer();
    const url = await uploadCatalogImage({
      pageId,
      bytes,
      contentType: file.type || "image/jpeg",
      fileName: file.name || "photo.jpg",
    });
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}
