-- Import into a NEW empty MySQL 5.7+ / MariaDB 10.4+ database.
CREATE TABLE app_meta (
  id TINYINT UNSIGNED PRIMARY KEY,
  setup_complete TINYINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;
INSERT INTO app_meta (id, setup_complete) VALUES (1, 0);

CREATE TABLE users (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE expenses (
  id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  amount_kopecks BIGINT UNSIGNED NOT NULL,
  category VARCHAR(71) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  spent_on DATE NOT NULL,
  note VARCHAR(200) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, id),
  CONSTRAINT fk_expenses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_date (user_id, spent_on),
  INDEX idx_user_category_date (user_id, category, spent_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE login_attempts (
  bucket CHAR(64) CHARACTER SET ascii PRIMARY KEY,
  attempts INT UNSIGNED NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  INDEX idx_attempt_expiry (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categories (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  id VARCHAR(71) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(40) NOT NULL,
  color CHAR(7) NOT NULL,
  icon VARCHAR(32) NOT NULL,
  PRIMARY KEY (user_id, id),
  CONSTRAINT fk_categories_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
