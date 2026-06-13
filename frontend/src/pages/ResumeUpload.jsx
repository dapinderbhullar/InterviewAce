import { useState } from "react";
import axios from "axios";
import Navbar from "../components/Navbar";

function ResumeUpload() {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");

  const handleUpload = async () => {
    if (!file) {
      alert("Please select a PDF first");
      return;
    }

    const formData = new FormData();
    formData.append("resume", file);

    const res = await axios.post(
      "http://localhost:5000/api/resume/upload",
      formData
    );

    localStorage.setItem("resumePath", res.data.path);
    setMessage("Resume Uploaded Successfully ✅");
  };

  return (
    <>
      <Navbar />

      <div style={{ textAlign: "center", marginTop: "80px" }}>
        <h1>Upload Resume</h1>

        <div
          style={{
            border: "1px solid #ddd",
            padding: "30px",
            borderRadius: "12px",
            width: "400px",
            margin: "auto",
            background: "#f8fafc",
          }}
        >
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => setFile(e.target.files[0])}
          />

          {file && <p>Selected: {file.name}</p>}

          <button onClick={handleUpload}>
            Upload Resume
          </button>

          {message && <p>{message}</p>}
        </div>
      </div>
    </>
  );
}

export default ResumeUpload;