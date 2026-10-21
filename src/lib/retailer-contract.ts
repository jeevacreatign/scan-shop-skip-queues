import { z } from "zod";

export const retailerUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.enum(["admin", "owner"]),
  storeName: z.string().nullable(),
  mustChangePassword: z.boolean(),
});

export const retailerProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  barcode: z.string(),
  category: z.string(),
  pricePaise: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
  active: z.boolean(),
  updatedAt: z.string(),
});

export const retailerOrderItemSchema = z.object({
  name: z.string(),
  barcode: z.string(),
  quantity: z.number().int().positive(),
  pricePaise: z.number().int().nonnegative(),
});

export const retailerOrderSchema = z.object({
  id: z.string(),
  totalPaise: z.number().int().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  state: z.enum(["demo", "paid", "verified"]),
  createdAt: z.string(),
  items: z.array(retailerOrderItemSchema),
});

export const retailerAccountSchema = z.object({
  id: z.string(),
  email: z.string(),
  storeName: z.string(),
  createdAt: z.string(),
  productCount: z.number().int().nonnegative(),
  orderCount: z.number().int().nonnegative(),
});

export const retailerApiResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  user: retailerUserSchema.nullable().optional(),
  products: z.array(retailerProductSchema).optional(),
  orders: z.array(retailerOrderSchema).optional(),
  retailers: z.array(retailerAccountSchema).optional(),
  orderCount: z.number().int().nonnegative().optional(),
  verifiedSalesPaise: z.number().int().nonnegative().optional(),
});

export type RetailerUser = z.infer<typeof retailerUserSchema>;
export type RetailerProduct = z.infer<typeof retailerProductSchema>;
export type RetailerOrder = z.infer<typeof retailerOrderSchema>;
export type RetailerAccount = z.infer<typeof retailerAccountSchema>;
export type RetailerApiResponse = z.infer<typeof retailerApiResponseSchema>;
