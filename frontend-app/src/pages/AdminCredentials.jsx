import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";

const HOURS_OPTIONS = [6, 12, 24, 48, 0];
const ROLE_OPTIONS = [
  { value: "temporary", label: "Temporary Employee" },
  { value: "staff", label: "Staff Employee" },
  { value: "data_executive", label: "Data Executive" },
];

const AdminCredentials = () => {
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [hours, setHours] = useState(12);
  const [role, setRole] = useState("temporary");
  const [canManageCertificates, setCanManageCertificates] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState(null);
  const [error, setError] = useState("");

  const [status, setStatus] = useState("active");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyDate, setHistoryDate] = useState("");
  const [historySuggestions, setHistorySuggestions] = useState([]);
  const [emailSuggestions, setEmailSuggestions] = useState([]);
  const [offices, setOffices] = useState([]);
  const [officesLoading, setOfficesLoading] = useState(false);
  const [officeName, setOfficeName] = useState("");
  const [officeIps, setOfficeIps] = useState("");
  const [officePlusCode, setOfficePlusCode] = useState("");
  const [officeLat, setOfficeLat] = useState("");
  const [officeLng, setOfficeLng] = useState("");
  const [officeRadius, setOfficeRadius] = useState("100");
  const [editingOfficeId, setEditingOfficeId] = useState(null);
  const [resolvingPlusCode, setResolvingPlusCode] = useState(false);

  const loadList = async (currentStatus = status) => {
    setLoading(true);
    try {
      const res = await api.get(`/api/auth/temp-credentials?status=${currentStatus}`);
      setItems(res.data.items || []);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to load credentials.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadOffices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const current = username.trim();
    if (!current) {
      setEmailSuggestions([]);
      return;
    }
    const q = current.toLowerCase();
    const filtered = users
      .filter((u) => u.email?.toLowerCase().includes(q))
      .slice(0, 6);
    if (filtered.length === 1 && filtered[0].email?.toLowerCase() === q) {
      setEmailSuggestions([]);
      return;
    }
    setEmailSuggestions(filtered);
  }, [username, users]);

  useEffect(() => {
    if (!historyQuery.trim()) {
      setHistorySuggestions([]);
      return;
    }
    const q = historyQuery.trim().toLowerCase();
    const filtered = users
      .filter(
        (u) =>
          u.email?.toLowerCase().includes(q) ||
          u.full_name?.toLowerCase().includes(q)
      )
      .slice(0, 6);
    setHistorySuggestions(filtered);
  }, [historyQuery, users]);

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await api.get("/api/auth/users");
      setUsers(res.data.items || []);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to load users.");
    } finally {
      setUsersLoading(false);
    }
  };

  const loadOffices = async () => {
    setOfficesLoading(true);
    try {
      const res = await api.get("/api/admin/offices");
      setOffices(res.data.items || []);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to load office locations.");
    } finally {
      setOfficesLoading(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const params = [];
      const q = historyQuery.trim();
      if (q) {
        const matchedUser = users.find(
          (u) =>
            u.email?.toLowerCase() === q.toLowerCase() ||
            u.full_name?.toLowerCase() === q.toLowerCase()
        );
        const email = matchedUser?.email || q;
        params.push(`email=${encodeURIComponent(email)}`);
      }

      if (historyDate) {
        const start = `${historyDate}T00:00:00`;
        const end = `${historyDate}T23:59:59.999`;
        params.push(`start=${encodeURIComponent(start)}`);
        params.push(`end=${encodeURIComponent(end)}`);
      }
      const query = params.length ? `?${params.join("&")}` : "";
      const res = await api.get(`/api/history${query}`);
      setHistoryItems(res.data.items || []);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to load history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!historyDate) {
      const today = new Date().toISOString().slice(0, 10);
      setHistoryDate(today);
      return;
    }
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyDate, historyQuery, users]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    setCreateResult(null);
    setCreating(true);
    try {
      const payload = {
        username: username.trim(),
        expires_in_hours: Number(hours),
        role,
        can_manage_certificates: canManageCertificates,
      };
      if (fullName.trim()) {
        payload.full_name = fullName.trim();
      }
      if (password.trim()) {
        payload.password = password.trim();
      }
      const res = await api.post("/api/auth/temp-credentials", payload);
      setCreateResult(res.data);
      setUsername("");
      setFullName("");
      setPassword("");
      setRole("temporary");
      setCanManageCertificates(false);
      await loadList();
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to create credentials.");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (accessId) => {
    setError("");
    try {
      await api.post("/api/auth/revoke", { temp_access_id: accessId });
      await loadList();
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to revoke credentials.");
    }
  };

  const resetOfficeForm = () => {
    setOfficeName("");
    setOfficeIps("");
    setOfficePlusCode("");
    setOfficeLat("");
    setOfficeLng("");
    setOfficeRadius("100");
    setEditingOfficeId(null);
  };

  const handleResolveOfficePlusCode = async () => {
    const plusCode = officePlusCode.trim();
    if (!plusCode || resolvingPlusCode) return;

    try {
      setError("");
      setResolvingPlusCode(true);
      const payload = { plus_code: plusCode };
      if (officeLat.trim()) payload.lat = Number(officeLat.trim());
      if (officeLng.trim()) payload.lng = Number(officeLng.trim());
      const res = await api.post("/api/admin/offices/resolve-plus-code", payload);
      setOfficeLat(Number(res.data.lat).toFixed(6));
      setOfficeLng(Number(res.data.lng).toFixed(6));
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to resolve Plus Code.");
    } finally {
      setResolvingPlusCode(false);
    }
  };

  const handleCreateOffice = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const ips = officeIps
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      const payload = {
        name: officeName.trim(),
        ips,
      };
      if (officePlusCode.trim()) payload.plus_code = officePlusCode.trim();
      if (officeLat.trim()) payload.lat = Number(officeLat.trim());
      if (officeLng.trim()) payload.lng = Number(officeLng.trim());
      if (officeRadius.trim()) payload.radius_m = Number(officeRadius.trim());

      if (editingOfficeId) {
        await api.put(`/api/admin/offices/${editingOfficeId}`, payload);
      } else {
        await api.post("/api/admin/offices", payload);
      }
      resetOfficeForm();
      await loadOffices();
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          (editingOfficeId
            ? "Failed to update office location."
            : "Failed to create office location.")
      );
    }
  };

  const handleDeleteOffice = async (officeId) => {
    setError("");
    try {
      await api.delete(`/api/admin/offices/${officeId}`);
      await loadOffices();
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to delete office location.");
    }
  };

  const handleEditOffice = (office) => {
    setEditingOfficeId(office.id);
    setOfficeName(office.name || "");
    setOfficeIps((office.ips || []).join(", "));
    setOfficePlusCode("");
    setOfficeLat(office.lat !== null && office.lat !== undefined ? String(office.lat) : "");
    setOfficeLng(office.lng !== null && office.lng !== undefined ? String(office.lng) : "");
    setOfficeRadius(
      office.radius_m !== null && office.radius_m !== undefined
        ? String(office.radius_m)
        : "100"
    );
  };

  const summary = useMemo(() => {
    const active = items.filter((i) => i.is_active).length;
    const expired = items.filter((i) => i.is_expired).length;
    return { active, expired, total: items.length };
  }, [items]);

  return (
    <div className="w-[95%] max-w-[1500px] mx-auto px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Temporary Credentials</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create, monitor, and revoke short‑lived logins.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          Active: {summary.active} · Expired: {summary.expired} · Total: {summary.total}
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_1.4fr]">
        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-border bg-card shadow-sm p-6"
        >
          <h2 className="text-lg font-semibold text-foreground">Create Credential</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="text-sm text-foreground">Email</label>
              <div className="relative">
                <input
                  className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onBlur={() => {
                    setTimeout(() => setEmailSuggestions([]), 150);
                  }}
                  onFocus={() => {
                    if (emailSuggestions.length === 0 && username.trim()) {
                      const q = username.trim().toLowerCase();
                      const filtered = users
                        .filter((u) => u.email?.toLowerCase().includes(q))
                        .slice(0, 6);
                      setEmailSuggestions(filtered);
                    }
                  }}
                  placeholder="temp.user@example.com"
                  required
                />
                {emailSuggestions.length > 0 ? (
                  <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-white shadow">
                    {emailSuggestions.map((u) => (
                    <button
                      type="button"
                      key={u.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setUsername(u.email || "");
                        setFullName(u.full_name || "");
                        setEmailSuggestions([]);
                      }}
                    >
                        <div className="text-foreground">{u.email}</div>
                        <div className="text-xs text-muted-foreground">{u.full_name || "—"}</div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div>
              <label className="text-sm text-foreground">Full Name</label>
              <input
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="User name"
              />
            </div>

            <div>
              <label className="text-sm text-foreground">Password (optional)</label>
              <input
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave empty to auto-generate"
              />
            </div>

            <div>
              <label className="text-sm text-foreground">Role</label>
              <select
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Data Executive can manage clients and must pass office location checks.
              </p>
            </div>

            <div>
              <label className="text-sm text-foreground">Expires In</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {HOURS_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setHours(opt)}
                    className={`px-3 py-1 rounded-full border text-sm ${
                      hours === opt
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt === 0 ? "Permanent" : `${opt} hours`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm text-foreground">Certificate Permissions</label>
              <div className="mt-2 flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={canManageCertificates}
                    onChange={(e) => setCanManageCertificates(e.target.checked)}
                  />
                  Allow Edit & Delete
                </label>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={creating}
            className="mt-6 w-full rounded-md bg-primary px-4 py-2 text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            {creating ? "Creating..." : "Create Credential"}
          </button>

          {createResult ? (
            <div className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-700">
              <div>Username: <span className="font-medium">{createResult.user?.username}</span></div>
              <div>Role: <span className="font-medium">{createResult.user?.role}</span></div>
              <div>Temporary Password: <span className="font-medium">{createResult.temporary_password}</span></div>
              <div>Expires At: <span className="font-medium">{createResult.expires_at}</span></div>
              <div>
                Permissions:{" "}
                <span className="font-medium">
                  Manage Certificates{" "}
                  {Boolean(
                    createResult.user?.can_manage_certificates ||
                      createResult.user?.can_edit_certificates ||
                      createResult.user?.can_delete_certificates
                  )
                    ? "Yes"
                    : "No"}
                </span>
              </div>
              <div className="text-xs text-emerald-700/70 mt-2">
                This password is shown only once. Copy it now.
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </form>

        <div className="rounded-2xl border border-border bg-card shadow-sm p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">Credentials</h2>
            <div className="flex gap-2">
              {["active", "expired", "all"].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setStatus(opt)}
                  className={`px-3 py-1 rounded-full border text-sm ${
                    status === opt
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4">Username</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Expires</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-muted-foreground">
                      No credentials found.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="border-b border-border/60">
                      <td className="py-3 pr-4 text-foreground">{item.username}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{item.role || "temporary"}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{item.expires_at || "—"}</td>
                      <td className="py-3 pr-4">
                        {item.is_revoked ? (
                          <span className="text-destructive">Revoked</span>
                        ) : item.is_expired ? (
                          <span className="text-muted-foreground">Expired</span>
                        ) : (
                          <span className="text-emerald-600">Active</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleRevoke(item.id)}
                          disabled={item.is_revoked}
                          className="text-sm px-3 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <form
          onSubmit={handleCreateOffice}
          className="rounded-2xl border border-border bg-card shadow-sm p-6"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Access Locations</h2>
            <button
              type="button"
              onClick={loadOffices}
              className="text-sm px-3 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground"
            >
              Refresh
            </button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Add office IP ranges and geo coordinates for staff access.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <label className="text-sm text-foreground">Location Name</label>
              <input
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
                value={officeName}
                onChange={(e) => setOfficeName(e.target.value)}
                placeholder="Main Office"
                required
              />
            </div>

            <div>
              <label className="text-sm text-foreground">Office IPs (comma separated)</label>
              <input
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
                value={officeIps}
                onChange={(e) => setOfficeIps(e.target.value)}
                placeholder="203.0.113.0/24,198.51.100.10"
              />
            </div>

            <div>
              <label className="text-sm text-foreground">Plus Code (optional)</label>
              <div className="mt-2 flex gap-2">
                <input
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                  value={officePlusCode}
                  onChange={(e) => setOfficePlusCode(e.target.value)}
                  onBlur={handleResolveOfficePlusCode}
                  placeholder="J47V+HC Patna, Bihar"
                />
                <button
                  type="button"
                  onClick={handleResolveOfficePlusCode}
                  disabled={!officePlusCode.trim() || resolvingPlusCode}
                  className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
                >
                  {resolvingPlusCode ? "Resolving..." : "Resolve"}
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Full Plus Codes resolve directly. Short Plus Codes can include a place, for example J47V+HC Patna.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="text-sm text-foreground">Latitude</label>
                <input
                  className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
                  value={officeLat}
                  onChange={(e) => setOfficeLat(e.target.value)}
                  placeholder="19.0760"
                />
              </div>
              <div>
                <label className="text-sm text-foreground">Longitude</label>
                <input
                  className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
                  value={officeLng}
                  onChange={(e) => setOfficeLng(e.target.value)}
                  placeholder="72.8777"
                />
              </div>
              <div>
                <label className="text-sm text-foreground">Radius (m)</label>
                <input
                  className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
                  value={officeRadius}
                  onChange={(e) => setOfficeRadius(e.target.value)}
                  placeholder="100"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <button
              type="submit"
              className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground font-medium hover:bg-primary/90"
            >
              {editingOfficeId ? "Update Location" : "Add Location"}
            </button>
            {editingOfficeId ? (
              <button
                type="button"
                onClick={resetOfficeForm}
                className="w-full rounded-md border border-border px-4 py-2 text-muted-foreground hover:text-foreground"
              >
                Cancel Edit
              </button>
            ) : null}
          </div>
        </form>

        <div className="rounded-2xl border border-border bg-card shadow-sm p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Saved Locations</h2>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">IPs</th>
                  <th className="py-2 pr-4">Geo</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {officesLoading ? (
                  <tr>
                    <td colSpan="4" className="py-6 text-center text-muted-foreground">
                      Loading...
                    </td>
                  </tr>
                ) : offices.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="py-6 text-center text-muted-foreground">
                      No locations added.
                    </td>
                  </tr>
                ) : (
                  offices.map((office) => {
                    const ipText = (office.ips || []).join(", ") || "-";
                    const geoText =
                      office.lat && office.lng && office.radius_m
                        ? `${office.lat}, ${office.lng} (${office.radius_m}m)`
                        : "-";
                    return (
                      <tr key={office.id} className="border-b border-border/60">
                        <td className="py-3 pr-4 text-foreground">{office.name}</td>
                        <td className="py-3 pr-4 text-muted-foreground break-words">
                          {ipText}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">{geoText}</td>
                        <td className="py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditOffice(office)}
                              className="text-sm px-3 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteOffice(office.id)}
                              className="text-sm px-3 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl border border-border bg-card shadow-sm p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Users</h2>
            <button
              type="button"
              onClick={loadUsers}
              className="text-sm px-3 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground"
            >
              Refresh
            </button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Cert Permissions</th>
                  <th className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {usersLoading ? (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-muted-foreground">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="border-b border-border/60">
                      <td className="py-3 pr-4 text-foreground">{u.email}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{u.full_name || "—"}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{u.role}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        Manage Certificates{" "}
                        {Boolean(
                          u.can_manage_certificates ||
                            u.can_edit_certificates ||
                            u.can_delete_certificates
                        )
                          ? "Yes"
                          : "No"}
                      </td>
                      <td className="py-3 text-muted-foreground">{u.created_at}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">History</h2>
            <button
              type="button"
              onClick={loadHistory}
              className="text-sm px-3 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="relative">
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
                placeholder="Filter by email or name"
              />
              {historySuggestions.length > 0 ? (
                <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-white shadow">
                  {historySuggestions.map((u) => (
                    <button
                      type="button"
                      key={u.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                      onClick={() => {
                        setHistoryQuery(u.email || "");
                        setHistorySuggestions([]);
                      }}
                    >
                      <div className="text-foreground">{u.email}</div>
                      <div className="text-xs text-muted-foreground">{u.full_name || "—"}</div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <input
              type="date"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={historyDate}
              onChange={(e) => setHistoryDate(e.target.value)}
            />
          </div>

          <div className="mt-4 max-h-[360px] overflow-y-auto overflow-x-hidden">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4 w-[20%]">Email</th>
                  <th className="py-2 pr-4 w-[20%]">Action</th>
                  <th className="py-2 pr-4 w-[35%]">Data</th>
                  <th className="py-2 w-[25%]">Time</th>
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr>
                    <td colSpan="4" className="py-6 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : historyItems.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="py-6 text-center text-muted-foreground">
                      No history records.
                    </td>
                  </tr>
                ) : (
                  historyItems.map((h) => (
                    <tr key={h.id} className="border-b border-border/60">
                      <td className="py-3 pr-4 text-foreground break-words">{h.email}</td>
                      <td className="py-3 pr-4 text-muted-foreground break-words">{h.action_type}</td>
                      <td className="py-3 pr-4 text-muted-foreground break-words">
                        {h.action_data ? JSON.stringify(h.action_data) : "—"}
                      </td>
                      <td className="py-3 text-muted-foreground break-words">{h.timestamp}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminCredentials;
