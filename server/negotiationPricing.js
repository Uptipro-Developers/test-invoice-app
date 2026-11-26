function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function baseItem(item, index) {
  const quantity = finiteNumber(item?.quantity ?? item?.qty);
  const unitPrice = finiteNumber(
    item?.unitPrice ?? item?.rate ?? item?.unit_price ?? item?.unitCost,
  );
  const amount = finiteNumber(
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
    rate: unitPrice,
    amount,
    total: amount,
  };
}

/**
 * Resolve an offer into a complete item snapshot.
 *
 * New SabiQuote offers carry explicit items. Older offers and BuildOS buyer
 * counters only carry a total, so their line values are scaled proportionally
 * from the invoice. The final line absorbs floating-point drift, guaranteeing
 * that the displayed lines add up to the negotiated total.
 */
export function resolveNegotiatedItems(baseItems, offeredItems, targetTotal) {
  const base = (Array.isArray(baseItems) ? baseItems : []).map(baseItem);
  const offered = Array.isArray(offeredItems) ? offeredItems : [];
  const target = finiteNumber(targetTotal, NaN);

  let resolved;
  if (offered.length > 0) {
    resolved = base.map((item, index) => {
      const offer = offered.find((candidate) => candidate?.id === item.id) || offered[index] || {};
      const quantity = finiteNumber(offer.quantity ?? offer.qty, item.quantity);
      const unitPrice = finiteNumber(
        offer.unitPrice ?? offer.rate ?? offer.unit_price ?? offer.unitCost,
        item.unitPrice,
      );
      const amount = finiteNumber(offer.amount ?? offer.total, quantity * unitPrice);
      return {
        ...item,
        ...offer,
        quantity,
        unitPrice,
        rate: unitPrice,
        amount,
        total: amount,
      };
    });
  } else {
    const baseTotal = base.reduce((sum, item) => sum + item.amount, 0);
    const ratio = Number.isFinite(target) && baseTotal > 0 ? target / baseTotal : 1;
    resolved = base.map((item) => {
      const unitPrice = item.unitPrice * ratio;
      const amount = item.quantity * unitPrice;
      return { ...item, unitPrice, rate: unitPrice, amount, total: amount };
    });
  }

  if (Number.isFinite(target) && resolved.length > 0) {
    const sum = resolved.reduce((total, item) => total + item.amount, 0);
    const difference = target - sum;
    if (Math.abs(difference) > 0.000001) {
      const index = resolved.length - 1;
      const last = resolved[index];
      const amount = last.amount + difference;
      const unitPrice = last.quantity ? amount / last.quantity : last.unitPrice;
      resolved[index] = { ...last, unitPrice, rate: unitPrice, amount, total: amount };
    }
  }

  return resolved;
}

export function applyAgreedPricing(invoice, offeredItems, agreedTotal) {
  const total = finiteNumber(agreedTotal);
  const payload = invoice?.payload && typeof invoice.payload === "object"
    ? invoice.payload
    : {};
  const items = resolveNegotiatedItems(payload.items, offeredItems, total);
  return {
    ...payload,
    originalItems: Array.isArray(payload.originalItems)
      ? payload.originalItems
      : payload.items,
    items,
    total,
    negotiatedTotal: total,
    negotiationStatus: "accepted",
  };
}
