import { ConfirmButton } from '../components/Feedback';
import { notify } from '../lib/notifications';
import { useEffect, useState } from "react";
import api from "../lib/api";
import Navbar from "../components/Navbar";
export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api.get(`/notes?page=${page}`).then(({
      data
    }) => {
      if (active) setNotes(data);
    }).catch(err => {
      if (active) setError(err.response?.data?.message || "Could not load notes.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [page, refresh]);
  function reload() {
    setLoading(true);
    setRefresh(value => value + 1);
  }
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editing) await api.put(`/notes/${editing}`, {
        title,
        content
      });else await api.post("/notes", {
        title,
        content
      });
      notify(editing ? "Note updated." : "Note added.");
      setTitle("");
      setContent("");
      setEditing(null);
      setPage(1);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || "Could not save note.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id) {
    setBusy(true);
    setError("");
    try {
      await api.delete(`/notes/${id}`);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || "Could not delete note.");
    } finally {
      setBusy(false);
    }
  }
  return <><Navbar /><main className="feature-page" id="workspace" tabIndex={-1}><h1>Notes</h1>
    <form className="panel" onSubmit={save}>
      <label htmlFor="note-title">Title</label><input id="note-title" required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} />
      <label htmlFor="note-content">Content</label><textarea id="note-content" required maxLength={20000} rows={5} value={content} onChange={event => setContent(event.target.value)} />
      <button disabled={busy || !title.trim() || !content.trim()}>{editing ? "Save Changes" : "Add Note"}</button>
      {editing && <button type="button" onClick={() => {
          setEditing(null);
          setTitle("");
          setContent("");
        }}>Cancel</button>}
    </form>
    {error && <div role="alert"><p>{error}</p><button onClick={() => {
          setError("");
          reload();
        }}>Retry loading notes</button></div>}
    <h2>Your Notes</h2>{loading ? <p role="status">Loading notes...</p> : !notes.length && <p>No notes on this page.</p>}
    {!loading && notes.map(note => <article className="panel" key={note._id}><h3>{note.title}</h3><p className="note-content">{note.content}</p>
      <div className="actions"><button disabled={busy} onClick={() => {
            setEditing(note._id);
            setTitle(note.title);
            setContent(note.content);
          }}>Edit</button>
      <ConfirmButton disabled={busy} title="Delete this note?" description="This permanently removes the saved note." confirmLabel="Delete note" onConfirm={() => remove(note._id)}>Delete</ConfirmButton></div></article>)}
    <div className="actions"><button disabled={loading || page === 1} onClick={() => {
          setLoading(true);
          setPage(value => value - 1);
        }}>Previous</button>
      <span>Page {page}</span><button disabled={loading || notes.length < 50} onClick={() => {
          setLoading(true);
          setPage(value => value + 1);
        }}>Next</button></div>
  </main></>;
}
