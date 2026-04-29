ALTER TABLE order_attachments
  ADD COLUMN is_annotation        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN source_attachment_id UUID    REFERENCES order_attachments(id) ON DELETE SET NULL;
