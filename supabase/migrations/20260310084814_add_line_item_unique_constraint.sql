-- Add unique constraint on shopify_line_item_id for idempotent upserts
ALTER TABLE order_line_items
ADD CONSTRAINT order_line_items_shopify_line_item_id_key UNIQUE (shopify_line_item_id);
