export function orderPlacedRecipients(customerId: number, vendorIds: number[]) {
  return {
    customerId,
    vendorIds: [...new Set(vendorIds)].sort((left, right) => left - right),
    notifyAdmins: true,
  };
}
