import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiUploadCloud, FiFileText, FiCheckCircle } from 'react-icons/fi';
import api from '../lib/api';
import Navbar from '../components/Navbar';
import { notify } from '../lib/notifications';
export default function ResumeUpload() {
  const fileInput = useRef(null);
  const [file, setFile] = useState(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [dragging, setDragging] = useState(false),
    [success, setSuccess] = useState(false);
  function select(value) {
    if (!value) return;
    setSuccess(false);
    setProgress(0);
    if (!/\.pdf$/i.test(value.name) || value.size > 5 * 1024 * 1024 || !value.size) {
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      setMessage('Select a non-empty PDF of at most 5 MB.');
      return;
    }
    setFile(value);
    setMessage('');
  }
  async function upload(e) {
    e.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setMessage('');
    setSuccess(false);
    try {
      const form = new FormData();
      form.append('resume', file);
      const {
        data
      } = await api.post('/resume/upload', form, {
        onUploadProgress: e => {
          if (e.total) setProgress(Math.round(e.loaded / e.total * 100));
        }
      });
      localStorage.setItem('resumeId', data.resumeId);
      localStorage.setItem('resumePath', data.path);
      setSuccess(true);
      setMessage('Resume uploaded. Your new version is ready to use.');
      notify('Resume uploaded successfully.');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return <><Navbar /><main className="feature-page" id="workspace" tabIndex={-1}><h1>Your next opportunity, on paper.</h1><p>Upload a resume to uncover your strengths, compare roles, and prepare with purpose.</p><form className="panel" onSubmit={upload}><span className="eyebrow">RESUME LIBRARY</span><div className={`drop-zone ${dragging ? 'dragging' : ''}`} onDragOver={e => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }} onDragLeave={() => setDragging(false)} onDrop={e => {
          e.preventDefault();
          setDragging(false);
          if (!busy) select(e.dataTransfer.files[0]);
        }}><FiUploadCloud /><h2>Make room for your next chapter</h2><p>Drag your resume here, or choose a file below.</p><label htmlFor="resume-file">PDF document · Up to 5 MB</label><input ref={fileInput} id="resume-file" type="file" accept=".pdf,application/pdf" disabled={busy} onChange={e => select(e.target.files[0])} /></div>{file && <div className="upload-meta"><FiFileText /><span><strong>{file.name}</strong><br /><small>{(file.size / 1024).toFixed(0)} KB · New resume version</small></span><button type="button" disabled={busy} onClick={() => {
            setFile(null);
            if (fileInput.current) fileInput.current.value = '';
            setSuccess(false);
            setMessage('');
          }}>Remove</button></div>}{busy && <div role="status"><progress aria-label="File upload progress" value={progress} max="100" />{progress < 100 ? `Uploading ${progress}%` : 'File transferred. Validating and saving your resume…'}</div>}<button type="submit" className="primary" disabled={busy || !file || success}>{busy ? 'Uploading…' : success ? 'Uploaded successfully' : 'Upload resume →'}</button>{message && <p className={success ? 'success' : ''} role={success ? 'status' : 'alert'}>{success && <FiCheckCircle />} {message}</p>}{success && <div className="actions"><Link className="button-link" to="/profile">Build candidate profile →</Link><Link to="/dashboard">Open dashboard</Link></div>}</form><p className="muted">Each upload creates a separate resume version. Your existing profiles and corrections stay linked to their original version.</p></main></>;
}
