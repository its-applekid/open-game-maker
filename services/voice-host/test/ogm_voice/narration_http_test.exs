defmodule OgmVoice.NarrationHTTPTest do
  use ExUnit.Case, async: false

  import Plug.Conn
  import Plug.Test

  alias OgmVoice.HTTP.Router

  @secret "ogm-http-internal-secret-0123456789abcdef"

  defmodule MissingCredentials do
    @behaviour VoiceConverse.Ports.Credentials

    @impl true
    def fetch(_provider, _purpose), do: {:error, :missing}
  end

  defmodule SessionOnlyProvider do
    def open(_spec), do: raise("narration must not open a session")
  end

  setup do
    dir = Path.join(System.tmp_dir!(), "ogm_voice_narration_#{System.unique_integer([:positive])}")
    File.mkdir_p!(dir)
    on_exit(fn -> File.rm_rf!(dir) end)
    %{render_dir: dir}
  end

  defp post(body, opts) do
    conn =
      conn(:post, "/internal/narration", Jason.encode!(body))
      |> put_req_header("content-type", "application/json")
      |> put_req_header("x-ogm-internal", @secret)

    Router.call(conn, Router.init(opts))
  end

  defp opts(render_dir, extra \\ []) do
    Keyword.merge(
      [
        secret: fn -> @secret end,
        provider: "fake",
        narration: fn ->
          [
            render_dir: render_dir,
            provider: VoiceConverse.Testing.FakeProvider,
            provider_id: :fake,
            credentials: OgmVoice.Ports.Credentials,
            privacy: %{}
          ]
        end
      ],
      extra
    )
  end

  test "renders a WAV and returns the fake provider alignment", %{render_dir: dir} do
    conn = post(%{text: "hello there little fox", voice_id: "default", format: "pcm_24000"}, opts(dir))
    assert conn.status == 200

    body = Jason.decode!(conn.resp_body)
    assert body["format"] == "pcm_24000"
    assert Enum.map(body["alignment"], & &1["text"]) == ~w(hello there little fox)

    assert Enum.map(body["alignment"], &{&1["start_ms"], &1["end_ms"]}) ==
             [{0, 250}, {250, 500}, {500, 750}, {750, 1000}]

    assert File.exists?(body["wav_path"])
    assert <<"RIFF", _::binary>> = File.read!(body["wav_path"])
  end

  test "rejects text over the package limit", %{render_dir: dir} do
    conn = post(%{text: String.duplicate("a", 6_000), voice_id: "default", format: "pcm_24000"}, opts(dir))
    assert conn.status == 400
    assert Jason.decode!(conn.resp_body) == %{"error" => "text_too_long"}
    assert File.ls!(dir) == []
  end

  test "maps a missing render credential to provider_auth", %{render_dir: dir} do
    missing =
      opts(dir,
        narration: fn ->
          [
            render_dir: dir,
            provider: VoiceConverse.Testing.FakeProvider,
            provider_id: :fake,
            credentials: MissingCredentials,
            privacy: %{}
          ]
        end
      )

    conn = post(%{text: "hello", voice_id: "default", format: "pcm_24000"}, missing)
    assert conn.status == 503
    assert Jason.decode!(conn.resp_body) == %{"error" => "provider_auth"}
    assert File.ls!(dir) == []
  end

  test "maps a session-only provider to unsupported", %{render_dir: dir} do
    unsupported =
      opts(dir,
        narration: fn ->
          [
            render_dir: dir,
            provider: SessionOnlyProvider,
            provider_id: :session_only,
            credentials: OgmVoice.Ports.Credentials,
            privacy: %{}
          ]
        end
      )

    conn = post(%{text: "hello", voice_id: "default", format: "pcm_24000"}, unsupported)
    assert conn.status == 501
    assert Jason.decode!(conn.resp_body) == %{"error" => "provider_has_no_render"}
    assert File.ls!(dir) == []
  end

  test "requires the internal secret", %{render_dir: dir} do
    conn = conn(:post, "/internal/narration", Jason.encode!(%{text: "hello"}))
    conn = Router.call(conn, Router.init(opts(dir)))
    assert conn.status == 401
  end
end
