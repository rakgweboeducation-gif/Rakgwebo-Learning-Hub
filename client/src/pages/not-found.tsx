import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f9fafb",
        padding: "20px",
      }}
    >
      <div
        style={{
          maxWidth: "400px",
          width: "100%",
          background: "white",
          padding: "24px",
          borderRadius: "10px",
          boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "10px",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <AlertCircle style={{ color: "red" }} />
          <h1 style={{ fontSize: "22px", fontWeight: "bold" }}>
            404 Page Not Found
          </h1>
        </div>

        <p style={{ marginTop: "16px", color: "#555" }}>
          Did you forget to add the page to the router?
        </p>

        <div style={{ marginTop: "24px" }}>
          <Link href="/">
            <a
              style={{
                display: "inline-block",
                width: "100%",
                padding: "10px",
                background: "#3b82f6",
                color: "white",
                borderRadius: "6px",
                textDecoration: "none",
              }}
            >
              Back to Home
            </a>
          </Link>
        </div>
      </div>
    </div>
  );
}
