// src/components/Navbar.jsx

import { Link, useNavigate } from "react-router-dom";

function Navbar() {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.clear();
    navigate("/login");
  };

  return (
    <nav
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "15px 30px",
        backgroundColor: "#1e293b",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "20px",
        }}
      >
        <Link
          to="/dashboard"
          style={{
            color: "white",
            textDecoration: "none",
          }}
        >
          Dashboard
        </Link>

        <Link
          to="/notes"
          style={{
            color: "white",
            textDecoration: "none",
          }}
        >
          Notes
        </Link>

        <Link
          to="/resume"
          style={{
            color: "white",
            textDecoration: "none",
          }}
        >
          Resume
        </Link>
      </div>

      <button
        onClick={logout}
        style={{
          backgroundColor: "#ef4444",
          color: "white",
          border: "none",
          padding: "8px 15px",
          borderRadius: "5px",
          cursor: "pointer",
        }}
      >
        Logout
      </button>
    </nav>
  );
}

export default Navbar;