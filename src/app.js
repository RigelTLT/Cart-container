require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const apiRouter = require("./routes/api");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use("/api", apiRouter);

// Serve frontend in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../../frontend/public")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../../frontend/public/index.html"));
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
