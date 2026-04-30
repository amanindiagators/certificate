import { useEffect, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

function getClientName(client) {
  return client?.display_name || client?.company_name || client?.person_name || "";
}

function getClientMeta(client) {
  return [client?.pan, client?.cin, client?.gstin].filter(Boolean).join(" | ");
}

export default function ClientSelector({
  entityType,
  onSelect,
  label = "Saved Client",
  placeholder = "Search by name, PAN, CIN, or GSTIN",
  className = "",
}) {
  const { user } = useAuth();
  const canUseClientMaster = user?.role === "admin" || user?.role === "data_executive";
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canUseClientMaster || !open) return undefined;

    let canceled = false;
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        const res = await api.get("/api/clients", {
          params: {
            q: query.trim() || undefined,
            entity_type: entityType || undefined,
            limit: 8,
          },
        });
        if (!canceled) {
          setItems(Array.isArray(res.data?.items) ? res.data.items : []);
        }
      } catch {
        if (!canceled) setItems([]);
      } finally {
        if (!canceled) setLoading(false);
      }
    }, 250);

    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [canUseClientMaster, entityType, open, query]);

  if (!canUseClientMaster) return null;

  const handleSelect = (client) => {
    setQuery(getClientName(client));
    setOpen(false);
    onSelect?.(client);
  };

  return (
    <div className={`relative ${className}`}>
      <Label>{label}</Label>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="pl-9 pr-10"
          autoComplete="off"
        />
        {query ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuery("");
              setItems([]);
              setOpen(true);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute z-40 mt-2 max-h-72 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading
            </div>
          ) : items.length ? (
            items.map((client) => (
              <button
                key={client.id}
                type="button"
                className="flex w-full items-start gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(client)}
              >
                <Check className="mt-0.5 h-4 w-4 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{getClientName(client)}</span>
                  {getClientMeta(client) ? (
                    <span className="block truncate text-xs text-muted-foreground">{getClientMeta(client)}</span>
                  ) : null}
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">No saved clients found</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
