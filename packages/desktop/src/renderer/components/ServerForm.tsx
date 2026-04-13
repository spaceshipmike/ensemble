import React, { useState } from "react";

interface ServerFormProps {
  initial?: {
    name: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    enabled?: boolean;
  };
  existingNames: string[];
  onSubmit: (name: string, server: Record<string, unknown>) => void;
  onCancel: () => void;
}

interface FormErrors {
  name?: string;
  command?: string;
}

export function ServerForm({ initial, existingNames, onSubmit, onCancel }: ServerFormProps) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [command, setCommand] = useState(initial?.command ?? "");
  const [args, setArgs] = useState(initial?.args?.join(" ") ?? "");
  const [envText, setEnvText] = useState(
    initial?.env
      ? Object.entries(initial.env).map(([k, v]) => `${k}=${v}`).join("\n")
      : "",
  );
  const [url, setUrl] = useState(initial?.url ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [errors, setErrors] = useState<FormErrors>({});

  const validate = (): boolean => {
    const e: FormErrors = {};

    if (!name.trim()) {
      e.name = "Name is required";
    } else if (!isEdit && existingNames.includes(name.trim())) {
      e.name = "A server with this name already exists";
    } else if (!/^[a-zA-Z0-9_-]+$/.test(name.trim())) {
      e.name = "Name must contain only letters, numbers, hyphens, and underscores";
    }

    if (!command.trim() && !url.trim()) {
      e.command = "Either command or URL is required";
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const env: Record<string, string> = {};
    for (const line of envText.split("\n").filter(Boolean)) {
      const idx = line.indexOf("=");
      if (idx > 0) {
        env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    }

    const server: Record<string, unknown> = { enabled };
    if (command.trim()) {
      server.command = command.trim();
      if (args.trim()) {
        server.args = args.trim().split(/\s+/);
      }
    }
    if (url.trim()) {
      server.url = url.trim();
    }
    if (Object.keys(env).length > 0) {
      server.env = env;
    }

    onSubmit(name.trim(), server);
  };

  return (
    <form
      data-testid="server-form"
      onSubmit={handleSubmit}
      className="p-6 bg-surface-card rounded-lg border border-surface-border space-y-4"
    >
      <h3 className="text-subhead font-medium text-sidebar-text">
        {isEdit ? `Edit ${initial.name}` : "Add Server"}
      </h3>

      <div>
        <label className="block text-secondary text-sidebar-muted mb-1">Name</label>
        <input
          data-testid="server-name-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isEdit}
          className={`w-full px-3 py-2 bg-surface-bg border rounded-md text-body text-sidebar-text
            ${errors.name ? "border-status-error" : "border-surface-border"}
            focus:outline-none focus:border-accent`}
          placeholder="my-server"
        />
        {errors.name && (
          <div data-testid="name-error" className="text-secondary text-status-error mt-1">
            {errors.name}
          </div>
        )}
      </div>

      <div>
        <label className="block text-secondary text-sidebar-muted mb-1">Command</label>
        <input
          data-testid="server-command-input"
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          className={`w-full px-3 py-2 bg-surface-bg border rounded-md text-body text-sidebar-text
            ${errors.command ? "border-status-error" : "border-surface-border"}
            focus:outline-none focus:border-accent`}
          placeholder="npx -y @modelcontextprotocol/server-filesystem"
        />
        {errors.command && (
          <div data-testid="command-error" className="text-secondary text-status-error mt-1">
            {errors.command}
          </div>
        )}
      </div>

      <div>
        <label className="block text-secondary text-sidebar-muted mb-1">Arguments</label>
        <input
          data-testid="server-args-input"
          type="text"
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          className="w-full px-3 py-2 bg-surface-bg border border-surface-border rounded-md text-body text-sidebar-text focus:outline-none focus:border-accent"
          placeholder="/Users/me/documents (space-separated)"
        />
      </div>

      <div>
        <label className="block text-secondary text-sidebar-muted mb-1">URL (for HTTP/SSE transport)</label>
        <input
          data-testid="server-url-input"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full px-3 py-2 bg-surface-bg border border-surface-border rounded-md text-body text-sidebar-text focus:outline-none focus:border-accent"
          placeholder="http://localhost:3000/sse"
        />
      </div>

      <div>
        <label className="block text-secondary text-sidebar-muted mb-1">Environment (KEY=VALUE, one per line)</label>
        <textarea
          data-testid="server-env-input"
          value={envText}
          onChange={(e) => setEnvText(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 bg-surface-bg border border-surface-border rounded-md text-body text-sidebar-text font-mono focus:outline-none focus:border-accent resize-y"
          placeholder={"API_KEY=op://Dev/my-server/key\nDEBUG=true"}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="server-enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="rounded"
        />
        <label htmlFor="server-enabled" className="text-body text-sidebar-text">
          Enabled
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-body text-sidebar-muted hover:text-sidebar-text transition-colors"
        >
          Cancel
        </button>
        <button
          data-testid="server-submit-btn"
          type="submit"
          className="px-4 py-2 bg-accent text-surface-bg rounded-md text-body font-medium hover:bg-accent-hover transition-colors"
        >
          {isEdit ? "Save Changes" : "Add Server"}
        </button>
      </div>
    </form>
  );
}
