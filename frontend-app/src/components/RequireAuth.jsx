import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import api from "../lib/api";

const RequireAuth = ({ children, role }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessOk, setAccessOk] = useState(false);
  const [accessError, setAccessError] = useState("");

  useEffect(() => {
    let canceled = false;

    const handleAccessError = (message) => {
      if (!canceled) {
        setAccessError(message);
        setAccessOk(false);
        setAccessLoading(false);
      }
    };

    const checkAccess = async () => {
      if (!user) {
        setAccessLoading(false);
        return;
      }
      if (user.role === "admin") {
        setAccessOk(true);
        setAccessError("");
        setAccessLoading(false);
        return;
      }

      setAccessLoading(true);
      setAccessError("");
      try {
        const res = await api.get("/api/access/status");
        if (canceled) return;

        if (res.data?.allowed) {
          setAccessOk(true);
          setAccessLoading(false);
          return;
        }

        if (!res.data?.geo_required) {
          handleAccessError(res.data?.message || "Access denied.");
          return;
        }

        if (!navigator.geolocation) {
          handleAccessError(
            "Geolocation is not supported in this browser. Please use office Wi-Fi."
          );
          return;
        }

        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              const geoRes = await api.post("/api/access/geo-check", {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              });
              if (canceled) return;
              if (geoRes.data?.allowed) {
                setAccessOk(true);
                setAccessLoading(false);
              } else {
                handleAccessError(geoRes.data?.message || "Access denied.");
              }
            } catch (err) {
              const message =
                err?.response?.data?.detail ||
                err?.message ||
                "Location verification failed.";
              handleAccessError(message);
            }
          },
          (err) => {
            if (err?.code === 1) {
              handleAccessError(
                "Location permission denied. Please allow location or use office Wi-Fi."
              );
            } else {
              handleAccessError(
                "Unable to fetch location. Please try again or use office Wi-Fi."
              );
            }
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
        );
      } catch (err) {
        const message =
          err?.response?.data?.detail ||
          err?.message ||
          "Access check failed. Please try again.";
        handleAccessError(message);
      }
    };

    checkAccess();

    return () => {
      canceled = true;
    };
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (role && user.role !== role) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-semibold text-foreground">Access denied</h1>
        <p className="text-muted-foreground mt-2">
          You do not have permission to view this page.
        </p>
      </div>
    );
  }

  if (accessLoading) {
    return (
      <div className="min-h-[60vh] grid place-items-center text-muted-foreground">
        Checking access...
      </div>
    );
  }

  if (!accessOk && user.role !== "admin") {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-semibold text-foreground">Access denied</h1>
        <p className="text-muted-foreground mt-2">
          {accessError || "You do not have permission to view this page."}
        </p>
      </div>
    );
  }

  return children;
};

export default RequireAuth;
