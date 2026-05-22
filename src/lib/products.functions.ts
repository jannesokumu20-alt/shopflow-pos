import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getShopId(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("shops")
    .select("id")
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new Error("Shop not found");
  return data.id as string;
}

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const shopId = await getShopId(supabase, userId);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("shop_id", shopId)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { products: data ?? [] };
  });

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  price: z.number().positive().max(10_000_000),
  stock: z.number().int().min(0).max(1_000_000),
  reorder_level: z.number().int().min(1).max(1_000_000),
});

export const createProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const shopId = await getShopId(supabase, userId);
    const { data: row, error } = await supabase
      .from("products")
      .insert({ ...data, shop_id: shopId })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("A product with that name already exists");
      throw new Error(error.message);
    }
    return { product: row };
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  price: z.number().positive().max(10_000_000).optional(),
  stock: z.number().int().min(0).max(1_000_000).optional(),
  reorder_level: z.number().int().min(1).max(1_000_000).optional(),
});

export const updateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const shopId = await getShopId(supabase, userId);
    const { id, ...patch } = data;
    const { data: row, error } = await supabase
      .from("products")
      .update(patch)
      .eq("id", id)
      .eq("shop_id", shopId)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("A product with that name already exists");
      throw new Error(error.message);
    }
    return { product: row };
  });

const deleteSchema = z.object({ id: z.string().uuid() });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => deleteSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const shopId = await getShopId(supabase, userId);
    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", data.id)
      .eq("shop_id", shopId);
    if (error) throw new Error(error.message);
    return { success: true };
  });