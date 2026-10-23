import express from "express";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const { Pool } = pg;
const PORT = process.env.PORT || 3000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.static(__dirname));

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === "true"
    ? { rejectUnauthorized: true }
    : undefined
});

// 📌 [추가된 부분] 서버가 켜질 때 DB 테이블을 자동으로 생성하는 함수
async function initDatabase() {
  try {
    await pool.query(`
      -- 1. 학생 테이블
      CREATE TABLE IF NOT EXISTS students (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          grade INTEGER NOT NULL,
          code VARCHAR(50) DEFAULT '',
          balance INTEGER DEFAULT 0,
          active BOOLEAN DEFAULT TRUE
      );
      
      -- 2. 상품 테이블
      CREATE TABLE IF NOT EXISTS products (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          category VARCHAR(50) NOT NULL,
          price INTEGER NOT NULL,
          stock INTEGER DEFAULT 0,
          image TEXT,
          active BOOLEAN DEFAULT TRUE
      );

      -- 3. 충전 신청 테이블
      CREATE TABLE IF NOT EXISTS requests (
          id VARCHAR(50) PRIMARY KEY,
          student_id VARCHAR(50),
          student_name VARCHAR(100) NOT NULL,
          amount INTEGER NOT NULL,
          status VARCHAR(20) DEFAULT '승인 대기',
          time VARCHAR(100) NOT NULL
      );

      -- 4. 거래 장부 테이블
      CREATE TABLE IF NOT EXISTS ledger (
          id VARCHAR(50) PRIMARY KEY,
          type VARCHAR(50) NOT NULL,
          detail TEXT NOT NULL,
          amount INTEGER NOT NULL,
          student VARCHAR(100),
          student_id VARCHAR(50),
          grade INTEGER,
          time VARCHAR(100) NOT NULL,
          timestamp BIGINT NOT NULL
      );

      -- 5. 기금 설정 테이블
      CREATE TABLE IF NOT EXISTS settings (
          key VARCHAR(50) PRIMARY KEY,
          value INTEGER NOT NULL
      );

      -- 기본 기금 설정값 초기화 (목표 10만포인트, 현재 0포인트)
      INSERT INTO settings (key, value) VALUES ('goal', 100000), ('fund', 0)
      ON CONFLICT (key) DO NOTHING;

      -- 6. 초기 샘플 데이터 (학생 A, B, C 추가)
      INSERT INTO students (id, name, grade, code, balance, active) VALUES 
      ('s1', '학생 A', 1, '', 3000, TRUE),
      ('s2', '학생 B', 2, '', 1500, TRUE),
      ('s3', '학생 C', 3, '', 0, TRUE)
      ON CONFLICT (id) DO NOTHING;

      -- 7. 초기 샘플 데이터 (초코 과자, 주스, 연필 추가)
      INSERT INTO products (id, name, category, price, stock, image, active) VALUES 
      ('p1', '초코 과자', '과자', 1000, 8, '', TRUE),
      ('p2', '주스', '음료', 1500, 5, '', TRUE),
      ('p3', '연필', '기타', 500, 12, '', TRUE)
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("🚀 데이터베이스 테이블 및 샘플 데이터 초기화 완료!");
  } catch (err) {
    console.error("❌ 데이터베이스 초기화 실패:", err.message);
  }
}

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ connected: true });
  } catch (error) {
    console.error("DB connection failed:", error.message);
    res.status(500).json({ connected: false });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "우리학교매점.html"));
});

// 서버를 실행하기 전, DB 테이블을 먼저 생성하도록 수정
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`Server listening on ${PORT}`);
  await initDatabase(); // 서버 켜질 때 테이블 생성 함수 실행!
});
