ALTER TABLE order_attachments
  DROP COLUMN IF EXISTS source_attachment_id,
  DROP COLUMN IF EXISTS is_annotation;
