export function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeInvoiceItems(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const quantity = safeNumber(item?.quantity ?? item?.qty);
    const unitPrice = safeNumber(
      item?.unitPrice ?? item?.rate ?? item?.unit_price ?? item?.unitCost,
    );
    const amount = safeNumber(
      item?.amount ?? item?.total,
      quantity * unitPrice,
    );
    return {
      ...item,
      id: item?.id ?? index,
      description:
        item?.description || item?.name || item?.material || `Item ${index + 1}`,
      quantity,
      unitPrice,
      amount,
    };
  });
}

export function resolveOfferItems(baseItems, offeredItems, targetTotal) {
  const base = normalizeInvoiceItems(baseItems);
  const offered = normalizeInvoiceItems(offeredItems);
  const target = safeNumber(targetTotal, NaN);
  if (offered.length > 0) {
    return base.map((item, index) => {
      const offer = offered.find((candidate) => candidate.id === item.id) || offered[index] || item;
      return {
        ...item,
        ...offer,
        originalPrice: item.amount,
        newUnitPrice: offer.unitPrice,
        newTotal: offer.amount,
      };
    });
  }

  const baseTotal = base.reduce((sum, item) => sum + item.amount, 0);
  const ratio = Number.isFinite(target) && baseTotal > 0 ? target / baseTotal : 1;
  const resolved = base.map((item) => {
    const newUnitPrice = item.unitPrice * ratio;
    return {
      ...item,
      originalPrice: item.amount,
      newUnitPrice,
      newTotal: item.quantity * newUnitPrice,
    };
  });
  if (Number.isFinite(target) && resolved.length > 0) {
    const difference = target - resolved.reduce((sum, item) => sum + item.newTotal, 0);
    const last = resolved[resolved.length - 1];
    const newTotal = last.newTotal + difference;
    resolved[resolved.length - 1] = {
      ...last,
      newTotal,
      newUnitPrice: last.quantity ? newTotal / last.quantity : last.newUnitPrice,
    };
  }
  return resolved;
}
