import { useEffect, useState } from "react";
import axios from "axios";
import Navbar from "../components/Navbar";

function Notes() {
  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const getNotes = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/notes");
      setNotes(res.data);
    } catch (error) {
      console.log("GET NOTES ERROR:", error);
    }
  };

  useEffect(() => {
    getNotes();
  }, []);

  const addNote = async () => {
    try {
      if (!title || !content) {
        alert("Please fill all fields");
        return;
      }

      const res = await axios.post("http://localhost:5000/api/notes", {
        title,
        content,
      });

      console.log("NOTE ADDED:", res.data);

      setTitle("");
      setContent("");
      getNotes();
    } catch (error) {
      console.log("ADD NOTE ERROR:", error);
      alert("Note not added");
    }
  };

  const deleteNote = async (id) => {
    await axios.delete(`http://localhost:5000/api/notes/${id}`);
    getNotes();
  };

  return (
    <>
      <Navbar />

      <div style={{ textAlign: "center", marginTop: "60px" }}>
        <h1>Notes</h1>

        <div
          style={{
            width: "420px",
            margin: "auto",
            padding: "25px",
            border: "1px solid #ddd",
            borderRadius: "12px",
            background: "#f8fafc",
          }}
        >
          <input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: "90%", padding: "10px" }}
          />

          <br />
          <br />

          <textarea
            placeholder="Content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{ width: "90%", padding: "10px", height: "90px" }}
          />

          <br />
          <br />

          <button onClick={addNote}>Add Note</button>
        </div>

        <hr style={{ marginTop: "30px" }} />

        <h2>All Notes</h2>

        {notes.length === 0 && <p>No notes yet</p>}

        {notes.map((note) => (
          <div
            key={note._id}
            style={{
              width: "420px",
              margin: "15px auto",
              padding: "15px",
              border: "1px solid #ddd",
              borderRadius: "10px",
              background: "white",
              textAlign: "left",
            }}
          >
            <h3>{note.title}</h3>
            <p>{note.content}</p>

            <button onClick={() => deleteNote(note._id)}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export default Notes;