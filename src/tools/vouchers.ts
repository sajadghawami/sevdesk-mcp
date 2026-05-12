/**
 * Voucher Tools
 * MCP tools for managing sevdesk vouchers (expenses/receipts)
 */

import { z } from "zod";
import { sevdeskFetch, sevdeskPost, sevdeskPut, sevdeskDelete, sevdeskUploadFile, buildQueryString, SevdeskApiResponse, SevdeskSingleResponse, extractSingleObject, VoucherFileUploadResponse } from "../api.js";
import type { Voucher, VoucherPos } from "../types.js";

/**
 * List vouchers schema
 */
export const listVouchersSchema = {
  limit: z.number().optional().describe("Maximum number of vouchers to return (default: 100)"),
  offset: z.number().optional().describe("Number of vouchers to skip for pagination"),
  depth: z.number().optional().describe("Depth of nested objects (0 = flat, 1 = includes related objects)"),
  status: z.string().optional().describe("Filter by voucher status (50=draft, 100=unpaid, 1000=paid)"),
  creditDebit: z.string().optional().describe("Filter by type: 'C' for credit/expense (you bought something), 'D' for debit/revenue (you sold something)"),
  startDate: z.string().optional().describe("Filter vouchers from this date (YYYY-MM-DD)"),
  endDate: z.string().optional().describe("Filter vouchers until this date (YYYY-MM-DD)"),
  supplierId: z.string().optional().describe("Filter by supplier contact ID"),
};

/**
 * Get voucher schema
 */
export const getVoucherSchema = {
  id: z.string().describe("The sevdesk voucher ID"),
};

/**
 * List all vouchers
 */
export async function listVouchers(params: {
  limit?: number;
  offset?: number;
  depth?: number;
  status?: string;
  creditDebit?: string;
  startDate?: string;
  endDate?: string;
  supplierId?: string;
}): Promise<Voucher[]> {
  const queryParams: Record<string, string | number | undefined> = {
    limit: params.limit ?? 100,
    offset: params.offset,
    depth: params.depth ?? 0,
  };

  if (params.status) {
    queryParams["status"] = params.status;
  }
  if (params.creditDebit) {
    queryParams["creditDebit"] = params.creditDebit;
  }
  if (params.startDate) {
    queryParams["startDate"] = params.startDate;
  }
  if (params.endDate) {
    queryParams["endDate"] = params.endDate;
  }
  if (params.supplierId) {
    queryParams["supplier[id]"] = params.supplierId;
    queryParams["supplier[objectName]"] = "Contact";
  }

  const queryString = buildQueryString(queryParams);

  const response = await sevdeskFetch<SevdeskApiResponse<Voucher>>(
    `/Voucher${queryString}`
  );

  return response.objects;
}

/**
 * Get a single voucher by ID
 */
export async function getVoucher(params: { id: string }): Promise<Voucher> {
  const response = await sevdeskFetch<SevdeskSingleResponse<Voucher>>(
    `/Voucher/${params.id}`
  );

  return extractSingleObject(response);
}

/**
 * Get voucher status label
 */
function getStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    "50": "Draft",
    "100": "Unpaid",
    "1000": "Paid",
  };
  return statusMap[status] || `Unknown (${status})`;
}

/**
 * Get credit/debit label
 */
function getCreditDebitLabel(creditDebit: string): string {
  return creditDebit === "C" ? "Credit (Expense)" : "Debit (Revenue)";
}

/**
 * Format voucher for display
 */
export function formatVoucher(voucher: Voucher): string {
  const lines: string[] = [
    `ID: ${voucher.id}`,
    `Type: ${getCreditDebitLabel(voucher.creditDebit)}`,
    `Voucher Type: ${voucher.voucherType}`,
    `Status: ${getStatusLabel(voucher.status)}`,
    `Voucher Date: ${voucher.voucherDate}`,
    `Currency: ${voucher.currency}`,
    `Sum Net: ${voucher.sumNet}`,
    `Sum Tax: ${voucher.sumTax}`,
    `Sum Gross: ${voucher.sumGross}`,
  ];

  if (voucher.supplierName) {
    lines.push(`Supplier: ${voucher.supplierName}`);
  } else if (voucher.supplier) {
    lines.push(`Supplier ID: ${voucher.supplier.id}`);
  }
  if (voucher.description) {
    lines.push(`Description: ${voucher.description}`);
  }
  if (voucher.payDate) {
    lines.push(`Pay Date: ${voucher.payDate}`);
  }
  if (voucher.paidAmount !== null) {
    lines.push(`Paid Amount: ${voucher.paidAmount}`);
  }
  if (voucher.deliveryDate) {
    lines.push(`Delivery Date: ${voucher.deliveryDate}`);
  }
  if (voucher.taxType) {
    lines.push(`Tax Type: ${voucher.taxType}`);
  }
  lines.push(`Created: ${voucher.create}`);
  lines.push(`Updated: ${voucher.update}`);

  return lines.join("\n");
}

/**
 * Format vouchers list for display
 */
export function formatVouchersList(vouchers: Voucher[]): string {
  if (vouchers.length === 0) {
    return "No vouchers found.";
  }

  const lines: string[] = [`Found ${vouchers.length} voucher(s):\n`];

  for (const voucher of vouchers) {
    const status = getStatusLabel(voucher.status);
    const type = voucher.creditDebit === "C" ? "CR" : "DR";
    const supplier = voucher.supplierName || "Unknown";
    lines.push(
      `- [${voucher.id}] ${type} | ${voucher.voucherDate} | ${voucher.sumGross} ${voucher.currency} | ${supplier} | ${status}`
    );
  }

  return lines.join("\n");
}

// ============================================================================
// Create/Update/Delete Operations
// ============================================================================

/**
 * Voucher position schema for creating vouchers
 */
const voucherPositionSchema = z.object({
  sum: z.number().describe("Position amount"),
  taxRate: z.number().describe("Tax rate percentage (e.g., 19)"),
  accountingTypeId: z.number().describe("Accounting type ID (expense category)"),
  net: z.boolean().optional().describe("Whether sum is net (true) or gross (false)"),
  comment: z.string().optional().describe("Position comment"),
  isAsset: z.boolean().optional().describe("Whether this is an asset"),
});

/**
 * Upload voucher file schema
 */
export const uploadVoucherFileSchema = {
  fileContent: z.string().describe("Base64-encoded file content (PDF, JPG, PNG)"),
  fileName: z.string().describe("Original filename with extension (e.g., receipt.pdf, invoice.jpg)"),
};

/**
 * Create voucher schema (uses factory endpoint)
 */
export const createVoucherSchema = {
  voucherDate: z.string().describe("Voucher date (YYYY-MM-DD)"),
  creditDebit: z.string().describe("Type: 'C' for credit/expense (you bought something), 'D' for debit/revenue (you sold something)"),
  positions: z.array(voucherPositionSchema).describe("Voucher line items"),
  supplierId: z.string().optional().describe("Supplier contact ID"),
  description: z.string().optional().describe("Voucher description"),
  paymentDeadline: z.string().optional().describe("Payment deadline (YYYY-MM-DD)"),
  currency: z.string().optional().describe("Currency code (default: EUR)"),
  taxType: z.string().optional().describe("Tax type: default, eu, noteu, custom, ss (v1.0 — use taxRule for v2.0 accounts)"),
  taxRule: z.number().optional().describe("Tax rule for v2.0 accounts: 1=taxable (default for Regelbesteuerer), 2=EU intra-community, 3=reverse charge §13b, 11=Kleinunternehmer §19, 17=not taxable inland"),
  voucherType: z.string().optional().describe("Voucher type: VOU (voucher), TA (travel expense)"),
  filename: z.string().optional().describe("Filename from upload_voucher_file to attach document"),
  costCentreId: z.string().optional().describe("Cost centre ID to assign voucher to a specific location (e.g. restaurant branch)"),
};

/**
 * Update voucher schema
 */
export const updateVoucherSchema = {
  id: z.string().describe("The sevdesk voucher ID to update"),
  description: z.string().optional().describe("Voucher description"),
  paymentDeadline: z.string().optional().describe("Payment deadline (YYYY-MM-DD)"),
  deliveryDate: z.string().optional().describe("Delivery date (YYYY-MM-DD)"),
  costCentreId: z.string().optional().describe("Cost centre ID to assign voucher to a specific location (e.g. restaurant branch)"),
};

/**
 * Delete voucher schema
 */
export const deleteVoucherSchema = {
  id: z.string().describe("The sevdesk voucher ID to delete"),
};

/**
 * Book voucher payment schema
 */
export const bookVoucherPaymentSchema = {
  id: z.string().describe("The sevdesk voucher ID"),
  amount: z.number().describe("Payment amount"),
  date: z.string().optional().describe("Payment date (YYYY-MM-DD)"),
  checkAccountId: z.string().optional().describe("Bank account ID for the payment"),
  checkAccountTransactionId: z.string().optional().describe("Link to existing bank transaction"),
  type: z.string().optional().describe("Payment type: N (normal)"),
};

/**
 * Enshrine voucher schema
 */
export const enshrineVoucherSchema = {
  id: z.string().describe("The sevdesk voucher ID to enshrine (finalize)"),
};

/**
 * List voucher positions schema
 */
export const listVoucherPositionsSchema = {
  voucherId: z.string().describe("The voucher ID to get positions for"),
  limit: z.number().optional().describe("Maximum number of positions to return"),
  offset: z.number().optional().describe("Number of positions to skip for pagination"),
};

/**
 * Get voucher position schema
 */
export const getVoucherPositionSchema = {
  id: z.string().describe("The voucher position ID"),
};

/**
 * Create voucher position schema
 */
export const createVoucherPositionSchema = {
  voucherId: z.string().describe("The voucher ID to add position to"),
  sum: z.number().describe("Position amount"),
  taxRate: z.number().describe("Tax rate percentage"),
  accountingTypeId: z.number().describe("Accounting type ID"),
  net: z.boolean().optional().describe("Whether sum is net"),
  comment: z.string().optional().describe("Position comment"),
  isAsset: z.boolean().optional().describe("Whether this is an asset"),
};

/**
 * Update voucher position schema
 */
export const updateVoucherPositionSchema = {
  id: z.string().describe("The voucher position ID to update"),
  sum: z.number().optional().describe("Position amount"),
  taxRate: z.number().optional().describe("Tax rate percentage"),
  comment: z.string().optional().describe("Position comment"),
};

/**
 * Delete voucher position schema
 */
export const deleteVoucherPositionSchema = {
  id: z.string().describe("The voucher position ID to delete"),
};

/**
 * Upload a file to attach to a voucher
 */
export async function uploadVoucherFile(params: {
  fileContent: string;
  fileName: string;
}): Promise<VoucherFileUploadResponse> {
  return sevdeskUploadFile("/Voucher/Factory/uploadTempFile", params.fileContent, params.fileName);
}

/**
 * Format upload result for display
 */
export function formatUploadResult(result: VoucherFileUploadResponse): string {
  const lines: string[] = [
    "File uploaded successfully:",
    `Filename: ${result.filename}`,
  ];
  if (result.pages !== undefined) lines.push(`Pages: ${result.pages}`);
  if (result.mimeType) lines.push(`MIME Type: ${result.mimeType}`);
  if (result.originMimeType) lines.push(`Original MIME Type: ${result.originMimeType}`);
  lines.push("");
  lines.push("Use this filename when creating a voucher to attach this document.");
  return lines.join("\n");
}

/**
 * Create a new voucher using the factory endpoint
 */
export async function createVoucher(params: {
  voucherDate: string;
  creditDebit: string;
  positions: Array<{
    sum: number;
    taxRate: number;
    accountingTypeId: number;
    net?: boolean;
    comment?: string;
    isAsset?: boolean;
  }>;
  supplierId?: string;
  description?: string;
  paymentDeadline?: string;
  currency?: string;
  taxType?: string;
  taxRule?: number;
  voucherType?: string;
  filename?: string;
  costCentreId?: string;
}): Promise<Voucher> {
  // Build voucher object for factory endpoint
  const voucher: Record<string, unknown> = {
    objectName: "Voucher",
    voucherDate: params.voucherDate,
    creditDebit: params.creditDebit,
    voucherType: params.voucherType || "VOU",
    status: 50, // Draft
    taxType: params.taxRule ? "default" : (params.taxType || "default"),
    currency: params.currency || "EUR",
    mapAll: true,
  };

  if (params.taxRule !== undefined) voucher.taxRule = { id: params.taxRule, objectName: "TaxRule" };
  if (params.supplierId !== undefined) {
    voucher.supplier = { id: params.supplierId, objectName: "Contact" };
  }
  if (params.description !== undefined) voucher.description = params.description;
  if (params.paymentDeadline !== undefined) voucher.paymentDeadline = params.paymentDeadline;
  if (params.costCentreId !== undefined) voucher.costCentre = { id: params.costCentreId, objectName: "CostCentre" };

  // Build positions array
  const voucherPosSave = params.positions.map((pos) => {
    const position: Record<string, unknown> = {
      objectName: "VoucherPos",
      sum: pos.sum,
      taxRate: pos.taxRate,
      accountingType: { id: pos.accountingTypeId, objectName: "AccountingType" },
      net: pos.net !== false, // Default to net
      isAsset: pos.isAsset || false,
      mapAll: true,
    };

    if (pos.comment !== undefined) position.comment = pos.comment;

    return position;
  });

  const body: Record<string, unknown> = {
    voucher,
    voucherPosSave,
  };

  // Add filename if provided (from uploadVoucherFile)
  if (params.filename !== undefined) {
    body.filename = params.filename;
  }

  const response = await sevdeskPost<{ objects: { voucher: Voucher } }>("/Voucher/Factory/saveVoucher", body);
  return response.objects.voucher;
}

/**
 * Update an existing voucher
 */
export async function updateVoucher(params: {
  id: string;
  description?: string;
  paymentDeadline?: string;
  deliveryDate?: string;
  costCentreId?: string;
}): Promise<Voucher> {
  const body: Record<string, unknown> = {};

  if (params.description !== undefined) body.description = params.description;
  if (params.paymentDeadline !== undefined) body.paymentDeadline = params.paymentDeadline;
  if (params.deliveryDate !== undefined) body.deliveryDate = params.deliveryDate;
  if (params.costCentreId !== undefined) body.costCentre = { id: params.costCentreId, objectName: "CostCentre" };

  const response = await sevdeskPut<SevdeskSingleResponse<Voucher>>(`/Voucher/${params.id}`, body);
  return extractSingleObject(response);
}

/**
 * Delete a voucher
 */
export async function deleteVoucher(params: { id: string }): Promise<void> {
  await sevdeskDelete(`/Voucher/${params.id}`);
}

/**
 * Book a payment on a voucher
 */
export async function bookVoucherPayment(params: {
  id: string;
  amount: number;
  date?: string;
  checkAccountId?: string;
  checkAccountTransactionId?: string;
  type?: string;
}): Promise<Voucher> {
  const body: Record<string, unknown> = {
    amount: params.amount,
    date: params.date || new Date().toISOString().split("T")[0],
    type: params.type || "N",
  };

  if (params.checkAccountId) {
    body.checkAccount = { id: params.checkAccountId, objectName: "CheckAccount" };
  }
  if (params.checkAccountTransactionId) {
    body.checkAccountTransaction = { id: params.checkAccountTransactionId, objectName: "CheckAccountTransaction" };
  }

  const response = await sevdeskPut<SevdeskSingleResponse<Voucher>>(`/Voucher/${params.id}/bookAmount`, body);
  return extractSingleObject(response);
}

/**
 * Enshrine (finalize) a voucher
 */
export async function enshrineVoucher(params: { id: string }): Promise<Voucher> {
  const response = await sevdeskPut<SevdeskSingleResponse<Voucher>>(`/Voucher/${params.id}/enshrine`, {});
  return extractSingleObject(response);
}

/**
 * List voucher positions
 */
export async function listVoucherPositions(params: {
  voucherId: string;
  limit?: number;
  offset?: number;
}): Promise<VoucherPos[]> {
  const queryString = buildQueryString({
    "voucher[id]": params.voucherId,
    "voucher[objectName]": "Voucher",
    limit: params.limit ?? 100,
    offset: params.offset,
  });

  const response = await sevdeskFetch<SevdeskApiResponse<VoucherPos>>(`/VoucherPos${queryString}`);
  return response.objects;
}

/**
 * Get a single voucher position
 */
export async function getVoucherPosition(params: { id: string }): Promise<VoucherPos> {
  const response = await sevdeskFetch<SevdeskSingleResponse<VoucherPos>>(`/VoucherPos/${params.id}`);
  return extractSingleObject(response);
}

/**
 * Create a voucher position
 */
export async function createVoucherPosition(params: {
  voucherId: string;
  sum: number;
  taxRate: number;
  accountingTypeId: number;
  net?: boolean;
  comment?: string;
  isAsset?: boolean;
}): Promise<VoucherPos> {
  const body: Record<string, unknown> = {
    voucher: { id: params.voucherId, objectName: "Voucher" },
    sum: params.sum,
    taxRate: params.taxRate,
    accountingType: { id: params.accountingTypeId, objectName: "AccountingType" },
    net: params.net !== false,
    isAsset: params.isAsset || false,
    mapAll: true,
  };

  if (params.comment !== undefined) body.comment = params.comment;

  const response = await sevdeskPost<SevdeskSingleResponse<VoucherPos>>("/VoucherPos", body);
  return extractSingleObject(response);
}

/**
 * Update a voucher position
 */
export async function updateVoucherPosition(params: {
  id: string;
  sum?: number;
  taxRate?: number;
  comment?: string;
}): Promise<VoucherPos> {
  const body: Record<string, unknown> = {};

  if (params.sum !== undefined) body.sum = params.sum;
  if (params.taxRate !== undefined) body.taxRate = params.taxRate;
  if (params.comment !== undefined) body.comment = params.comment;

  const response = await sevdeskPut<SevdeskSingleResponse<VoucherPos>>(`/VoucherPos/${params.id}`, body);
  return extractSingleObject(response);
}

/**
 * Delete a voucher position
 */
export async function deleteVoucherPosition(params: { id: string }): Promise<void> {
  await sevdeskDelete(`/VoucherPos/${params.id}`);
}

/**
 * Format voucher result
 */
export function formatVoucherResult(voucher: Voucher, action: string): string {
  return `Voucher ${action} successfully:\n${formatVoucher(voucher)}`;
}

/**
 * Format delete result
 */
export function formatVoucherDeleteResult(id: string): string {
  return `Voucher ${id} deleted successfully.`;
}

/**
 * Format payment booked result
 */
export function formatVoucherPaymentResult(voucher: Voucher, amount: number): string {
  return `Payment of ${amount} booked on voucher ${voucher.id}.\nNew paid amount: ${voucher.paidAmount}`;
}

/**
 * Format enshrine result
 */
export function formatEnshrineResult(voucher: Voucher): string {
  return `Voucher ${voucher.id} enshrined (finalized) successfully.`;
}

/**
 * Format voucher position
 */
export function formatVoucherPosition(pos: VoucherPos): string {
  const lines: string[] = [
    `ID: ${pos.id}`,
    `Sum: ${pos.sum}`,
    `Tax Rate: ${pos.taxRate}%`,
    `Net: ${pos.net}`,
    `Sum Net: ${pos.sumNet}`,
    `Sum Tax: ${pos.sumTax}`,
    `Sum Gross: ${pos.sumGross}`,
  ];

  if (pos.comment) lines.push(`Comment: ${pos.comment}`);
  if (pos.isAsset) lines.push(`Is Asset: Yes`);

  return lines.join("\n");
}

/**
 * Format voucher positions list
 */
export function formatVoucherPositionsList(positions: VoucherPos[]): string {
  if (positions.length === 0) {
    return "No voucher positions found.";
  }

  const lines: string[] = [`Found ${positions.length} position(s):\n`];

  for (const pos of positions) {
    lines.push(`- [${pos.id}] ${pos.sum} | Tax: ${pos.taxRate}% | Gross: ${pos.sumGross}`);
  }

  return lines.join("\n");
}

/**
 * Format position result
 */
export function formatVoucherPositionResult(pos: VoucherPos, action: string): string {
  return `Voucher position ${action} successfully:\n${formatVoucherPosition(pos)}`;
}

/**
 * Format position delete result
 */
export function formatVoucherPositionDeleteResult(id: string): string {
  return `Voucher position ${id} deleted successfully.`;
}
