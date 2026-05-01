const express = require("express");
const cors = require("cors");
const http = require("http");

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.send("DSS API Gateway Running");
});

// DSS Route
app.get("/brain", (req, res) => {
  const options = {
    hostname: "localhost",
    port: 5000,
    path: "/brain",
    method: "GET"
  };

  const request = http.request(options, (response) => {
    let data = "";

    response.on("data", (chunk) => {
      data += chunk;
    });

    response.on("end", () => {
      try {
        res.json(JSON.parse(data));
      } catch (err) {
        res.status(500).json({ error: "Invalid response from brain service" });
      }
    });
  });

  request.on("error", (err) => {
    res.status(500).json({ error: "Brain service unreachable" });
  });

  request.end();
});

// IMPORTANT
app.listen(3000, "0.0.0.0", () => {
  console.log("API Gateway running on port 3000");
});
