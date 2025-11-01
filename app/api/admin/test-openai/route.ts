import { NextRequest } from "next/server";
import { logJsonLine } from "@/lib/logger";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function GET(req: NextRequest) {
  const adminToken = process.env.ADMIN_TOKEN;
  const providedToken = req.headers.get("x-admin-token");
  if (adminToken && providedToken !== adminToken) {
    await logJsonLine("admin_openai_healthcheck", {
      stage: "unauthorized",
      provided: providedToken ? "present" : "missing",
    });
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const apiKey = process.env.API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    await logJsonLine("admin_openai_healthcheck", {
      stage: "missing_api_key",
    });
    return json(
      {
        ok: false,
        error: "Missing OpenAI API key (API_KEY or OPENAI_API_KEY)",
      },
      500
    );
  }

  const start = Date.now();
  try {
    await logJsonLine("admin_openai_healthcheck", {
      stage: "request",
      endpoint: "models",
    });

    const response = await fetch("https://api.openai.com/v1/models?limit=1", {
      method: "GET",
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    const durationMs = Date.now() - start;

    if (!response.ok) {
      let errorMessage = `OpenAI API request failed (HTTP ${response.status})`;
      try {
        const text = await response.text();
        if (text) {
          const body = JSON.parse(text);
          if (body?.error?.message) errorMessage = body.error.message;
        }
      } catch {
        // ignore parsing errors
      }

      await logJsonLine("admin_openai_healthcheck", {
        stage: "response",
        status: response.status,
        ok: false,
        durationMs,
      });

      return json({ ok: false, error: errorMessage }, response.status === 401 ? 401 : 500);
    }

    await logJsonLine("admin_openai_healthcheck", {
      stage: "response",
      status: response.status,
      ok: true,
      durationMs,
    });

    return json({ ok: true });
  } catch (error) {
    await logJsonLine("admin_openai_healthcheck", {
      stage: "exception",
      message: (error as Error).message,
      durationMs: Date.now() - start,
    });
    return json({ ok: false, error: "Failed to reach OpenAI API" }, 500);
  }
}
