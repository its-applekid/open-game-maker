defmodule OgmVoice.HTTPTest do
  use ExUnit.Case, async: false

  import Plug.Test
  import Plug.Conn

  alias OgmVoice.HTTP.Router

  @secret "ogm-http-internal-secret-0123456789abcdef"
  @push %{"target_key" => "scope:s1", "observed_at" => "2026-11-01T05:25:00Z", "summary" => "Scoping"}

  setup do
    start_supervised!(OgmVoice.Cache)
    :ok
  end

  defp post(body, secret) do
    conn = conn(:post, "/internal/briefing", body) |> put_req_header("content-type", "application/json")
    conn = if secret, do: put_req_header(conn, "x-ogm-internal", secret), else: conn
    Router.call(conn, opts())
  end

  defp opts, do: Router.init(secret: fn -> @secret end, provider: "fake")

  test "stores a push carrying the shared secret" do
    assert %{status: 204} = post(Jason.encode!(@push), @secret)
    assert {:ok, _entry} = OgmVoice.Cache.get("scope:s1")
  end

  test "refuses a missing or wrong secret and stores nothing" do
    assert %{status: 401} = post(Jason.encode!(@push), nil)
    assert %{status: 401} = post(Jason.encode!(@push), @secret <> "x")
    assert :error = OgmVoice.Cache.get("scope:s1")
  end

  test "refuses every push when the host secret is unset" do
    opts = Router.init(secret: fn -> nil end, provider: "fake")
    conn = conn(:post, "/internal/briefing", Jason.encode!(@push)) |> put_req_header("x-ogm-internal", "")
    assert %{status: 401} = Router.call(conn, opts)
  end

  test "answers 400 for an invalid push and 413 for an oversized one" do
    assert %{status: 400} = post("not json", @secret)
    assert %{status: 400} = post(Jason.encode!(Map.delete(@push, "observed_at")), @secret)
    big = Jason.encode!(Map.put(@push, "summary", String.duplicate("a", 300 * 1024)))
    assert %{status: 413} = post(big, @secret)
    assert :error = OgmVoice.Cache.get("scope:s1")
  end

  test "health needs no secret and reports the provider; other paths are 404" do
    conn = Router.call(conn(:get, "/healthz"), opts())
    assert conn.status == 200
    assert Jason.decode!(conn.resp_body) == %{"ok" => true, "service" => "voice-host", "provider" => "fake"}
    assert %{status: 404} = Router.call(conn(:get, "/internal/briefing"), opts())
  end
end
