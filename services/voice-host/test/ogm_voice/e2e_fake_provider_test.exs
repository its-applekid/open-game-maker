defmodule OgmVoice.E2EFakeProviderTest do
  # The whole path with no provider key: API-format token → real WebSocket → FakeProvider session →
  # draft → confirm → the API stub receives the instruct callback → `delivery: delivered`.
  use ExUnit.Case, async: false

  alias OgmVoice.Test.{ApiStub, WsClient}
  alias VoiceConverse.{Events, SessionRegistry}
  alias VoiceConverse.Testing.FakeProvider

  @token_secret "ogm-e2e-token-secret-0123456789abcdef"
  @internal_secret "ogm-e2e-internal-secret-0123456789abcdef"
  @target %{"kind" => "build", "game_id" => "g1", "job_id" => "j1", "ticket" => "142", "creator_id" => "u1"}

  defmodule FakeDictation do
    def start(opts) do
      owner = Keyword.fetch!(opts, :owner)
      test = Keyword.fetch!(opts, :test)
      send(test, {:dictation_started, owner})
      Agent.start(fn -> %{owner: owner, test: test} end)
    end

    def push(pid, audio) do
      %{test: test} = Agent.get(pid, & &1)
      send(test, {:dictation_audio, audio})
    end

    def commit(pid) do
      %{owner: owner, test: test} = Agent.get(pid, & &1)
      send(test, :dictation_committed)
      send(owner, {:voice_transcript, :final, "make the door blue"})
      send(owner, {:voice_closed})
    end

    def stop(pid) do
      if Process.alive?(pid), do: Agent.stop(pid)
      :ok
    end
  end

  setup context do
    render_dir = Path.join(System.tmp_dir!(), "ogm_voice_e2e_#{System.unique_integer([:positive])}")

    {stub, api_url} =
      ApiStub.start!(self(), Map.get(context, :api_status, 200), 0, Map.get(context, :api_body))

    on_exit(fn ->
      Process.exit(stub, :shutdown)
      File.rm_rf!(render_dir)
    end)

    config = %OgmVoice.Config{
      port: 0,
      internal_port: 0,
      provider: "fake",
      llm: "fake",
      max_sessions: 2,
      api_internal_url: api_url,
      render_dir: render_dir,
      dictation_transcriber: FakeDictation,
      dictation_transcriber_opts: [test: self()],
      token_secret: fn -> @token_secret end,
      internal_secret: fn -> @internal_secret end
    }

    host =
      start_supervised!(%{
        id: :host,
        start: {Supervisor, :start_link, [OgmVoice.Application.children(config), [strategy: :one_for_one]]},
        type: :supervisor
      })

    %{port: listener_port(host, :voice_socket), internal_port: listener_port(host, :internal_http)}
  end

  test "a minted token opens a conversation that delivers a confirmed draft to the API", %{port: port} do
    {:ok, ws} = WsClient.connect(port, "/?token=" <> token("u1"))
    ws = WsClient.send_json(ws, %{v: 1, type: "start", target: @target})
    {_, ws} = WsClient.await(ws, &match?(%{"type" => "state", "state" => "listening"}, &1))
    provider = provider_ref()

    :ok = FakeProvider.emit(provider, %Events.UserTranscript{text: "Make it red", final?: true})
    :ok = FakeProvider.emit(provider, %Events.AgentText{turn_id: "t1", text: "What should change?", final?: true})
    {frame, ws} = WsClient.await(ws, &match?(%{"type" => "agent_text"}, &1))
    assert %{"text" => "What should change?", "final" => true} = frame

    assert_receive {:api_stub, "POST", "/internal/voice/transcript", [@internal_secret], creator_body}, 2_000
    assert_receive {:api_stub, "POST", "/internal/voice/transcript", [@internal_secret], agent_body}, 2_000

    assert %{
             "actor" => "creator",
             "conversation_id" => conversation_id,
             "target" => @target,
             "text" => "Make it red",
             "turn_id" => "user-1"
           } = Jason.decode!(creator_body)

    assert %{
             "actor" => "agent",
             "conversation_id" => ^conversation_id,
             "target" => @target,
             "text" => "What should change?",
             "turn_id" => "t1"
           } = Jason.decode!(agent_body)

    :ok =
      FakeProvider.emit(provider, %Events.ToolCall{
        call_id: "c1",
        name: "propose_instruction",
        params: %{"text" => "make the door red"}
      })

    {draft, ws} = WsClient.await(ws, &match?(%{"type" => "draft"}, &1))
    assert %{"status" => "proposed", "text" => "make the door red", "draft_id" => draft_id} = draft
    refute_received {:api_stub, _, _, _, _}

    ws = WsClient.send_json(ws, %{v: 1, type: "confirm_draft", draft_id: draft_id})
    assert_receive {:api_stub, "POST", "/internal/voice/instruct", [@internal_secret], body}, 2_000

    assert %{"text" => "make the door red", "idempotency_key" => ^draft_id, "kind" => "instruct", "target" => @target} =
             Jason.decode!(body)

    {delivery, ws} = WsClient.await(ws, &match?(%{"type" => "delivery", "status" => "delivered"}, &1))
    assert delivery["draft_id"] == draft_id

    ws = WsClient.send_json(ws, %{v: 1, type: "end"})
    assert {%{"type" => "ended"}, _ws} = WsClient.await(ws, &match?(%{"type" => "ended"}, &1))
  end

  @tag api_body: ~s({"delivery_id":"d-1","status":"needs_choice"})
  test "the fake provider reads budget details and keeps a needs-choice session live", %{
    port: port,
    internal_port: internal_port
  } do
    budget = "Remaining today: 2.0 stars (40%). Resets at 12:00 am. Free slots: 1 new game, 2 edits. Queued: none."
    sizes = "Rough sizes: small ≈ 0.5 star, medium ≈ 1–2, large ≈ 3–5, huge ≈ 6+ (low confidence)."
    assert :ok = push_briefing(internal_port, budget, sizes)

    {:ok, ws} = WsClient.connect(port, "/?token=" <> token("u1"))
    ws = WsClient.send_json(ws, %{v: 1, type: "start", target: @target})
    {_, _ws} = WsClient.await(ws, &match?(%{"type" => "state", "state" => "listening"}, &1))
    provider = provider_ref()
    test = self()
    Agent.update(provider, &Map.put(&1, :call_observer, test))

    :ok =
      FakeProvider.emit(provider, %Events.ToolCall{
        call_id: "budget",
        name: "get_details",
        params: %{"section" => "budget"}
      })

    assert_receive {:fake_provider, :tool_result, "budget", %{text: details, is_error: false}}, 1_000
    assert details =~ "Remaining today"
    assert details =~ "Rough sizes"

    waiting_on = "Doesn't fit today: trim, split, queue for 12:00 am, or ask an admin"
    assert :ok = push_briefing(internal_port, budget, sizes, waiting_on)
    :ok = FakeProvider.emit(provider, %Events.ToolCall{call_id: "status", name: "get_status", params: %{}})
    assert_receive {:fake_provider, :tool_result, "status", %{text: status, is_error: false}}, 1_000
    assert status =~ waiting_on

    :ok =
      FakeProvider.emit(provider, %Events.ToolCall{
        call_id: "later",
        name: "propose_instruction",
        params: %{"text" => "[later] add a boss"}
      })

    {draft, ws} = WsClient.await(ws, &match?(%{"type" => "draft"}, &1))
    ws = WsClient.send_json(ws, %{v: 1, type: "confirm_draft", draft_id: draft["draft_id"]})
    assert_receive {:api_stub, "POST", "/internal/voice/instruct", [@internal_secret], body}, 2_000
    assert %{"text" => "[later] add a boss"} = Jason.decode!(body)

    assert {%{"type" => "delivery", "status" => "delivered"}, _ws} =
             WsClient.await(ws, &match?(%{"type" => "delivery", "status" => "delivered"}, &1))
  end

  @tag api_status: 500
  test "an API that refuses the instruction reports delivery failed", %{port: port} do
    {:ok, ws} = WsClient.connect(port, "/?token=" <> token("u1"))
    ws = WsClient.send_json(ws, %{v: 1, type: "start", target: @target})
    {_, ws} = WsClient.await(ws, &match?(%{"type" => "state", "state" => "listening"}, &1))

    :ok =
      FakeProvider.emit(provider_ref(), %Events.ToolCall{
        call_id: "c1",
        name: "propose_instruction",
        params: %{"text" => "x"}
      })

    {%{"draft_id" => draft_id}, ws} = WsClient.await(ws, &match?(%{"type" => "draft"}, &1))
    ws = WsClient.send_json(ws, %{v: 1, type: "confirm_draft", draft_id: draft_id})
    assert_receive {:api_stub, "POST", _, _, _}, 2_000

    assert {%{"draft_id" => ^draft_id}, _} =
             WsClient.await(ws, &match?(%{"type" => "delivery", "status" => "failed"}, &1))
  end

  test "a bad token closes the socket with 4401 before any session", %{port: port} do
    for path <- ["/?token=vct1.bad.token", "/", "/?token=" <> token("u1", secret: String.duplicate("x", 40))] do
      {:ok, ws} = WsClient.connect(port, path)
      assert {{:close, 4401, "unauthorized"}, _} = WsClient.await(ws, &match?({:close, _, _}, &1))
    end

    assert sessions() == []
  end

  test "a dictate token streams audio once and returns the final transcript", %{port: port} do
    dictation_token = token("u1", scope: "dictate", nonce: "dictation-one")
    {:ok, ws} = WsClient.connect(port, "/?mode=dictate&token=" <> dictation_token)
    assert_receive {:dictation_started, _owner}

    ws = WsClient.send_json(ws, %{v: 1, type: "audio", data_b64: "AA=="})
    assert_receive {:dictation_audio, "AA=="}
    ws = WsClient.send_json(ws, %{v: 1, type: "commit"})
    assert_receive :dictation_committed

    {transcript, ws} = WsClient.await(ws, &match?(%{"type" => "transcript", "kind" => "final"}, &1))
    assert transcript["text"] == "make the door blue"
    assert {%{"type" => "ended"}, _ws} = WsClient.await(ws, &match?(%{"type" => "ended"}, &1))

    {:ok, replay} = WsClient.connect(port, "/?mode=dictate&token=" <> dictation_token)

    assert {%{"type" => "error", "code" => "token_replayed"}, _replay} =
             WsClient.await(replay, &match?(%{"type" => "error"}, &1))
  end

  test "dictation refuses a conversation token before starting the transcriber", %{port: port} do
    {:ok, ws} = WsClient.connect(port, "/?mode=dictate&token=" <> token("u1"))
    assert {{:close, 4401, "unauthorized"}, _} = WsClient.await(ws, &match?({:close, _, _}, &1))
    refute_receive {:dictation_started, _owner}
  end

  test "a token cannot open a target that names another creator", %{port: port} do
    {:ok, ws} = WsClient.connect(port, "/?token=" <> token("u2"))
    ws = WsClient.send_json(ws, %{v: 1, type: "start", target: @target})
    assert {%{"type" => "error"}, _} = WsClient.await(ws, &match?(%{"type" => "error"}, &1))
    assert sessions() == []
  end

  test "a token cannot be replayed for another target owned by the same creator", %{port: port} do
    {:ok, ws} = WsClient.connect(port, "/?token=" <> token("u1"))
    ws = WsClient.send_json(ws, %{v: 1, type: "start", target: %{@target | "job_id" => "j2"}})
    assert {%{"type" => "error"}, _} = WsClient.await(ws, &match?(%{"type" => "error"}, &1))
    assert sessions() == []
  end

  @tag api_body: ~s({})
  test "a malformed successful API response reports delivery failed", %{port: port} do
    {:ok, ws} = WsClient.connect(port, "/?token=" <> token("u1"))
    ws = WsClient.send_json(ws, %{v: 1, type: "start", target: @target})
    {_, ws} = WsClient.await(ws, &match?(%{"type" => "state", "state" => "listening"}, &1))

    :ok =
      FakeProvider.emit(provider_ref(), %Events.ToolCall{
        call_id: "c1",
        name: "propose_instruction",
        params: %{"text" => "x"}
      })

    {%{"draft_id" => draft_id}, ws} = WsClient.await(ws, &match?(%{"type" => "draft"}, &1))
    ws = WsClient.send_json(ws, %{v: 1, type: "confirm_draft", draft_id: draft_id})
    assert_receive {:api_stub, "POST", _, _, _}, 2_000

    assert {%{"draft_id" => ^draft_id}, _} =
             WsClient.await(ws, &match?(%{"type" => "delivery", "status" => "failed"}, &1))
  end

  test "text input is refused: voice only in V1", %{port: port} do
    {:ok, ws} = WsClient.connect(port, "/?token=" <> token("u1"))
    ws = WsClient.send_json(ws, %{v: 1, type: "text", text: "hello"})
    assert {%{"code" => "unsupported_frame"}, _} = WsClient.await(ws, &match?(%{"type" => "error"}, &1))
  end

  test "the internal port serves health with the provider name", %{internal_port: port} do
    {:ok, {{_, 200, _}, _, body}} = :httpc.request(~c"http://127.0.0.1:#{port}/healthz")
    assert Jason.decode!(body) == %{"ok" => true, "service" => "voice-host", "provider" => "fake"}
  end

  # The API mints in TypeScript (services/api/src/voice/token.ts); this reproduces that format
  # independently of the host's issuer, so the socket is opened with a token the host did not mint.
  defp token(sub, opts \\ []) do
    secret = Keyword.get(opts, :secret, @token_secret)
    target = Keyword.get(opts, :target, Map.put(@target, "creator_id", sub))

    claims = %{
      scope: Keyword.get(opts, :scope, "converse"),
      sub: sub,
      exp: System.os_time(:second) + 300,
      nonce: Keyword.get(opts, :nonce, "AAAAAAAAAAAAAAAA"),
      target: target
    }

    body = "vct1." <> Base.url_encode64(Jason.encode!(claims), padding: false)
    body <> "." <> Base.url_encode64(:crypto.mac(:hmac, :sha256, secret, body), padding: false)
  end

  defp sessions do
    Registry.select(SessionRegistry.name(OgmVoice.Config.instance()), [{{:"$1", :"$2", :_}, [], [{{:"$1", :"$2"}}]}])
  end

  defp provider_ref do
    [{_id, session}] = sessions()
    :sys.get_state(session).provider_ref
  end

  defp push_briefing(port, budget, sizes, waiting_on \\ nil) do
    body =
      Jason.encode!(%{
        target_key: "build:j1",
        observed_at: "2026-11-01T05:10:00Z",
        summary: "Building",
        current_task: "Placing the first room",
        next_steps: [],
        waiting_on: waiting_on,
        questions: [],
        extra: [%{title: "Budget", text: budget}],
        sections: [
          %{id: "budget", text: budget <> "\n" <> sizes},
          %{id: "progress", text: "Building: placing the first room"},
          %{id: "estimate", text: sizes}
        ]
      })

    request =
      {~c"http://127.0.0.1:#{port}/internal/briefing", [{~c"x-ogm-internal", String.to_charlist(@internal_secret)}],
       ~c"application/json", body}

    case :httpc.request(:post, request, [], []) do
      {:ok, {{_version, 204, _reason}, _headers, _body}} -> :ok
      other -> {:error, other}
    end
  end

  defp listener_port(host, id) do
    {^id, pid, _, _} = host |> Supervisor.which_children() |> List.keyfind(id, 0)
    {:ok, {{127, 0, 0, 1}, port}} = ThousandIsland.listener_info(pid)
    port
  end
end
