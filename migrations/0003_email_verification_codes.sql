-- Código de verificación de correo (6 dígitos) con límites de envío e intentos.
CREATE TABLE email_verification_codes (
  user_id      TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  code_hash    TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  last_sent_at INTEGER NOT NULL,
  sends        INTEGER NOT NULL DEFAULT 1,
  attempts     INTEGER NOT NULL DEFAULT 0
);
