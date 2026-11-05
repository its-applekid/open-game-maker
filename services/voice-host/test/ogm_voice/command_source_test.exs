defmodule OgmVoice.CommandSourceTest do
  use ExUnit.Case, async: false

  alias OgmVoice.Ports.CommandSource
  alias OgmVoice.Test.ApiStub
  alias VoiceConverse.Ports

  @target %{"kind" => "build", "game_id" => "g1", "job_id" => "j1", "ticket" => "7", "creator_id" => "u1"}

  @push %{
    "target_key" => "build:j1",
    "observed_at" => "2026-11-01T05:25:00Z",
    "summary" => "Building the castle level",
    "next_steps" => [],
    "extra" => [],
    "sections" => [],
    "commands" => [
      %{
        "id" => "decision-1",
        "version" => 3,
        "question" => "Which door color?",
        "options" => [%{"id" => "red", "label" => "Red"}, %{"id" => "blue", "label" => "Blue"}]
      }
    ]
  }

  setup do
    on_exit(&CommandSource.uninstall/0)
    start_supervised!(OgmVoice.Cache)
    :ok
  end

  test "posts the signed answer with the internal credential" do
    test = self()
    assert :ok = OgmVoice.Cache.put(@push)

    request = fn url, secret, payload ->
      send(test, {:request, url, secret, payload})
      {:ok, 200, %{"status" => "answered"}}
    end

    CommandSource.install("http://127.0.0.1:4300/", fn -> "secret" end, request: request)
    assert :ok = CommandSource.answer(@target, "decision-1", "Blue", "call-1")

    assert_receive {:request, "http://127.0.0.1:4300/internal/voice/command-answer", "secret",
                    %{
                      target: @target,
                      command_id: "decision-1",
                      choice: "Blue",
                      idempotency_key: "call-1"
                    }}
  end

  test "answers inside the package's answer deadline and posts in the background" do
    {stub, api_url} = ApiStub.start!(self(), 200, 600, ~s({"status":"answered"}))
    on_exit(fn -> Process.exit(stub, :shutdown) end)
    assert :ok = OgmVoice.Cache.put(@push)

    CommandSource.install(api_url, fn -> "secret" end)

    args = [@target, "decision-1", "blue", "call-slow"]
    assert :ok = Ports.call_port(CommandSource, :answer, args, :answer)

    assert_receive {:api_stub, "POST", path, ["secret"], body}, 2_000
    assert path == "/internal/voice/command-answer"
    answered = Jason.decode!(body)
    assert %{"target" => @target, "command_id" => "decision-1", "choice" => "blue"} = answered
    assert answered["idempotency_key"] == "call-slow"
  end

  test "refuses a Command that is no longer open and a choice that is not its option" do
    test = self()
    assert :ok = OgmVoice.Cache.put(@push)
    request = fn _url, _secret, _payload -> send(test, :posted) end
    CommandSource.install("http://127.0.0.1:4300", fn -> "secret" end, request: request)

    assert {:error, :stale} = CommandSource.answer(@target, "decision-9", "blue", "k1")
    assert {:error, :invalid_choice} = CommandSource.answer(@target, "decision-1", "green", "k1")
    refute_receive :posted, 100
  end

  test "a target with no briefing answers unavailable instead of guessing" do
    CommandSource.install("http://127.0.0.1:4300", fn -> "secret" end)
    assert {:error, :unavailable} = CommandSource.answer(@target, "decision-1", "blue", "call-1")
  end

  test "a failed delivery is logged instead of crashing the port caller" do
    assert :ok = OgmVoice.Cache.put(@push)

    CommandSource.install("http://127.0.0.1:4300", fn -> "secret" end,
      request: fn _url, _secret, _payload -> raise "provider details" end
    )

    assert :ok = CommandSource.answer(@target, "decision-1", "blue", "call-1")
  end
end
