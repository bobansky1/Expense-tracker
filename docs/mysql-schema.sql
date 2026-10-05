-- Future server-side MySQL storage. Do not expose database credentials to React.
-- Authentication and an API must be implemented before deploying multi-user storage.
CREATE TABLE users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE expenses (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  amount_kopecks BIGINT UNSIGNED NOT NULL,
  category ENUM('food','cafe','transport','home','shopping','health','fun','other') NOT NULL,
  spent_on DATE NOT NULL,
  note VARCHAR(200) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_expenses_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT positive_expense CHECK (amount_kopecks BETWEEN 1 AND 9999999999),
  INDEX idx_user_date (user_id, spent_on),
  INDEX idx_user_category_date (user_id, category, spent_on)
);
