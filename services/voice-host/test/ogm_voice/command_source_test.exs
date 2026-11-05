defmodule OgmVoice.CommandSourceTest do
  use ExUnit.Case, async: false

  alias OgmVoice.Ports.CommandSource
  alias OgmVoice.Test.ApiStub

  @target %{"kind" => "build", "game_id" => "g1", "job_id" => "j1", "ticket" => "7", "creator_id" => "u1"}

  setup do
    on_exit(&CommandSource.uninstall/0)
    :ok
  end

  test "posts a signed target answer with the internal credential and maps the receipt" do
    test = self()

    request = fn url, secret, payload ->
      send(test, {:request, url, secret, payload})
      {:ok, 200, %{"status" => "answered"}}
    end

    CommandSource.install("http://127.0.0.1:4300/", fn -> "secret" end, request: request)
    assert :ok = CommandSource.answer(@target, "decision-1", "blue", "call-1")

    assert_receive {:request, "http://127.0.0.1:4300/internal/voice/command-answer", "secret",
                    %{
                      target: @target,
                      command_id: "decision-1",
                      choice: "blue",
                      idempotency_key: "call-1"
                    }}
  end

  test "waits for the API's Decision call instead of failing on a local round-trip budget" do
    {stub, api_url} = ApiStub.start!(self(), 200, 600, ~s({"status":"answered"}))
    on_exit(fn -> Process.exit(stub, :shutdown) end)

    CommandSource.install(api_url, fn -> "secret" end)

    assert :ok = CommandSource.answer(@target, "decision-1", "blue", "call-slow")
  end

  test "maps stale and opaque failures without exposing response details" do
    CommandSource.install("http://127.0.0.1:4300", fn -> "secret" end,
      request: fn _url, _secret, _payload -> {:ok, 409, %{"status" => "stale"}} end
    )

    assert {:error, :stale} = CommandSource.answer(@target, "decision-1", "blue", "call-2")

    CommandSource.install("http://127.0.0.1:4300", fn -> "secret" end,
      request: fn _url, _secret, _payload -> raise "provider details" end
    )

    assert {:error, :unavailable} = CommandSource.answer(@target, "decision-1", "blue", "call-3")
  end
end
