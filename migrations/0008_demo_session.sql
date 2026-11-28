-- Demo pública: sesiones creadas sin credenciales y de solo lectura.
-- La sesión de demo nunca da acceso al panel de plataforma.

ALTER TABLE sessions ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;
CREATE INDEX ix_sessions_demo ON sessions (is_demo, expires_at);
