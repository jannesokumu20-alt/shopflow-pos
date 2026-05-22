
CREATE TYPE public.till_type_enum AS ENUM ('paybill', 'till', 'bank');
CREATE TYPE public.subscription_status_enum AS ENUM ('trial', 'active', 'expired');
CREATE TYPE public.payment_status_enum AS ENUM ('pending', 'completed', 'failed', 'cancelled');

CREATE TABLE public.shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_name text NOT NULL,
  shop_name text NOT NULL,
  phone text NOT NULL,
  pin_hash text NOT NULL,
  pin_valid_until timestamptz,
  pin_failed_attempts integer NOT NULL DEFAULT 0,
  pin_locked_until timestamptz,
  payhero_channel_id integer,
  till_number text,
  till_type public.till_type_enum,
  trial_start timestamptz NOT NULL DEFAULT now(),
  subscription_expiry timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  subscription_status public.subscription_status_enum NOT NULL DEFAULT 'trial',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(10,2) NOT NULL CHECK (price > 0),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  reorder_level integer NOT NULL DEFAULT 5 CHECK (reorder_level > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX products_shop_name_uniq ON public.products(shop_id, lower(name));
CREATE INDEX idx_products_shop_stock ON public.products(shop_id, stock);

CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  total_amount numeric(10,2) NOT NULL CHECK (total_amount > 0),
  customer_phone text NOT NULL,
  payment_status public.payment_status_enum NOT NULL DEFAULT 'pending',
  payhero_reference text,
  payhero_checkout_request_id text,
  sold_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sales_shop_sold ON public.sales(shop_id, sold_at DESC);

CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(10,2) NOT NULL CHECK (unit_price > 0),
  line_total numeric(10,2) NOT NULL CHECK (line_total > 0)
);
CREATE INDEX idx_sale_items_sale ON public.sale_items(sale_id);

CREATE TABLE public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  payhero_reference text,
  payhero_checkout_request_id text,
  payment_status public.payment_status_enum NOT NULL DEFAULT 'pending',
  paid_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shops_expiry ON public.shops(subscription_expiry);

CREATE OR REPLACE FUNCTION public.current_shop_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.shops WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER shops_updated BEFORE UPDATE ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER products_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own shop" ON public.shops
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Owner updates own shop" ON public.shops
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Owner reads own products" ON public.products
  FOR SELECT USING (shop_id = public.current_shop_id());
CREATE POLICY "Owner inserts own products" ON public.products
  FOR INSERT WITH CHECK (shop_id = public.current_shop_id());
CREATE POLICY "Owner updates own products" ON public.products
  FOR UPDATE USING (shop_id = public.current_shop_id());
CREATE POLICY "Owner deletes own products" ON public.products
  FOR DELETE USING (shop_id = public.current_shop_id());

CREATE POLICY "Owner reads own sales" ON public.sales
  FOR SELECT USING (shop_id = public.current_shop_id());

CREATE POLICY "Owner reads own sale items" ON public.sale_items
  FOR SELECT USING (sale_id IN (SELECT id FROM public.sales WHERE shop_id = public.current_shop_id()));

CREATE POLICY "Owner reads own subscription payments" ON public.subscription_payments
  FOR SELECT USING (shop_id = public.current_shop_id());
