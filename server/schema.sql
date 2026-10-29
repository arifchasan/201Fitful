CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(160) NOT NULL,
  age TINYINT UNSIGNED NOT NULL,
  gender ENUM('male', 'female') NOT NULL,
  height_cm DECIMAL(5, 1) NOT NULL,
  weight_kg DECIMAL(5, 1) NOT NULL,
  body_fat DECIMAL(4, 1) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_entries (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  entry_date DATE NOT NULL,
  declaration_text VARCHAR(500) NOT NULL DEFAULT '',
  steps INT UNSIGNED NULL,
  sport VARCHAR(120) NULL,
  duration_minutes SMALLINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_daily_entries_user_date (user_id, entry_date),
  CONSTRAINT fk_daily_entries_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meals (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  entry_date DATE NOT NULL,
  meal_type ENUM('breakfast', 'lunch', 'dinner') NOT NULL,
  photo_path VARCHAR(255) NOT NULL,
  food_name VARCHAR(160) NULL,
  calories DECIMAL(7, 1) NULL,
  protein_g DECIMAL(6, 1) NULL,
  edited_food_name VARCHAR(160) NULL,
  edited_calories DECIMAL(7, 1) NULL,
  edited_protein_g DECIMAL(6, 1) NULL,
  ai_status ENUM('pending', 'done', 'failed') NOT NULL DEFAULT 'pending',
  ai_error VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_meals_user_date_type (user_id, entry_date, meal_type),
  KEY idx_meals_user_date (user_id, entry_date),
  CONSTRAINT fk_meals_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
