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

// 1. 서버 시작 시 DB 테이블 및 샘플 데이터 초기화 함수
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS students (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          grade INTEGER NOT NULL,
          code VARCHAR(50) DEFAULT '',
          balance INTEGER DEFAULT 0,
          active BOOLEAN DEFAULT TRUE
      );
      
      CREATE TABLE IF NOT EXISTS products (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          category VARCHAR(50) NOT NULL,
          price INTEGER NOT NULL,
          stock INTEGER DEFAULT 0,
          image TEXT,
          active BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS requests (
          id VARCHAR(50) PRIMARY KEY,
          student_id VARCHAR(50),
          student_name VARCHAR(100) NOT NULL,
          amount INTEGER NOT NULL,
          status VARCHAR(20) DEFAULT '승인 대기',
          time VARCHAR(100) NOT NULL
      );

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

      CREATE TABLE IF NOT EXISTS settings (
          key VARCHAR(50) PRIMARY KEY,
          value INTEGER NOT NULL
      );

      INSERT INTO settings (key, value) VALUES ('goal', 100000), ('fund', 0)
      ON CONFLICT (key) DO NOTHING;

      INSERT INTO students (id, name, grade, code, balance, active) VALUES 
      ('s1', '학생 A', 1, '', 3000, TRUE),
      ('s2', '학생 B', 2, '', 1500, TRUE),
      ('s3', '학생 C', 3, '', 0, TRUE)
      ON CONFLICT (id) DO NOTHING;

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

// -------------------------------------------------------------
// 📌 2단계: 백엔드 API 라우터 추가
// -------------------------------------------------------------

// ① 전체 데이터 가져오기 API (프론트엔드가 켜질 때 호출)
app.get("/api/data", async (req, res) => {
  try {
    const studentsRes = await pool.query("SELECT * FROM students");
    const productsRes = await pool.query("SELECT * FROM products");
    const requestsRes = await pool.query("SELECT * FROM requests");
    const ledgerRes = await pool.query("SELECT * FROM ledger ORDER BY timestamp DESC");
    const settingsRes = await pool.query("SELECT * FROM settings");

    let goal = 100000;
    let fund = 0;
    settingsRes.rows.forEach(row => {
      if (row.key === 'goal') goal = row.value;
      if (row.key === 'fund') fund = row.value;
    });

    res.json({
      students: studentsRes.rows,
      products: productsRes.rows,
      requests: requestsRes.rows,
      ledger: ledgerRes.rows,
      goal,
      fund
    });
  } catch (error) {
    console.error("데이터 조회 실패:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

// ② 전체 데이터 동기화/저장 API (프론트엔드에서 상태가 바뀔 때 통째로 저장)
app.post("/api/data", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { students, products, requests, ledger, goal, fund } = req.body;

    // students 갱신
    await client.query("DELETE FROM students");
    for (const s of students) {
      await client.query(
        "INSERT INTO students (id, name, grade, code, balance, active) VALUES ($1, $2, $3, $4, $5, $6)",
        [s.id, s.name, s.grade, s.code, s.balance, s.active]
      );
    }

    // products 갱신
    await client.query("DELETE FROM products");
    for (const p of products) {
      await client.query(
        "INSERT INTO products (id, name, category, price, stock, image, active) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [p.id, p.name, p.category, p.price, p.stock, p.image, p.active]
      );
    }

    // requests 갱신
    await client.query("DELETE FROM requests");
    for (const r of requests) {
      await client.query(
        "INSERT INTO requests (id, student_id, student_name, amount, status, time) VALUES ($1, $2, $3, $4, $5, $6)",
        [r.id, r.studentId, r.studentName, r.amount, r.status, r.time]
      );
    }

    // ledger 갱신
    await client.query("DELETE FROM ledger");
    for (const l of ledger) {
      await client.query(
        "INSERT INTO ledger (id, type, detail, amount, student, student_id, grade, time, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [l.id, l.type, l.detail, l.amount, l.student, l.studentId, l.grade, l.time, l.timestamp]
      );
    }

    // settings 갱신
    await client.query(
      "INSERT INTO settings (key, value) VALUES ('goal', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
      [goal]
    );
    await client.query(
      "INSERT INTO settings (key, value) VALUES ('fund', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
      [fund]
    );

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("데이터 저장 실패:", error);
    res.status(500).json({ error: "Failed to save data" });
  } finally {
    client.release();
  }
});

// 기존 헬스체크 API
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

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`Server listening on ${PORT}`);
  await initDatabase();
});
