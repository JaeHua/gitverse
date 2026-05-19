export const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE,
  image TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  source_type ENUM('local', 'remote') NOT NULL,
  source_path TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS analyses (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  total_commits INT NOT NULL DEFAULT 0,
  total_files INT NOT NULL DEFAULT 0,
  file_timeline JSON,
  analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS file_nodes (
  id VARCHAR(36) PRIMARY KEY,
  analysis_id VARCHAR(36) NOT NULL,
  path TEXT NOT NULL,
  name VARCHAR(255) NOT NULL,
  extension VARCHAR(20),
  commit_count INT DEFAULT 0,
  added_lines INT DEFAULT 0,
  deleted_lines INT DEFAULT 0,
  heat DECIMAL(5,2) DEFAULT 0,
  risk ENUM('high', 'medium', 'low') DEFAULT 'low',
  risk_reason TEXT,
  FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dependency_edges (
  id VARCHAR(36) PRIMARY KEY,
  analysis_id VARCHAR(36) NOT NULL,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  weight DECIMAL(5,2) DEFAULT 0,
  type VARCHAR(20) DEFAULT 'direct',
  FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS commit_snapshots (
  id VARCHAR(36) PRIMARY KEY,
  analysis_id VARCHAR(36) NOT NULL,
  hash VARCHAR(40) NOT NULL,
  date DATETIME NOT NULL,
  message TEXT,
  files_changed JSON,
  FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`
