defmodule OgmVoice.HTTP.Router do
  @moduledoc """
  Loopback-only internal HTTP: `GET /healthz` and `POST /internal/briefing` (requires
  `X-OGM-Internal: <OGM_VOICE_INTERNAL_SECRET>`). Everything else is 404.
  """
  @behaviour Plug

  import Plug.Conn

  @max_body_bytes 256 * 1024

  @impl true
  def init(opts), do: opts

  @impl true
  def call(%{method: "GET", path_info: ["healthz"]} = conn, opts) do
    json(conn, 200, %{ok: true, service: "voice-host", provider: opts[:provider]})
  end

  def call(%{method: "POST", path_info: ["internal", "briefing"]} = conn, opts) do
    with :ok <- authorize(conn, opts[:secret]),
         {:ok, body, conn} <- read_body(conn, length: @max_body_bytes),
         {:ok, push} <- decode(body),
         :ok <- OgmVoice.Cache.put(push) do
      send_resp(conn, 204, "")
    else
      :unauthorized -> json(conn, 401, %{error: "unauthorized"})
      {:more, _partial, conn} -> json(conn, 413, %{error: "too_large"})
      {:error, reason} when is_atom(reason) -> json(conn, 400, %{error: Atom.to_string(reason)})
    end
  end

  def call(conn, _opts), do: json(conn, 404, %{error: "not_found"})

  defp authorize(conn, secret) do
    expected = secret.()
    given = internal_secret(conn)

    if is_binary(expected) and expected != "" and is_binary(given) and Plug.Crypto.secure_compare(given, expected),
      do: :ok,
      else: :unauthorized
  end

  defp internal_secret(conn) do
    case get_req_header(conn, "x-ogm-internal") do
      [given] -> given
      [] -> bearer_secret(conn)
      _ -> nil
    end
  end

  defp bearer_secret(conn) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> given] when given != "" -> given
      _ -> nil
    end
  end

  defp decode(body) do
    case Jason.decode(body) do
      {:ok, push} when is_map(push) -> {:ok, push}
      _ -> {:error, :invalid_json}
    end
  end

  defp json(conn, status, body) do
    conn |> put_resp_content_type("application/json") |> send_resp(status, Jason.encode!(body))
  end
end
