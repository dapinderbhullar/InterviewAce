// src/pages/Dashboard.jsx

import Navbar from "../components/Navbar";
import { useState } from "react";
import axios from "axios";
import {
  FaFileAlt,
  FaChartLine,
  FaQuestionCircle,
} from "react-icons/fa";

function Dashboard() {
  const [analysis, setAnalysis] = useState("");
  const [atsResult, setAtsResult] = useState("");
  const [questions, setQuestions] = useState("");

  const resumePath = localStorage.getItem("resumePath");

  const analyzeResume = async () => {
    try {
      const res = await axios.post(
        "http://localhost:5000/api/gemini/analyze",
        { path: resumePath }
      );

      setAnalysis(res.data.analysis);
    } catch (err) {
      alert("Analysis Failed");
      console.log(err);
    }
  };

  const generateATS = async () => {
    try {
      const res = await axios.post(
        "http://localhost:5000/api/gemini/ats",
        { path: resumePath }
      );

      setAtsResult(res.data.result);
    } catch (err) {
      alert("ATS Generation Failed");
      console.log(err);
    }
  };

  const generateQuestions = async () => {
    try {
      const res = await axios.post(
        "http://localhost:5000/api/gemini/questions",
        { path: resumePath }
      );

      setQuestions(res.data.questions);
    } catch (err) {
      alert("Question Generation Failed");
      console.log(err);
    }
  };

  return (
    <>
      <Navbar />

      <div
        style={{
          padding: "20px",
          maxWidth: "900px",
          margin: "auto",
        }}
      >
        <h1>AI Resume Dashboard</h1>
        
<h3>
  Welcome, {localStorage.getItem("userName") || "User"}! Here you can analyze your resume, get an ATS score, and generate interview questions based on your resume content.
</h3>

        <div style={{ marginBottom: "20px" }}>
          <button onClick={analyzeResume}>
            Analyze Resume
          </button>

          <button
            onClick={generateATS}
            style={{ marginLeft: "10px" }}
          >
            Generate ATS Score
          </button>

          <button
            onClick={generateQuestions}
            style={{ marginLeft: "10px" }}
          >
            Generate Questions
          </button>
        </div>

        {analysis && (
          <div
            style={{
              marginTop: "20px",
              padding: "15px",
              border: "1px solid #ddd",
              borderRadius: "10px",
            }}
          >
            <h2>
              <FaFileAlt /> Resume Analysis
            </h2>

            <pre
              style={{
                whiteSpace: "pre-wrap",
              }}
            >
              {analysis}
            </pre>
          </div>
        )}

        {atsResult && (
          <div
            style={{
              marginTop: "20px",
              padding: "15px",
              border: "1px solid #ddd",
              borderRadius: "10px",
            }}
          >
            <h2>
              <FaChartLine /> ATS Score
            </h2>

            <pre
              style={{
                whiteSpace: "pre-wrap",
              }}
            >
              {atsResult}
            </pre>
          </div>
        )}

        {questions && (
          <div
            style={{
              marginTop: "20px",
              padding: "15px",
              border: "1px solid #ddd",
              borderRadius: "10px",
            }}
          >
            <h2>
              <FaQuestionCircle /> Interview Questions
            </h2>

            <pre
              style={{
                whiteSpace: "pre-wrap",
              }}
            >
              {questions}
            </pre>
          </div>
        )}
      </div>
    </>
  );
}

export default Dashboard;