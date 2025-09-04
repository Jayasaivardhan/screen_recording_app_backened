const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const multer = require("multer");
const sqlite3 = require("sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Allow only your Netlify frontend
app.use(cors({
  origin: "https://boisterous-quokka-ce7558.netlify.app"
}));

app.use(morgan("dev"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + ".webm");
  },
});
const upload = multer({ storage });

// Database setup
const db = new sqlite3.Database(path.join(__dirname, "database.db"));
db.run(`
  CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT,
    filepath TEXT,
    filesize INTEGER,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// Upload new recording
app.post("/api/recordings", upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const { filename, path: filepath, size } = req.file;
  db.run(
    "INSERT INTO recordings (filename, filepath, filesize) VALUES (?, ?, ?)",
    [filename, filepath, size],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({
        message: "Recording uploaded",
        recording: { id: this.lastID, filename, filepath, size },
      });
    }
  );
});

// Get all recordings
app.get("/api/recordings", (req, res) => {
  db.all("SELECT * FROM recordings ORDER BY createdAt DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get single recording (file download/stream)
app.get("/api/recordings/:id", (req, res) => {
  const id = req.params.id;
  db.get("SELECT * FROM recordings WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Not found" });
    res.sendFile(path.resolve(row.filepath));
  });
});

// Delete recording
app.delete("/api/recordings/:id", (req, res) => {
  const id = req.params.id;
  db.get("SELECT * FROM recordings WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Recording not found" });

    // Delete file from disk
    fs.unlink(row.filepath, (unlinkErr) => {
      if (unlinkErr) console.error("Error deleting file:", unlinkErr);
    });

    // Delete DB entry
    db.run("DELETE FROM recordings WHERE id = ?", [id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Recording deleted", id });
    });
  });
});

app.listen(PORT, () =>
  console.log(`✅ Backend running at http://localhost:${PORT}`)
);
