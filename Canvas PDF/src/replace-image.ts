/** Make an image resource private to this occurrence before changing its pixels. */
export function replaceIsolatedImage(
  engine: any,
  handle: number,
  bgra: Uint8Array,
  width: number,
  height: number,
) {
  const M = engine.M,
    clip = M._FPDFPageObj_GetClipPath(handle);
  if (
    (clip && M._FPDFClipPath_CountPaths(clip) > 0) ||
    M._FPDFPageObj_HasTransparency(handle)
  )
    throw Error(
      "此圖片含裁切或透明合成；請保留原圖模式，或先另存整頁點陣化版本再編輯",
    );
  const index = engine.currentIndexOf(handle),
    matrix = M._malloc(24),
    fresh = M._FPDFPageObj_NewImageObj(engine.doc);
  let inserted = false;
  try {
    if (index < 0 || !fresh || !M._FPDFPageObj_GetMatrix(handle, matrix))
      throw Error("來源圖片矩陣無效");
    if (
      !engine.replaceImage(fresh, bgra, width, height) ||
      !M._FPDFPageObj_SetMatrix(fresh, matrix)
    )
      throw Error("圖片副本建立失敗");
    if (!M._FPDFPage_RemoveObject(engine.page, handle))
      throw Error("來源圖片無法替換");
    if (!M._FPDFPage_InsertObjectAtIndex(engine.page, fresh, index)) {
      M._FPDFPage_InsertObjectAtIndex(engine.page, handle, index);
      throw Error("圖片副本無法插回原圖層");
    }
    inserted = true;
    M._FPDFPageObj_Destroy(handle);
    engine._pageDirty = true;
  } finally {
    M._free(matrix);
    if (fresh && !inserted) M._FPDFPageObj_Destroy(fresh);
  }
}
