const mongoose = require("mongoose");
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
const noteRoutes = require("./routes/noteRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const geminiRoutes = require("./routes/geminiRoutes");

app.use(cors());
app.use(express.json());
app.use("/api/uploads", uploadRoutes);
app.use("/uploads", express.static("uploads"));
app.use("/api/gemini", geminiRoutes);

app.use("/api/auth",require("./routes/auth"));
app.use("/api/resume",require("./routes/resume"));
app.use("/api/notes", noteRoutes);



mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

app.get("/", (req,res)=>{
    res.send("Server Running");
});

app.listen(5000,()=>{
    console.log("Server Started");
});

