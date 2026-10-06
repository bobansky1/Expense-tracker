-- Run on an existing database before deploying the category update. Existing expenses are preserved.
ALTER TABLE expenses MODIFY category VARCHAR(71) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;
CREATE TABLE IF NOT EXISTS categories (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  id VARCHAR(71) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(40) NOT NULL,
  color CHAR(7) NOT NULL,
  icon VARCHAR(32) NOT NULL,
  PRIMARY KEY (user_id, id),
  CONSTRAINT fk_categories_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
