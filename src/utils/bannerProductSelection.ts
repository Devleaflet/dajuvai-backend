type BannerProductSelection = {
  productSource?: string | null;
  selectedProducts?: Array<{ id: number }> | null;
};

export const normalizeManualBannerProductIds = (ids: unknown): number[] => {
  if (!Array.isArray(ids)) return [];
  return [
    ...new Set(
      ids
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
};

export const getManualBannerProductIds = (
  banner: BannerProductSelection,
): number[] | null => {
  if (banner.productSource !== "manual") return null;

  return normalizeManualBannerProductIds(
    (banner.selectedProducts ?? []).map((product) => product.id),
  );
};
